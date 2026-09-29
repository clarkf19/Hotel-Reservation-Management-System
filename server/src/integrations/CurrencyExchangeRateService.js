/**
 * UML «interface» CurrencyExchangeRateService
 *   + getExchangeRate(currency: String): double
 * Relationship: Payment ..uses..> CurrencyExchangeRateService
 * SRS: SI-5.1 (retrieve rates at least once every 24 hours), BR-4, CO-3 (ISO 4217)
 *
 * IMPLEMENTATION DECISION: rates come from a simulated provider (fixed reference
 * rates with a small daily drift) and are cached in the exchange_rates table.
 * A cached rate older than 24 hours is refreshed before use.
 * Rate semantics: 1 unit of foreign currency = `rate` units of the base currency (INR).
 */
import { prisma } from '../lib/prisma.js';

const REFERENCE_RATES_TO_INR = { INR: 1, USD: 83.2, EUR: 90.4, GBP: 105.6, AED: 22.65, SGD: 61.8, JPY: 0.56, AUD: 54.9 };
export const SUPPORTED_CURRENCIES = Object.keys(REFERENCE_RATES_TO_INR);
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

class SimulatedRateProvider {
  async fetchRate(currency) {
    const base = REFERENCE_RATES_TO_INR[currency];
    if (!base) throw new Error(`Unsupported currency ${currency}`);
    const day = Math.floor(Date.now() / MAX_AGE_MS);
    const drift = currency === 'INR' ? 0 : Math.sin(day + currency.charCodeAt(0)) * 0.004;
    return Math.round(base * (1 + drift) * 1e6) / 1e6;
  }
}

export class CurrencyExchangeRateService {
  constructor(provider = new SimulatedRateProvider()) {
    this.provider = provider;
  }

  async getExchangeRate(currency) {
    const code = String(currency).toUpperCase();
    if (code === 'INR') return 1;
    const cached = await prisma.exchangeRate.findUnique({ where: { currency: code } });
    if (cached && Date.now() - cached.fetchedAt.getTime() < MAX_AGE_MS) return Number(cached.rate);
    const rate = await this.provider.fetchRate(code);
    await prisma.exchangeRate.upsert({
      where: { currency: code },
      update: { rate, fetchedAt: new Date() },
      create: { currency: code, rate, fetchedAt: new Date() },
    });
    return rate;
  }

  /** Refresh every supported rate (background job, SI-5.1). */
  async refreshAll() {
    for (const c of SUPPORTED_CURRENCIES.filter((c) => c !== 'INR')) {
      const rate = await this.provider.fetchRate(c);
      await prisma.exchangeRate.upsert({ where: { currency: c }, update: { rate, fetchedAt: new Date() }, create: { currency: c, rate, fetchedAt: new Date() } });
    }
  }
}

export const currencyExchangeRateService = new CurrencyExchangeRateService();
