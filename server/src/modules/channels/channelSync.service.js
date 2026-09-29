/**
 * SRS 4.3 Multi-Channel Booking Synchronization
 *   Channel.Sync.Inventory (<= 60 s), Channel.Sync.Rate, Channel.Sync.Status,
 *   Channel.Sync.Conflict (flag for manual reconciliation by a Receptionist), Channel.Connect.Manage, BR-10
 * Sequence diagram SD-3 / collaboration diagram CD-3 "OTA Booking Synchronization + Conflict Resolution":
 *   syncReservations() -> pullBookings() -> booking details -> detectConflicts()
 *   alt [No conflict] updateBookingStatus() -> status updated -> synchronization successful
 *   alt [Conflict]    (flagged) ... Receptionist -> resolveConflicts() -> updateBookingStatus() -> status updated -> conflict resolved
 *   pushAvailability() -> availability updated
 * UML: ChannelSync.syncReservations(), detectConflicts(), resolveConflicts(); OTAChannel.updateInventory(), updateRates();
 *      Receptionist.resolveOTAConflicts()
 * Activity: OTA lane "Update Availability / Rates / Status" | "Pull OTA Bookings" -> "Detect Booking Conflicts"
 *           -> <Conflict Detected?> Yes -> Receptionist "Handle OTA Conflicts" | No -> "Update OTA Booking Status"
 * DECISION D-4 (docs/ASSUMPTIONS.md): conflicts are DETECTED automatically and RESOLVED by a Receptionist.
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound, unprocessable } from '../../lib/errors.js';
import { addDays, formatDateOnly, hotelToday, nightsBetween, parseDateOnly } from '../../lib/dates.js';
import { round2, toNumber } from '../../lib/money.js';
import { trace, traceScenario } from '../../lib/trace.js';
import { getSettings } from '../../lib/settings.js';
import { AuditLog } from '../../domain/AuditLog.js';
import { Reservation } from '../../domain/Reservation.js';
import { Room, INVENTORY_HOLDING_STATUSES, UNSELLABLE_ROOM_STATUSES } from '../../domain/Room.js';
import { otaPlatformFor, MockOTAPlatform } from '../../integrations/ota/OTAPlatform.js';
import { notificationService } from '../../integrations/NotificationService.js';
import { ROLES } from '../../domain/rbac.js';

const WINDOW_DAYS = 30;

async function connectedChannels(channelId) {
  return prisma.oTAChannel.findMany({ where: { status: { not: 'DISABLED' }, ...(channelId ? { id: channelId } : {}) }, orderBy: { id: 'asc' } });
}

/** Availability + rate snapshot for the next WINDOW_DAYS days, per room type (what OTAs are allowed to sell). */
export async function availabilitySnapshot() {
  const start = hotelToday();
  const end = addDays(start, WINDOW_DAYS);
  const rooms = await prisma.room.findMany({ include: { roomType: true } });
  const res = await prisma.reservation.findMany({
    where: { status: { in: INVENTORY_HOLDING_STATUSES }, checkInDate: { lt: end }, checkOutDate: { gt: start } },
    select: { roomId: true, checkInDate: true, checkOutDate: true },
  });
  const byType = new Map();
  for (const room of rooms) {
    if (!byType.has(room.roomTypeId)) byType.set(room.roomTypeId, { roomTypeId: room.roomTypeId, typeName: room.roomType.typeName, rate: toNumber(room.roomType.baseRate), rooms: [] });
    byType.get(room.roomTypeId).rooms.push(room);
  }
  const types = [];
  for (const t of byType.values()) {
    const days = [];
    for (let i = 0; i < WINDOW_DAYS; i++) {
      const d = addDays(start, i);
      const sellable = t.rooms.filter((r) => !UNSELLABLE_ROOM_STATUSES.includes(r.status));
      const booked = sellable.filter((r) => res.some((x) => x.roomId === r.id && x.checkInDate <= d && x.checkOutDate > d)).length;
      days.push({ date: formatDateOnly(d), available: sellable.length - booked });
    }
    types.push({ roomTypeId: t.roomTypeId, typeName: t.typeName, rate: t.rate, days });
  }
  return { generatedAt: new Date().toISOString(), windowDays: WINDOW_DAYS, roomTypes: types };
}

