/**
 * SRS 4.3 Multi-Channel Booking Synchronization — SD-3 "OTA Booking Synchronization + Conflict Resolution"
 * Tests 12 (OTA synchronization), 13 (conflict detection), 14 (conflict resolution)
 */
import { describe, expect, it } from 'vitest';
import { api, day, freeRoom, login, prisma } from './helpers.js';

describe('12. OTA synchronization (Channel.Sync.Inventory / .Status)', () => {
  it('imports new OTA bookings, confirms them back to the OTA and pushes availability', async () => {
    const manager = await login('manager@hrms.test');
    const channel = await prisma.oTAChannel.findFirst({ where: { code: 'OTAC' } });
    const room = await freeRoom(day(100), day(102));
    const sim = await api().post(`/api/channels/${channel.id}/simulate`).set(manager.auth).send({ roomNumber: room.roomNumber, guestName: 'Nina Park', guestEmail: 'nina.park@example.com', checkIn: day(100), checkOut: day(102), numGuests: 2 });
    expect(sim.status).toBe(200);
    const ref = sim.body.booking.externalRef;

    const res = await api().post('/api/channels/sync').set(manager.auth).send({ channelId: channel.id });
    expect(res.status).toBe(200);
    expect(res.body.summary[0].created).toBeGreaterThanOrEqual(1);
    const msgs = res.body.trace.steps.map((s) => s.message);
    expect(msgs).toEqual(expect.arrayContaining(['syncReservations()', 'pullBookings()', 'detectConflicts()', 'updateBookingStatus()', 'status updated', 'pushAvailability()', 'availability updated']));

    const r = await prisma.reservation.findUnique({ where: { otaChannelId_externalRef: { otaChannelId: channel.id, externalRef: ref } } });
    expect(r.status).toBe('CONFIRMED');
    expect(r.source).toBe('OTA');
    expect(r.reservationNumber).toBeGreaterThan(0);
    const ota = await prisma.mockOtaBooking.findUnique({ where: { channelId_externalRef: { channelId: channel.id, externalRef: ref } } });
    expect(ota.hrmsStatus).toBe('CONFIRMED');
  });

  it('reflects a cancellation made on the OTA', async () => {
    const manager = await login('manager@hrms.test');
    const channel = await prisma.oTAChannel.findFirst({ where: { code: 'OTAC' } });
    const booking = await prisma.mockOtaBooking.findFirst({ where: { channelId: channel.id, guestEmail: 'nina.park@example.com' } });
    await api().post(`/api/channels/${channel.id}/simulate`).set(manager.auth).send({ action: 'cancel', externalRef: booking.externalRef }).expect(200);
    await api().post('/api/channels/sync').set(manager.auth).send({ channelId: channel.id }).expect(200);
    const r = await prisma.reservation.findUnique({ where: { otaChannelId_externalRef: { otaChannelId: channel.id, externalRef: booking.externalRef } } });
    expect(r.status).toBe('CANCELLED');
  });

  it('records a failure (and keeps the booking) when an OTA is unreachable', async () => {
    const manager = await login('manager@hrms.test');
    const channel = await prisma.oTAChannel.findFirst({ where: { code: 'OTAA' } });
    await prisma.oTAChannel.update({ where: { id: channel.id }, data: { status: 'ERROR' } });
    const res = await api().post('/api/channels/sync').set(manager.auth).send({ channelId: channel.id });
    expect(res.body.summary[0].errors).toBe(1);
    expect(await prisma.channelSync.count({ where: { channelId: channel.id, syncStatus: 'FAILED' } })).toBeGreaterThan(0);
    await prisma.oTAChannel.update({ where: { id: channel.id }, data: { status: 'CONNECTED' } });
  });
});

