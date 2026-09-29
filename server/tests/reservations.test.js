/**
 * SRS 4.1 Reservation and Smart Room Allocation + 3.0 Payment Processing
 * Tests 3 (availability), 4 (double booking), 5 (creation), 6 (cancellation), 7 (payment success), 8 (payment failure)
 * SD-1 "Making Room Reservation"
 */
import { describe, expect, it } from 'vitest';
import { api, book, CARD_DECLINED, CARD_OK, CARD_TIMEOUT, day, freeRoom, login, prisma } from './helpers.js';

describe('3. Room availability (Reservation.Search / .Filter / .Allocate.Smart)', () => {
  it('returns only rooms free for the whole stay, ranked by smart allocation', async () => {
    const guest = await login('guest@hrms.test');
    const res = await api().get(`/api/rooms/search?checkIn=${day(40)}&checkOut=${day(42)}&guests=2`).set(guest.auth);
    expect(res.status).toBe(200);
    expect(res.body.rooms.length).toBeGreaterThan(0);
    expect(res.body.recommendedRoomId).toBe(res.body.rooms[0].id);
    const scores = res.body.rooms.map((r) => r.recommendation.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(res.body.usedPreferences).toBe(true);
    // Aarav prefers high floor / sea view / king bed: top recommendation should reflect it
    expect(res.body.rooms[0].recommendation.reasons.join(' ')).toMatch(/floor|view|King/i);
    expect(res.body.trace.steps.map((s) => s.message)).toContain('isAvailable()');
  });

  it('excludes a booked room for overlapping dates but offers it for adjacent dates', async () => {
    const r = await prisma.reservation.findFirst({ where: { status: 'CONFIRMED', checkInDate: { gt: new Date() } }, include: { room: true } });
    const ci = r.checkInDate.toISOString().slice(0, 10);
    const co = r.checkOutDate.toISOString().slice(0, 10);
    const overlap = await api().get(`/api/rooms/search?checkIn=${ci}&checkOut=${co}&guests=1`);
    expect(overlap.body.rooms.find((x) => x.id === r.roomId)).toBeUndefined();
    const res2 = await prisma.reservation.findFirst({ where: { roomId: r.roomId, status: { in: ['CONFIRMED', 'CHECKED_IN', 'PENDING_PAYMENT'] }, checkInDate: { gte: r.checkOutDate, lt: new Date(r.checkOutDate.getTime() + 86400000) } } });
    if (!res2) {
      const after = await api().get(`/api/rooms/search?checkIn=${co}&checkOut=${new Date(r.checkOutDate.getTime() + 86400000).toISOString().slice(0, 10)}&guests=1`);
      expect(after.body.rooms.find((x) => x.id === r.roomId)).toBeDefined(); // half-open date ranges
    }
  });

  it('filters by category, price and accessibility; validates dates', async () => {
    const res = await api().get(`/api/rooms/search?checkIn=${day(45)}&checkOut=${day(46)}&guests=1&category=SUITE&maxPrice=13000`);
    expect(res.body.rooms.every((r) => r.roomType.category === 'SUITE' && r.baseRate <= 13000)).toBe(true);
    const acc = await api().get(`/api/rooms/search?checkIn=${day(45)}&checkOut=${day(46)}&guests=1&accessible=true`);
    expect(acc.body.rooms.length).toBeGreaterThan(0);
    expect(acc.body.rooms.every((r) => r.accessible)).toBe(true);
    expect((await api().get(`/api/rooms/search?checkIn=${day(3)}&checkOut=${day(2)}`)).status).toBe(400);
    expect((await api().get(`/api/rooms/search?checkIn=${day(-3)}&checkOut=${day(2)}`)).status).toBe(400);
  });
});

describe('4. Double booking prevention (BR-3 / Reservation.Prevent.DoubleBooking)', () => {
  it('rejects a second booking of the same room for overlapping dates', async () => {
    const a = await login('guest@hrms.test');
    const b = await login('meera@hrms.test');
    const room = await freeRoom(day(50), day(53));
    const first = await book(a, { roomId: room.id, checkIn: day(50), checkOut: day(53) });
    expect(first.paid.status).toBe(200);
    const second = await api().post('/api/reservations').set(b.auth).send({ roomId: room.id, checkIn: day(52), checkOut: day(55), numGuests: 1 });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ROOM_UNAVAILABLE');
    // back-to-back is allowed (check-out day = next check-in day)
    const adjacent = await api().post('/api/reservations').set(b.auth).send({ roomId: room.id, checkIn: day(53), checkOut: day(54), numGuests: 1 });
    expect(adjacent.status).toBe(201);
  });

  it('concurrent requests for the same room: exactly one wins (database exclusion constraint)', async () => {
    const a = await login('guest@hrms.test');
    const b = await login('meera@hrms.test');
    const room = await freeRoom(day(60), day(62));
    const results = await Promise.all([
      api().post('/api/reservations').set(a.auth).send({ roomId: room.id, checkIn: day(60), checkOut: day(62), numGuests: 1 }),
      api().post('/api/reservations').set(b.auth).send({ roomId: room.id, checkIn: day(61), checkOut: day(63), numGuests: 1 }),
      api().post('/api/reservations').set(a.auth).send({ roomId: room.id, checkIn: day(60), checkOut: day(61), numGuests: 1 }),
    ]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
  });

  it('the database itself refuses overlapping active reservations', async () => {
    const existing = await prisma.reservation.findFirst({ where: { status: 'CONFIRMED' } });
    await expect(prisma.reservation.create({ data: { guestId: existing.guestId, roomId: existing.roomId, checkInDate: existing.checkInDate, checkOutDate: existing.checkOutDate, numGuests: 1, status: 'CONFIRMED', reservationNumber: 999999, totalAmount: 1 } })).rejects.toThrow(/no_double_booking|23P01|exclusion/i);
  });
});

describe('5 + 7. Reservation creation and successful payment (SD-1)', () => {
  it('locks the room, verifies payment, confirms with a sequential reservation number and syncs OTAs', async () => {
    const guest = await login('guest@hrms.test');
    const room = await freeRoom(day(70), day(72));
    const created = await api().post('/api/reservations').set(guest.auth).send({ roomId: room.id, checkIn: day(70), checkOut: day(72), numGuests: 2 });
    expect(created.status).toBe(201);
    const r = created.body.reservation;
    expect(r.status).toBe('PENDING_PAYMENT');
    expect(r.reservationNumber).toBeNull(); // BR-5: no confirmation before payment
    expect(new Date(r.holdExpiresAt) > new Date()).toBe(true);
    expect(created.body.pricing.total).toBeCloseTo(Number(room.baseRate) * 2 * 1.12, 2);

    const before = await prisma.reservation.aggregate({ _max: { reservationNumber: true } });
    const paid = await api().post(`/api/reservations/${r.id}/pay`).set(guest.auth).send(CARD_OK);
    expect(paid.status).toBe(200);
    expect(paid.body.reservation.status).toBe('CONFIRMED');
    expect(paid.body.reservation.reservationNumber).toBe(before._max.reservationNumber + 1);
    expect(paid.body.reservation.reference).toMatch(/^HRMS-\d{6}$/);
    expect(paid.body.payment.methodSummary).toMatch(/•••• 4242$/);

    const payment = await prisma.payment.findFirst({ where: { reservationId: r.id } });
    expect(payment.status).toBe('CAPTURED');
    expect(JSON.stringify(payment)).not.toContain('4242424242424242'); // SE-4: no raw card data stored

    // SD-1 message order as executed
    const msgs = paid.body.trace.steps.map((s) => s.message);
    const order = ['initiate()', 'authorize(', 'verify()', 'confirm()', 'updateStatus()', 'syncReservations()', 'sendEmail(to, subject, body)', 'Reservation confirmed'];
    let last = -1;
    for (const m of order) {
      const i = msgs.findIndex((x, idx) => idx > last && x.startsWith(m));
      expect(i, `message ${m}`).toBeGreaterThan(last);
      last = i;
    }
    // fork branches ran: confirmation e-mail + OTA push + audit
    expect(await prisma.notification.count({ where: { userId: guest.user.id, type: 'BOOKING_CONFIRMED', channel: 'EMAIL' } })).toBeGreaterThan(0);
    expect(await prisma.channelSync.count({ where: { reservationId: r.id, syncType: 'PUSH_AVAILABILITY' } })).toBeGreaterThan(0);
    expect(await prisma.auditLog.count({ where: { action: 'RESERVATION_CONFIRMED', entityId: String(r.id) } })).toBe(1);
  });

  it('receptionist can create a reservation for a guest', async () => {
    const reception = await login('reception@hrms.test');
    const guest = await prisma.guest.findFirst({ where: { user: { email: 'liam@hrms.test' } } });
    const room = await freeRoom(day(75), day(76));
    const { created, paid } = await book(reception, { roomId: room.id, checkIn: day(75), checkOut: day(76), numGuests: 1, extra: { guestId: guest.id } });
    expect(created.status).toBe(201);
    expect(paid.body.reservation.source).toBe('RECEPTIONIST');
    expect(paid.body.reservation.guest.email).toBe('liam@hrms.test');
  });
});

describe('8. Payment failure (Fig. 3 / Activity "Release Inventory Lock")', () => {
  it('a declined card leaves the reservation unconfirmed, releases the lock and lets the guest retry', async () => {
    const guest = await login('guest@hrms.test');
    const room = await freeRoom(day(80), day(82));
    const created = await api().post('/api/reservations').set(guest.auth).send({ roomId: room.id, checkIn: day(80), checkOut: day(82), numGuests: 2 });
    const id = created.body.reservation.id;
    const fail = await api().post(`/api/reservations/${id}/pay`).set(guest.auth).send(CARD_DECLINED);
    expect(fail.status).toBe(402);
    expect(fail.body.error.code).toBe('PAYMENT_FAILED');
    const after = await prisma.reservation.findUnique({ where: { id } });
    expect(after.status).toBe('DRAFT');
    expect(after.reservationNumber).toBeNull();
    expect((await prisma.payment.findFirst({ where: { reservationId: id } })).status).toBe('FAILED');
    expect(await prisma.notification.count({ where: { userId: guest.user.id, type: 'PAYMENT_FAILED' } })).toBeGreaterThan(0); // CI-2
    // lock released: another guest could now take the room
    const search = await api().get(`/api/rooms/search?checkIn=${day(80)}&checkOut=${day(82)}&guests=1`);
    expect(search.body.rooms.some((r) => r.id === room.id)).toBe(true);
    // gateway timeout is also a failure
    const timeout = await api().post(`/api/reservations/${id}/pay`).set(guest.auth).send(CARD_TIMEOUT);
    expect(timeout.status).toBe(402);
    // retry with a good card succeeds
    const retry = await api().post(`/api/reservations/${id}/pay`).set(guest.auth).send(CARD_OK);
    expect(retry.status).toBe(200);
    expect(retry.body.reservation.status).toBe('CONFIRMED');
  });

  it('rejects malformed card details before contacting the gateway', async () => {
    const guest = await login('guest@hrms.test');
    const room = await freeRoom(day(84), day(85));
    const created = await api().post('/api/reservations').set(guest.auth).send({ roomId: room.id, checkIn: day(84), checkOut: day(85), numGuests: 1 });
    const res = await api().post(`/api/reservations/${created.body.reservation.id}/pay`).set(guest.auth).send({ method: 'CARD', details: { cardNumber: '1234 5678 9012 3456', expiry: '12/30', cvv: '123' } });
    expect(res.status).toBe(400);
    expect(await prisma.payment.count({ where: { reservationId: created.body.reservation.id } })).toBe(0);
  });
});

describe('6. Reservation cancellation (Reservation.Cancel, .Cancel.Confirm, BR-8)', () => {
  it('requires explicit confirmation, refunds in full outside 48 h and frees the room', async () => {
    const guest = await login('guest@hrms.test');
    const room = await freeRoom(day(90), day(92));
    const { paid } = await book(guest, { roomId: room.id, checkIn: day(90), checkOut: day(92) });
    const id = paid.body.reservation.id;
    const terms = await api().get(`/api/reservations/${id}/cancellation-terms`).set(guest.auth);
    expect(terms.body.freeCancellation).toBe(true);
    expect(terms.body.cancellationFee).toBe(0);
    expect((await api().post(`/api/reservations/${id}/cancel`).set(guest.auth).send({})).status).toBe(400);
    const res = await api().post(`/api/reservations/${id}/cancel`).set(guest.auth).send({ confirm: true });
    expect(res.status).toBe(200);
    expect(res.body.reservation.status).toBe('CANCELLED');
    expect(res.body.refunded).toBeCloseTo(paid.body.reservation.totalAmount, 2);
    expect((await prisma.payment.findFirst({ where: { reservationId: id } })).status).toBe('REFUNDED');
    const search = await api().get(`/api/rooms/search?checkIn=${day(90)}&checkOut=${day(92)}&guests=1`);
    expect(search.body.rooms.some((r) => r.id === room.id)).toBe(true);
  });

  it('charges one night when cancelled within 48 hours of check-in', async () => {
    const guest = await login('guest@hrms.test');
    const room = await freeRoom(day(1), day(3), { exclude: ['305'] });
    const { paid } = await book(guest, { roomId: room.id, checkIn: day(1), checkOut: day(3) });
    const id = paid.body.reservation.id;
    const res = await api().post(`/api/reservations/${id}/cancel`).set(guest.auth).send({ confirm: true });
    expect(res.body.terms.freeCancellation).toBe(false);
    const oneNight = paid.body.reservation.totalAmount / 2;
    expect(res.body.terms.cancellationFee).toBeCloseTo(oneNight, 2);
    expect(res.body.refunded).toBeCloseTo(paid.body.reservation.totalAmount - oneNight, 2);
  });

  it('modifies dates of a confirmed reservation, charging the difference', async () => {
    const guest = await login('guest@hrms.test');
    const room = await freeRoom(day(95), day(99));
    const { paid } = await book(guest, { roomId: room.id, checkIn: day(95), checkOut: day(96) });
    const id = paid.body.reservation.id;
    const quote = await api().patch(`/api/reservations/${id}`).set(guest.auth).send({ checkOut: day(97) });
    expect(quote.body.requiresPayment).toBe(true);
    const res = await api().patch(`/api/reservations/${id}`).set(guest.auth).send({ checkOut: day(97), payment: CARD_OK });
    expect(res.status).toBe(200);
    expect(res.body.reservation.checkOutDate).toBe(day(97));
    expect(res.body.priceDifference).toBeCloseTo(quote.body.amountDue, 2);
  });
});
