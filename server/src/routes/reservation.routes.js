/**
 * DFD 2.0 Room Search & Reservation Management + 3.0 Payment Processing + 4.0 Check-in/Check-out & Access
 * UC-1 Manage Reservations, UC-2 Manage Guest Services ; SD-1, SD-2
 */
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/common.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';
import { forbidden } from '../lib/errors.js';
import * as rooms from '../modules/reservations/room.service.js';
import * as reservations from '../modules/reservations/reservation.service.js';
import * as access from '../modules/access/access.service.js';
import { SUPPORTED_CURRENCIES } from '../integrations/CurrencyExchangeRateService.js';
import { razorpayGateway } from '../integrations/RazorpayGateway.js';

const r = Router();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD dates.');
const id = (v) => Number.parseInt(v, 10);

const searchSchema = z.object({
  checkIn: date,
  checkOut: date,
  guests: z.coerce.number().int().min(1).max(8).default(2),
  category: z.enum(['STANDARD', 'DELUXE', 'SUITE', 'ACCESSIBLE']).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  accessible: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});

const paymentSchema = z.object({
  method: z.enum(['CARD', 'UPI', 'NET_BANKING', 'WALLET']),
  details: z.object({
    cardNumber: z.string().max(23).optional(), expiry: z.string().max(5).optional(), cvv: z.string().max(4).optional(), cardholder: z.string().max(80).optional(),
    upiId: z.string().max(60).optional(), bank: z.string().max(60).optional(), wallet: z.string().max(60).optional(),
  }).default({}),
  payCurrency: z.enum(SUPPORTED_CURRENCIES).optional(),
});

// ---- Rooms (SE-2: publicly browsable) -------------------------------------------------
r.get('/rooms/types', async (_req, res) => res.json({ roomTypes: await rooms.listRoomTypes() }));

/** Reservation.Search / .Search.Filter / .Allocate.Smart  — Guest.searchRooms() */
r.get('/rooms/search', optionalAuth, validate(searchSchema, 'query'), async (req, res) => {
  res.json(await rooms.searchRooms(req.validatedQuery, req.user?.guestPk));
});

/** Guest.viewRoomDetails() */
r.get('/rooms/:id', async (req, res) => res.json({ room: await rooms.getRoom(id(req.params.id)) }));

// ---- Reservations ---------------------------------------------------------------------
r.use('/reservations', authenticate);

r.get('/reservations', async (req, res) => res.json({ reservations: await reservations.listReservations(req.user, req.query) }));

/** SD-1 msgs 3-6 + Lock Room Inventory: Guest.makeReservation() / Receptionist.createReservation() */
r.post('/reservations', authorize('reservation.own', 'reservation.manage'), validate(z.object({
  roomId: z.number().int().positive(),
  checkIn: date,
  checkOut: date,
  numGuests: z.number().int().min(1).max(8),
  specialRequests: z.string().max(500).optional(),
  redeemPoints: z.number().int().min(0).default(0),
  guestId: z.number().int().positive().optional(),
  viaConcierge: z.boolean().optional(),
})), async (req, res) => {
  const result = req.user.guestPk ? await req.actor.makeReservation(req.body) : await req.actor.createReservation(req.body);
  res.status(201).json(result);
});

r.get('/reservations/:id', async (req, res) => res.json({ reservation: await reservations.getReservation(req.user, id(req.params.id)) }));

/** SD-1 msgs 7-16: payment -> confirm -> fork(sync, notify) */
r.post('/reservations/:id/pay', authorize('payment.own', 'reservation.manage'), validate(paymentSchema), async (req, res) => {
  res.json(await reservations.payReservation(req.user, id(req.params.id), req.body));
});

// ---- Real Razorpay gateway (optional; enabled when RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are set) ----
r.get('/payments/razorpay/config', authenticate, (_req, res) => {
  const paise = razorpayGateway.chargePaise();
  res.json({ enabled: razorpayGateway.configured(), mode: razorpayGateway.configured() ? razorpayGateway.mode() : null, keyId: razorpayGateway.configured() ? razorpayGateway.keyId : null, demoChargeAmount: paise ? paise / 100 : null });
});

r.post('/reservations/:id/razorpay/order', authorize('payment.own', 'reservation.manage'), async (req, res) => {
  res.json(await reservations.startRazorpayPayment(req.user, id(req.params.id)));
});