/** OTAChannel.updateInventory() / updateRates(): push the snapshot to every connected OTA (BR-10). */
export async function pushAvailabilityToAll({ reason = 'Inventory changed', reservationId, syncType = 'PUSH_AVAILABILITY', channelId } = {}) {
  const channels = await connectedChannels(channelId);
  const snapshot = await availabilitySnapshot();
  const results = [];
  for (const channel of channels) {
    trace('HRMS', 'OTAPlatform', 'pushAvailability()', { ref: 'SD-3 msg 8', activity: 'Update Availability / Rates / Status', note: channel.channelName });
    try {
      await otaPlatformFor(channel).pushAvailability(snapshot);
      await prisma.channelSync.create({ data: { channelId: channel.id, reservationId: reservationId ?? null, syncType, syncStatus: 'SUCCESS', details: { reason, roomTypes: snapshot.roomTypes.length } } });
      await prisma.oTAChannel.update({ where: { id: channel.id }, data: { lastSyncAt: new Date() } });
      trace('OTAPlatform', 'HRMS', 'availability updated', { ref: 'SD-3 msg 9', kind: 'return' });
      results.push({ channel: channel.channelName, ok: true });
    } catch (err) {
      await recordFailure(channel, syncType, err, reservationId);
      results.push({ channel: channel.channelName, ok: false, error: err.message });
    }
  }
  return results;
}

async function recordFailure(channel, syncType, err, reservationId) {
  trace('OTAPlatform', 'HRMS', `sync failed: ${err.message}`, { ref: 'UC-1 alt', kind: 'return', branch: 'failure' });
  await prisma.channelSync.create({ data: { channelId: channel.id, reservationId: reservationId ?? null, syncType, syncStatus: 'FAILED', errorMessage: err.message } });
  // UC-1 exception: "OTA synchronization failure -> retry and alert staff for persistent conflicts"
  const recentFailures = await prisma.channelSync.count({ where: { channelId: channel.id, syncStatus: 'FAILED', lastSyncAt: { gt: new Date(Date.now() - 10 * 60_000) } } });
  if (recentFailures === 3) {
    await notificationService.notifyRole([ROLES.RECEPTIONIST, ROLES.SYSTEM_ADMINISTRATOR], { type: 'OTA_SYNC_FAILURE', subject: `${channel.channelName} sync failing`, body: `${recentFailures} consecutive synchronisation attempts with ${channel.channelName} failed: ${err.message}. The system keeps retrying automatically.` });
  }
}

async function findOrCreateOtaGuest(booking, tx) {
  const email = booking.guestEmail.toLowerCase();
  const existing = await tx.user.findUnique({ where: { email }, include: { guest: true } });
  if (existing?.guest) return existing.guest.id;
  if (existing) throw unprocessable('EMAIL_BELONGS_TO_STAFF', `The OTA guest e-mail ${email} belongs to a staff account.`);
  const role = await tx.role.findUnique({ where: { roleName: ROLES.GUEST } });
  const { generateGuestId } = await import('../auth/auth.service.js');
  const user = await tx.user.create({ data: { name: booking.guestName, email, roleId: role.id, passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 8) } });
  const guest = await tx.guest.create({ data: { userId: user.id, guestId: await generateGuestId(tx) } });
  await tx.guestProfile.create({ data: { guestId: guest.id } });
  await tx.loyaltyAccount.create({ data: { guestId: guest.id } });
  return guest.id;
}

/**
 * ChannelSync.detectConflicts(): would accepting this OTA booking break an HRMS rule?
 * Returns null when there is no conflict.
 */