describe('13. OTA conflict detection (Channel.Sync.Conflict)', () => {
  it('flags an OTA booking for a room HRMS already holds, instead of double booking', async () => {
    const reception = await login('reception@hrms.test');
    const channel = await prisma.oTAChannel.findFirst({ where: { code: 'OTAB' } });
    const res = await api().post('/api/channels/sync').set(reception.auth).send({ channelId: channel.id });
    expect(res.status).toBe(200);
    expect(res.body.summary[0].conflicts).toBeGreaterThanOrEqual(1);
    const conflict = await prisma.channelSync.findFirst({ where: { externalRef: 'OTAB-7Q2K9P', syncStatus: 'CONFLICT' } });
    expect(conflict.conflictType).toBe('ROOM_ALREADY_BOOKED');
    expect(conflict.errorMessage).toMatch(/room 203/);
    expect(await prisma.reservation.count({ where: { externalRef: 'OTAB-7Q2K9P' } })).toBe(0);
    const ota = await prisma.mockOtaBooking.findFirst({ where: { externalRef: 'OTAB-7Q2K9P' } });
    expect(ota.hrmsStatus).toBe('PENDING_RECONCILIATION');
    expect(await prisma.notification.count({ where: { type: 'OTA_CONFLICT', user: { email: 'reception@hrms.test' } } })).toBeGreaterThan(0);
    const list = await api().get('/api/channels/conflicts').set(reception.auth);
    expect(list.body.conflicts.some((c) => c.externalRef === 'OTAB-7Q2K9P')).toBe(true);
  });

  it('does not re-flag the same booking on the next sync', async () => {
    const reception = await login('reception@hrms.test');
    const channel = await prisma.oTAChannel.findFirst({ where: { code: 'OTAB' } });
    await api().post('/api/channels/sync').set(reception.auth).send({ channelId: channel.id });
    expect(await prisma.channelSync.count({ where: { externalRef: 'OTAB-7Q2K9P', syncStatus: 'CONFLICT' } })).toBe(1);
  });
});

describe('14. OTA conflict resolution by a Receptionist', () => {
  it('REASSIGN_ROOM accepts the OTA booking in another free room and tells the OTA', async () => {
    const reception = await login('reception@hrms.test');
    const conflict = await prisma.channelSync.findFirst({ where: { externalRef: 'OTAB-7Q2K9P', syncStatus: 'CONFLICT' } });
    const options = await api().get(`/api/channels/conflicts/${conflict.id}/options`).set(reception.auth);
    expect(options.body.candidateRooms.length).toBeGreaterThan(0);
    const target = options.body.candidateRooms[0];
    const res = await api().post(`/api/channels/conflicts/${conflict.id}/resolve`).set(reception.auth).send({ resolution: 'REASSIGN_ROOM', targetRoomId: target.id, note: 'Upgraded to a free room' });
    expect(res.status).toBe(200);
    expect(res.body.trace.steps.map((s) => s.message)).toEqual(expect.arrayContaining(['resolveOTAConflicts()', 'resolveConflicts()', 'updateBookingStatus()', 'status updated', 'conflict resolved', 'pushAvailability()']));
    const r = await prisma.reservation.findUnique({ where: { id: res.body.reservationId }, include: { room: true } });
    expect(r.room.roomNumber).toBe(target.roomNumber);
    expect(r.status).toBe('CONFIRMED');
    expect((await prisma.channelSync.findUnique({ where: { id: conflict.id } })).syncStatus).toBe('RESOLVED');
    const ota = await prisma.mockOtaBooking.findFirst({ where: { externalRef: 'OTAB-7Q2K9P' } });
    expect(ota.hrmsStatus).toBe('CONFIRMED');
    expect(ota.roomNumber).toBe(target.roomNumber);
  });

  it('REJECT_OTA_BOOKING declines the OTA booking without touching HRMS reservations', async () => {
    const reception = await login('reception@hrms.test');
    const conflict = await prisma.channelSync.findFirst({ where: { externalRef: 'OTAA-M4X8TD', syncStatus: 'CONFLICT' } });
    const before = await prisma.reservation.findUnique({ where: { id: conflict.conflictReservationId } });
    const res = await api().post(`/api/channels/conflicts/${conflict.id}/resolve`).set(reception.auth).send({ resolution: 'REJECT_OTA_BOOKING' });
    expect(res.status).toBe(200);
    expect((await prisma.mockOtaBooking.findFirst({ where: { externalRef: 'OTAA-M4X8TD' } })).hrmsStatus).toBe('REJECTED');
    const after = await prisma.reservation.findUnique({ where: { id: before.id } });
    expect(after.roomId).toBe(before.roomId);
    expect(after.status).toBe(before.status);
  });

  it('a Guest cannot resolve conflicts', async () => {
    const guest = await login('guest@hrms.test');
    expect((await api().post('/api/channels/conflicts/1/resolve').set(guest.auth).send({ resolution: 'REJECT_OTA_BOOKING' })).status).toBe(403);
  });
});
