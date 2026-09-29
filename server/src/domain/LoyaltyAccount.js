/**
 * UML class: LoyaltyAccount
 *   loyaltyId, guestId, pointsBalance, tier
 *   + accruePoints(points: int): void
 *   + redeemPoints(points: int): Boolean
 *   + getBalance(): int
 * Relationship: Guest 1 --has--> 0..1 LoyaltyAccount
 * SRS: Guest.Rewards.Accrue, Guest.Rewards.Redeem, BR-6 (points only after Checked-Out)
 *
 * Loyalty rules are NOT specified in the documentation. IMPLEMENTATION ASSUMPTION
 * (configurable in System Settings, see docs/ASSUMPTIONS.md):
 *   earn  = floor(room revenue / 100 x loyaltyPointsPer100 x tier multiplier)
 *   tier  = highest tier whose minLifetimePoints <= lifetime points earned
 *   value = 1 point = loyaltyPointValue of base currency, max loyaltyMaxRedeemPercent of room charges
 */
import { prisma } from '../lib/prisma.js';
import { unprocessable } from '../lib/errors.js';

export class LoyaltyAccount {
  static tierFor(lifetimePoints, tiers) {
    return [...tiers].sort((a, b) => b.minLifetimePoints - a.minLifetimePoints).find((t) => lifetimePoints >= t.minLifetimePoints) ?? tiers[0];
  }

  static pointsForStay(roomRevenue, tierName, settings) {
    const tier = settings.loyaltyTiers.find((t) => t.name === tierName) ?? settings.loyaltyTiers[0];
    return Math.floor((roomRevenue / 100) * settings.loyaltyPointsPer100 * tier.multiplier);
  }

  static maxRedeemable(account, roomCharges, settings) {
    const byValue = Math.floor(((roomCharges * settings.loyaltyMaxRedeemPercent) / 100) / settings.loyaltyPointValue);
    return Math.max(0, Math.min(account?.pointsBalance ?? 0, byValue));
  }

  static getBalance(account) {
    return account.pointsBalance;
  }

  /** accruePoints(): credit points and recalculate the tier. Must run inside the check-out transaction. */
  static async accruePoints(guestId, points, { reservationId, description, settings, db = prisma }) {
    if (points <= 0) return null;
    const account = await db.loyaltyAccount.upsert({ where: { guestId }, update: {}, create: { guestId } });
    const lifetime = account.lifetimePoints + points;
    const tier = LoyaltyAccount.tierFor(lifetime, settings.loyaltyTiers).name;
    const updated = await db.loyaltyAccount.update({
      where: { id: account.id },
      data: { pointsBalance: { increment: points }, lifetimePoints: lifetime, tier },
    });
    await db.loyaltyTransaction.create({ data: { loyaltyAccountId: account.id, reservationId, type: 'ACCRUAL', points, description } });
    return { account: updated, tierChanged: tier !== account.tier, previousTier: account.tier };
  }

  /** redeemPoints(): debit points; returns false if the balance is insufficient. */
  static async redeemPoints(guestId, points, { reservationId, description, db = prisma }) {
    if (points <= 0) return true;
    const account = await db.loyaltyAccount.findUnique({ where: { guestId } });
    if (!account || account.pointsBalance < points) {
      throw unprocessable('INSUFFICIENT_POINTS', 'You do not have enough loyalty points.');
    }
    await db.loyaltyAccount.update({ where: { id: account.id }, data: { pointsBalance: { decrement: points } } });
    await db.loyaltyTransaction.create({ data: { loyaltyAccountId: account.id, reservationId, type: 'REDEMPTION', points: -points, description } });
    return true;
  }

  /** Return redeemed points when a reservation is cancelled or payment fails. */
  static async restorePoints(guestId, points, { reservationId, description, db = prisma }) {
    if (!points) return;
    const account = await db.loyaltyAccount.findUnique({ where: { guestId } });
    if (!account) return;
    await db.loyaltyAccount.update({ where: { id: account.id }, data: { pointsBalance: { increment: points } } });
    await db.loyaltyTransaction.create({ data: { loyaltyAccountId: account.id, reservationId, type: 'ADJUSTMENT', points, description } });
  }
}
