/**
 * DFD Level 1 process 2.0 "Room Search & Reservation Management" (D2, D3) and its
 * hand-off to 3.0 "Payment Processing" (D4).
 *   Level 2: 2.2 Select Room / Temporary Reservation -> 2.3 Create Reservation -> 3.1 / 3.2 / 3.3
 * Sequence diagram SD-1 "Making Room Reservation" (Exp 4) and collaboration diagram CD-1.
 * Activity diagram (Exp 5): Select Room -> Provide Payment Details -> Lock Room Inventory ->
 *   Verify Payment -> <Payment Successful?> -> Release Inventory Lock | Confirm Reservation ->
 *   FORK [Update Guest Profile & Loyalty | Record Booking and Update Inventory | Sync Booking Status to OTA]
 *   + Send Booking Confirmation -> JOIN
 * SRS 4.1: Reservation.Book, .Book.Payment, .Book.Confirm, .Modify, .Cancel, .Cancel.Confirm,
 *   .Status.Update, .Prevent.DoubleBooking ; BR-1, BR-3, BR-5, BR-8, BR-9 ; SE-5 ; SE-6 ; CI-1 ; CI-2
 */
import { prisma } from '../../lib/prisma.js';
import { badRequest, conflict, forbidden, notFound, paymentFailed, unprocessable } from '../../lib/errors.js';
import { formatDateOnly, hotelToday, nightsBetween, parseDateOnly } from '../../lib/dates.js';
import { round2, toNumber } from '../../lib/money.js';
import { trace, traceScenario } from '../../lib/trace.js';
import { getSettings } from '../../lib/settings.js';
import { Reservation, ACTIVE_STATUSES } from '../../domain/Reservation.js';
import { Room } from '../../domain/Room.js';
import { Payment } from '../../domain/Payment.js';
import { LoyaltyAccount } from '../../domain/LoyaltyAccount.js';
import { AuditLog } from '../../domain/AuditLog.js';
import { notificationService } from '../../integrations/NotificationService.js';
import { hasPermission } from '../../middleware/auth.js';
import { validateStayDates, roomView } from './room.service.js';
import { releaseExpiredHolds } from './holds.js';
import * as channelSync from '../channels/channelSync.service.js';

export const reservationInclude = {
  room: { include: { roomType: true } },
  guest: { include: { user: { select: { id: true, name: true, email: true, phone: true } } } },
  payments: { orderBy: { createdAt: 'asc' } },
  invoice: true,
  digitalKey: true,
  otaChannel: { select: { id: true, channelName: true, code: true } },
};

export const formatReference = (n) => (n ? `HRMS-${String(n).padStart(6, '0')}` : null);