export async function detectConflicts(booking, { excludeReservationId } = {}) {
  const room = await prisma.room.findUnique({ where: { roomNumber: booking.roomNumber } });
  if (!room) return { conflictType: 'UNKNOWN_ROOM', message: `OTA booked room ${booking.roomNumber}, which does not exist in HRMS inventory.` };
  if (UNSELLABLE_ROOM_STATUSES.includes(room.status)) return { conflictType: 'ROOM_OUT_OF_SERVICE', room, message: `Room ${room.roomNumber} is ${room.status.replace(/_/g, ' ').toLowerCase()} in HRMS.` };
  if (booking.numGuests > room.capacity) return { conflictType: 'CAPACITY_EXCEEDED', room, message: `${booking.numGuests} guests exceed room ${room.roomNumber}'s capacity of ${room.capacity}.` };
  const clash = await prisma.reservation.findFirst({
    where: {
      roomId: room.id, status: { in: INVENTORY_HOLDING_STATUSES }, id: excludeReservationId ? { not: excludeReservationId } : undefined,
      checkInDate: { lt: booking.checkOutDate }, checkOutDate: { gt: booking.checkInDate },
    },
    include: { guest: { include: { user: { select: { name: true } } } } },
  });
  if (clash) {
    return {
      conflictType: 'ROOM_ALREADY_BOOKED', room, clash,
      message: `OTA says room ${room.roomNumber} is booked ${formatDateOnly(booking.checkInDate)} → ${formatDateOnly(booking.checkOutDate)}, but HRMS already holds it for ${clash.guest.user.name} (${formatDateOnly(clash.checkInDate)} → ${formatDateOnly(clash.checkOutDate)}).`,
    };
  }
  return null;
}

async function createOtaReservation(channel, booking, room, tx) {
  const guestId = await findOrCreateOtaGuest(booking, tx);
  const created = await tx.reservation.create({
    data: {
      guestId, roomId: room.id, checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate,
      numGuests: booking.numGuests, status: 'PENDING_PAYMENT', totalAmount: booking.amount, source: 'OTA',
      otaChannelId: channel.id, externalRef: booking.externalRef, specialRequests: `Booked via ${channel.channelName}`,
    },
  });
  // OTA bookings are prepaid through the OTA (OTA collects payment and settles with the hotel).
  await tx.payment.create({
    data: {
      reservationId: created.id, amount: booking.amount, currency: 'INR', paymentMethod: 'CARD', purpose: 'RESERVATION',
      status: 'CAPTURED', paidAt: new Date(), transactionRef: `ota_${channel.code}_${booking.externalRef}`, methodSummary: `Collected by ${channel.channelName}`,
    },
  });
  return Reservation.confirm(created, tx);
}

/**
 * ChannelSync.syncReservations() — SD-3 main flow for one or all connected channels.
 * Called by the background scheduler (<= every 60 s), by staff ("Sync now"), and by the
 * confirmation fork.
 */
export async function syncReservations({ channelId, performedBy } = {}) {
  traceScenario('SD-3 OTA Booking Synchronization + Conflict Resolution');
  const channels = await connectedChannels(channelId);
  const summary = [];
  for (const channel of channels) {
    const platform = otaPlatformFor(channel);
    const stats = { channel: channel.channelName, created: 0, modified: 0, cancelled: 0, conflicts: 0, errors: 0 };
    trace('HRMS', 'ChannelSync', 'syncReservations()', { ref: 'SD-3 msg 1', note: channel.channelName, activity: 'Sync Booking Status to OTA Channels' });
    let bookings;
    try {
      trace('ChannelSync', 'OTAPlatform', 'pullBookings()', { ref: 'SD-3 msg 2', activity: 'Pull OTA Bookings' });
      bookings = await platform.pullBookings();
      trace('OTAPlatform', 'ChannelSync', `booking details (${bookings.length})`, { ref: 'SD-3 msg 3', kind: 'return' });
    } catch (err) {
      await recordFailure(channel, 'PULL_BOOKINGS', err);
      stats.errors++;
      summary.push(stats);
      continue;
    }

    for (const booking of bookings) {
      try {
        await processBooking(channel, platform, booking, stats, performedBy);
      } catch (err) {
        stats.errors++;
        await prisma.channelSync.create({ data: { channelId: channel.id, syncType: 'PULL_BOOKINGS', syncStatus: 'FAILED', externalRef: booking.externalRef, errorMessage: err.message } });
      }
    }
    await prisma.oTAChannel.update({ where: { id: channel.id }, data: { lastSyncAt: new Date() } });
    summary.push(stats);
  }
  if (summary.some((s) => s.created || s.modified || s.cancelled)) await pushAvailabilityToAll({ reason: 'OTA bookings synchronised' });
  else if (channels.length) await pushAvailabilityToAll({ reason: 'Scheduled inventory sync', channelId });
  return summary;
}

