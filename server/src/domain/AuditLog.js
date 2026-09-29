/**
 * UML class: AuditLog
 *   logId, timestamp, action, entityType, entityId, performedBy, details
 *   + record()
 * Relationship: User 1 --creates--> 0..* AuditLog
 * SRS: SE-6 (log all booking and payment transactions), UC-4 step 4, 4.2.2 (role changes logged)
 * DFD: 6.0 Reporting & Administration ("Audit Logs")
 */
import { prisma } from '../lib/prisma.js';

export class AuditLog {
  /**
   * Persist one audit record. Never throws: auditing must not break the business action.
   * Pass a transaction client as `db` to make the record part of the same transaction.
   */
  static async record({ action, entityType, entityId, performedBy, details, ipAddress }, db = prisma) {
    try {
      return await db.auditLog.create({
        data: {
          action,
          entityType,
          entityId: entityId == null ? null : String(entityId),
          performedBy: performedBy ?? null,
          details: details ?? {},
          ipAddress: ipAddress ?? null,
        },
      });
    } catch (err) {
      console.error('[audit] failed to record', action, err.message);
      return null;
    }
  }
}
