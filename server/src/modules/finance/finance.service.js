/**
 * Finance Staff functions (SRS 2.3; UC-3 step 3; use cases "Verify & Reconcile Payments",
 * "Generate Financial / Revenue Report")
 * UML: FinanceStaff.verifyPayments(), reconcileRevenue(), generateInvoice(), viewFinancialReports()
 * DFD: 6.0 Reporting & Administration <- D4 Payment Records ("Payment Verification / Reconciliation Data")
 * SRS 2.3: Finance Staff "do not modify reservation records directly" — this module never writes reservations.
 */
import { prisma } from '../../lib/prisma.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { round2, toNumber } from '../../lib/money.js';
import { getSettings } from '../../lib/settings.js';
import { AuditLog } from '../../domain/AuditLog.js';
import { Invoice } from '../../domain/Invoice.js';
import { paymentGateway } from '../../integrations/PaymentGateway.js';
import { razorpayGateway } from '../../integrations/RazorpayGateway.js';
import { formatReference } from '../reservations/reservation.service.js';

function paymentView(p) {
  return {
    id: p.id, reservationId: p.reservationId, reference: formatReference(p.reservation?.reservationNumber), guest: p.reservation?.guest?.user?.name,
    amount: toNumber(p.amount), currency: p.currency, originalAmount: p.originalAmount ? toNumber(p.originalAmount) : null, originalCurrency: p.originalCurrency,
    status: p.status, purpose: p.purpose, paymentMethod: p.paymentMethod, methodSummary: p.methodSummary, transactionRef: p.transactionRef,
    refundedAmount: toNumber(p.refundedAmount), failureReason: p.failureReason, paidAt: p.paidAt, createdAt: p.createdAt,
    verifiedBy: p.verifiedBy?.name ?? null, verifiedAt: p.verifiedAt, reconciled: p.reconciled, source: p.reservation?.source,
    gateway: p.gateway, gatewayAmount: p.gatewayAmount == null ? null : toNumber(p.gatewayAmount),
  };
}

const paymentInclude = { reservation: { select: { reservationNumber: true, source: true, guest: { select: { user: { select: { name: true } } } } } }, verifiedBy: { select: { name: true } } };

export async function listPayments(q = {}) {
  const where = {};
  if (q.status) where.status = { in: q.status.split(',') };
  if (q.method) where.paymentMethod = q.method;
  if (q.unverified === 'true') where.verifiedAt = null;
  if (q.from || q.to) where.createdAt = { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(`${q.to}T23:59:59Z`) : undefined };
  if (q.search) where.OR = [{ transactionRef: { contains: q.search, mode: 'insensitive' } }, { reservation: { guest: { user: { name: { contains: q.search, mode: 'insensitive' } } } } }];
  const rows = await prisma.payment.findMany({ where, include: paymentInclude, orderBy: { createdAt: 'desc' }, take: 300 });
  const totals = await prisma.payment.groupBy({ by: ['status'], _sum: { amount: true, refundedAmount: true }, _count: true });
  return {
    payments: rows.map(paymentView),
    totals: Object.fromEntries(totals.map((t) => [t.status, { count: t._count, amount: toNumber(t._sum.amount), refunded: toNumber(t._sum.refundedAmount) }])),
  };
}

/** FinanceStaff.verifyPayments(): confirm a captured payment has been checked. */
export async function verifyPayment(user, paymentId, { note } = {}) {
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!p) throw notFound('Payment');
  if (!['CAPTURED', 'REFUNDED'].includes(p.status)) throw unprocessable('NOT_VERIFIABLE', 'Only settled payments can be verified.');
  const updated = await prisma.payment.update({ where: { id: paymentId }, data: { verifiedById: user.id, verifiedAt: new Date() }, include: paymentInclude });
  await AuditLog.record({ action: 'PAYMENT_VERIFIED', entityType: 'Payment', entityId: paymentId, performedBy: user.id, details: { note } });
  return paymentView(updated);
}

