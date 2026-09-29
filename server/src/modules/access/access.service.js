/**
 * DFD Level 1 process 4.0 "Check-in / Check-out & Access Management" (D5 Room Access Logs)
 * Sequence diagram SD-2 / collaboration diagram CD-2 "Digital Check-in + Digital Room Key":
 *   initiate online check-in() -> verifyReservation() -> alt [confirmed & check-in date arrived]
 *   reservation verified -> verify Guest identity -> issueKey() -> digital key issued -> digital room key
 *   -> verifyKey() -> key verified -> unlock(keyCode) -> room unlocked
 *   alt [not confirmed or date not arrived] verification failed -> check-in rejected
 * Activity: Verify Check-In Eligibility -> <Check-In Allowed?> -> Issue Time-Bound Digital Key ;
 *   Guest: Complete Digital Check-In -> Verify Identity -> Present Digital Key ;
 *   Smart Lock: Validate Digital Key -> <Key Valid?> -> Unlock Room | Deny Access ;
 *   Check-out: Calculate Final Charges -> Process Final Payment -> <Payment Successful?> -> Revoke Digital Key
 *   -> Generate Invoice -> Send Invoice / Checkout Confirmation
 * SRS 4.6: CheckIn.Online, CheckIn.Verify.Identity, Room.Access.Issue, Room.Access.Revoke,
 *   Payment.Contactless.Process, CheckOut.Express, Invoice.Generate ; BR-6 ; BR-7 ; 5.2 Safety
 * UML: Receptionist.checkInGuest(), Receptionist.checkOutGuest(), DigitalKey.*, SmartLockController.unlock()
 */
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound, paymentFailed, unprocessable } from '../../lib/errors.js';
import { formatDateOnly, hotelToday, nightsBetween } from '../../lib/dates.js';
import { round2, toNumber } from '../../lib/money.js';
import { trace, traceScenario } from '../../lib/trace.js';
import { getSettings } from '../../lib/settings.js';
import { DigitalKey } from '../../domain/DigitalKey.js';
import { Room } from '../../domain/Room.js';
import { Payment } from '../../domain/Payment.js';
import { Invoice } from '../../domain/Invoice.js';
import { LoyaltyAccount } from '../../domain/LoyaltyAccount.js';
import { AuditLog } from '../../domain/AuditLog.js';
import { SimulatedSmartLockController } from '../../integrations/SmartLockController.js';
import { notificationService } from '../../integrations/NotificationService.js';
import { loadReservationFor, reservationInclude, reservationView, formatReference } from '../reservations/reservation.service.js';
import * as channelSync from '../channels/channelSync.service.js';

/** CheckIn.Verify.Identity — IMPLEMENTATION ASSUMPTION: accepted documents and their formats. */
export const IDENTITY_DOCUMENTS = {
  PASSPORT: { label: 'Passport', pattern: /^[A-Z][0-9]{7}$/, example: 'K1234567' },
  AADHAAR: { label: 'Aadhaar', pattern: /^[2-9][0-9]{11}$/, example: '234567890123' },
  DRIVING_LICENCE: { label: 'Driving licence', pattern: /^[A-Z]{2}[0-9]{2}[0-9A-Z]{11,13}$/, example: 'MH0220190001234' },
  NATIONAL_ID: { label: 'National ID card', pattern: /^[A-Z0-9]{6,20}$/, example: 'ID987654' },
};

/** "Verify Check-In Eligibility (Reservation + Date)" — SD-2 verifyReservation(); BR-7 */
export function checkInEligibility(r, today = hotelToday()) {
  if (r.status === 'CHECKED_IN') return { allowed: false, reason: 'You are already checked in.' };
  if (r.status !== 'CONFIRMED') return { allowed: false, reason: `Reservation is ${r.status.replace('_', ' ').toLowerCase()}, not confirmed.` };
  if (r.checkInDate > today) return { allowed: false, reason: `Online check-in opens on your arrival date (${formatDateOnly(r.checkInDate)}).` };
  if (r.checkOutDate <= today) return { allowed: false, reason: 'The stay dates for this reservation have passed.' };
  return { allowed: true, reason: 'Reservation confirmed and check-in date arrived' };
}

