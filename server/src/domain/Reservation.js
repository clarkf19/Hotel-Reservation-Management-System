/**
 * UML class: Reservation
 *   reservationId, reservationNumber, guestId, roomId, checkInDate, checkOutDate,
 *   numGuests, status, totalAmount, createdAt, updatedAt
 *   + checkAvailability(): Boolean
 *   + calculateAmount(): double
 *   + confirm(): void
 *   + modify(): void
 *   + cancel(): void
 * Relationships: Guest 1 --makes--> 0..* Reservation ; Room 1 --booked for--> 0..* Reservation ;
 *   Reservation 1 --has--> 0..* Payment, 0..1 Invoice ; --issues--> 0..1 DigitalKey ;
 *   --synchronized through--> 0..* ChannelSync ; ..uses..> NotificationService
 * SRS: 4.1 (Reservation.*), BR-1, BR-3, BR-5, BR-7, BR-8 ; Figure 2 ; data dictionary "reservation"
 */
import { prisma } from '../lib/prisma.js';
import { conflict, unprocessable } from '../lib/errors.js';
import { atHotelTime, hoursUntil, nightsBetween } from '../lib/dates.js';
import { round2, toNumber } from '../lib/money.js';
import { Room } from './Room.js';

/**
 * Reservation lifecycle. States follow the SRS data dictionary; the events
 * follow SRS Figure 2 (see docs/ASSUMPTIONS.md, decision D-1, for the mapping):
 *   Fig.2 INQUIRY              -> room search (not persisted)
 *   Fig.2 PENDING RESERVATION  -> DRAFT (details captured, not yet paid)
 *   Fig.2 PENDING PAYMENT      -> PENDING_PAYMENT (room locked for paymentHoldMinutes)
 *   Fig.2 CONFIRMED            -> CONFIRMED
 *   Fig.2 CHECKED-IN           -> CHECKED_IN
 *   Fig.2 COMPLETED            -> CHECKED_OUT
 *   Fig.2 CANCELLED            -> CANCELLED
 */
export const RESERVATION_TRANSITIONS = {
  DRAFT: ['PENDING_PAYMENT', 'CANCELLED'],
  PENDING_PAYMENT: ['CONFIRMED', 'DRAFT', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'CONFIRMED'],
  CHECKED_IN: ['CHECKED_OUT'],
  CHECKED_OUT: [],
  CANCELLED: [],
};

export const ACTIVE_STATUSES = ['DRAFT', 'PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN'];

export class Reservation {
  static canTransition(from, to) {
    return (RESERVATION_TRANSITIONS[from] || []).includes(to);
  }

  static assertTransition(from, to) {
    if (!Reservation.canTransition(from, to)) {
      throw unprocessable('INVALID_STATUS_TRANSITION', `A reservation cannot move from ${from.replace('_', ' ')} to ${to.replace('_', ' ')}.`);
    }
  }

  /** checkAvailability(): delegates to Room.isAvailable for the requested room and dates. */
  static checkAvailability(roomId, checkIn, checkOut, opts) {
    return Room.isAvailable(roomId, checkIn, checkOut, opts);
  }

  /**
   * calculateAmount(): nights x nightly rate, minus loyalty discount, plus tax.
   * IMPLEMENTATION ASSUMPTION: flat nightly rate (Room.baseRate) and a single tax rate.
   */
  static calculateAmount({ nightlyRate, checkIn, checkOut, taxRatePercent, discount = 0 }) {
    const nights = nightsBetween(checkIn, checkOut);
    const roomCharges = round2(nights * toNumber(nightlyRate));
    const disc = round2(Math.min(discount, roomCharges));
    const taxable = round2(roomCharges - disc);
    const tax = round2((taxable * taxRatePercent) / 100);
    return { nights, nightlyRate: toNumber(nightlyRate), roomCharges, discount: disc, tax, total: round2(taxable + tax) };
  }

  /** confirm(): assign the sequential reservation number and move to CONFIRMED (only after payment is verified - BR-5). */
  static async confirm(reservation, db = prisma) {
    Reservation.assertTransition(reservation.status, 'CONFIRMED');
    const [{ nextval }] = await db.$queryRaw`SELECT nextval('reservation_number_seq')::int AS nextval`;
    return db.reservation.update({
      where: { id: reservation.id },
      data: { status: 'CONFIRMED', reservationNumber: nextval, confirmedAt: new Date(), holdExpiresAt: null },
    });
  }

  /** modify(): validate that a reservation may still be changed (Reservation.Modify). */
  static assertModifiable(reservation, today) {
    if (reservation.status !== 'CONFIRMED') {
      throw unprocessable('NOT_MODIFIABLE', 'Only confirmed reservations that have not started can be modified.');
    }
    if (reservation.checkInDate <= today) {
      throw unprocessable('NOT_MODIFIABLE', 'This stay has already started or starts today; please contact the front desk.');
    }
  }

  /**
   * cancel(): BR-8 cancellation policy. Free up to `freeHours` before check-in;
   * later cancellations incur a one-night charge (one night's rate + tax).
   */
  static cancellationTerms(reservation, settings, now = new Date()) {
    if (!['DRAFT', 'PENDING_PAYMENT', 'CONFIRMED'].includes(reservation.status)) {
      throw unprocessable('NOT_CANCELLABLE', `A ${reservation.status.replace('_', ' ').toLowerCase()} reservation cannot be cancelled.`);
    }
    const checkInAt = atHotelTime(reservation.checkInDate, settings.checkInTime);
    const hoursBefore = hoursUntil(checkInAt, now);
    const paid = reservation.status === 'CONFIRMED';
    const nights = nightsBetween(reservation.checkInDate, reservation.checkOutDate);
    const nightly = round2((toNumber(reservation.totalAmount)) / Math.max(1, nights));
    const free = hoursBefore >= settings.freeCancellationHours;
    const fee = !paid || free ? 0 : round2(Math.min(nightly, toNumber(reservation.totalAmount)));
    return {
      hoursBeforeCheckIn: Math.round(hoursBefore * 10) / 10,
      freeCancellation: free,
      cancellationFee: fee,
      refundAmount: paid ? round2(toNumber(reservation.totalAmount) - fee) : 0,
      policy: `Free cancellation up to ${settings.freeCancellationHours} hours before check-in; later cancellations are charged one night.`,
    };
  }

  static assertNoOverlapError(err) {
    // PostgreSQL exclusion-constraint violation (SQLSTATE 23P01) raised by reservations_no_double_booking
    const text = `${err?.message || ''} ${err?.meta?.message || ''} ${err?.meta?.code || ''}`;
    if (text.includes('reservations_no_double_booking') || text.includes('23P01')) {
      throw conflict('ROOM_UNAVAILABLE', 'That room was just booked for overlapping dates. Please choose another room.');
    }
    throw err;
  }
}