/**
 * Razorpay payments are reconciled against Razorpay's own API. When a demo token amount was charged,
 * the gateway figures are compared in proportion to the booking value recorded in HRMS.
 */
async function reconcileRazorpay(p) {
  const hrmsNet = round2(toNumber(p.amount) - toNumber(p.refundedAmount));
  const base = { ...paymentView(p), hrmsNet };
  if (!razorpayGateway.configured()) return { ...base, gatewayState: null, gatewayNet: null, reconStatus: 'MISMATCH', issue: 'Razorpay keys not configured, cannot verify this Razorpay payment' };
  try {
    const rp = await razorpayGateway.fetchPayment(p.transactionRef);
    const charged = toNumber(p.gatewayAmount ?? p.amount);
    const scale = charged > 0 ? toNumber(p.amount) / charged : 1;
    const gatewayNet = round2(((rp.amount - (rp.amount_refunded || 0)) / 100) * scale);
    let status = 'MATCHED';
    let issue = `Razorpay ${rp.status}: ₹${(rp.amount / 100).toFixed(2)} charged${rp.amount_refunded ? `, ₹${(rp.amount_refunded / 100).toFixed(2)} refunded` : ''}${scale !== 1 ? ' (demo charge, scaled to booking value)' : ''}`;
    if (!['captured', 'refunded'].includes(rp.status)) { status = 'MISMATCH'; issue = `Razorpay reports status "${rp.status}"`; }
    else if (Math.abs(rp.amount / 100 - charged) > 0.009) { status = 'MISMATCH'; issue = `Razorpay charged ₹${(rp.amount / 100).toFixed(2)}, HRMS expected ₹${charged.toFixed(2)}`; }
    else if (Math.abs(gatewayNet - hrmsNet) > Math.max(1, scale * 1.01)) { status = 'MISMATCH'; issue = `Refunds differ: gateway net ≈ ₹${gatewayNet.toFixed(2)} vs HRMS ₹${hrmsNet.toFixed(2)}`; }
    return { ...base, gatewayState: `RAZORPAY_${rp.status.toUpperCase()}`, gatewayNet: status === 'MATCHED' ? hrmsNet : gatewayNet, reconStatus: status, issue: status === 'MATCHED' ? null : issue, note: issue };
  } catch (err) {
    return { ...base, gatewayState: null, gatewayNet: null, reconStatus: 'MISSING_AT_GATEWAY', issue: `Razorpay lookup failed: ${err.message}` };
  }
}

/**
 * FinanceStaff.reconcileRevenue(): compare HRMS payment records (D4) with the payment
 * gateway's settlement report. OTA-collected payments are settled by the OTA and excluded.
 */