export function reservationView(r) {
  if (!r) return null;
  const nights = nightsBetween(r.checkInDate, r.checkOutDate);
  const paid = round2((r.payments || []).filter((p) => ['CAPTURED', 'REFUNDED'].includes(p.status)).reduce((s, p) => s + toNumber(p.amount) - toNumber(p.refundedAmount), 0));
  return {
    id: r.id,
    reservationNumber: r.reservationNumber,
    reference: formatReference(r.reservationNumber),
    status: r.status,
    checkInDate: formatDateOnly(r.checkInDate),
    checkOutDate: formatDateOnly(r.checkOutDate),
    nights,
    numGuests: r.numGuests,
    totalAmount: toNumber(r.totalAmount),
    discountAmount: toNumber(r.discountAmount),
    pointsRedeemed: r.pointsRedeemed,
    currency: r.currency,
    source: r.source,
    externalRef: r.externalRef,
    specialRequests: r.specialRequests,
    holdExpiresAt: r.holdExpiresAt,
    confirmedAt: r.confirmedAt,
    identityVerifiedAt: r.identityVerifiedAt,
    identityDocument: r.identityDocument,
    checkedInAt: r.checkedInAt,
    checkedOutAt: r.checkedOutAt,
    cancelledAt: r.cancelledAt,
    cancellationReason: r.cancellationReason,
    cancellationFee: toNumber(r.cancellationFee),
    createdAt: r.createdAt,
    amountPaid: paid,
    room: r.room ? roomView(r.room) : undefined,
    guest: r.guest ? { id: r.guest.id, guestId: r.guest.guestId, name: r.guest.user?.name, email: r.guest.user?.email, phone: r.guest.user?.phone } : undefined,
    otaChannel: r.otaChannel ?? null,
    payments: (r.payments || []).map((p) => ({
      id: p.id, amount: toNumber(p.amount), currency: p.currency, status: p.status, purpose: p.purpose,
      paymentMethod: p.paymentMethod, methodSummary: p.methodSummary, transactionRef: p.transactionRef,
      paidAt: p.paidAt, failureReason: p.failureReason, refundedAmount: toNumber(p.refundedAmount),
      originalAmount: p.originalAmount ? toNumber(p.originalAmount) : null, originalCurrency: p.originalCurrency, createdAt: p.createdAt,
    })),
    invoice: r.invoice ? { id: r.invoice.id, invoiceNumber: r.invoice.invoiceNumber, totalAmount: toNumber(r.invoice.totalAmount), issueDate: r.invoice.issueDate, status: r.invoice.status } : null,
    digitalKey: r.digitalKey ? { status: r.digitalKey.status, keyType: r.digitalKey.keyType, issueDate: r.digitalKey.issueDate, expiryDate: r.digitalKey.expiryDate } : null,
  };
}

/** Load a reservation enforcing SE-5 / BR-9: guests see only their own; staff with reservation.manage see all. */
export async function loadReservationFor(user, id, include = reservationInclude) {
  const r = await prisma.reservation.findUnique({ where: { id }, include });
  if (!r) throw notFound('Reservation');
  const isOwner = user.guestPk && r.guestId === user.guestPk;
  const isStaff = hasPermission(user, 'reservation.manage') || hasPermission(user, 'frontdesk.checkin') || hasPermission(user, 'payment.read');
  if (!isOwner && !isStaff) throw notFound('Reservation'); // do not reveal other guests' bookings
  return r;
}

async function resolveGuestPk(user, requestedGuestPk) {
  if (user.guestPk) return user.guestPk; // a guest always books for themselves (BR-1: exactly one holder)
  if (!hasPermission(user, 'reservation.manage')) throw forbidden();
  if (!requestedGuestPk) throw badRequest('Select the guest this reservation is for.');
  const guest = await prisma.guest.findUnique({ where: { id: requestedGuestPk } });
  if (!guest) throw notFound('Guest');
  return guest.id;
}

/**
 * Step 1 of SD-1 — Guest.makeReservation() / Receptionist.createReservation()
 * checkAvailability() -> calculateAmount() -> Lock Room Inventory (PENDING_PAYMENT with a hold).
 * Returns the reservation that now awaits payment (DFD 2.3 -> "Reservation Details (for payment)").
 */