r.post('/reservations/:id/razorpay/verify', authorize('payment.own', 'reservation.manage'), validate(z.object({
  orderId: z.string().regex(/^order_[A-Za-z0-9]+$/, 'Invalid Razorpay order id'),
  paymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/, 'Invalid Razorpay payment id'),
  signature: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid Razorpay signature'),
})), async (req, res) => {
  res.json(await reservations.completeRazorpayPayment(req.user, id(req.params.id), req.body));
});

r.post('/reservations/:id/razorpay/cancel', authorize('payment.own', 'reservation.manage'), validate(z.object({ orderId: z.string().max(60).optional(), reason: z.string().max(200).optional() })), async (req, res) => {
  res.json(await reservations.abandonRazorpayPayment(req.user, id(req.params.id), req.body));
});

/** Reservation.Modify */
r.patch('/reservations/:id', authorize('reservation.own', 'reservation.manage'), validate(z.object({
  checkIn: date.optional(), checkOut: date.optional(), roomId: z.number().int().positive().optional(), numGuests: z.number().int().min(1).max(8).optional(),
  payment: paymentSchema.optional(),
})), async (req, res) => {
  res.json(await req.actor.modifyReservation(id(req.params.id), req.body));
});

/** Reservation.Cancel.Confirm — preview of BR-8 terms */
r.get('/reservations/:id/cancellation-terms', async (req, res) => res.json(await reservations.cancellationTerms(req.user, id(req.params.id))));

/** Reservation.Cancel */
r.post('/reservations/:id/cancel', authorize('reservation.own', 'reservation.manage'), validate(z.object({ confirm: z.literal(true, { message: 'Please confirm the cancellation.' }), reason: z.string().max(200).optional() })), async (req, res) => {
  res.json(await req.actor.cancelReservation(id(req.params.id), req.body));
});

// ---- 4.0 Check-in / Check-out & Access (SD-2) -----------------------------------------
r.get('/access/identity-documents', (_req, res) => res.json({ documents: Object.entries(access.IDENTITY_DOCUMENTS).map(([k, v]) => ({ key: k, label: v.label, example: v.example })) }));

const checkinSchema = validate(z.object({
  documentType: z.enum(Object.keys(access.IDENTITY_DOCUMENTS)),
  documentNumber: z.string().min(4).max(30),
  keyType: z.enum(['QR', 'NFC']).default('QR'),
}));

/** CheckIn.Online (Guest) / Receptionist.checkInGuest() */
r.post('/reservations/:id/check-in', authorize('checkin.own', 'frontdesk.checkin'), checkinSchema, async (req, res) => {
  const result = req.user.guestPk ? await req.actor.completeDigitalCheckIn(id(req.params.id), req.body) : await req.actor.checkInGuest(id(req.params.id), req.body);
  res.json(result);
});

r.get('/reservations/:id/digital-key', authorize('checkin.own', 'frontdesk.checkin'), async (req, res) => res.json({ digitalKey: await access.getDigitalKey(req.user, id(req.params.id)) }));
r.post('/reservations/:id/digital-key/revoke', authorize('frontdesk.checkin'), async (req, res) => res.json(await access.revokeKeyManually(req.user, id(req.params.id))));
r.post('/reservations/:id/digital-key/reissue', authorize('frontdesk.checkin', 'checkin.own'), async (req, res) => res.json({ digitalKey: await access.reissueKey(req.user, id(req.params.id), req.body) }));

r.get('/reservations/:id/checkout-summary', authorize('checkin.own', 'frontdesk.checkin'), async (req, res) => res.json(await access.checkoutSummary(req.user, id(req.params.id))));

/** CheckOut.Express (Guest) / Receptionist.checkOutGuest() */
r.post('/reservations/:id/check-out', authorize('checkin.own', 'frontdesk.checkin'), validate(z.object({ payment: paymentSchema.optional() })), async (req, res) => {
  const result = req.user.guestPk ? await req.actor.expressCheckOut(id(req.params.id), req.body) : await req.actor.checkOutGuest(id(req.params.id), req.body);
  res.json(result);
});

/** Smart lock simulation: present a digital key at a door (SmartLockController.unlock) */
r.post('/access/unlock', authenticate, validate(z.object({ roomNumber: z.string().min(1).max(10), keyCode: z.string().min(4).max(80) })), async (req, res) => {
  if (!req.user.permissions.has('checkin.own') && !req.user.permissions.has('frontdesk.checkin')) throw forbidden();
  res.json(await access.presentKeyAtDoor(req.user, req.body));
});

r.get('/access/logs', authenticate, authorize('frontdesk.checkin', 'audit.read'), async (req, res) => res.json({ logs: await access.accessLogs({ roomNumber: req.query.roomNumber }) }));

export default r;
