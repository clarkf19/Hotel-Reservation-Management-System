/**
 * System configuration (UML: SystemAdministrator.systemSettings()).
 * Values live in the system_settings table and are editable by the System
 * Administrator; the defaults below are used until a value is saved.
 * Every default that is not stated in the SRS is marked IMPLEMENTATION ASSUMPTION
 * in docs/ASSUMPTIONS.md.
 */
import { prisma } from './prisma.js';

export const DEFAULT_SETTINGS = {
  hotelName: { value: 'Solstice Bay Hotel', description: 'Property name shown to guests' },
  baseCurrency: { value: 'INR', description: 'Hotel base currency, ISO 4217 (BR-4, CO-3)' },
  checkInTime: { value: '14:00', description: 'Standard check-in time (hotel local time)' },
  checkOutTime: { value: '11:00', description: 'Standard check-out time (hotel local time)' },
  taxRatePercent: { value: 12, description: 'Tax applied to room and service charges' },
  freeCancellationHours: { value: 48, description: 'BR-8: free cancellation up to this many hours before check-in' },
  paymentHoldMinutes: { value: 10, description: 'How long a room stays locked while payment is pending' },
  loyaltyPointsPer100: { value: 5, description: 'Loyalty points earned per 100 units of room revenue (before tier bonus)' },
  loyaltyPointValue: { value: 1, description: 'Currency value of one loyalty point when redeemed' },
  loyaltyMaxRedeemPercent: { value: 50, description: 'Maximum share of room charges payable with points' },
  loyaltyTiers: {
    value: [
      { name: 'SILVER', minLifetimePoints: 0, multiplier: 1 },
      { name: 'GOLD', minLifetimePoints: 2500, multiplier: 1.25 },
      { name: 'PLATINUM', minLifetimePoints: 7500, multiplier: 1.5 },
    ],
    description: 'Loyalty tiers by lifetime points',
  },
  loginMaxAttempts: { value: 5, description: 'User.Login.Lockout: failed attempts before lockout' },
  loginLockoutMinutes: { value: 15, description: 'User.Login.Lockout: lockout duration' },
  otaSyncIntervalSeconds: { value: 30, description: 'Channel.Sync.Inventory: background OTA sync interval (must be <= 60)' },
  digitalKeyGraceMinutes: { value: 60, description: 'Digital key remains valid this long after check-out time' },
  conciergeEscalationThreshold: { value: 0.35, description: 'Knowledge-base match score below which a query is escalated' },
};

let cache = null;
let cacheAt = 0;

export async function getSettings() {
  if (cache && Date.now() - cacheAt < 5000) return cache;
  const rows = await prisma.systemSetting.findMany();
  const merged = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k, d]) => [k, d.value]));
  for (const row of rows) merged[row.key] = row.value;
  cache = merged;
  cacheAt = Date.now();
  return merged;
}

export function invalidateSettings() {
  cache = null;
}