export async function createReservation(user, input) {
  traceScenario('SD-1 Making Room Reservation');
  const settings = await getSettings();
  const { checkIn, checkOut } = validateStayDates(input.checkIn, input.checkOut);
  const guestPk = await resolveGuestPk(user, input.guestId);
  await releaseExpiredHolds();

  const actor = user.guestPk ? 'Guest' : 'Receptionist';
  trace(actor, 'HRMS', user.guestPk ? 'makeReservation()' : 'createReservation()', { ref: 'SD-1 msg 3', activity: 'Select Room / Request Smart Allocation', dfd: '2.2 Select Room / Temporary Reservation' });

  const room = await prisma.room.findUnique({ where: { id: input.roomId }, include: { roomType: true } });
  if (!room) throw notFound('Room');
  if (input.numGuests > room.capacity) throw badRequest(`Room ${room.roomNumber} accommodates at most ${room.capacity} guests.`);

  trace('HRMS', 'Reservation', 'checkAvailability()', { ref: 'SD-1 msg 4' });
  trace('Reservation', 'Room', 'isAvailable()', { ref: 'CD-1 msg 4/5' });
  const available = await Reservation.checkAvailability(room.id, checkIn, checkOut);
  if (!available) {
    trace('Room', 'Reservation', 'Room unavailable', { ref: 'UC-1 alt', kind: 'return', branch: 'failure', activity: 'Rooms Available? — No' });
    throw conflict('ROOM_UNAVAILABLE', `Room ${room.roomNumber} is not available for those dates. Please pick another room or change your dates.`);
  }
  trace('Reservation', 'HRMS', 'Room available', { ref: 'SD-1', kind: 'return' });

  // Optional loyalty redemption (Guest.Rewards.Redeem): discount computed now, points debited only on confirmation.
  const nights = nightsBetween(checkIn, checkOut);
  const roomCharges = round2(nights * toNumber(room.baseRate));
  let pointsToRedeem = 0;
  if (input.redeemPoints > 0) {
    const account = await prisma.loyaltyAccount.findUnique({ where: { guestId: guestPk } });
    const max = LoyaltyAccount.maxRedeemable(account, roomCharges, settings);
    if (input.redeemPoints > max) throw unprocessable('REDEMPTION_LIMIT', `You can redeem at most ${max} points on this stay.`);
    pointsToRedeem = input.redeemPoints;
  }

  trace('HRMS', 'Reservation', 'calculateAmount()', { ref: 'SD-1 msg 6' });
  const amount = Reservation.calculateAmount({
    nightlyRate: room.baseRate, checkIn, checkOut, taxRatePercent: settings.taxRatePercent,
    discount: pointsToRedeem * settings.loyaltyPointValue,
  });
  trace('Reservation', 'HRMS', `Total amount ₹${amount.total.toLocaleString('en-IN')}`, { ref: 'SD-1', kind: 'return' });

  trace('HRMS', 'Room', 'Lock Room Inventory', { ref: 'Activity', activity: 'Lock Room Inventory', dfd: '2.2 Lock Room (Temporary Hold) → D2' });
  let reservation;
  try {
    reservation = await prisma.reservation.create({
      data: {
        guestId: guestPk,
        roomId: room.id,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        numGuests: input.numGuests,
        status: 'PENDING_PAYMENT',
        totalAmount: amount.total,
        discountAmount: amount.discount,
        pointsRedeemed: pointsToRedeem,
        currency: settings.baseCurrency,
        specialRequests: input.specialRequests || null,
        source: user.guestPk ? (input.viaConcierge ? 'AI_CONCIERGE' : 'DIRECT') : 'RECEPTIONIST',
        holdExpiresAt: new Date(Date.now() + settings.paymentHoldMinutes * 60_000),
        createdById: user.id,
      },
      include: reservationInclude,
    });
  } catch (err) {
    Reservation.assertNoOverlapError(err); // DB exclusion constraint = last line of defence against double booking
  }
  trace('HRMS', 'Reservation', 'store reservation (PENDING_PAYMENT)', { ref: 'DFD 2.3', dfd: '2.3 Create Reservation → D3 Reservation Data', kind: 'call' });
  await AuditLog.record({ action: 'RESERVATION_CREATED', entityType: 'Reservation', entityId: reservation.id, performedBy: user.id, details: { roomNumber: room.roomNumber, checkIn: formatDateOnly(checkIn), checkOut: formatDateOnly(checkOut), total: amount.total } });
  return { reservation: reservationView(reservation), pricing: amount, holdMinutes: settings.paymentHoldMinutes };
}

/**
 * Step 2 of SD-1 — Payment and confirmation (DFD 3.1 -> 3.2 -> 3.3; BR-5).
 * <Payment Successful?>  No  -> Release Inventory Lock, notify guest (CI-2), reservation becomes a recoverable DRAFT
 *                        Yes -> confirm() -> Room.updateStatus() -> FORK(...) -> JOIN -> "Reservation confirmed"
 */