export async function reconcile(user, { apply = false } = {}) {
  const settlement = await paymentGateway.getSettlementReport();
  const ledger = new Map(settlement.map((t) => [t.transactionId, t]));
  const payments = await prisma.payment.findMany({ where: { transactionRef: { not: null }, NOT: { transactionRef: { startsWith: 'ota_' } } }, include: paymentInclude, orderBy: { createdAt: 'desc' } });
  const items = [];
  for (const p of payments) {
    if (p.gateway === 'RAZORPAY') {
      if (p.status === 'FAILED') continue;
      items.push(await reconcileRazorpay(p));
      continue;
    }
    const tx = ledger.get(p.transactionRef);
    const hrmsNet = round2(toNumber(p.amount) - toNumber(p.refundedAmount));
    let status = 'MATCHED';
    let issue = null;
    if (p.status === 'FAILED') {
      if (tx && ['CAPTURED', 'PARTIALLY_REFUNDED'].includes(tx.state)) { status = 'MISMATCH'; issue = 'HRMS shows failed, gateway shows money captured'; }
      else continue; // failed on both sides: nothing to reconcile
    } else if (!tx) { status = 'MISSING_AT_GATEWAY'; issue = 'Transaction not found in gateway settlement report'; }
    else {
      const gwNet = round2((tx.amount || 0) - (tx.refunded || 0));
      if (Math.abs(gwNet - hrmsNet) > 0.009) { status = 'MISMATCH'; issue = `Gateway net ₹${gwNet.toFixed(2)} vs HRMS net ₹${hrmsNet.toFixed(2)}`; }
      else if (tx.state === 'AUTHORIZED') { status = 'MISMATCH'; issue = 'Authorised at gateway but never captured'; }
    }
    items.push({ ...paymentView(p), hrmsNet, gatewayState: tx?.state ?? null, gatewayNet: tx ? round2((tx.amount || 0) - (tx.refunded || 0)) : null, reconStatus: status, issue });
  }
  const hrmsIds = new Set(payments.map((p) => p.transactionRef));
  const unknownAtHrms = settlement.filter((t) => t.state === 'CAPTURED' && !hrmsIds.has(t.transactionId)).map((t) => ({ transactionRef: t.transactionId, gatewayNet: t.amount, reconStatus: 'MISSING_IN_HRMS', issue: 'Captured at gateway but no HRMS payment record', createdAt: t.createdAt }));
  const matched = items.filter((i) => i.reconStatus === 'MATCHED');
  if (apply && matched.length) {
    await prisma.payment.updateMany({ where: { id: { in: matched.map((m) => m.id) } }, data: { reconciled: true } });
  }
  await AuditLog.record({ action: 'REVENUE_RECONCILED', entityType: 'Payment', performedBy: user.id, details: { matched: matched.length, exceptions: items.length - matched.length + unknownAtHrms.length, applied: apply } });
  return {
    runAt: new Date().toISOString(),
    summary: {
      checked: items.length, matched: matched.length, exceptions: items.length - matched.length + unknownAtHrms.length,
      hrmsNetTotal: round2(items.reduce((s, i) => s + i.hrmsNet, 0)),
      gatewayNetTotal: round2(items.reduce((s, i) => s + (i.gatewayNet ?? 0), 0)),
    },
    items: [...items.filter((i) => i.reconStatus !== 'MATCHED'), ...unknownAtHrms, ...matched],
  };
}

export async function listInvoices(q = {}) {
  const rows = await prisma.invoice.findMany({
    where: q.search ? { OR: [{ invoiceNumber: { contains: q.search, mode: 'insensitive' } }, { reservation: { guest: { user: { name: { contains: q.search, mode: 'insensitive' } } } } }] } : {},
    include: { reservation: { select: { reservationNumber: true, checkInDate: true, checkOutDate: true, guest: { select: { user: { select: { name: true, email: true } } } }, room: { select: { roomNumber: true } } } } },
    orderBy: { issueDate: 'desc' },
    take: 300,
  });
  return rows.map((i) => ({ id: i.id, invoiceNumber: i.invoiceNumber, issueDate: i.issueDate, subtotal: toNumber(i.subtotal), taxAmount: toNumber(i.taxAmount), totalAmount: toNumber(i.totalAmount), amountPaid: toNumber(i.amountPaid), status: i.status, emailedAt: i.emailedAt, guest: i.reservation.guest.user.name, email: i.reservation.guest.user.email, roomNumber: i.reservation.room.roomNumber, reference: formatReference(i.reservation.reservationNumber), lineItems: i.lineItems }));
}

/** Invoice.generatePDF() — guests may download their own; finance/front desk any. */
export async function invoicePdf(user, invoiceId) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { reservation: { include: { guest: { include: { user: true } }, room: { include: { roomType: true } } } } } });
  if (!invoice) throw notFound('Invoice');
  const canSeeAll = user.permissions.has('invoice.read') || user.permissions.has('frontdesk.checkin');
  if (!canSeeAll && invoice.reservation.guestId !== user.guestPk) throw notFound('Invoice');
  const settings = await getSettings();
  return { filename: `${invoice.invoiceNumber}.pdf`, buffer: Invoice.generatePDF(invoice, invoice.reservation, settings.hotelName) };
}
