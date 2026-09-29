import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { addDays, formatDateOnly, hotelToday } from '../src/lib/dates.js';

export const app = createApp();
export const api = () => request(app);
export const PASSWORD = 'Hotel@2026';
export const CARD_OK = { method: 'CARD', details: { cardNumber: '4242 4242 4242 4242', expiry: '12/30', cvv: '123', cardholder: 'Test Guest' } };
export const CARD_DECLINED = { method: 'CARD', details: { cardNumber: '4000 0000 0000 0002', expiry: '12/30', cvv: '123' } };
export const CARD_TIMEOUT = { method: 'CARD', details: { cardNumber: '4000 0000 0009 0003', expiry: '12/30', cvv: '123' } };

export async function login(email) {
  const res = await api().post('/api/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, user: res.body.user, auth: { Authorization: `Bearer ${res.body.token}` } };
}

export const day = (offset) => formatDateOnly(addDays(hotelToday(), offset));

/** A room with no active reservation in [checkIn, checkOut). */
export async function freeRoom(checkIn, checkOut, { exclude = [], capacity = 2 } = {}) {
  const ci = new Date(`${checkIn}T00:00:00Z`);
  const co = new Date(`${checkOut}T00:00:00Z`);
  const rooms = await prisma.room.findMany({ where: { status: { notIn: ['MAINTENANCE', 'OUT_OF_SERVICE'] }, capacity: { gte: capacity }, roomNumber: { notIn: exclude } }, orderBy: { roomNumber: 'asc' } });
  for (const r of rooms) {
    const clash = await prisma.reservation.findFirst({ where: { roomId: r.id, status: { in: ['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN'] }, checkInDate: { lt: co }, checkOutDate: { gt: ci } } });
    if (!clash) return r;
  }
  throw new Error('no free room');
}

/** Create + pay a reservation as the given user. */
export async function book(session, { roomId, checkIn, checkOut, numGuests = 2, payment = CARD_OK, extra = {} }) {
  const created = await api().post('/api/reservations').set(session.auth).send({ roomId, checkIn, checkOut, numGuests, ...extra });
  if (created.status !== 201) return { created };
  const paid = await api().post(`/api/reservations/${created.body.reservation.id}/pay`).set(session.auth).send(payment);
  return { created, paid };
}

export { prisma };