export async function payReservation(user, reservationId, { method, details, payCurrency }) {
  traceScenario('SD-1 Making Room Reservation');
  await releaseExpiredHolds();
  let r = await loadReservationFor(user, reservationId);
  if (user.guestPk && r.guestId !== user.guestPk) throw notFound('Reservation');
  if (!['PENDING_PAYMENT', 'DRAFT'].includes(r.status)) throw unprocessable('ALREADY_PROCESSED', `This reservation is already ${r.status.replace('_', ' ').toLowerCase()}.`);

  // A recoverable draft (failed/expired payment) must re-lock the room before a new attempt.
  if (r.status === 'DRAFT') {
    const settings = await getSettings();
    trace('HRMS', 'Reservation', 'checkAvailability()', { ref: 'SD-1 msg 4', note: 'retry from draft' });
    if (!(await Reservation.checkAvailability(r.roomId, r.checkInDate, r.checkOutDate))) {
      throw conflict('ROOM_UNAVAILABLE', 'Sorry — this room was booked by someone else while your booking was pending. Please search again.');
    }
    try {
      r = await prisma.reservation.update({ where: { id: r.id }, data: { status: 'PENDING_PAYMENT', holdExpiresAt: new Date(Date.now() + settings.paymentHoldMinutes * 60_000) }, include: reservationInclude });
    } catch (err) {
      Reservation.assertNoOverlapError(err);
    }
    trace('HRMS', 'Room', 'Lock Room Inventory', { ref: 'Activity', activity: 'Lock Room Inventory' });
  }

  const actor = user.guestPk ? 'Guest' : 'Receptionist';
  trace(actor, 'HRMS', 'Provide Payment Details', { ref: 'Activity', activity: 'Provide Payment Details', dfd: '3.1 Validate Payment Details' });

  const result = await Payment.process({
    reservationId: r.id, amount: toNumber(r.totalAmount), purpose: 'RESERVATION',
    method, details, payCurrency, performedBy: user.id, ref: 'SD-1 msg 7-11',
  });

  if (!result.success) {
    // Activity: Release Inventory Lock ; Fig.3 PAYMENT FAILED "guest may retry"
    trace('HRMS', 'Room', 'Release Inventory Lock', { ref: 'Activity', activity: 'Release Inventory Lock', branch: 'failure' });
    await prisma.reservation.update({ where: { id: r.id }, data: { status: 'DRAFT', holdExpiresAt: null } });
    trace('HRMS', 'NotificationService', 'sendPush(payment problem)', { ref: 'CI-2', branch: 'failure' });
    await notificationService.notifyUser(r.guest.user.id, {
      type: 'PAYMENT_FAILED', channels: ['IN_APP', 'PUSH', 'EMAIL'],
      subject: 'Payment unsuccessful',
      body: `We could not process your payment for room ${r.room.roomNumber} (${result.reason}). Your booking was saved as a draft — you can retry any time.`,
    });
    trace('HRMS', actor, 'Payment failed — reservation not confirmed', { ref: 'UC-1 alt', kind: 'return', branch: 'failure' });
    throw paymentFailed(result.reason, { reservationId: r.id, paymentId: result.payment.id });
  }

  // BR-5 satisfied: payment verified -> confirm
  let confirmed;
  try {
    confirmed = await prisma.$transaction(async (tx) => {
      trace('HRMS', 'Reservation', 'confirm()', { ref: 'SD-1 msg 12', activity: 'Confirm Reservation', dfd: '3.3 Update Reservation → D3' });
      const c = await Reservation.confirm(r, tx);
      if (r.pointsRedeemed > 0) {
        await LoyaltyAccount.redeemPoints(r.guestId, r.pointsRedeemed, { reservationId: r.id, description: `Redeemed on reservation ${formatReference(c.reservationNumber)}`, db: tx });
      }
      await AuditLog.record({ action: 'RESERVATION_CONFIRMED', entityType: 'Reservation', entityId: r.id, performedBy: user.id, details: { reservationNumber: c.reservationNumber, amount: toNumber(r.totalAmount) } }, tx);
      return c;
    });
  } catch (err) {
    // Payment succeeded but confirmation failed (e.g. points spent elsewhere): refund automatically.
    await Payment.refund(r.id, toNumber(r.totalAmount), { performedBy: user.id, reason: 'Automatic refund: confirmation failed' });
    await prisma.reservation.update({ where: { id: r.id }, data: { status: 'DRAFT', holdExpiresAt: null } });
    throw err;
  }
  trace('Reservation', 'HRMS', `Reservation confirmed + reservation number ${formatReference(confirmed.reservationNumber)}`, { ref: 'SD-1', kind: 'return' });

  trace('HRMS', 'Room', 'updateStatus()', { ref: 'SD-1 msg 13' });
  await Room.updateStatus(r.roomId);

  await runConfirmationFork(r, confirmed, user);

  trace('HRMS', actor, 'Reservation confirmed', { ref: 'SD-1 msg 16', kind: 'return' });
  const full = await prisma.reservation.findUnique({ where: { id: r.id }, include: reservationInclude });
  return { reservation: reservationView(full), payment: { id: result.payment.id, transactionRef: result.payment.transactionRef, amount: toNumber(result.payment.amount), methodSummary: result.payment.methodSummary } };
}

