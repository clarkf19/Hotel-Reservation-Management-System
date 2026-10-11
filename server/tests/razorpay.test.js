/**
 * Real Razorpay gateway integration — tested against a fake Razorpay REST API (global fetch is
 * intercepted), so no network calls and no money are involved.
 */
import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { api, day, freeRoom, login, prisma } from './helpers.js';

const SECRET = 'test_secret_for_hrms_suite';
const sign = (orderId, paymentId) => crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');

// --- fake Razorpay API ---------------------------------------------------------------------------
const orders = new Map();
const payments = new Map();
let seq = 0;
const realFetch = globalThis.fetch;
function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
async function fakeRazorpay(url, init = {}) {
  const u = new URL(url);
  const body = init.body ? JSON.parse(init.body) : {};
  const auth = Buffer.from(String(init.headers?.Authorization || '').replace('Basic ', ''), 'base64').toString();
  if (auth !== `rzp_test_HRMSFAKEKEY:${SECRET}`) return json(401, { error: { description: 'Authentication failed' } });
  let m;
  if (init.method === 'POST' && u.pathname === '/v1/orders') {
    const order = { id: `order_T${++seq}`, amount: body.amount, currency: body.currency, receipt: body.receipt, status: 'created' };
    orders.set(order.id, order);
    return json(200, order);
  }
  if ((m = u.pathname.match(/^\/v1\/payments\/([^/]+)$/))) return payments.has(m[1]) ? json(200, payments.get(m[1])) : json(400, { error: { description: 'The id provided does not exist' } });
  if ((m = u.pathname.match(/^\/v1\/payments\/([^/]+)\/capture$/))) { const p = payments.get(m[1]); p.status = 'captured'; return json(200, p); }
  if ((m = u.pathname.match(/^\/v1\/payments\/([^/]+)\/refund$/))) { const p = payments.get(m[1]); p.amount_refunded = (p.amount_refunded || 0) + body.amount; return json(200, { id: `rfnd_T${++seq}`, amount: body.amount }); }
  return json(404, { error: { description: 'not found' } });
}
/** What Razorpay Checkout would do in the browser when the guest pays. */
function guestPaysInCheckout(orderId, { status = 'captured', amount, method = 'upi' } = {}) {
  const order = orders.get(orderId);
  const id = `pay_T${++seq}`;
  payments.set(id, { id, order_id: orderId, amount: amount ?? order.amount, currency: 'INR', status, method, vpa: 'clark@okhdfc', amount_refunded: 0 });
  return { paymentId: id, signature: sign(orderId, id) };
}

beforeAll(() => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_HRMSFAKEKEY';
  process.env.RAZORPAY_KEY_SECRET = SECRET;
  process.env.RAZORPAY_CHARGE_PAISE = '100';
  vi.stubGlobal('fetch', (url, init) => (String(url).startsWith('https://api.razorpay.com/') ? fakeRazorpay(String(url), init) : realFetch(url, init)));
});
afterAll(() => {
  vi.unstubAllGlobals();
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_CHARGE_PAISE;
});

async function newBooking(guest, offset) {
  const room = await freeRoom(day(offset), day(offset + 2));
  const res = await api().post('/api/reservations').set(guest.auth).send({ roomId: room.id, checkIn: day(offset), checkOut: day(offset + 2), numGuests: 1 });
  return res.body.reservation;
}

