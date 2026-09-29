/**
 * UML «interface» PaymentGateway (external actor "Payment Gateway (Bank / PSP)")
 *   + authorize(amount: double): Boolean
 *   + capture(transactionId: String): Boolean
 *   + refund(transactionId: String): Boolean
 * Relationship: Payment ..uses..> PaymentGateway
 * SRS: SI-1.1, SE-4, DE-2, Reservation.Book.Payment, Payment.Contactless.Process
 *
 * IMPLEMENTATION DECISION: MockPaymentGateway is a sandbox that behaves like a
 * PSP. It never receives or stores a full card number from the HRMS database:
 * the raw card number is used only in memory to decide the simulated outcome,
 * and only brand + last four digits are returned (SE-4).
 *
 * Sandbox test instruments (documented in docs/DEMO_ACCOUNTS.md):
 *   Card 4242 4242 4242 4242 -> approved
 *   Card ending ...0002      -> declined ("Insufficient funds")
 *   Card ending ...0003      -> gateway timeout / error
 *   UPI  fail@upi            -> declined
 *   anything else valid       -> approved
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ledgerFile = process.env.MOCK_GATEWAY_LEDGER || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.data/mock-gateway-ledger.json');

function luhnValid(num) {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = Number(num[i]);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function brandOf(num) {
  if (/^4/.test(num)) return 'Visa';
  if (/^5[1-5]/.test(num) || /^2[2-7]/.test(num)) return 'Mastercard';
  if (/^3[47]/.test(num)) return 'Amex';
  if (/^6/.test(num)) return 'RuPay';
  return 'Card';
}

export class MockPaymentGateway {
  constructor(file = ledgerFile) {
    this.file = file;
    this.ledger = this.#load();
  }

  #load() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { return {}; }
  }

  #save() {
    if (process.env.VITEST && !process.env.MOCK_GATEWAY_LEDGER) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.ledger, null, 1));
  }

  /**
   * Validate the payment instrument (DFD 3.1 "Validate Payment Details").
   * Returns a summary safe to store (never the full number).
   */
  validateDetails(method, details = {}) {
    if (method === 'CARD') {
      const num = String(details.cardNumber || '').replace(/\s|-/g, '');
      if (!/^\d{13,19}$/.test(num) || !luhnValid(num)) return { valid: false, reason: 'Card number is invalid.' };
      if (!/^\d{2}\/\d{2}$/.test(details.expiry || '')) return { valid: false, reason: 'Expiry must be MM/YY.' };
      const [mm, yy] = details.expiry.split('/').map(Number);
      const exp = new Date(Date.UTC(2000 + yy, mm, 1));
      if (mm < 1 || mm > 12 || exp <= new Date()) return { valid: false, reason: 'Card has expired.' };
      if (!/^\d{3,4}$/.test(details.cvv || '')) return { valid: false, reason: 'CVV is invalid.' };
      return { valid: true, summary: `${brandOf(num)} •••• ${num.slice(-4)}`, instrument: num };
    }
    if (method === 'UPI') {
      const id = String(details.upiId || '');
      if (!/^[\w.-]{2,}@[a-z]{2,}$/i.test(id)) return { valid: false, reason: 'UPI ID is invalid (e.g. name@bank).' };
      return { valid: true, summary: `UPI ${id.replace(/^(.{2}).*(@.*)$/, '$1•••$2')}`, instrument: id };
    }
    if (method === 'NET_BANKING') {
      if (!details.bank) return { valid: false, reason: 'Select a bank.' };
      return { valid: true, summary: `Net banking · ${details.bank}`, instrument: details.bank };
    }
    if (method === 'WALLET') {
      if (!details.wallet) return { valid: false, reason: 'Select a wallet.' };
      return { valid: true, summary: `Wallet · ${details.wallet}`, instrument: details.wallet };
    }
    return { valid: false, reason: 'Unsupported payment method.' };
  }

  /** authorize(amount): place an authorisation hold. */
  async authorize(amount, { currency = 'INR', method, instrument, reference } = {}) {
    await new Promise((r) => setTimeout(r, process.env.VITEST ? 0 : 350)); // network latency
    const transactionId = `txn_${crypto.randomBytes(9).toString('hex')}`;
    const inst = String(instrument || '');
    let outcome = { approved: true };
    if (method === 'CARD' && inst.endsWith('0002')) outcome = { approved: false, reason: 'Card declined: insufficient funds.' };
    else if (method === 'CARD' && inst.endsWith('0003')) outcome = { approved: false, reason: 'Payment gateway timeout. No money was taken.', timeout: true };
    else if (method === 'UPI' && inst.toLowerCase() === 'fail@upi') outcome = { approved: false, reason: 'UPI payment declined by the bank.' };

    this.ledger[transactionId] = {
      transactionId, amount, currency, reference, method,
      state: outcome.approved ? 'AUTHORIZED' : 'DECLINED',
      createdAt: new Date().toISOString(),
    };
    this.#save();
    return { ...outcome, transactionId };
  }

  /** capture(transactionId): settle an authorised amount. */
  async capture(transactionId) {
    const tx = this.ledger[transactionId];
    if (!tx || tx.state !== 'AUTHORIZED') return false;
    tx.state = 'CAPTURED';
    tx.capturedAt = new Date().toISOString();
    this.#save();
    return true;
  }

  /** refund(transactionId): refund all or part of a captured payment. */
  async refund(transactionId, amount) {
    const tx = this.ledger[transactionId];
    if (!tx || !['CAPTURED', 'PARTIALLY_REFUNDED'].includes(tx.state)) return false;
    tx.refunded = Math.round(((tx.refunded || 0) + (amount ?? tx.amount)) * 100) / 100;
    tx.state = tx.refunded >= tx.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    this.#save();
    return true;
  }

  /** Settlement report used by Finance Staff reconciliation (reconcileRevenue). */
  async getSettlementReport() {
    return Object.values(this.ledger);
  }

  /** Seeding / demo helper: record a transaction exactly as the gateway would. */
  _recordExternal(tx) {
    this.ledger[tx.transactionId] = tx;
    this.#save();
  }
}

export const paymentGateway = new MockPaymentGateway();