function verifyIdentity(documentType, documentNumber) {
  const spec = IDENTITY_DOCUMENTS[documentType];
  const number = String(documentNumber || '').toUpperCase().replace(/[\s-]/g, '');
  if (!spec) return { ok: false, reason: 'Unsupported identity document type.' };
  if (!spec.pattern.test(number)) return { ok: false, reason: `That ${spec.label} number does not look valid (example: ${spec.example}).` };
  return { ok: true, masked: `${spec.label} ••••${number.slice(-4)}` };
}

/** SD-2: online check-in by the guest, or Receptionist.checkInGuest() at the front desk. */
export async function checkIn(user, reservationId, { documentType, documentNumber, keyType = 'QR' }) {
  traceScenario('SD-2 Digital Check-in + Digital Room Key');
  const settings = await getSettings();
  const actor = user.guestPk ? 'Guest' : 'Receptionist';
  const r = await loadReservationFor(user, reservationId);
  if (user.guestPk && r.guestId !== user.guestPk) throw notFound('Reservation');

  trace(actor, 'HRMS', user.guestPk ? 'initiate online check-in()' : 'checkInGuest()', { ref: 'SD-2 msg 1', activity: 'Complete Digital Check-In', dfd: '4.0 Check-in / Check-out & Access Management' });
  trace('HRMS', 'Reservation', 'verifyReservation()', { ref: 'SD-2 msg 2', activity: 'Verify Check-In Eligibility (Reservation + Date)' });
  const eligibility = checkInEligibility(r);
  if (!eligibility.allowed) {
    trace('Reservation', 'HRMS', 'verification failed', { ref: 'CD-2 alt msg 2', kind: 'return', branch: 'failure', activity: 'Check-In Allowed? — No' });
    trace('HRMS', actor, 'check-in rejected', { ref: 'CD-2 alt msg 6', kind: 'return', branch: 'failure' });
    await AuditLog.record({ action: 'CHECKIN_REJECTED', entityType: 'Reservation', entityId: r.id, performedBy: user.id, details: { reason: eligibility.reason } });
    throw unprocessable('CHECKIN_NOT_ALLOWED', eligibility.reason);
  }
  trace('Reservation', 'HRMS', 'reservation verified', { ref: 'SD-2 msg 3', kind: 'return', activity: 'Check-In Allowed? — Yes' });

  trace('HRMS', 'HRMS', 'verify Guest identity', { ref: 'SD-2', activity: 'Verify Identity' });
  const identity = verifyIdentity(documentType, documentNumber);
  if (!identity.ok) {
    trace('HRMS', actor, 'identity verification failed — front desk assistance required', { ref: 'UC-2 alt', kind: 'return', branch: 'failure' });
    await AuditLog.record({ action: 'IDENTITY_VERIFICATION_FAILED', entityType: 'Reservation', entityId: r.id, performedBy: user.id, details: { documentType } });
    throw unprocessable('IDENTITY_NOT_VERIFIED', `${identity.reason} If the problem continues, please visit the front desk.`);
  }

  trace('HRMS', 'DigitalKey', 'issueKey()', { ref: 'SD-2 msg 4', activity: 'Issue Time-Bound Digital Key' });
  const { key, updated } = await prisma.$transaction(async (tx) => {
    const k = await DigitalKey.issueKey(r, settings, { keyType, db: tx });
    const u = await tx.reservation.update({
      where: { id: r.id },
      data: { status: 'CHECKED_IN', checkedInAt: new Date(), identityVerifiedAt: new Date(), identityDocument: identity.masked },
      include: reservationInclude,
    });
    await AuditLog.record({ action: 'GUEST_CHECKED_IN', entityType: 'Reservation', entityId: r.id, performedBy: user.id, details: { channel: user.guestPk ? 'online' : 'front desk', keyType, keyValidUntil: k.expiryDate } }, tx);
    return { key: k, updated: u };
  });
  trace('DigitalKey', 'HRMS', 'digital key issued', { ref: 'SD-2 msg 5', kind: 'return' });
  await Room.updateStatus(r.roomId);

  await notificationService.notifyUser(r.guest.user.id, {
    type: 'CHECKED_IN', channels: ['PUSH', 'IN_APP'],
    subject: `Welcome! Room ${r.room.roomNumber} is ready`,
    body: `Your ${keyType} digital key is active until ${key.expiryDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}. Hold your phone to the door lock to enter.`,
  });
  trace('HRMS', actor, 'digital room key', { ref: 'SD-2 msg 6', kind: 'return', activity: 'Present Digital Key (QR / NFC)' });
  return { reservation: reservationView(updated), digitalKey: keyView(key, r.room.roomNumber) };
}

