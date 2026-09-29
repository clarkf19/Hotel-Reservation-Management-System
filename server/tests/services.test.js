/**
 * SRS 4.4 AI Virtual Concierge, 4.5 Loyalty, 4.7 Analytics, Finance reconciliation, audit logging (SE-6)
 */
import { describe, expect, it } from 'vitest';
import { api, day, login, prisma } from './helpers.js';
import { parseBookingRequest } from '../src/modules/guest-services/concierge.service.js';
import { Reservation } from '../src/domain/Reservation.js';
import { LoyaltyAccount } from '../src/domain/LoyaltyAccount.js';
import { DigitalKey } from '../src/domain/DigitalKey.js';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';

const settings = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k, v]) => [k, v.value]));

describe('AI Concierge (AI.Query, AI.FAQ.Answer, AI.Booking, AI.Query.Escalate)', () => {
  it('answers FAQs from the knowledge base and labels the source honestly', async () => {
    const guest = await login('guest@hrms.test');
    const res = await api().post('/api/concierge/messages').set(guest.auth).send({ message: 'What time is check-in?' });
    expect(res.status).toBe(200);
    expect(res.body.message.resolved).toBe(true);
    expect(res.body.message.source).toBe('KNOWLEDGE_BASE');
    expect(res.body.message.response).toMatch(/2:00 pm/);
    expect(res.body.mode).toMatch(/Knowledge base/);
  });

  it('files a service request for "Can I get extra towels?" (Submit Service Request)', async () => {
    const meera = await login('meera@hrms.test');
    const res = await api().post('/api/concierge/messages').set(meera.auth).send({ message: 'Can I get extra towels please?' });
    expect(res.body.action.type).toBe('SERVICE_REQUEST_CREATED');
    const sr = await prisma.serviceRequest.findUnique({ where: { id: res.body.action.requestId } });
    expect(sr.category).toBe('AMENITIES');
  });

  it('helps with booking by searching real availability (AI.Booking)', async () => {
    const guest = await login('guest@hrms.test');
    const res = await api().post('/api/concierge/messages').set(guest.auth).send({ message: `Book a deluxe room from ${day(110)} to ${day(112)} for 2 guests` });
    expect(res.body.action.type).toBe('ROOM_SUGGESTIONS');
    expect(res.body.action.rooms.length).toBeGreaterThan(0);
  });

  it('escalates questions it cannot answer to a Receptionist', async () => {
    const guest = await login('guest@hrms.test');
    const res = await api().post('/api/concierge/messages').set(guest.auth).send({ message: 'My grandmother needs her insulin kept refrigerated overnight' });
    expect(res.body.message.resolved).toBe(false);
    expect(res.body.action.type).toBe('ESCALATED');
    const sr = await prisma.serviceRequest.findUnique({ where: { id: res.body.action.requestId } });
    expect(sr.isEscalation).toBe(true);
    const reception = await login('reception@hrms.test');
    const reply = await api().patch(`/api/service-requests/${sr.id}`).set(reception.auth).send({ status: 'COMPLETED', staffNote: 'A medical fridge has been placed in your room.' });
    expect(reply.status).toBe(200);
  });

  it('parses natural-language dates', () => {
    const today = new Date(Date.UTC(2026, 8, 29));
    const p = parseBookingRequest('suite from 12 oct to 15 oct for 3 guests', today);
    expect(p.checkIn.toISOString().slice(0, 10)).toBe('2026-10-12');
    expect(p.checkOut.toISOString().slice(0, 10)).toBe('2026-10-15');
    expect(p.guests).toBe(3);
    expect(p.category).toBe('SUITE');
    expect(parseBookingRequest('tomorrow for 2 nights', today).checkOut.toISOString().slice(0, 10)).toBe('2026-10-02');
  });
});

