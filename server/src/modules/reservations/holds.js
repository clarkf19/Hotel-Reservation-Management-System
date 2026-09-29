/**
 * Temporary inventory locks (Activity: "Lock Room Inventory" / "Release Inventory Lock";
 * DFD 2.2 "Lock Room (Temporary Hold)"; SRS Fig. 2 PENDING PAYMENT "awaiting payment within time limit").
 *
 * - A PENDING_PAYMENT reservation whose hold has expired releases the room and becomes a
 *   recoverable DRAFT (SRS 5.4 Robustness: preserve the in-progress booking).
 * - A DRAFT that is not paid within 24 hours is CANCELLED (Fig. 2 timeout -> CANCELLED).
 * IMPLEMENTATION ASSUMPTION: the 24-hour draft lifetime is not specified in the documents.
 */
import { prisma } from '../../lib/prisma.js';

export async function releaseExpiredHolds(now = new Date()) {
  const released = await prisma.reservation.updateMany({
    where: { status: 'PENDING_PAYMENT', holdExpiresAt: { lt: now } },
    data: { status: 'DRAFT', holdExpiresAt: null },
  });
  const abandoned = await prisma.reservation.updateMany({
    where: { status: 'DRAFT', updatedAt: { lt: new Date(now.getTime() - 24 * 3600_000) } },
    data: { status: 'CANCELLED', cancelledAt: now, cancellationReason: 'Payment not completed (draft expired)' },
  });
  return { released: released.count, abandoned: abandoned.count };
}