function keyView(key, roomNumber) {
  return { id: key.id, keyCode: key.keyCode, keyType: key.keyType, status: key.status, validFrom: key.issueDate, validTo: key.expiryDate, roomNumber };
}

export async function getDigitalKey(user, reservationId) {
  const r = await loadReservationFor(user, reservationId);
  if (!r.digitalKey) throw notFound('Digital key');
  if (r.digitalKey.status === 'ACTIVE' && new Date() > r.digitalKey.expiryDate) {
    await prisma.digitalKey.update({ where: { id: r.digitalKey.id }, data: { status: 'EXPIRED' } });
    r.digitalKey.status = 'EXPIRED';
  }
  const logs = await prisma.roomAccessLog.findMany({ where: { reservationId: r.id }, orderBy: { attemptedAt: 'desc' }, take: 10 });
  return { ...keyView(r.digitalKey, r.room.roomNumber), accessLog: logs };
}

async function validateKeyAtDoor(keyCode, roomNumber) {
  const key = await prisma.digitalKey.findUnique({ where: { keyCode }, include: { reservation: { include: { room: true } } } });
  const verdict = DigitalKey.verifyKey(key, roomNumber);
  if (verdict.expired && key?.status === 'ACTIVE') await prisma.digitalKey.update({ where: { id: key.id }, data: { status: 'EXPIRED' } });
  return { ...verdict, key };
}

/**
 * Guest presents the key at a door (CD-2 msgs 7-10; Activity Smart Lock lane).
 * Every attempt, granted or denied, is written to D5 Room Access Logs.
 */
export async function presentKeyAtDoor(user, { roomNumber, keyCode }) {
  traceScenario('SD-2 Digital Check-in + Digital Room Key');
  const room = await prisma.room.findUnique({ where: { roomNumber } });
  if (!room) throw notFound('Room');
  trace('Guest', 'DigitalKey', 'verifyKey()', { ref: 'SD-2 msg 7', activity: 'Present Digital Key (QR / NFC)' });
  const pre = await validateKeyAtDoor(keyCode, roomNumber);
  trace('DigitalKey', 'Guest', pre.valid ? 'key verified' : `key rejected: ${pre.reason}`, { ref: 'SD-2 msg 8', kind: 'return', branch: pre.valid ? undefined : 'failure' });

  trace('Guest', 'SmartLockController', 'unlock(keyCode)', { ref: 'SD-2 msg 9', activity: 'Validate Digital Key' });
  const lock = new SimulatedSmartLockController(roomNumber, async (code, door) => validateKeyAtDoor(code, door));
  const result = await lock.unlock(keyCode);
  trace('SmartLockController', 'SmartLockController', `Key Valid? — ${result.unlocked ? 'Yes' : 'No'}`, { ref: 'Activity', kind: 'alt', branch: result.unlocked ? undefined : 'failure' });
  trace('SmartLockController', 'Guest', result.unlocked ? 'room unlocked' : 'Deny Access', { ref: result.unlocked ? 'SD-2 msg 10' : 'Activity', kind: 'return', activity: result.unlocked ? 'Unlock Room' : 'Deny Access', branch: result.unlocked ? undefined : 'failure' });

  await prisma.roomAccessLog.create({
    data: { roomId: room.id, digitalKeyId: pre.key?.id ?? null, reservationId: pre.key?.reservationId ?? null, result: result.unlocked ? 'GRANTED' : 'DENIED', reason: result.reason },
  });
  if (!result.unlocked && pre.key) {
    await AuditLog.record({ action: 'ROOM_ACCESS_DENIED', entityType: 'Room', entityId: room.id, performedBy: user.id, details: { reason: result.reason } });
  }
  return { roomNumber, granted: result.unlocked, reason: result.reason, relockInMs: result.relockInMs, door: SimulatedSmartLockController.state(roomNumber) };
}