/**
 * Activity diagram FORK after "Confirm Reservation". The branches are independent and run
 * concurrently; a failure in one branch (e.g. an OTA being down) never undoes the booking.
 */
async function runConfirmationFork(r, confirmed, user) {
  trace('HRMS', 'HRMS', 'FORK ⟂', { ref: 'Activity', kind: 'fork', activity: 'fork after Confirm Reservation' });
  const ref = formatReference(confirmed.reservationNumber);
  const settings = await getSettings();
  const branches = await Promise.allSettled([
    (async () => {
      trace('HRMS', 'ChannelSync', 'syncReservations()', { ref: 'SD-1 msg 14', activity: 'Sync Booking Status to OTA Channels', branch: 'fork' });
      const out = await channelSync.pushAvailabilityToAll({ reason: `Reservation ${ref} confirmed`, reservationId: r.id });
      trace('ChannelSync', 'HRMS', 'Synchronization completed', { ref: 'SD-1', kind: 'return', branch: 'fork' });
      return out;
    })(),
    (async () => {
      trace('HRMS', 'NotificationService', 'sendEmail(to, subject, body)', { ref: 'SD-1 msg 15 / CI-1', activity: 'Send Booking Confirmation (Email / SMS)', branch: 'fork' });
      await notificationService.notifyUser(r.guest.user.id, {
        type: 'BOOKING_CONFIRMED', channels: ['EMAIL', 'SMS', 'IN_APP'],
        subject: `Booking confirmed · ${ref}`,
        body: `Your ${r.room.roomType.typeName} (room ${r.room.roomNumber}) is confirmed for ${formatDateOnly(r.checkInDate)} → ${formatDateOnly(r.checkOutDate)}, ${r.numGuests} guest(s). Total paid: ₹${toNumber(r.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}. Check-in from ${settings.checkInTime}.`,
      });
      trace('NotificationService', 'Guest', 'Confirmation sent', { ref: 'CD-1 msg 16', kind: 'return', branch: 'fork' });
    })(),
    (async () => {
      trace('HRMS', 'GuestProfile', 'Update Guest Profile & Loyalty Account', { ref: 'Activity', activity: 'Update Guest Profile & Loyalty Account', branch: 'fork', note: 'booking history & preferences only; points are credited at check-out (BR-6)' });
      const profile = await prisma.guestProfile.findUnique({ where: { guestId: r.guestId } });
      if (profile) {
        const prefs = { ...(profile.preferences || {}), lastRoomType: r.room.roomType.typeName };
        await prisma.guestProfile.update({ where: { id: profile.id }, data: { preferences: prefs } });
      }
    })(),
    (async () => {
      trace('HRMS', 'Room', 'Record Booking and Update Inventory', { ref: 'Activity', activity: 'Record Booking and Update Inventory', branch: 'fork', dfd: 'D2 Room Inventory / D3 Reservation Data' });
      await AuditLog.record({ action: 'INVENTORY_UPDATED', entityType: 'Room', entityId: r.roomId, performedBy: user.id, details: { reservation: ref } });
    })(),
  ]);
  const failed = branches.filter((b) => b.status === 'rejected');
  for (const f of failed) console.error('[fork] branch failed:', f.reason?.message);
  trace('HRMS', 'HRMS', failed.length ? `JOIN ⟂ (${failed.length} branch deferred)` : 'JOIN ⟂', { ref: 'Activity', kind: 'join' });
}

