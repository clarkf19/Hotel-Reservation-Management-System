/**
 * Room inventory and rate management.
 * UML: HotelManager.manageRates(), HotelManager.manageInventory(), Room.updateStatus()
 * Use cases: Manage Channels & Rates (Hotel Manager) ; SRS 4.3.2 "Hotel Manager updates a room rate ->
 *   System pushes the new rate to every connected OTA" (Channel.Sync.Rate, BR-10)
 * Activity (Hotel Manager lane): Manage Room Rates -> Manage Room Inventory ; Receptionist room board
 * DFD: D2 Room Inventory
 */
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound, unprocessable } from '../../lib/errors.js';
import { formatDateOnly, hotelToday } from '../../lib/dates.js';
import { toNumber } from '../../lib/money.js';
import { trace, traceScenario } from '../../lib/trace.js';
import { AuditLog } from '../../domain/AuditLog.js';
import { Room } from '../../domain/Room.js';
import * as channelSync from '../channels/channelSync.service.js';

/** Room board: every room with its current / next reservation. */
export async function roomBoard() {
  const today = hotelToday();
  const rooms = await prisma.room.findMany({
    include: {
      roomType: true,
      reservations: {
        where: { status: { in: ['CONFIRMED', 'CHECKED_IN'] }, checkOutDate: { gte: today } },
        include: { guest: { include: { user: { select: { name: true } } } } },
        orderBy: { checkInDate: 'asc' },
        take: 2,
      },
    },
    orderBy: [{ floor: 'asc' }, { roomNumber: 'asc' }],
  });
  return rooms.map((r) => {
    const current = r.reservations.find((x) => x.status === 'CHECKED_IN') ?? r.reservations.find((x) => x.checkInDate <= today) ?? null;
    const next = r.reservations.find((x) => x !== current && x.checkInDate > today) ?? null;
    const brief = (x) => x && { id: x.id, reservationNumber: x.reservationNumber, guest: x.guest.user.name, checkInDate: formatDateOnly(x.checkInDate), checkOutDate: formatDateOnly(x.checkOutDate), status: x.status, numGuests: x.numGuests };
    return {
      id: r.id, roomNumber: r.roomNumber, floor: r.floor, capacity: r.capacity, status: r.status, baseRate: toNumber(r.baseRate), accessible: r.accessible, view: r.view, features: r.features,
      roomType: { id: r.roomType.id, typeName: r.roomType.typeName, category: r.roomType.category },
      current: brief(current), next: brief(next),
    };
  });
}

/** Room.updateStatus() from the front desk / manager (e.g. CLEANING -> AVAILABLE, MAINTENANCE). */
export async function setRoomStatus(user, roomId, status) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw notFound('Room');
  const inHouse = await prisma.reservation.count({ where: { roomId, status: 'CHECKED_IN' } });
  if (inHouse && status !== 'OCCUPIED') throw unprocessable('ROOM_OCCUPIED', 'A guest is checked in to this room. Check them out first.');
  if (!inHouse && status === 'OCCUPIED') throw unprocessable('NOT_OCCUPIED', 'Rooms become occupied only through check-in.');
  let updated = await Room.updateStatus(roomId, { status });
  if (status === 'AVAILABLE') updated = await Room.updateStatus(roomId); // may become RESERVED if an arrival is due today
  await AuditLog.record({ action: 'ROOM_STATUS_CHANGED', entityType: 'Room', entityId: roomId, performedBy: user.id, details: { roomNumber: room.roomNumber, from: room.status, to: updated.status } });
  if (['MAINTENANCE', 'OUT_OF_SERVICE'].includes(status) || ['MAINTENANCE', 'OUT_OF_SERVICE'].includes(room.status)) {
    channelSync.pushAvailabilityToAll({ reason: `Room ${room.roomNumber} is now ${status}` }).catch(() => {});
  }
  return { ...updated, baseRate: toNumber(updated.baseRate) };
}

export async function listRoomTypes() {
  const types = await prisma.roomType.findMany({ include: { _count: { select: { rooms: true } } }, orderBy: { baseRate: 'asc' } });
  return types.map((t) => ({ ...t, baseRate: toNumber(t.baseRate), roomCount: t._count.rooms, _count: undefined }));
}

/** HotelManager.manageRates(): change a room type's rate, apply it to its rooms and push it to every OTA. */
export async function updateRate(user, roomTypeId, { baseRate }) {
  traceScenario('Manage Channels & Rates (SRS 4.3.2)');
  if (!(baseRate > 0)) throw badRequest('Rate must be greater than zero.');
  const type = await prisma.roomType.findUnique({ where: { id: roomTypeId } });
  if (!type) throw notFound('Room type');
  trace('HotelManager', 'HRMS', 'manageRates()', { ref: 'Class diagram', activity: 'Manage Room Rates' });
  await prisma.$transaction([
    prisma.roomType.update({ where: { id: roomTypeId }, data: { baseRate } }),
    prisma.room.updateMany({ where: { roomTypeId }, data: { baseRate } }),
  ]);
  await AuditLog.record({ action: 'RATE_CHANGED', entityType: 'RoomType', entityId: roomTypeId, performedBy: user.id, details: { typeName: type.typeName, from: toNumber(type.baseRate), to: baseRate } });
  trace('HRMS', 'OTAChannel', 'updateRates()', { ref: 'Class diagram / Channel.Sync.Rate' });
  const pushed = await channelSync.pushAvailabilityToAll({ reason: `Rate for ${type.typeName} changed to ₹${baseRate}`, syncType: 'PUSH_RATES' });
  return { roomTypeId, baseRate, pushedTo: pushed };
}

/** HotelManager.manageInventory(): add / edit rooms. */
export async function saveRoom(user, id, data) {
  if (data.roomTypeId) {
    const t = await prisma.roomType.findUnique({ where: { id: data.roomTypeId } });
    if (!t) throw badRequest('Unknown room type.');
    if (!id && data.baseRate == null) data.baseRate = toNumber(t.baseRate);
  }
  const saved = id ? await prisma.room.update({ where: { id }, data }) : await prisma.room.create({ data: { status: 'AVAILABLE', features: [], ...data } });
  await AuditLog.record({ action: id ? 'ROOM_UPDATED' : 'ROOM_ADDED', entityType: 'Room', entityId: saved.id, performedBy: user.id, details: data });
  channelSync.pushAvailabilityToAll({ reason: `Inventory changed (room ${saved.roomNumber})` }).catch(() => {});
  return { ...saved, baseRate: toNumber(saved.baseRate) };
}

export async function saveRoomType(user, id, data) {
  const saved = id ? await prisma.roomType.update({ where: { id }, data }) : await prisma.roomType.create({ data });
  await AuditLog.record({ action: id ? 'ROOM_TYPE_UPDATED' : 'ROOM_TYPE_ADDED', entityType: 'RoomType', entityId: saved.id, performedBy: user.id, details: data });
  return { ...saved, baseRate: toNumber(saved.baseRate) };
}