/** "Calculate Final Charges" — room balance plus service charges plus tax. */
export async function finalCharges(r, settings) {
  const services = await prisma.serviceRequest.findMany({ where: { reservationId: r.id, charge: { gt: 0 }, status: { not: 'CANCELLED' } } });
  const serviceSubtotal = round2(services.reduce((s, x) => s + toNumber(x.charge), 0));
  const serviceTax = round2((serviceSubtotal * settings.taxRatePercent) / 100);
  const netPaid = await Payment.netPaid(r.id);
  const grandTotal = round2(toNumber(r.totalAmount) + serviceSubtotal + serviceTax);
  return { roomTotal: toNumber(r.totalAmount), services: services.map((s) => ({ id: s.id, category: s.category, description: s.description, charge: toNumber(s.charge) })), serviceSubtotal, serviceTax, grandTotal, netPaid, balanceDue: Math.max(0, round2(grandTotal - netPaid)) };
}

export async function checkoutSummary(user, reservationId) {
  const r = await loadReservationFor(user, reservationId);
  if (r.status !== 'CHECKED_IN') throw unprocessable('NOT_CHECKED_IN', 'Only a checked-in stay can be checked out.');
  return finalCharges(r, await getSettings());
}

/**
 * CheckOut.Express (guest) / Receptionist.checkOutGuest() (front desk).
 * Calculate Final Charges -> Process Final Payment -> <Payment Successful?> (No: retry) ->
 * Revoke Digital Key -> Generate Invoice -> Send Invoice / Checkout Confirmation ; then BR-6 loyalty accrual.
 */
