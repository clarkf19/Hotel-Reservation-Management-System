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
import { badRequest } from '../lib/errors.js';
import { round2, toNumber } from '../lib/money.js';
import { trace } from '../lib/trace.js';
import { paymentGateway } from '../integrations/PaymentGateway.js';
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
      trace('Payment', 'PaymentGateway', `refund("${p.transactionRef}")`, { ref: 'Class diagram', note: `${part.toFixed(2)} INR` });
      const ok = await paymentGateway.refund(p.transactionRef, part);
      if (!ok) continue;
      const newRefunded = round2(toNumber(p.refundedAmount) + part);
      await prisma.payment.update({
        where: { id: p.id },
        data: { refundedAmount: newRefunded, status: newRefunded >= toNumber(p.amount) ? 'REFUNDED' : 'CAPTURED' },
      });
      remaining = round2(remaining - part);
      refunded = round2(refunded + part);
      await AuditLog.record({ action: 'PAYMENT_REFUNDED', entityType: 'Payment', entityId: p.id, performedBy, details: { reservationId, amount: part, reason } });
    }
    return refunded;
  }

  /** Net amount collected for a reservation (captured minus refunded). */
  static async netPaid(reservationId, db = prisma) {
    const payments = await db.payment.findMany({ where: { reservationId, status: { in: ['CAPTURED', 'REFUNDED'] } } });
    return round2(payments.reduce((s, p) => s + toNumber(p.amount) - toNumber(p.refundedAmount), 0));
  }
}