describe('Domain rules (unit)', () => {
  it('Reservation.calculateAmount applies nights, discount and tax', () => {
    const a = Reservation.calculateAmount({ nightlyRate: 5000, checkIn: '2026-10-01', checkOut: '2026-10-04', taxRatePercent: 12, discount: 1000 });
    expect(a).toMatchObject({ nights: 3, roomCharges: 15000, discount: 1000, tax: 1680, total: 15680 });
  });

  it('Reservation state machine follows the documented lifecycle', () => {
    expect(Reservation.canTransition('PENDING_PAYMENT', 'CONFIRMED')).toBe(true);
    expect(Reservation.canTransition('DRAFT', 'CONFIRMED')).toBe(false); // BR-5
    expect(Reservation.canTransition('CHECKED_OUT', 'CANCELLED')).toBe(false);
    expect(Reservation.canTransition('CONFIRMED', 'CHECKED_OUT')).toBe(false);
  });

  it('LoyaltyAccount tiers and earning', () => {
    expect(LoyaltyAccount.tierFor(0, settings.loyaltyTiers).name).toBe('SILVER');
    expect(LoyaltyAccount.tierFor(2600, settings.loyaltyTiers).name).toBe('GOLD');
    expect(LoyaltyAccount.tierFor(9000, settings.loyaltyTiers).name).toBe('PLATINUM');
    expect(LoyaltyAccount.pointsForStay(10000, 'GOLD', settings)).toBe(625);
  });

  it('DigitalKey.verifyKey rules', () => {
    const base = { status: 'ACTIVE', issueDate: new Date(Date.now() - 1000), expiryDate: new Date(Date.now() + 60_000), reservation: { status: 'CHECKED_IN', room: { roomNumber: '301' } } };
    expect(DigitalKey.verifyKey(base, '301').valid).toBe(true);
    expect(DigitalKey.verifyKey(base, '302').valid).toBe(false);
    expect(DigitalKey.verifyKey({ ...base, status: 'REVOKED' }, '301').reason).toMatch(/revoked/);
    expect(DigitalKey.verifyKey({ ...base, expiryDate: new Date(Date.now() - 1) }, '301').expired).toBe(true);
    expect(DigitalKey.verifyKey({ ...base, issueDate: new Date(Date.now() + 60_000) }, '301').reason).toMatch(/not valid yet/);
  });
});

describe('Analytics, reports and finance (SRS 4.7, UC-3)', () => {
  it('dashboard figures are computed from database records', async () => {
    const manager = await login('manager@hrms.test');
    const res = await api().get('/api/dashboard').set(manager.auth);
    expect(res.status).toBe(200);
    const inHouse = await prisma.reservation.count({ where: { status: 'CHECKED_IN' } });
    expect(res.body.kpis.roomsOccupied).toBeGreaterThanOrEqual(inHouse);
    expect(res.body.occupancyByCategory.length).toBe(6);
    expect(res.body.revenueByChannel.some((c) => c.channel.startsWith('OTA Platform'))).toBe(true);
  });

  it('generates and exports revenue report segmented by channel (CSV + PDF)', async () => {
    const manager = await login('manager@hrms.test');
    const gen = await api().post('/api/reports').set(manager.auth).send({ type: 'revenue', from: day(-30), to: day(0) });
    expect(gen.status).toBe(201);
    expect(gen.body.report.tables[0].rows.length).toBeGreaterThan(1);
    const csv = await api().get(`/api/reports/${gen.body.report.id}/export?format=csv`).set(manager.auth);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toMatch(/Revenue by booking channel/);
    const pdf = await api().get(`/api/reports/${gen.body.report.id}/export?format=pdf`).set(manager.auth).buffer(true);
    expect(pdf.headers['content-type']).toBe('application/pdf');
  });

  it('a Receptionist cannot generate financial reports', async () => {
    const reception = await login('reception@hrms.test');
    expect((await api().post('/api/reports').set(reception.auth).send({ type: 'revenue', from: day(-7), to: day(0) })).status).toBe(403);
  });

  it('reconciliation finds the seeded gateway discrepancies', async () => {
    const finance = await login('finance@hrms.test');
    const res = await api().post('/api/payments/reconcile').set(finance.auth).send({ apply: false });
    expect(res.status).toBe(200);
    const statuses = res.body.items.map((i) => i.reconStatus);
    expect(statuses).toContain('MISMATCH');
    expect(statuses).toContain('MISSING_AT_GATEWAY');
    expect(statuses).toContain('MISSING_IN_HRMS');
    expect(res.body.summary.matched).toBeGreaterThan(50);
  });

  it('every booking and payment transaction is audited (SE-6)', async () => {
    const { book, freeRoom } = await import('./helpers.js');
    const guest = await login('meera@hrms.test');
    const room = await freeRoom(day(120), day(121));
    const { paid } = await book(guest, { roomId: room.id, checkIn: day(120), checkOut: day(121), numGuests: 1 });
    const paymentId = paid.body.payment.id;
    expect(await prisma.auditLog.count({ where: { action: 'PAYMENT_CAPTURED', entityType: 'Payment', entityId: String(paymentId) } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'RESERVATION_CONFIRMED', entityId: String(paid.body.reservation.id) } })).toBe(1);
    const admin = await login('admin@hrms.test');
    const res = await api().get('/api/admin/audit-logs?action=PAYMENT').set(admin.auth);
    expect(res.body.logs.length).toBeGreaterThan(0);
    expect(res.body.logs.every((l) => l.action.includes('PAYMENT'))).toBe(true);
  });
});