export async function checkOut(user, reservationId, { payment } = {}) {
  traceScenario('Express Check-out (UC-2 / Activity check-out branch)');
  const settings = await getSettings();
  const actor = user.guestPk ? 'Guest' : 'Receptionist';
  const r = await loadReservationFor(user, reservationId);
  if (user.guestPk && r.guestId !== user.guestPk) throw notFound('Reservation');
  if (r.status !== 'CHECKED_IN') throw unprocessable('NOT_CHECKED_IN', 'Only a checked-in stay can be checked out.');

  trace(actor, 'HRMS', user.guestPk ? 'Initiate Express Check-Out' : 'checkOutGuest()', { ref: 'Activity', activity: 'Initiate Express Check-Out', dfd: '4.0' });
  trace('HRMS', 'HRMS', 'Calculate Final Charges', { ref: 'Activity', activity: 'Calculate Final Charges' });
  const charges = await finalCharges(r, settings);

  let finalPayment = null;
  if (charges.balanceDue > 0) {
    if (!payment) {
      throw unprocessable('PAYMENT_REQUIRED', `A balance of ₹${charges.balanceDue.toFixed(2)} is due. Please provide a payment method.`, { charges });
    }
    trace('HRMS', 'Payment', 'Process Final Payment', { ref: 'Activity', activity: 'Process Final Payment', dfd: '3.0 Payment Processing (final payment)' });
    const result = await Payment.process({ reservationId: r.id, amount: charges.balanceDue, purpose: 'FINAL_SETTLEMENT', method: payment.method, details: payment.details, payCurrency: payment.payCurrency, performedBy: user.id, ref: 'Activity check-out' });
    if (!result.success) {
      trace('HRMS', actor, 'Payment Successful? — No (retry)', { ref: 'Activity', kind: 'return', branch: 'failure' });
      await notificationService.notifyUser(r.guest.user.id, { type: 'PAYMENT_FAILED', channels: ['PUSH', 'IN_APP'], subject: 'Check-out payment failed', body: `${result.reason} Please try another payment method.` });
      throw paymentFailed(result.reason, { charges });
    }
    finalPayment = result.payment;
  }

  trace('HRMS', 'DigitalKey', 'revokeKey()', { ref: 'Class diagram', activity: 'Revoke Digital Key' });
  const nights = nightsBetween(r.checkInDate, r.checkOutDate);
  const roomCharges = round2(nights * toNumber(r.room.baseRate));
  const discount = toNumber(r.discountAmount);
  const roomTax = round2(toNumber(r.totalAmount) - (roomCharges - discount));
  const lineItems = [
    { description: `${r.room.roomType.typeName} - room ${r.room.roomNumber}`, quantity: nights, unitPrice: toNumber(r.room.baseRate), amount: roomCharges },
    ...(discount > 0 ? [{ description: `Loyalty points redeemed (${r.pointsRedeemed} pts)`, quantity: 1, unitPrice: -discount, amount: -discount }] : []),
    ...charges.services.map((s) => ({ description: `${s.category}: ${s.description}`.slice(0, 80), quantity: 1, unitPrice: s.charge, amount: s.charge })),
  ];
  const subtotal = round2(lineItems.reduce((s, i) => s + i.amount, 0));
  const taxAmount = round2(roomTax + charges.serviceTax);
  const netPaid = await Payment.netPaid(r.id);

  const { updated, invoice, loyalty } = await prisma.$transaction(async (tx) => {
    await DigitalKey.revokeKey(r.id, tx);
    const u = await tx.reservation.update({ where: { id: r.id }, data: { status: 'CHECKED_OUT', checkedOutAt: new Date() }, include: reservationInclude });
    await Room.updateStatus(r.roomId, { status: 'CLEANING', db: tx });
    const inv = await tx.invoice.upsert({
      where: { reservationId: r.id },
      update: {},
      create: {
        reservationId: r.id, invoiceNumber: Invoice.number(r.reservationNumber), subtotal, taxAmount,
        totalAmount: round2(subtotal + taxAmount), amountPaid: netPaid, currency: 'INR', lineItems,
        status: netPaid >= round2(subtotal + taxAmount) - 0.01 ? 'PAID' : 'ISSUED',
      },
    });
    // BR-6 / Guest.Rewards.Accrue: points only after the status changes to Checked-Out
    const account = await tx.loyaltyAccount.findUnique({ where: { guestId: r.guestId } });
    const points = LoyaltyAccount.pointsForStay(round2(roomCharges - discount), account?.tier ?? 'SILVER', settings);
    const loy = await LoyaltyAccount.accruePoints(r.guestId, points, { reservationId: r.id, description: `Stay ${formatReference(r.reservationNumber)} (${nights} night${nights === 1 ? '' : 's'})`, settings, db: tx });
    await AuditLog.record({ action: 'GUEST_CHECKED_OUT', entityType: 'Reservation', entityId: r.id, performedBy: user.id, details: { invoice: inv.invoiceNumber, finalPayment: finalPayment ? toNumber(finalPayment.amount) : 0, pointsAwarded: points } }, tx);
    return { updated: u, invoice: inv, loyalty: loy ? { points, tier: loy.account.tier, tierChanged: loy.tierChanged, balance: loy.account.pointsBalance } : null };
  });
  trace('HRMS', 'Invoice', 'generatePDF()', { ref: 'Class diagram', activity: 'Generate Invoice' });
  trace('HRMS', 'LoyaltyAccount', `accruePoints(${loyalty?.points ?? 0})`, { ref: 'BR-6', note: 'after status = CHECKED_OUT' });

  trace('HRMS', 'NotificationService', 'sendEmail(invoice)', { ref: 'SI-4.1', activity: 'Send Invoice / Checkout Confirmation (Email / SMS)' });
  await prisma.invoice.update({ where: { id: invoice.id }, data: { emailedAt: new Date() } });
  await notificationService.notifyUser(r.guest.user.id, {
    type: 'INVOICE', channels: ['EMAIL', 'IN_APP'],
    subject: `Your invoice ${invoice.invoiceNumber}`,
    body: `Thank you for staying with us. Invoice total ₹${toNumber(invoice.totalAmount).toFixed(2)}, paid ₹${toNumber(invoice.amountPaid).toFixed(2)}.${loyalty?.points ? ` You earned ${loyalty.points} loyalty points${loyalty.tierChanged ? ` and reached ${loyalty.tier} tier` : ''}!` : ''}`,
  });
  channelSync.pushAvailabilityToAll({ reason: `Room ${r.room.roomNumber} checked out` }).catch(() => {});
  trace('HRMS', actor, 'Receive Invoice / Checkout Confirmation', { ref: 'Activity', kind: 'return', activity: 'Receive Invoice / Checkout Confirmation' });
  return { reservation: reservationView(updated), invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber, totalAmount: toNumber(invoice.totalAmount), amountPaid: toNumber(invoice.amountPaid) }, loyalty, charges };
}

