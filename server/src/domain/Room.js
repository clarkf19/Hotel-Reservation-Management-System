/**
 * UML class: Room
 *   roomId, roomNumber, roomTypeId, floor, capacity, status, baseRate
 *   + isAvailable(): Boolean
 *   + updateStatus(): void
 * Relationships: RoomType 1 --contain--> 0..* Room ; Room 1 --booked for--> 0..* Reservation
 * SRS data dictionary "room"; DFD store D2 Room Inventory
 */
import { prisma } from '../lib/prisma.js';
import { hotelToday } from '../lib/dates.js';

/** Reservation states that occupy inventory (mirrors the DB exclusion constraint). */
export const INVENTORY_HOLDING_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN'];
/** Physical states in which a room cannot be sold. */
export const UNSELLABLE_ROOM_STATUSES = ['MAINTENANCE', 'OUT_OF_SERVICE'];

export class Room {
  /**
   * isAvailable(): true if no active reservation overlaps [checkIn, checkOut)
   * and the room is not out of service.
   */
  static async isAvailable(roomId, checkIn, checkOut, { excludeReservationId, db = prisma } = {}) {
    const room = await db.room.findUnique({ where: { id: roomId }, select: { status: true } });
    if (!room || UNSELLABLE_ROOM_STATUSES.includes(room.status)) return false;
    const clash = await db.reservation.findFirst({
      where: {
        roomId,
        status: { in: INVENTORY_HOLDING_STATUSES },
        id: excludeReservationId ? { not: excludeReservationId } : undefined,
        checkInDate: { lt: checkOut },
        checkOutDate: { gt: checkIn },
      },
      select: { id: true },
    });
    return !clash;
  }

  /** Where-clause fragment: rooms with no overlapping active reservation. */
  static availabilityFilter(checkIn, checkOut) {
    return {
      status: { notIn: UNSELLABLE_ROOM_STATUSES },
      reservations: {
        none: {
          status: { in: INVENTORY_HOLDING_STATUSES },
          checkInDate: { lt: checkOut },
          checkOutDate: { gt: checkIn },
        },
      },
    };
  }

  /**
   * updateStatus(): recompute the room's operational status from its reservations.
   *  - a guest is checked in             -> OCCUPIED
   *  - a confirmed arrival is due today   -> RESERVED
   *  - otherwise OCCUPIED/RESERVED revert -> AVAILABLE
   * CLEANING / MAINTENANCE / OUT_OF_SERVICE are set by staff and left untouched,
   * except that an explicit `status` argument always wins (staff room-board action).
   */
  static async updateStatus(roomId, { status, db = prisma } = {}) {
    if (status) return db.room.update({ where: { id: roomId }, data: { status } });
    const room = await db.room.findUnique({ where: { id: roomId } });
    if (!room) return null;
    const today = hotelToday();
    const inHouse = await db.reservation.count({ where: { roomId, status: 'CHECKED_IN' } });
    const arrivingToday = await db.reservation.count({ where: { roomId, status: 'CONFIRMED', checkInDate: today } });
    let next = room.status;
    if (inHouse) next = 'OCCUPIED';
    else if (['CLEANING', 'MAINTENANCE', 'OUT_OF_SERVICE'].includes(room.status)) next = room.status;
    else if (arrivingToday) next = 'RESERVED';
    else next = 'AVAILABLE';
    if (next === room.status) return room;
    return db.room.update({ where: { id: roomId }, data: { status: next } });
  }
}