async function processBooking(channel, platform, booking, stats, performedBy) {
  const existing = await prisma.reservation.findUnique({ where: { otaChannelId_externalRef: { otaChannelId: channel.id, externalRef: booking.externalRef } } });
  const openConflict = await prisma.channelSync.findFirst({ where: { channelId: channel.id, externalRef: booking.externalRef, syncStatus: 'CONFLICT' } });

  // Channel.Sync.Status: cancellation that originated on the OTA
  if (booking.status === 'CANCELLED') {
    if (existing && ['CONFIRMED', 'PENDING_PAYMENT'].includes(existing.status)) {
      await prisma.reservation.update({ where: { id: existing.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: `Cancelled on ${channel.channelName}` } });
      await Room.updateStatus(existing.roomId);
      stats.cancelled++;
    }
    if (openConflict) await prisma.channelSync.update({ where: { id: openConflict.id }, data: { syncStatus: 'RESOLVED', resolution: 'CANCELLED_ON_OTA', resolvedAt: new Date() } });
    trace('ChannelSync', 'OTAPlatform', 'updateBookingStatus(CANCELLED)', { ref: 'SD-3 msg 5' });
    await platform.updateBookingStatus(booking.externalRef, 'CANCELLED');
    trace('OTAPlatform', 'ChannelSync', 'status updated', { ref: 'SD-3 msg 6', kind: 'return' });
    await prisma.channelSync.create({ data: { channelId: channel.id, reservationId: existing?.id ?? null, syncType: 'STATUS_UPDATE', syncStatus: 'SUCCESS', externalRef: booking.externalRef, details: { event: 'OTA cancellation' } } });
    await AuditLog.record({ action: 'OTA_BOOKING_CANCELLED', entityType: 'Reservation', entityId: existing?.id, performedBy, details: { channel: channel.channelName, externalRef: booking.externalRef } });
    return;
  }
  if (openConflict) return; // still waiting for a Receptionist

  trace('ChannelSync', 'ChannelSync', 'detectConflicts()', { ref: 'SD-3 msg 4', activity: 'Detect Booking Conflicts', note: booking.externalRef });
  const found = await detectConflicts(booking, { excludeReservationId: existing?.id });

  if (found) {
    // alt [Conflict detected] -> flag for manual reconciliation (Channel.Sync.Conflict)
    trace('ChannelSync', 'ChannelSync', 'Conflict Detected? — Yes', { ref: 'SD-3 alt', kind: 'alt', branch: 'failure', activity: 'Conflict Detected? → Handle OTA Conflicts (Receptionist)' });
    await prisma.channelSync.create({
      data: {
        channelId: channel.id, reservationId: existing?.id ?? null, syncType: 'PULL_BOOKINGS', syncStatus: 'CONFLICT',
        externalRef: booking.externalRef, conflictType: found.conflictType, conflictReservationId: found.clash?.id ?? null,
        errorMessage: found.message,
        details: { otaBooking: { ...booking, amount: toNumber(booking.amount), checkInDate: formatDateOnly(booking.checkInDate), checkOutDate: formatDateOnly(booking.checkOutDate) }, isModification: Boolean(existing) },
      },
    });
    await platform.updateBookingStatus(booking.externalRef, 'PENDING_RECONCILIATION');
    await notificationService.notifyRole([ROLES.RECEPTIONIST], { type: 'OTA_CONFLICT', subject: `Booking conflict from ${channel.channelName}`, body: found.message });
    await AuditLog.record({ action: 'OTA_CONFLICT_DETECTED', entityType: 'ChannelSync', entityId: booking.externalRef, performedBy, details: { channel: channel.channelName, conflictType: found.conflictType, message: found.message } });
    stats.conflicts++;
    return;
  }

  // alt [No conflict detected]
  trace('ChannelSync', 'ChannelSync', 'Conflict Detected? — No', { ref: 'SD-3 alt', kind: 'alt', activity: 'Update OTA Booking Status' });
  const room = await prisma.room.findUnique({ where: { roomNumber: booking.roomNumber } });
  let reservationId;
  try {
    if (existing) {
      // Channel.Sync.Status: modification originated on the OTA
      await prisma.reservation.update({ where: { id: existing.id }, data: { roomId: room.id, checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate, numGuests: booking.numGuests, totalAmount: booking.amount } });
      reservationId = existing.id;
      stats.modified++;
    } else {
      const created = await prisma.$transaction((tx) => createOtaReservation(channel, booking, room, tx));
      reservationId = created.id;
      stats.created++;
    }
  } catch (err) {
    Reservation.assertNoOverlapError(err);
  }
  await Room.updateStatus(room.id);
  trace('ChannelSync', 'OTAPlatform', 'updateBookingStatus()', { ref: 'SD-3 msg 5' });
  await platform.updateBookingStatus(booking.externalRef, 'CONFIRMED');
  trace('OTAPlatform', 'ChannelSync', 'status updated', { ref: 'SD-3 msg 6', kind: 'return' });
  await prisma.channelSync.create({ data: { channelId: channel.id, reservationId, syncType: 'PULL_BOOKINGS', syncStatus: 'SUCCESS', externalRef: booking.externalRef, details: { event: existing ? 'modified' : 'created' } } });
  await AuditLog.record({ action: existing ? 'OTA_BOOKING_MODIFIED' : 'OTA_BOOKING_IMPORTED', entityType: 'Reservation', entityId: reservationId, performedBy, details: { channel: channel.channelName, externalRef: booking.externalRef } });
  trace('ChannelSync', 'HRMS', 'synchronization successful', { ref: 'SD-3', kind: 'return' });
}

