/**
 * UML class: Payment
 *   paymentId, reservationId, amount, currency, paymentMethod, status, paidAt, transactionRef
 *   + initiate(): void
 *   + verify(): Boolean
 *   + refund(): void
 * Relationships: Reservation 1 --has--> 0..* Payment ; Payment ..uses..> PaymentGateway, CurrencyExchangeRateService
 * SRS: Reservation.Book.Payment, BR-4, BR-5, SE-4, SE-6, Payment.Contactless.Process ; Figure 3
 * DFD Level 2 of process 3.0: 3.1 Validate Payment Details -> 3.2 Process Payment -> 3.3 Update Reservation
 *
 * Payment status follows the SRS data dictionary:
 *   INITIATED -> PROCESSING -> VERIFIED -> CAPTURED   (success; Fig.3 "Payment successful")
 *   INITIATED -> PROCESSING -> FAILED                 (Fig.3 "Payment failed / declined / gateway timeout")
 *   CAPTURED  -> REFUNDED                             (cancellation refund)
 */
import { prisma } from '../lib/prisma.js';
import { badRequest, unprocessable } from '../lib/errors.js';
import { round2, toNumber } from '../lib/money.js';
import { trace } from '../lib/trace.js';
import { paymentGateway } from '../integrations/PaymentGateway.js';
import { razorpayGateway, RazorpayGateway } from '../integrations/RazorpayGateway.js';
import { currencyExchangeRateService } from '../integrations/CurrencyExchangeRateService.js';
import { AuditLog } from './AuditLog.js';

export class Payment {
  /** DFD 3.1 Validate Payment Details. Throws a validation error for malformed instruments. */
  static validateDetails(method, details) {
    const result = paymentGateway.validateDetails(method, details);
    trace('Payment', 'PaymentGateway', 'validatePaymentDetails()', { ref: 'DFD 3.1', dfd: '3.1 Validate Payment Details' });
    if (!result.valid) throw badRequest(result.reason, { field: 'payment' });
    return result;
  }

  /**
   * initiate() + authorize + verify() + capture in one call (DFD 3.2 Process Payment).
   * Must be called OUTSIDE a database transaction because it talks to the external gateway.
   * Returns { success, payment, reason }.
   */
  static async process({ reservationId, amount, purpose, method, details, payCurrency, performedBy, ref = 'SD-1' }) {
    const validated = Payment.validateDetails(method, details);
    const base = round2(amount);

    // BR-4: amounts are stored in the base currency; a foreign-currency payer sees the converted figure.
    let originalAmount = null;
    let exchangeRate = null;
    if (payCurrency && payCurrency !== 'INR') {
      exchangeRate = await currencyExchangeRateService.getExchangeRate(payCurrency);
      originalAmount = round2(base / exchangeRate);
      trace('Payment', 'CurrencyExchangeRateService', `getExchangeRate("${payCurrency}")`, { ref: 'Class diagram', note: `1 ${payCurrency} = ${exchangeRate} INR` });
    }

    trace('HRMS', 'Payment', 'initiate()', { ref, activity: 'Verify Payment', dfd: '3.2 Process Payment' });
    let payment = await prisma.payment.create({
      data: {
        reservationId, amount: base, currency: 'INR', paymentMethod: method, purpose,
        status: 'INITIATED', methodSummary: validated.summary,
        originalAmount, originalCurrency: originalAmount ? payCurrency : null, exchangeRate,
      },
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'PROCESSING' } });

    trace('Payment', 'PaymentGateway', `authorize(${base.toFixed(2)})`, { ref, activity: 'Process Reservation Payment' });
    const auth = await paymentGateway.authorize(base, { currency: 'INR', method, instrument: validated.instrument, reference: `RES-${reservationId}` });

