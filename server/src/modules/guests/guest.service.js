/**
 * SRS 4.5 Guest Preference and Loyalty Management:
 *   Guest.Profile.Manage, Guest.Profile.History, Guest.Rewards.Accrue (see access.service), Guest.Rewards.Redeem
 * OR-3: exportable data package ; UD-2 guided walkthrough state
 * UML: GuestProfile.updatePreferences(), LoyaltyAccount.getBalance(), Guest.manageLoyalty(), Guest.viewStayHistory()
 * DFD: 1.0 User Authentication & Profile Management (D1)
 */
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { formatDateOnly, parseDateOnly } from '../../lib/dates.js';
import { toNumber } from '../../lib/money.js';
import { getSettings } from '../../lib/settings.js';
import { AuditLog } from '../../domain/AuditLog.js';
import { LoyaltyAccount } from '../../domain/LoyaltyAccount.js';
import { stayHistory, listReservations } from '../reservations/reservation.service.js';

export async function getProfile(user) {
  const guest = await prisma.guest.findUnique({ where: { id: user.guestPk }, include: { profile: true, user: { select: { name: true, email: true, phone: true, mfaEnabled: true, createdAt: true } } } });
  if (!guest) throw notFound('Guest');
  const p = guest.profile;
  return {
    guestId: guest.guestId, name: guest.user.name, email: guest.user.email, phone: guest.user.phone, mfaEnabled: guest.user.mfaEnabled, memberSince: guest.user.createdAt,
    dateOfBirth: p?.dateOfBirth ? formatDateOnly(p.dateOfBirth) : null, nationality: p?.nationality ?? null, address: p?.address ?? null,
    preferences: p?.preferences ?? {}, accessibilityNeeds: p?.accessibilityNeeds ?? null, preferredCurrency: p?.preferredCurrency ?? 'INR',
  };
}

/** GuestProfile.updatePreferences() + User.updateProfile() — stored for future smart allocation. */
export async function updateProfile(user, input) {
  await prisma.$transaction(async (tx) => {
    if (input.name || input.phone !== undefined || input.mfaEnabled !== undefined) {
      await tx.user.update({ where: { id: user.id }, data: { name: input.name ?? undefined, phone: input.phone ?? undefined, mfaEnabled: input.mfaEnabled ?? undefined } });
    }
    await tx.guestProfile.upsert({
      where: { guestId: user.guestPk },
      update: {
        dateOfBirth: input.dateOfBirth ? parseDateOnly(input.dateOfBirth) : input.dateOfBirth === null ? null : undefined,
        nationality: input.nationality ?? undefined, address: input.address ?? undefined,
        preferences: input.preferences ?? undefined, accessibilityNeeds: input.accessibilityNeeds ?? undefined,
        preferredCurrency: input.preferredCurrency ?? undefined,
      },
      create: { guestId: user.guestPk, preferences: input.preferences ?? {} },
    });
  });
  await AuditLog.record({ action: 'GUEST_PROFILE_UPDATED', entityType: 'GuestProfile', entityId: user.guestPk, performedBy: user.id, details: { fields: Object.keys(input) } });
  return getProfile(user);
}

/** Guest.manageLoyalty() — balance, tier progress and transactions. */
export async function getLoyalty(user) {
  const settings = await getSettings();
  const account = await prisma.loyaltyAccount.upsert({ where: { guestId: user.guestPk }, update: {}, create: { guestId: user.guestPk }, include: { transactions: { orderBy: { createdAt: 'desc' }, take: 50, include: { reservation: { select: { reservationNumber: true } } } } } });
  const tiers = [...settings.loyaltyTiers].sort((a, b) => a.minLifetimePoints - b.minLifetimePoints);
  const current = LoyaltyAccount.tierFor(account.lifetimePoints, tiers);
  const next = tiers.find((t) => t.minLifetimePoints > account.lifetimePoints) ?? null;
  return {
    balance: LoyaltyAccount.getBalance(account),
    lifetimePoints: account.lifetimePoints,
    tier: account.tier,
    tierMultiplier: current.multiplier,
    nextTier: next ? { name: next.name, pointsNeeded: next.minLifetimePoints - account.lifetimePoints, minLifetimePoints: next.minLifetimePoints } : null,
    tiers,
    rules: {
      earn: `${settings.loyaltyPointsPer100} points per ₹100 of room charges, × tier multiplier, credited after check-out (BR-6)`,
      redeem: `1 point = ₹${settings.loyaltyPointValue}; up to ${settings.loyaltyMaxRedeemPercent}% of room charges`,
      pointValue: settings.loyaltyPointValue,
      maxRedeemPercent: settings.loyaltyMaxRedeemPercent,
    },
    transactions: account.transactions.map((t) => ({ id: t.id, type: t.type, points: t.points, description: t.description, createdAt: t.createdAt, reservationNumber: t.reservation?.reservationNumber ?? null })),
  };
}

/** OR-3: portable data package (reservations, invoices, loyalty history) */
export async function exportMyData(user) {
  const [profile, reservations, loyalty, requests, conversations] = await Promise.all([
    getProfile(user),
    listReservations(user, {}),
    getLoyalty(user),
    prisma.serviceRequest.findMany({ where: { guestId: user.guestPk } }),
    prisma.aIConversation.findMany({ where: { guestId: user.guestPk }, orderBy: { timestamp: 'asc' } }),
  ]);
  const invoices = await prisma.invoice.findMany({ where: { reservation: { guestId: user.guestPk } } });
  await AuditLog.record({ action: 'GUEST_DATA_EXPORTED', entityType: 'Guest', entityId: user.guestPk, performedBy: user.id });
  return {
    exportedAt: new Date().toISOString(), format: 'HRMS guest data package v1 (JSON)',
    profile, reservations, invoices: invoices.map((i) => ({ ...i, subtotal: toNumber(i.subtotal), taxAmount: toNumber(i.taxAmount), totalAmount: toNumber(i.totalAmount), amountPaid: toNumber(i.amountPaid) })),
    loyalty, serviceRequests: requests.map((r) => ({ ...r, charge: toNumber(r.charge) })), conciergeConversations: conversations,
  };
}

export { stayHistory };

/** Staff guest lookup (Receptionist "Guest management"). */
export async function searchGuests(q) {
  const s = (q || '').trim();
  const rows = await prisma.guest.findMany({
    where: s ? { OR: [{ guestId: { contains: s.toUpperCase() } }, { user: { name: { contains: s, mode: 'insensitive' } } }, { user: { email: { contains: s, mode: 'insensitive' } } }, { user: { phone: { contains: s } } }] } : {},
    include: { user: { select: { name: true, email: true, phone: true, isActive: true } }, loyaltyAccount: true, _count: { select: { reservations: true } } },
    orderBy: { id: 'desc' },
    take: 50,
  });
  return rows.map((g) => ({ id: g.id, guestId: g.guestId, name: g.user.name, email: g.user.email, phone: g.user.phone, tier: g.loyaltyAccount?.tier ?? 'SILVER', points: g.loyaltyAccount?.pointsBalance ?? 0, reservations: g._count.reservations }));
}