/** Security action (staff): revoke a key immediately, e.g. lost phone. */
export async function revokeKeyManually(user, reservationId) {
  const r = await loadReservationFor(user, reservationId);
  const res = await DigitalKey.revokeKey(r.id);
  if (!res.count) throw badRequest('There is no active key for this reservation.');
  await AuditLog.record({ action: 'DIGITAL_KEY_REVOKED', entityType: 'Reservation', entityId: r.id, performedBy: user.id, details: { reason: 'manual revocation' } });
  return { revoked: true };
}

/** Re-issue a key for a checked-in stay (lost phone / revoked by mistake). */
export async function reissueKey(user, reservationId, { keyType = 'QR' } = {}) {
  const r = await loadReservationFor(user, reservationId);
  if (r.status !== 'CHECKED_IN') throw unprocessable('NOT_CHECKED_IN', 'Keys can only be issued for a checked-in stay.');
  const key = await DigitalKey.issueKey(r, await getSettings(), { keyType });
  await AuditLog.record({ action: 'DIGITAL_KEY_REISSUED', entityType: 'Reservation', entityId: r.id, performedBy: user.id });
  return keyView(key, r.room.roomNumber);
}

export async function accessLogs({ roomNumber, limit = 50 } = {}) {
  const rows = await prisma.roomAccessLog.findMany({
    where: roomNumber ? { room: { roomNumber } } : {},
    include: { room: { select: { roomNumber: true } }, reservation: { select: { reservationNumber: true, guest: { select: { user: { select: { name: true } } } } } } },
    orderBy: { attemptedAt: 'desc' },
    take: Math.min(limit, 200),
  });
  return rows.map((l) => ({ id: l.id, roomNumber: l.room.roomNumber, result: l.result, reason: l.reason, attemptedAt: l.attemptedAt, guest: l.reservation?.guest?.user?.name ?? null, reservation: formatReference(l.reservation?.reservationNumber) }));
}