    if (!auth.approved) {
      trace('PaymentGateway', 'Payment', auth.timeout ? 'gateway timeout' : 'payment declined', { ref, kind: 'return', branch: 'failure', activity: 'Payment Successful? — No' });
      payment = await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failureReason: auth.reason, transactionRef: auth.transactionId },
      });
      await AuditLog.record({ action: 'PAYMENT_FAILED', entityType: 'Payment', entityId: payment.id, performedBy, details: { reservationId, amount: base, reason: auth.reason } });
      return { success: false, payment, reason: auth.reason };
    }

    trace('PaymentGateway', 'Payment', 'Payment authorized', { ref, kind: 'return' });
    trace('Payment', 'Payment', 'verify()', { ref, activity: 'Payment Successful? — Yes' });
    payment = await prisma.payment.update({ where: { id: payment.id }, data: { status: 'VERIFIED', transactionRef: auth.transactionId } });
    const captured = await paymentGateway.capture(auth.transactionId);
    payment = await prisma.payment.update({
      where: { id: payment.id },
      data: captured ? { status: 'CAPTURED', paidAt: new Date() } : { status: 'FAILED', failureReason: 'Capture failed' },
    });
    trace('Payment', 'HRMS', 'Payment verified', { ref, kind: 'return', dfd: '3.3 Update Reservation' });
    await AuditLog.record({ action: 'PAYMENT_CAPTURED', entityType: 'Payment', entityId: payment.id, performedBy, details: { reservationId, amount: base, method, purpose, transactionRef: auth.transactionId } });
    return { success: captured, payment, reason: captured ? null : 'Capture failed' };
  }

  /**
   * initiate() for the real Razorpay gateway: create a Razorpay Order and an INITIATED payment row.
   * The guest then authorises the payment in Razorpay Checkout in the browser.
   */
  static async startRazorpay({ reservation, performedBy }) {
    if (!razorpayGateway.configured()) {
      throw unprocessable('RAZORPAY_NOT_CONFIGURED', razorpayGateway.liveKeysRefused()
        ? 'Live Razorpay keys are not allowed in this project (test mode only). Use rzp_test_ keys.'
        : 'Razorpay is not configured. Add test keys (rzp_test_…) to server/.env and restart the API.');
    }
    const amount = round2(toNumber(reservation.totalAmount));
    const tokenPaise = razorpayGateway.chargePaise();
    const amountPaise = tokenPaise ?? Math.round(amount * 100);
    trace('HRMS', 'Payment', 'initiate()', { ref: 'SD-1 msg 7', activity: 'Verify Payment', dfd: '3.2 Process Payment' });
    trace('Payment', 'Razorpay', `createOrder(₹${(amountPaise / 100).toFixed(2)})`, { ref: 'PaymentGateway (real)', note: tokenPaise ? 'demo token charge' : 'full amount' });
    let order;
    try {
      order = await razorpayGateway.createOrder({
        amountPaise,
        receipt: `HRMS-RES-${reservation.id}-${Date.now().toString(36)}`,
        notes: { reservationId: String(reservation.id), bookingTotalInr: amount.toFixed(2), hotel: 'Solstice Bay HRMS' },
      });
    } catch (err) {
      throw unprocessable('RAZORPAY_ERROR', err.message);
    }
    const payment = await prisma.payment.create({
      data: {
        reservationId: reservation.id, amount, currency: 'INR', paymentMethod: 'CARD', purpose: 'RESERVATION',
        status: 'PROCESSING', gateway: 'RAZORPAY', gatewayOrderId: order.id, gatewayAmount: amountPaise / 100,
        methodSummary: 'Razorpay TEST',
      },
    });
    await AuditLog.record({ action: 'PAYMENT_INITIATED', entityType: 'Payment', entityId: payment.id, performedBy, details: { reservationId: reservation.id, gateway: 'RAZORPAY', orderId: order.id, charged: amountPaise / 100, bookingTotal: amount } });
    return {
      keyId: razorpayGateway.keyId, mode: razorpayGateway.mode(), orderId: order.id, amountPaise, currency: 'INR',
      bookingTotal: amount, demoCharge: Boolean(tokenPaise), paymentId: payment.id,
    };
  }

  /**
   * verify() for Razorpay: check the Checkout signature, then confirm with Razorpay's own API that the
   * payment exists, belongs to this order, has the right amount and is captured (capturing it if needed).
   */
  static async completeRazorpay({ reservation, orderId, paymentId, signature, performedBy }) {
    const payment = await prisma.payment.findUnique({ where: { gatewayOrderId: String(orderId) } });
    if (!payment || payment.reservationId !== reservation.id) throw badRequest('This Razorpay order does not belong to this reservation.');
    const fail = async (reason) => {
      const failed = await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: reason, transactionRef: payment.transactionRef ?? (paymentId ? String(paymentId) : null) } });
      await AuditLog.record({ action: 'PAYMENT_FAILED', entityType: 'Payment', entityId: payment.id, performedBy, details: { reservationId: reservation.id, gateway: 'RAZORPAY', reason } });
      return { success: false, payment: failed, reason };
    };
    if (payment.status === 'CAPTURED') return { success: true, payment };

    trace('Razorpay', 'Payment', 'Payment authorized (Checkout)', { ref: 'SD-1 msg 9', kind: 'return' });
    trace('Payment', 'Payment', 'verify() — signature', { ref: 'SD-1 msg 10', activity: 'Payment Successful?' });
    if (!razorpayGateway.verifySignature(orderId, paymentId, signature)) return fail('Payment signature did not match. The payment was not accepted.');

    let rp;
    try {
      trace('Payment', 'Razorpay', `fetchPayment("${paymentId}")`, { ref: 'SD-1 msg 10' });
      rp = await razorpayGateway.fetchPayment(paymentId);
      const expectedPaise = Math.round(toNumber(payment.gatewayAmount) * 100);
      if (rp.order_id !== orderId) return fail('Razorpay payment belongs to a different order.');
      if (rp.amount !== expectedPaise || rp.currency !== 'INR') return fail('Razorpay payment amount does not match the order.');
      if (rp.status === 'authorized') {
        trace('Payment', 'Razorpay', 'capture()', { ref: 'PaymentGateway.capture' });
        rp = await razorpayGateway.capture(paymentId, expectedPaise);
      }
      if (rp.status !== 'captured') return fail(`Razorpay reports the payment as "${rp.status}".`);
    } catch (err) {
      return fail(`Could not verify the payment with Razorpay: ${err.message}`);
    }
    const mode = 'TEST';
    const charged = toNumber(payment.gatewayAmount);
    const demo = Math.abs(charged - toNumber(payment.amount)) > 0.009;
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'CAPTURED', paidAt: new Date(), transactionRef: rp.id, paymentMethod: RazorpayGateway.methodEnum(rp),
        methodSummary: `Razorpay ${mode} · ${RazorpayGateway.describe(rp)}${demo ? ` · ₹${charged.toFixed(2)} demo charge` : ''}`,
      },
    });
    trace('Payment', 'HRMS', 'Payment verified', { ref: 'SD-1 msg 11', kind: 'return', dfd: '3.3 Update Reservation' });
    await AuditLog.record({ action: 'PAYMENT_CAPTURED', entityType: 'Payment', entityId: payment.id, performedBy, details: { reservationId: reservation.id, gateway: 'RAZORPAY', mode, razorpayPaymentId: rp.id, charged, bookingTotal: toNumber(payment.amount) } });
    return { success: true, payment: updated };
  }

  /** refund(): refund `amount` across the reservation's captured payments (newest first). */
  static async refund(reservationId, amount, { performedBy, reason } = {}) {
    let remaining = round2(amount);
    if (remaining <= 0) return 0;
    const payments = await prisma.payment.findMany({ where: { reservationId, status: 'CAPTURED' }, orderBy: { createdAt: 'desc' } });
    let refunded = 0;
    for (const p of payments) {
      if (remaining <= 0) break;
      const refundable = round2(toNumber(p.amount) - toNumber(p.refundedAmount));
      const part = Math.min(refundable, remaining);
      if (part <= 0) continue;
      trace('Payment', p.gateway === 'RAZORPAY' ? 'Razorpay' : 'PaymentGateway', `refund("${p.transactionRef}")`, { ref: 'Class diagram', note: `${part.toFixed(2)} INR` });
      let gatewayNote;
      if (p.gateway === 'RAZORPAY') {
        // Refund the same proportion of what Razorpay actually charged (it may be a demo token amount).
        const charged = toNumber(p.gatewayAmount ?? p.amount);
        const paise = Math.round((part / toNumber(p.amount)) * charged * 100);
        if (paise >= 100) {
          try {
            const rf = await razorpayGateway.refund(p.transactionRef, paise, { reservationId: String(reservationId), reason: reason || 'refund' });
            gatewayNote = `Razorpay refund ${rf.id} for ₹${(paise / 100).toFixed(2)}`;
          } catch (err) {
            await AuditLog.record({ action: 'PAYMENT_REFUND_FAILED', entityType: 'Payment', entityId: p.id, performedBy, details: { reservationId, amount: part, gateway: 'RAZORPAY', error: err.message } });
            continue;
          }
        } else {
          gatewayNote = `No Razorpay refund: ₹${(paise / 100).toFixed(2)} is below Razorpay's ₹1 minimum`;
        }
      } else {
        const ok = await paymentGateway.refund(p.transactionRef, part);
        if (!ok) continue;
      }
      const newRefunded = round2(toNumber(p.refundedAmount) + part);
      await prisma.payment.update({
        where: { id: p.id },
        data: { refundedAmount: newRefunded, status: newRefunded >= toNumber(p.amount) ? 'REFUNDED' : 'CAPTURED' },
      });
      remaining = round2(remaining - part);
      refunded = round2(refunded + part);
      await AuditLog.record({ action: 'PAYMENT_REFUNDED', entityType: 'Payment', entityId: p.id, performedBy, details: { reservationId, amount: part, reason, ...(gatewayNote ? { gateway: gatewayNote } : {}) } });
    }
    return refunded;
  }

  /** Net amount collected for a reservation (captured minus refunded). */
  static async netPaid(reservationId, db = prisma) {
    const payments = await db.payment.findMany({ where: { reservationId, status: { in: ['CAPTURED', 'REFUNDED'] } } });
    return round2(payments.reduce((s, p) => s + toNumber(p.amount) - toNumber(p.refundedAmount), 0));
  }
}
