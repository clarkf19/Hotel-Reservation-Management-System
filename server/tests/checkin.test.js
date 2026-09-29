/**
 * SRS 4.6 Digital Check-in and Contactless Services — SD-2 "Digital Check-in + Digital Room Key"
 * Tests 9 (digital check-in), 10 (digital key generation), 11 (digital key expiration), 15 (checkout)
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { api, book, CARD_DECLINED, CARD_OK, day, freeRoom, login, prisma } from './helpers.js';

const ID = { documentType: 'PASSPORT', documentNumber: 'K1234567', keyType: 'QR' };
let guest;
let reservationId;
let roomNumber;
let keyCode;

beforeAll(async () => {
  guest = await login('guest@hrms.test');
  const room = await freeRoom(day(0), day(2), { exclude: ['305'] });
  roomNumber = room.roomNumber;
  const { paid } = await book(guest, { roomId: room.id, checkIn: day(0), checkOut: day(2) });
  reservationId = paid.body.reservation.id;
});

describe('9. Digital check-in (CheckIn.Online, CheckIn.Verify.Identity, BR-7)', () => {
  it('rejects check-in before the arrival date — "check-in rejected" branch', async () => {
    const room = await freeRoom(day(20), day(21));
    const { paid } = await book(guest, { roomId: room.id, checkIn: day(20), checkOut: day(21) });
    const res = await api().post(`/api/reservations/${paid.body.reservation.id}/check-in`).set(guest.auth).send(ID);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CHECKIN_NOT_ALLOWED');
    const msgs = res.body.trace.steps.map((s) => s.message);
    expect(msgs).toEqual(expect.arrayContaining(['verifyReservation()', 'verification failed', 'check-in rejected']));
  });

  it('rejects an invalid identity document (front desk assistance required)', async () => {
    const res = await api().post(`/api/reservations/${reservationId}/check-in`).set(guest.auth).send({ ...ID, documentNumber: '12' });
    expect(res.status).toBe(400); // schema: too short
    const res2 = await api().post(`/api/reservations/${reservationId}/check-in`).set(guest.auth).send({ ...ID, documentNumber: 'NOTAPASSPORT' });
    expect(res2.status).toBe(422);
    expect(res2.body.error.code).toBe('IDENTITY_NOT_VERIFIED');
    expect((await prisma.reservation.findUnique({ where: { id: reservationId } })).status).toBe('CONFIRMED');
  });

  it('checks the guest in when the reservation is confirmed and the date has arrived', async () => {
    const res = await api().post(`/api/reservations/${reservationId}/check-in`).set(guest.auth).send(ID);
    expect(res.status).toBe(200);
    expect(res.body.reservation.status).toBe('CHECKED_IN');
    expect(res.body.reservation.identityDocument).toBe('Passport ••••4567'); // only a masked number is stored
    const msgs = res.body.trace.steps.map((s) => s.message);
    expect(msgs).toEqual(expect.arrayContaining(['initiate online check-in()', 'verifyReservation()', 'reservation verified', 'verify Guest identity', 'issueKey()', 'digital key issued', 'digital room key']));
    const room = await prisma.room.findUnique({ where: { roomNumber } });
    expect(room.status).toBe('OCCUPIED');
  });
});

describe('10. Digital key generation and smart lock (Room.Access.Issue, SmartLockController.unlock)', () => {
  it('issues one time-bound key valid only for the reserved room and stay', async () => {
    const res = await api().get(`/api/reservations/${reservationId}/digital-key`).set(guest.auth);
    expect(res.status).toBe(200);
    keyCode = res.body.digitalKey.keyCode;
    expect(keyCode).toMatch(/^HRMS-/);
    expect(res.body.digitalKey.status).toBe('ACTIVE');
    expect(new Date(res.body.digitalKey.validTo) > new Date()).toBe(true);
    expect(await prisma.digitalKey.count({ where: { reservationId } })).toBe(1);
  });

  it('unlocks the reserved room and logs the access (D5 Room Access Logs)', async () => {
    const res = await api().post('/api/access/unlock').set(guest.auth).send({ roomNumber, keyCode });
    expect(res.body.granted).toBe(true);
    expect(res.body.trace.steps.map((s) => s.message)).toEqual(expect.arrayContaining(['verifyKey()', 'key verified', 'unlock(keyCode)', 'room unlocked']));
    const log = await prisma.roomAccessLog.findFirst({ where: { reservationId }, orderBy: { attemptedAt: 'desc' } });
    expect(log.result).toBe('GRANTED');
  });

  it('denies access to any other room', async () => {
    const res = await api().post('/api/access/unlock').set(guest.auth).send({ roomNumber: roomNumber === '101' ? '102' : '101', keyCode });
    expect(res.body.granted).toBe(false);
    expect(res.body.reason).toMatch(/not valid for room/);
  });

  it('denies an unknown key', async () => {
    const res = await api().post('/api/access/unlock').set(guest.auth).send({ roomNumber, keyCode: 'HRMS-FORGEDKEY' });
    expect(res.body.granted).toBe(false);
  });
});

describe('11. Digital key expiration (Room.Access.Revoke)', () => {
  it('an expired key is denied and marked EXPIRED', async () => {
    const other = await login('meera@hrms.test');
    const r = await prisma.reservation.findFirst({ where: { guest: { user: { email: 'meera@hrms.test' } }, status: 'CHECKED_IN' }, include: { digitalKey: true, room: true } });
    await prisma.digitalKey.update({ where: { id: r.digitalKey.id }, data: { expiryDate: new Date(Date.now() - 60_000), issueDate: new Date(Date.now() - 3 * 86400000) } });
    const res = await api().post('/api/access/unlock').set(other.auth).send({ roomNumber: r.room.roomNumber, keyCode: r.digitalKey.keyCode });
    expect(res.body.granted).toBe(false);
    expect(res.body.reason).toBe('Key has expired');
    expect((await prisma.digitalKey.findUnique({ where: { id: r.digitalKey.id } })).status).toBe('EXPIRED');
    expect(await prisma.roomAccessLog.count({ where: { digitalKeyId: r.digitalKey.id, result: 'DENIED' } })).toBeGreaterThan(0);
  });

  it('the background job expires keys whose stay has ended', async () => {
    const { DigitalKey } = await import('../src/domain/DigitalKey.js');
    const active = await prisma.digitalKey.findFirst({ where: { status: 'ACTIVE' } });
    await prisma.digitalKey.update({ where: { id: active.id }, data: { expiryDate: new Date(Date.now() - 1000) } });
    await DigitalKey.expireOverdue();
    expect((await prisma.digitalKey.findUnique({ where: { id: active.id } })).status).toBe('EXPIRED');
  });
});

describe('15. Checkout (CheckOut.Express, Invoice.Generate, BR-6)', () => {
  it('adds service charges, takes final payment (retrying after a decline), revokes the key, invoices and awards points', async () => {
    const svc = await api().post('/api/service-requests').set(guest.auth).send({ category: 'EXTRA_BED', description: 'Extra bed please', reservationId });
    expect(svc.status).toBe(201);
    const summary = await api().get(`/api/reservations/${reservationId}/checkout-summary`).set(guest.auth);
    expect(summary.body.serviceSubtotal).toBe(2000);
    expect(summary.body.balanceDue).toBeCloseTo(2240, 2);

    const noPay = await api().post(`/api/reservations/${reservationId}/check-out`).set(guest.auth).send({});
    expect(noPay.status).toBe(422);
    expect(noPay.body.error.code).toBe('PAYMENT_REQUIRED');
    const declined = await api().post(`/api/reservations/${reservationId}/check-out`).set(guest.auth).send({ payment: CARD_DECLINED });
    expect(declined.status).toBe(402); // <Payment Successful?> No -> retry
    expect((await prisma.reservation.findUnique({ where: { id: reservationId } })).status).toBe('CHECKED_IN');

    const loyaltyBefore = await prisma.loyaltyAccount.findFirst({ where: { guest: { user: { email: 'guest@hrms.test' } } } });
    const res = await api().post(`/api/reservations/${reservationId}/check-out`).set(guest.auth).send({ payment: CARD_OK });
    expect(res.status).toBe(200);
    expect(res.body.reservation.status).toBe('CHECKED_OUT');
    expect(res.body.invoice.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
    expect(res.body.invoice.amountPaid).toBeCloseTo(res.body.invoice.totalAmount, 2);

    const key = await prisma.digitalKey.findUnique({ where: { reservationId } });
    expect(key.status).toBe('REVOKED');
    const denied = await api().post('/api/access/unlock').set(guest.auth).send({ roomNumber, keyCode });
    expect(denied.body.granted).toBe(false);

    const loyaltyAfter = await prisma.loyaltyAccount.findUnique({ where: { id: loyaltyBefore.id } });
    expect(loyaltyAfter.pointsBalance).toBeGreaterThan(loyaltyBefore.pointsBalance); // BR-6: only now
    expect(res.body.loyalty.points).toBe(loyaltyAfter.pointsBalance - loyaltyBefore.pointsBalance);

    const room = await prisma.room.findUnique({ where: { roomNumber } });
    expect(room.status).toBe('CLEANING');
    expect(await prisma.notification.count({ where: { userId: guest.user.id, type: 'INVOICE', channel: 'EMAIL' } })).toBeGreaterThan(0);

    const pdf = await api().get(`/api/invoices/${res.body.invoice.id}/pdf`).set(guest.auth);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('loyalty points are not credited at booking time (BR-6)', async () => {
    const acct = await prisma.loyaltyAccount.findFirst({ where: { guest: { user: { email: 'guest@hrms.test' } } } });
    const room = await freeRoom(day(33), day(35));
    await book(guest, { roomId: room.id, checkIn: day(33), checkOut: day(35) });
    const after = await prisma.loyaltyAccount.findUnique({ where: { id: acct.id } });
    expect(after.pointsBalance).toBe(acct.pointsBalance);
  });
});