/** Reservation.Modify — change dates and/or room (room type), subject to availability. */
export async function modifyReservation(user, id, input) {
  traceScenario('Modify Reservation (UC-1 step 4)');
  const settings = await getSettings();
  const r = await loadReservationFor(user, id);
  if (user.guestPk && r.guestId !== user.guestPk) throw notFound('Reservation');
  Reservation.assertModifiable(r, hotelToday());

  const checkIn = input.checkIn ? parseDateOnly(input.checkIn) : r.checkInDate;
  const checkOut = input.checkOut ? parseDateOnly(input.checkOut) : r.checkOutDate;
  validateStayDates(formatDateOnly(checkIn), formatDateOnly(checkOut));
  const numGuests = input.numGuests ?? r.numGuests;
  let room = r.room;
  if (input.roomId && input.roomId !== r.roomId) {
    room = await prisma.room.findUnique({ where: { id: input.roomId }, include: { roomType: true } });
    if (!room) throw notFound('Room');
  }
  if (numGuests > room.capacity) throw badRequest(`Room ${room.roomNumber} accommodates at most ${room.capacity} guests.`);

  trace('HRMS', 'Reservation', 'checkAvailability()', { ref: 'UC-1', note: 'excluding this reservation' });
  if (!(await Reservation.checkAvailability(room.id, checkIn, checkOut, { excludeReservationId: r.id }))) {
    throw conflict('ROOM_UNAVAILABLE', `Room ${room.roomNumber} is not available for the new dates.`);
  }
  trace('HRMS', 'Reservation', 'calculateAmount()', { ref: 'UC-1' });
  const amount = Reservation.calculateAmount({ nightlyRate: room.baseRate, checkIn, checkOut, taxRatePercent: settings.taxRatePercent, discount: toNumber(r.discountAmount) });
  const delta = round2(amount.total - toNumber(r.totalAmount));

  if (delta > 0) {
    if (!input.payment) {
      return { requiresPayment: true, amountDue: delta, newTotal: amount.total, pricing: amount };
    }
    const pay = await Payment.process({ reservationId: r.id, amount: delta, purpose: 'RESERVATION', method: input.payment.method, details: input.payment.details, performedBy: user.id, ref: 'UC-1 modify' });
    if (!pay.success) throw paymentFailed(pay.reason, { reservationId: r.id });
  }

  trace('HRMS', 'Reservation', 'modify()', { ref: 'Class diagram', activity: 'Manage Reservations (View / Modify)' });
  let updated;
  try {
    updated = await prisma.reservation.update({
      where: { id: r.id },
      data: { checkInDate: checkIn, checkOutDate: checkOut, roomId: room.id, numGuests, totalAmount: amount.total },
      include: reservationInclude,
    });
  } catch (err) {
    if (delta > 0) await Payment.refund(r.id, delta, { performedBy: user.id, reason: 'Modification failed' });
    Reservation.assertNoOverlapError(err);
  }
  if (delta < 0) await Payment.refund(r.id, -delta, { performedBy: user.id, reason: 'Reservation modified (lower price)' });

  await Promise.allSettled([Room.updateStatus(r.roomId), Room.updateStatus(room.id)]);
  await AuditLog.record({ action: 'RESERVATION_MODIFIED', entityType: 'Reservation', entityId: r.id, performedBy: user.id, details: { from: { checkIn: formatDateOnly(r.checkInDate), checkOut: formatDateOnly(r.checkOutDate), room: r.room.roomNumber }, to: { checkIn: formatDateOnly(checkIn), checkOut: formatDateOnly(checkOut), room: room.roomNumber }, priceDifference: delta } });
  await Promise.allSettled([
    channelSync.pushAvailabilityToAll({ reason: `Reservation ${formatReference(r.reservationNumber)} modified` }),
    notificationService.notifyUser(r.guest.user.id, { type: 'BOOKING_MODIFIED', subject: `Reservation ${formatReference(r.reservationNumber)} updated`, body: `Your stay is now ${formatDateOnly(checkIn)} → ${formatDateOnly(checkOut)} in room ${room.roomNumber}.${delta ? ` Price difference: ₹${delta.toFixed(2)}${delta < 0 ? ' (refunded)' : ' (charged)'}.` : ''}` }),
  ]);
  const full = await prisma.reservation.findUnique({ where: { id: r.id }, include: reservationInclude });
  return { reservation: reservationView(full), priceDifference: delta };
}