/**
 * Receptionist.resolveOTAConflicts() -> ChannelSync.resolveConflicts() (SD-3 conflict branch, msgs 7 -> 5 -> 6 -> 8 -> 9)
 * resolution:
 *   REASSIGN_ROOM      - accept the OTA booking in another available room (targetRoomId)
 *   MOVE_EXISTING      - move the HRMS reservation to targetRoomId and accept the OTA booking in the original room
 *   REJECT_OTA_BOOKING - decline the OTA booking; the OTA must rebook or cancel it with the guest
 */
export async function resolveConflicts(user, syncId, { resolution, targetRoomId, note }) {
  traceScenario('SD-3 OTA Booking Synchronization + Conflict Resolution');
  const sync = await prisma.channelSync.findUnique({ where: { id: syncId }, include: { channel: true } });
  if (!sync || sync.syncStatus !== 'CONFLICT') throw notFound('Open conflict');
  const channel = sync.channel;
  const platform = otaPlatformFor(channel);
  const booking = await platform.getBookingDetails(sync.externalRef);
  if (!booking) throw notFound('OTA booking');

  trace('Receptionist', 'HRMS', 'resolveOTAConflicts()', { ref: 'Class diagram', activity: 'Handle OTA Conflicts' });
  trace('HRMS', 'ChannelSync', 'resolveConflicts()', { ref: 'SD-3 msg 7' });

  let reservationId = null;
  let finalRoomNumber = booking.roomNumber;
  let otaStatus = 'CONFIRMED';

  if (resolution === 'REJECT_OTA_BOOKING') {
    otaStatus = 'REJECTED';
  } else {
    if (!targetRoomId) throw badRequest('Choose the room to use.');
    const target = await prisma.room.findUnique({ where: { id: targetRoomId } });
    if (!target) throw notFound('Room');
    await prisma.$transaction(async (tx) => {
      if (resolution === 'MOVE_EXISTING') {
        if (!sync.conflictReservationId) throw unprocessable('NOTHING_TO_MOVE', 'This conflict has no HRMS reservation to move.');
        const hrms = await tx.reservation.findUnique({ where: { id: sync.conflictReservationId } });
        if (!(await Room.isAvailable(target.id, hrms.checkInDate, hrms.checkOutDate, { excludeReservationId: hrms.id, db: tx }))) {
          throw unprocessable('ROOM_UNAVAILABLE', `Room ${target.roomNumber} is not free for the HRMS guest's dates.`);
        }
        if (target.capacity < hrms.numGuests) throw unprocessable('CAPACITY', `Room ${target.roomNumber} is too small for the HRMS guest.`);
        await tx.reservation.update({ where: { id: hrms.id }, data: { roomId: target.id } });
        await AuditLog.record({ action: 'RESERVATION_ROOM_MOVED', entityType: 'Reservation', entityId: hrms.id, performedBy: user.id, details: { toRoom: target.roomNumber, reason: 'OTA conflict resolution' } }, tx);
        const originalRoom = await tx.room.findUnique({ where: { roomNumber: booking.roomNumber } });
        const created = await createOtaReservation(channel, booking, originalRoom, tx);
        reservationId = created.id;
      } else if (resolution === 'REASSIGN_ROOM') {
        if (target.capacity < booking.numGuests) throw unprocessable('CAPACITY', `Room ${target.roomNumber} is too small for this OTA booking.`);
        if (!(await Room.isAvailable(target.id, booking.checkInDate, booking.checkOutDate, { db: tx }))) {
          throw unprocessable('ROOM_UNAVAILABLE', `Room ${target.roomNumber} is not free for those dates.`);
        }
        const existing = await tx.reservation.findUnique({ where: { otaChannelId_externalRef: { otaChannelId: channel.id, externalRef: booking.externalRef } } });
        if (existing) {
          await tx.reservation.update({ where: { id: existing.id }, data: { roomId: target.id, checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate, numGuests: booking.numGuests } });
          reservationId = existing.id;
        } else {
          const created = await createOtaReservation(channel, { ...booking, roomNumber: target.roomNumber }, target, tx);
          reservationId = created.id;
        }
        finalRoomNumber = target.roomNumber;
      } else {
        throw badRequest('Unknown resolution.');
      }
    }).catch((err) => Reservation.assertNoOverlapError(err));
  }

  trace('ChannelSync', 'OTAPlatform', 'updateBookingStatus()', { ref: 'SD-3 msg 5 (after resolve)' });
  await platform.updateBookingStatus(booking.externalRef, otaStatus, { roomNumber: finalRoomNumber });
  trace('OTAPlatform', 'ChannelSync', 'status updated', { ref: 'SD-3 msg 6', kind: 'return' });

  await prisma.channelSync.update({
    where: { id: sync.id },
    data: { syncStatus: 'RESOLVED', resolution, resolutionNote: note || null, resolvedById: user.id, resolvedAt: new Date(), reservationId: reservationId ?? sync.reservationId },
  });
  await AuditLog.record({ action: 'OTA_CONFLICT_RESOLVED', entityType: 'ChannelSync', entityId: sync.id, performedBy: user.id, details: { resolution, targetRoomId, note, externalRef: booking.externalRef } });
  trace('ChannelSync', 'HRMS', 'conflict resolved', { ref: 'SD-3', kind: 'return' });

  const rooms = await prisma.room.findMany({ where: { roomNumber: { in: [booking.roomNumber, finalRoomNumber] } } });
  await Promise.all(rooms.map((r) => Room.updateStatus(r.id)));
  await pushAvailabilityToAll({ reason: 'OTA conflict resolved', reservationId });
  return { resolved: true, resolution, reservationId };
}

