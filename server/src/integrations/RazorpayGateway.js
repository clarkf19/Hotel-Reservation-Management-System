/**
 * Real payment gateway: Razorpay (realises the UML «interface» PaymentGateway against a live PSP).
 *   authorize  -> the guest authorises the payment in Razorpay Checkout (browser), against an Order we create
 *   verify     -> HMAC-SHA256 signature check + fetch the payment from Razorpay's API
 *   capture    -> POST /payments/:id/capture (only if the account does not auto-capture)
 *   refund     -> POST /payments/:id/refund
 *
 * Configured with RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in server/.env.
 *   rzp_test_… keys  -> Razorpay TEST mode: no real money moves.
 *   rzp_live_… keys  -> LIVE mode: real money is collected into the Razorpay account that owns the keys.
 * RAZORPAY_CHARGE_PAISE (optional, e.g. 100 = ₹1): charge this token amount instead of the full booking
 * total. The HRMS still records the booking value; the payment row stores what Razorpay actually charged
 * in `gatewayAmount`, and the UI labels it as a demo charge.
 *
 * The key secret never leaves the server. Card / UPI details are entered in Razorpay's own checkout,
 * so the HRMS never sees them at all (SE-4).
 */
import crypto from 'node:crypto';

const API = 'https://api.razorpay.com/v1';

export class RazorpayError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export class RazorpayGateway {
  get keyId() { return process.env.RAZORPAY_KEY_ID || ''; }
  get #secret() { return process.env.RAZORPAY_KEY_SECRET || ''; }

  configured() {
    return /^rzp_(test|live)_/.test(this.keyId) && Boolean(this.#secret);
  }

  mode() {
    return this.keyId.startsWith('rzp_live_') ? 'live' : 'test';
  }

  /** Token amount in paise to charge instead of the full total, or null to charge in full. */
  chargePaise() {
    const v = Number.parseInt(process.env.RAZORPAY_CHARGE_PAISE || '', 10);
    return Number.isFinite(v) && v >= 100 ? v : null;
  }

  async #call(method, path, body) {
    let res;
    try {
      res = await fetch(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.#secret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new RazorpayError('Could not reach Razorpay. Check your internet connection.', 503);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const description = data?.error?.description || `Razorpay request failed (HTTP ${res.status})`;
      throw new RazorpayError(res.status === 401 ? 'Razorpay rejected the API keys. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server/.env.' : description, res.status, data);
    }
    return data;
  }

  /** Create an Order for the amount the guest will authorise in Checkout. */
  createOrder({ amountPaise, receipt, notes }) {
    return this.#call('POST', '/orders', { amount: amountPaise, currency: 'INR', receipt: receipt.slice(0, 40), notes });
  }

  /** Checkout's success handler returns this signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
  verifySignature(orderId, paymentId, signature) {
    if (!orderId || !paymentId || !signature) return false;
    const expected = crypto.createHmac('sha256', this.#secret).update(`${orderId}|${paymentId}`).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  fetchPayment(paymentId) {
    return this.#call('GET', `/payments/${encodeURIComponent(paymentId)}`);
  }

  capture(paymentId, amountPaise) {
    return this.#call('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: 'INR' });
  }

  refund(paymentId, amountPaise, notes) {
    return this.#call('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise, notes });
  }

  /** Human-readable, non-sensitive description of how the guest paid. */
  static describe(p) {
    if (p.method === 'upi' && p.vpa) return `UPI ${String(p.vpa).replace(/^(.{2}).*(@.*)$/, '$1•••$2')}`;
    if (p.method === 'card' && p.card) return `${p.card.network || 'Card'} •••• ${p.card.last4 || ''}`.trim();
    if (p.method === 'netbanking') return `Net banking · ${p.bank || ''}`.trim();
    if (p.method === 'wallet') return `Wallet · ${p.wallet || ''}`.trim();
    return p.method ? p.method.toUpperCase() : 'Razorpay';
  }

  static methodEnum(p) {
    return { upi: 'UPI', card: 'CARD', netbanking: 'NET_BANKING', wallet: 'WALLET' }[p.method] || 'CARD';
  }
}

export const razorpayGateway = new RazorpayGateway();