/** Reservation.Cancel.Confirm — preview the BR-8 terms so the UI can ask for confirmation. */
export async function cancellationTerms(user, id) {
  const r = await loadReservationFor(user, id);
  return Reservation.cancellationTerms(r, await getSettings());
}

/** Reservation.Cancel (BR-8). Requires { confirm: true } — the explicit confirmation step. */
export async function cancelReservation(user, id, { confirm, reason }) {
  traceScenario('Cancel Reservation (UC-1 / BR-8)');
  if (!confirm) throw badRequest('Please confirm the cancellation.');
  const settings = await getSettings();
  const r = await loadReservationFor(user, id);
  if (user.guestPk && r.guestId !== user.guestPk) throw notFound('Reservation');
  const terms = Reservation.cancellationTerms(r, settings);

  trace(user.guestPk ? 'Guest' : 'Receptionist', 'HRMS', 'cancelReservation()', { ref: 'Class diagram' });
  trace('HRMS', 'Reservation', 'cancel()', { ref: 'Class diagram', note: terms.freeCancellation ? 'free cancellation' : `fee ₹${terms.cancellationFee}` });
  await prisma.$transaction(async (tx) => {
    await tx.reservation.update({
      where: { id: r.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason || (user.guestPk ? 'Cancelled by guest' : 'Cancelled by front desk'), cancellationFee: terms.cancellationFee, holdExpiresAt: null },
    });
    if (r.pointsRedeemed && r.status === 'CONFIRMED' && terms.freeCancellation) {
      await LoyaltyAccount.restorePoints(r.guestId, r.pointsRedeemed, { reservationId: r.id, description: 'Points returned (free cancellation)', db: tx });
    }
    await AuditLog.record({ action: 'RESERVATION_CANCELLED', entityType: 'Reservation', entityId: r.id, performedBy: user.id, details: terms }, tx);
  });

  let refunded = 0;
  if (terms.refundAmount > 0) refunded = await Payment.refund(r.id, terms.refundAmount, { performedBy: user.id, reason: 'Cancellation' });

  await Room.updateStatus(r.roomId);
  await Promise.allSettled([
    channelSync.pushAvailabilityToAll({ reason: `Reservation ${formatReference(r.reservationNumber) ?? r.id} cancelled` }),
    r.source === 'OTA' ? channelSync.reportStatusToOta(r.id, 'CANCELLED') : null,
    notificationService.notifyUser(r.guest.user.id, {
      type: 'BOOKING_CANCELLED', channels: ['EMAIL', 'IN_APP'],
      subject: `Reservation ${formatReference(r.reservationNumber) ?? '#' + r.id} cancelled`,
      body: terms.freeCancellation ? `Your reservation was cancelled free of charge.${refunded ? ` ₹${refunded.toFixed(2)} will be refunded to your original payment method.` : ''}` : `Your reservation was cancelled within ${settings.freeCancellationHours} hours of check-in, so a one-night charge of ₹${terms.cancellationFee.toFixed(2)} applies. ₹${refunded.toFixed(2)} will be refunded.`,
    }),
  ]);
  const full = await prisma.reservation.findUnique({ where: { id: r.id }, include: reservationInclude });
  return { reservation: reservationView(full), terms, refunded };
}

