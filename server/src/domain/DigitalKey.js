/**
 * UML class: DigitalKey
 *   keyId, reservationId, keyCode, issueDate, expiryDate, status
 *   + issueKey(): void
 *   + verifyKey(): Boolean
 *   + revokeKey(): void
 * Relationships: Reservation 1 --issues--> 0..1 DigitalKey ; DigitalKey ..uses..> SmartLockController
 * SRS: Room.Access.Issue (time-bound QR/NFC key valid only for the reserved room and stay),
 *      Room.Access.Revoke (revoked automatically at the end of the stay), 5.2 Safety
 * Data dictionary: digital key = key ID + token + valid from + valid to + reservation
 */
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { atHotelTime } from '../lib/dates.js';

export class DigitalKey {
  /** Validity window: from check-in time (or now, if later) until check-out time + grace. */
  static validityWindow(reservation, settings, now = new Date()) {
    const standardFrom = atHotelTime(reservation.checkInDate, settings.checkInTime);
    const from = now < standardFrom ? now : standardFrom; // early digital check-in still gets a working key
    const to = new Date(atHotelTime(reservation.checkOutDate, settings.checkOutTime).getTime() + settings.digitalKeyGraceMinutes * 60_000);
    return { from, to };
  }

  /** issueKey(): create (or re-issue) the single key of a reservation with a fresh cryptographic token. */
  static async issueKey(reservation, settings, { keyType = 'QR', db = prisma } = {}) {
    const { from, to } = DigitalKey.validityWindow(reservation, settings);
    const keyCode = `HRMS-${crypto.randomBytes(12).toString('base64url').toUpperCase()}`;
    return db.digitalKey.upsert({
      where: { reservationId: reservation.id },
      update: { keyCode, keyType, issueDate: from, expiryDate: to, status: 'ACTIVE', revokedAt: null },
      create: { reservationId: reservation.id, keyCode, keyType, issueDate: from, expiryDate: to, status: 'ACTIVE' },
    });
  }

  /**
   * verifyKey(): decide whether a presented key opens a given door.
   * Returns { valid, reason } — "Key Valid?" decision of the activity diagram.
   */
  static verifyKey(key, roomNumber, now = new Date()) {
    if (!key) return { valid: false, reason: 'Unknown key' };
    if (key.status === 'REVOKED') return { valid: false, reason: 'Key has been revoked' };
    if (key.status === 'EXPIRED' || now > key.expiryDate) return { valid: false, reason: 'Key has expired', expired: true };
    if (now < key.issueDate) return { valid: false, reason: 'Key is not valid yet' };
    if (key.reservation.room.roomNumber !== roomNumber) return { valid: false, reason: `Key is not valid for room ${roomNumber}` };
    if (key.reservation.status !== 'CHECKED_IN') return { valid: false, reason: 'Reservation is not checked in' };
    return { valid: true, reason: 'Key verified' };
  }

  /** revokeKey(): permanently disable the key (check-out or security action). */
  static revokeKey(reservationId, db = prisma) {
    return db.digitalKey.updateMany({
      where: { reservationId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
  }

  /** Room.Access.Revoke: expire every key whose stay duration has ended (background job). */
  static expireOverdue(now = new Date(), db = prisma) {
    return db.digitalKey.updateMany({ where: { status: 'ACTIVE', expiryDate: { lt: now } }, data: { status: 'EXPIRED' } });
  }
}