/** HRMS-side change of an OTA booking (e.g. cancelled at the front desk) -> tell the OTA (Channel.Sync.Status). */
export async function reportStatusToOta(reservationId, status) {
  const r = await prisma.reservation.findUnique({ where: { id: reservationId }, include: { otaChannel: true } });
  if (!r?.otaChannel || !r.externalRef) return;
  try {
    await otaPlatformFor(r.otaChannel).updateBookingStatus(r.externalRef, status);
    await prisma.channelSync.create({ data: { channelId: r.otaChannel.id, reservationId, syncType: 'STATUS_UPDATE', syncStatus: 'SUCCESS', externalRef: r.externalRef, details: { status } } });
  } catch (err) {
    await recordFailure(r.otaChannel, 'STATUS_UPDATE', err, reservationId);
  }
}

/** Candidate rooms a receptionist can use to resolve a conflict. */
export async function conflictOptions(syncId) {
  const sync = await prisma.channelSync.findUnique({ where: { id: syncId }, include: { channel: true, conflictReservation: { include: { room: { include: { roomType: true } }, guest: { include: { user: { select: { name: true, email: true } } } } } } } });
  if (!sync) throw notFound('Conflict');
  const b = sync.details?.otaBooking;
  if (!b) return { sync, rooms: [] };
  const ci = parseDateOnly(b.checkInDate);
  const co = parseDateOnly(b.checkOutDate);
  const original = await prisma.room.findUnique({ where: { roomNumber: b.roomNumber }, include: { roomType: true } });
  const rooms = await prisma.room.findMany({
    where: { ...Room.availabilityFilter(ci, co), capacity: { gte: b.numGuests } },
    include: { roomType: true },
    orderBy: { roomNumber: 'asc' },
  });
  const sameType = (r) => original && r.roomTypeId === original.roomTypeId;
  return {
    otaBooking: b,
    originalRoom: original ? { id: original.id, roomNumber: original.roomNumber, typeName: original.roomType.typeName, status: original.status } : null,
    conflictReservation: sync.conflictReservation ? {
      id: sync.conflictReservation.id, reservationNumber: sync.conflictReservation.reservationNumber, guest: sync.conflictReservation.guest.user.name,
      checkInDate: formatDateOnly(sync.conflictReservation.checkInDate), checkOutDate: formatDateOnly(sync.conflictReservation.checkOutDate),
      numGuests: sync.conflictReservation.numGuests, status: sync.conflictReservation.status,
    } : null,
    candidateRooms: rooms
      .filter((r) => r.roomNumber !== b.roomNumber)
      .map((r) => ({ id: r.id, roomNumber: r.roomNumber, typeName: r.roomType.typeName, floor: r.floor, capacity: r.capacity, baseRate: toNumber(r.baseRate), sameType: sameType(r) }))
      .sort((a, b2) => Number(b2.sameType) - Number(a.sameType)),
  };
}