/** Guest: own reservations. Staff: all, with filters. */
export async function listReservations(user, q = {}) {
  await releaseExpiredHolds();
  const where = {};
  if (user.guestPk) where.guestId = user.guestPk;
  else if (!hasPermission(user, 'reservation.manage') && !hasPermission(user, 'payment.read')) throw forbidden();
  if (q.status) where.status = { in: q.status.split(',') };
  if (q.source) where.source = q.source;
  if (q.from) where.checkOutDate = { gte: parseDateOnly(q.from) };
  if (q.to) where.checkInDate = { lte: parseDateOnly(q.to) };
  if (q.arrivingOn) where.checkInDate = parseDateOnly(q.arrivingOn);
  if (q.departingOn) where.checkOutDate = parseDateOnly(q.departingOn);
  if (q.search) {
    const s = q.search.trim();
    const num = Number(s.replace(/\D/g, ''));
    where.OR = [
      { guest: { user: { name: { contains: s, mode: 'insensitive' } } } },
      { guest: { user: { email: { contains: s, mode: 'insensitive' } } } },
      { guest: { guestId: { contains: s.toUpperCase() } } },
      { room: { roomNumber: s } },
      ...(num ? [{ reservationNumber: num }] : []),
      { externalRef: { contains: s, mode: 'insensitive' } },
    ];
  }
  const rows = await prisma.reservation.findMany({
    where,
    include: reservationInclude,
    orderBy: q.sort === 'created' ? { createdAt: 'desc' } : [{ checkInDate: user.guestPk ? 'desc' : 'asc' }],
    take: Math.min(Number(q.limit) || 200, 500),
  });
  return rows.map(reservationView);
}

export async function getReservation(user, id) {
  const r = await loadReservationFor(user, id, {
    ...reservationInclude,
    channelSyncs: { include: { channel: { select: { channelName: true } } }, orderBy: { lastSyncAt: 'desc' }, take: 10 },
    serviceRequests: { orderBy: { createdAt: 'desc' } },
  });
  const view = reservationView(r);
  view.channelSyncs = r.channelSyncs.map((s) => ({ id: s.id, channel: s.channel.channelName, syncType: s.syncType, syncStatus: s.syncStatus, lastSyncAt: s.lastSyncAt }));
  view.serviceRequests = r.serviceRequests.map((s) => ({ id: s.id, category: s.category, description: s.description, status: s.status, charge: toNumber(s.charge), createdAt: s.createdAt }));
  view.timeline = await prisma.auditLog.findMany({ where: { OR: [{ entityType: 'Reservation', entityId: String(r.id) }, { entityType: 'Payment', entityId: { in: r.payments.map((p) => String(p.id)) } }] }, orderBy: { timestamp: 'asc' }, select: { action: true, timestamp: true, details: true } });
  return view;
}

/** Guest.Profile.History — stays in the previous 12 months. */
export async function stayHistory(user) {
  const since = new Date(hotelToday().getTime() - 365 * 24 * 3600_000);
  const rows = await prisma.reservation.findMany({
    where: { guestId: user.guestPk, status: { in: ['CHECKED_OUT', 'CHECKED_IN', 'CONFIRMED', 'CANCELLED'] }, checkInDate: { gte: since } },
    include: reservationInclude,
    orderBy: { checkInDate: 'desc' },
  });
  return rows.map(reservationView);
}

export { ACTIVE_STATUSES };