describe('Razorpay gateway (real PSP integration, faked API)', () => {
  it('reports its configuration (test mode, ₹1 demo charge)', async () => {
    const guest = await login('guest@hrms.test');
    const res = await api().get('/api/payments/razorpay/config').set(guest.auth);
    expect(res.body).toEqual({ enabled: true, mode: 'test', keyId: 'rzp_test_HRMSFAKEKEY', demoChargeAmount: 1 });
  });

  it('order → Checkout → verified signature → capture → reservation confirmed (₹1 charged, booking value recorded)', async () => {
    const guest = await login('guest@hrms.test');
    const r = await newBooking(guest, 140);
    const order = await api().post(`/api/reservations/${r.id}/razorpay/order`).set(guest.auth);
    expect(order.status).toBe(200);
    expect(order.body.amountPaise).toBe(100);
    expect(order.body.demoCharge).toBe(true);
    expect(order.body.keyId).toBe('rzp_test_HRMSFAKEKEY');
    expect(JSON.stringify(order.body)).not.toContain(SECRET); // the secret never reaches the browser

    const { paymentId, signature } = guestPaysInCheckout(order.body.orderId, { status: 'authorized' });
    const done = await api().post(`/api/reservations/${r.id}/razorpay/verify`).set(guest.auth).send({ orderId: order.body.orderId, paymentId, signature });
    expect(done.status).toBe(200);
    expect(done.body.reservation.status).toBe('CONFIRMED');
    expect(done.body.reservation.reference).toMatch(/^HRMS-\d{6}$/);
    expect(payments.get(paymentId).status).toBe('captured'); // authorised payment was captured

    const p = await prisma.payment.findUnique({ where: { gatewayOrderId: order.body.orderId } });
    expect(p).toMatchObject({ status: 'CAPTURED', gateway: 'RAZORPAY', transactionRef: paymentId, paymentMethod: 'UPI' });
    expect(Number(p.gatewayAmount)).toBe(1);
    expect(Number(p.amount)).toBe(r.totalAmount);
    expect(p.methodSummary).toMatch(/Razorpay TEST · UPI .*₹1\.00 demo charge/);
    const msgs = done.body.trace.steps.map((s) => s.message);
    expect(msgs).toEqual(expect.arrayContaining(['verify() — signature', 'confirm()', 'syncReservations()']));

    // verifying the same payment again is idempotent
    const again = await api().post(`/api/reservations/${r.id}/razorpay/verify`).set(guest.auth).send({ orderId: order.body.orderId, paymentId, signature });
    expect(again.status).toBe(200);
  });

  it('rejects a forged signature: payment FAILED, room lock released, reservation not confirmed', async () => {
    const guest = await login('guest@hrms.test');
    const r = await newBooking(guest, 145);
    const order = await api().post(`/api/reservations/${r.id}/razorpay/order`).set(guest.auth);
    const { paymentId } = guestPaysInCheckout(order.body.orderId);
    const res = await api().post(`/api/reservations/${r.id}/razorpay/verify`).set(guest.auth).send({ orderId: order.body.orderId, paymentId, signature: 'a'.repeat(64) });
    expect(res.status).toBe(402);
    expect(res.body.error.message).toMatch(/signature/i);
    expect((await prisma.reservation.findUnique({ where: { id: r.id } })).status).toBe('DRAFT');
    expect((await prisma.payment.findUnique({ where: { gatewayOrderId: order.body.orderId } })).status).toBe('FAILED');
  });

  it('rejects a payment whose amount does not match the order', async () => {
    const guest = await login('guest@hrms.test');
    const r = await newBooking(guest, 150);
    const order = await api().post(`/api/reservations/${r.id}/razorpay/order`).set(guest.auth);
    const { paymentId, signature } = guestPaysInCheckout(order.body.orderId, { amount: 50 });
    const res = await api().post(`/api/reservations/${r.id}/razorpay/verify`).set(guest.auth).send({ orderId: order.body.orderId, paymentId, signature });
    expect(res.status).toBe(402);
    expect((await prisma.reservation.findUnique({ where: { id: r.id } })).reservationNumber).toBeNull();
  });

  it('closing Checkout releases the room lock and keeps a recoverable draft', async () => {
    const guest = await login('guest@hrms.test');
    const r = await newBooking(guest, 155);
    const order = await api().post(`/api/reservations/${r.id}/razorpay/order`).set(guest.auth);
    const res = await api().post(`/api/reservations/${r.id}/razorpay/cancel`).set(guest.auth).send({ orderId: order.body.orderId, reason: 'Checkout closed by guest' });
    expect(res.body).toMatchObject({ released: true, status: 'DRAFT' });
    expect((await prisma.payment.findUnique({ where: { gatewayOrderId: order.body.orderId } })).status).toBe('FAILED');
  });

  it('free cancellation refunds the ₹1 through Razorpay', async () => {
    const guest = await login('guest@hrms.test');
    const r = await newBooking(guest, 160);
    const order = await api().post(`/api/reservations/${r.id}/razorpay/order`).set(guest.auth);
    const { paymentId, signature } = guestPaysInCheckout(order.body.orderId);
    await api().post(`/api/reservations/${r.id}/razorpay/verify`).set(guest.auth).send({ orderId: order.body.orderId, paymentId, signature }).expect(200);
    const res = await api().post(`/api/reservations/${r.id}/cancel`).set(guest.auth).send({ confirm: true });
    expect(res.status).toBe(200);
    expect(payments.get(paymentId).amount_refunded).toBe(100);
    expect((await prisma.payment.findUnique({ where: { gatewayOrderId: order.body.orderId } })).status).toBe('REFUNDED');
  });

  it('finance reconciliation checks Razorpay payments against Razorpay', async () => {
    const finance = await login('finance@hrms.test');
    const res = await api().post('/api/payments/reconcile').set(finance.auth).send({ apply: false });
    const rzp = res.body.items.filter((i) => i.gateway === 'RAZORPAY');
    expect(rzp.length).toBeGreaterThan(0);
    expect(rzp.every((i) => i.reconStatus === 'MATCHED')).toBe(true);
  });

  it('a guest cannot pay for someone else\'s reservation', async () => {
    const meera = await login('meera@hrms.test');
    const other = await prisma.reservation.findFirst({ where: { status: 'DRAFT', guest: { user: { email: 'guest@hrms.test' } } } });
    const res = await api().post(`/api/reservations/${other.id}/razorpay/order`).set(meera.auth);
    expect(res.status).toBe(404);
  });
});