export async function listConflicts({ status = 'CONFLICT' } = {}) {
  const rows = await prisma.channelSync.findMany({
    where: { syncStatus: status === 'ALL' ? { in: ['CONFLICT', 'RESOLVED'] } : status, conflictType: { not: null } },
    include: { channel: { select: { channelName: true, code: true } }, resolvedBy: { select: { name: true } }, conflictReservation: { select: { id: true, reservationNumber: true } } },
    orderBy: { lastSyncAt: 'desc' },
    take: 100,
  });
  return rows.map((s) => ({
    id: s.id, channel: s.channel.channelName, channelCode: s.channel.code, externalRef: s.externalRef, conflictType: s.conflictType,
    message: s.errorMessage, syncStatus: s.syncStatus, detectedAt: s.lastSyncAt, otaBooking: s.details?.otaBooking ?? null,
    conflictReservation: s.conflictReservation, resolution: s.resolution, resolutionNote: s.resolutionNote, resolvedBy: s.resolvedBy?.name ?? null, resolvedAt: s.resolvedAt,
  }));
}

export async function listChannels() {
  const channels = await prisma.oTAChannel.findMany({ orderBy: { id: 'asc' } });
  const out = [];
  for (const c of channels) {
    const [bookings, openConflicts, lastFailure, revenue] = await Promise.all([
      prisma.reservation.count({ where: { otaChannelId: c.id, status: { not: 'CANCELLED' } } }),
      prisma.channelSync.count({ where: { channelId: c.id, syncStatus: 'CONFLICT' } }),
      prisma.channelSync.findFirst({ where: { channelId: c.id, syncStatus: 'FAILED' }, orderBy: { lastSyncAt: 'desc' } }),
      prisma.reservation.aggregate({ where: { otaChannelId: c.id, status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] } }, _sum: { totalAmount: true } }),
    ]);
    out.push({
      id: c.id, channelName: c.channelName, code: c.code, apiEndpoint: c.apiEndpoint, status: c.status, commissionPercent: toNumber(c.commissionPercent),
      lastSyncAt: c.lastSyncAt, bookings, openConflicts, lastError: lastFailure?.errorMessage ?? null, revenue: toNumber(revenue._sum.totalAmount),
      listing: otaPlatformFor(c).getPublishedListing(),
    });
  }
  return out;
}

export async function listSyncLog({ channelId, limit = 60 } = {}) {
  const rows = await prisma.channelSync.findMany({ where: channelId ? { channelId } : {}, include: { channel: { select: { channelName: true } } }, orderBy: { lastSyncAt: 'desc' }, take: Math.min(limit, 200) });
  return rows.map((s) => ({ id: s.id, channel: s.channel.channelName, syncType: s.syncType, syncStatus: s.syncStatus, externalRef: s.externalRef, lastSyncAt: s.lastSyncAt, errorMessage: s.errorMessage, reservationId: s.reservationId, details: s.details }));
}

/** Channel.Connect.Manage (System Administrator): add, configure or disable an OTA connection. */
export async function saveChannel(user, id, data) {
  const saved = id
    ? await prisma.oTAChannel.update({ where: { id }, data })
    : await prisma.oTAChannel.create({ data });
  await AuditLog.record({ action: id ? 'OTA_CHANNEL_UPDATED' : 'OTA_CHANNEL_ADDED', entityType: 'OTAChannel', entityId: saved.id, performedBy: user.id, details: data });
  return saved;
}

/** Demo control: a guest books (or cancels) on an OTA website. Optionally targets a room that is already taken, to demonstrate a conflict. */
export async function simulateOtaBooking(user, channelId, input) {
  const channel = await prisma.oTAChannel.findUnique({ where: { id: channelId } });
  if (!channel) throw notFound('Channel');
  if (input.action === 'cancel') {
    const b = await MockOTAPlatform.simulateGuestCancellation(channel, input.externalRef);
    return { booking: b };
  }
  const checkIn = parseDateOnly(input.checkIn);
  const checkOut = parseDateOnly(input.checkOut);
  if (checkOut <= checkIn) throw badRequest('Check-out must be after check-in.');
  const room = await prisma.room.findUnique({ where: { roomNumber: input.roomNumber } });
  const nights = nightsBetween(checkIn, checkOut);
  const settings = await getSettings();
  const rate = room ? toNumber(room.baseRate) : 5000;
  const booking = await MockOTAPlatform.simulateGuestBooking(channel, {
    roomNumber: input.roomNumber, guestName: input.guestName, guestEmail: input.guestEmail, checkInDate: checkIn, checkOutDate: checkOut,
    numGuests: input.numGuests || 2, amount: round2(rate * nights * (1 + settings.taxRatePercent / 100)),
  });
  await AuditLog.record({ action: 'OTA_BOOKING_SIMULATED', entityType: 'OTAChannel', entityId: channel.id, performedBy: user.id, details: { externalRef: booking.externalRef, roomNumber: input.roomNumber } });
  return { booking: { ...booking, amount: toNumber(booking.amount) } };
}

export async function listPlatformBookings(channelId) {
  const rows = await prisma.mockOtaBooking.findMany({ where: channelId ? { channelId } : {}, include: { channel: { select: { channelName: true } } }, orderBy: { createdAt: 'desc' }, take: 50 });
  return rows.map((b) => ({ ...b, amount: toNumber(b.amount), checkInDate: formatDateOnly(b.checkInDate), checkOutDate: formatDateOnly(b.checkOutDate), channel: b.channel.channelName }));
}
