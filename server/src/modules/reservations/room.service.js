/**
 * DFD Level 2 process 2.1 "Check Room Availability" (reads D2 Room Inventory)
 * SRS: Reservation.Search, Reservation.Search.Filter, Reservation.Allocate.Smart, PE-3, SE-2
 * UML: Guest.searchRooms(), Guest.viewRoomDetails(), Room.isAvailable()
 * Activity: "Search Available Rooms" -> "Check Room Availability" -> <Rooms Available?>
 *           -> No: "Suggest Alternative Dates / Categories" | Yes: "Perform Smart Room Allocation"
 */
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { addDays, formatDateOnly, hotelToday, nightsBetween, parseDateOnly } from '../../lib/dates.js';
import { toNumber } from '../../lib/money.js';
import { trace } from '../../lib/trace.js';
import { getSettings } from '../../lib/settings.js';
import { Room } from '../../domain/Room.js';
import { releaseExpiredHolds } from './holds.js';

const MAX_NIGHTS = 30;

export function validateStayDates(checkInStr, checkOutStr, { allowPast = false } = {}) {
  const checkIn = parseDateOnly(checkInStr);
  const checkOut = parseDateOnly(checkOutStr);
  if (checkOut <= checkIn) throw badRequest('Check-out must be after check-in.');
  if (!allowPast && checkIn < hotelToday()) throw badRequest('Check-in date cannot be in the past.');
  if (nightsBetween(checkIn, checkOut) > MAX_NIGHTS) throw badRequest(`Stays are limited to ${MAX_NIGHTS} nights online. Contact the hotel for longer stays.`);
  return { checkIn, checkOut, nights: nightsBetween(checkIn, checkOut) };
}

/**
 * Smart room allocation (Reservation.Allocate.Smart): rank candidate rooms against the
 * guest's stated preferences, occupancy and accessibility requirement.
 * The documents do not define the ranking; the weights below are an
 * IMPLEMENTATION ASSUMPTION and every score is returned with its reasons so the
 * recommendation is explainable.
 */
export function scoreRoom(room, { guests, accessibleRequired, preferences = {}, maxRate }) {
  let score = 0;
  const reasons = [];
  const spare = room.capacity - guests;
  if (spare === 0) { score += 30; reasons.push('Exact fit for your party size'); }
  else if (spare === 1) { score += 22; reasons.push('Comfortable space for your party'); }
  else { score += Math.max(0, 14 - spare * 3); }

  if (accessibleRequired) {
    if (room.accessible) { score += 30; reasons.push('Accessible room, as requested'); }
  } else if (room.accessible) {
    score -= 8; // keep accessible rooms free for guests who need them
  }

  const p = preferences || {};
  if (p.floor === 'HIGH' && room.floor >= 4) { score += 12; reasons.push(`High floor (${room.floor})`); }
  if (p.floor === 'LOW' && room.floor <= 2) { score += 12; reasons.push(`Low floor (${room.floor})`); }
  if (p.view && room.view && room.view.toLowerCase() === String(p.view).toLowerCase()) { score += 15; reasons.push(`${room.view} view you prefer`); }
  if (p.bedType && room.roomType?.bedType && room.roomType.bedType.toLowerCase().includes(String(p.bedType).toLowerCase())) { score += 8; reasons.push(`${room.roomType.bedType} bed`); }
  if (p.quiet && room.features?.some((f) => /quiet/i.test(f))) { score += 8; reasons.push('Quiet zone'); }
  if (p.nearElevator && room.features?.some((f) => /elevator/i.test(f))) { score += 5; reasons.push('Near the elevator'); }

  if (maxRate > 0) score += Math.round((1 - toNumber(room.baseRate) / maxRate) * 12);
  return { score: Math.max(0, Math.min(100, Math.round(score + 20))), reasons };
}

function roomView(room) {
  return {
    id: room.id,
    roomNumber: room.roomNumber,
    floor: room.floor,
    capacity: room.capacity,
    status: room.status,
    baseRate: toNumber(room.baseRate),
    accessible: room.accessible,
    view: room.view,
    features: room.features,
    roomType: room.roomType && {
      id: room.roomType.id,
      typeName: room.roomType.typeName,
      category: room.roomType.category,
      description: room.roomType.description,
      maxOccupancy: room.roomType.maxOccupancy,
      sizeSqm: room.roomType.sizeSqm,
      bedType: room.roomType.bedType,
      amenities: room.roomType.amenities,
      imageUrl: room.roomType.imageUrl,
      baseRate: toNumber(room.roomType.baseRate),
    },
  };
}

async function findAvailable({ checkIn, checkOut, guests, category, minPrice, maxPrice, accessible }) {
  return prisma.room.findMany({
    where: {
      ...Room.availabilityFilter(checkIn, checkOut),
      capacity: { gte: guests },
      accessible: accessible ? true : undefined,
      baseRate: { gte: minPrice ?? undefined, lte: maxPrice ?? undefined },
      roomType: category ? { category } : undefined,
    },
    include: { roomType: true },
    orderBy: [{ baseRate: 'asc' }, { roomNumber: 'asc' }],
  });
}

/** Guest.searchRooms() */
export async function searchRooms(query, guestPk) {
  const { checkIn, checkOut, nights } = validateStayDates(query.checkIn, query.checkOut);
  await releaseExpiredHolds();
  const settings = await getSettings();

  trace('Guest', 'HRMS', 'searchRooms()', { ref: 'SD-1', activity: 'Search Available Rooms', dfd: '2.1 Check Room Availability' });
  const profile = guestPk ? await prisma.guestProfile.findUnique({ where: { guestId: guestPk } }) : null;
  const accessibleRequired = Boolean(query.accessible || profile?.accessibilityNeeds);

  trace('HRMS', 'Room', 'isAvailable()', { ref: 'SD-1', activity: 'Check Room Availability' });
  const rooms = await findAvailable({ ...query, checkIn, checkOut });
  trace('Room', 'HRMS', `Available rooms (${rooms.length})`, { ref: 'SD-1', kind: 'return' });

  let alternatives = null;
  if (rooms.length === 0) {
    trace('HRMS', 'HRMS', 'Rooms Available? — No', { ref: 'Activity', kind: 'alt', activity: 'Suggest Alternative Dates / Categories', branch: 'failure' });
    alternatives = await suggestAlternatives({ ...query, checkIn, checkOut, nights });
  } else {
    trace('HRMS', 'HRMS', 'Rooms Available? — Yes → Perform Smart Room Allocation', { ref: 'Activity', kind: 'self', activity: 'Perform Smart Room Allocation' });
  }

  const maxRate = Math.max(1, ...rooms.map((r) => toNumber(r.baseRate)));
  const ranked = rooms
    .map((r) => ({ ...roomView(r), recommendation: scoreRoom(r, { guests: query.guests, accessibleRequired, preferences: profile?.preferences, maxRate }) }))
    .sort((a, b) => b.recommendation.score - a.recommendation.score || a.baseRate - b.baseRate);

  const taxRate = settings.taxRatePercent;
  for (const r of ranked) {
    const roomCharges = r.baseRate * nights;
    r.pricing = { nights, roomCharges, tax: Math.round(roomCharges * taxRate) / 100, total: Math.round(roomCharges * (100 + taxRate)) / 100 };
  }

  trace('HRMS', 'Guest', 'Display available rooms and rates', { ref: 'SD-1', kind: 'return' });
  return {
    checkIn: formatDateOnly(checkIn),
    checkOut: formatDateOnly(checkOut),
    nights,
    guests: query.guests,
    usedPreferences: Boolean(profile),
    recommendedRoomId: ranked[0]?.id ?? null,
    rooms: ranked,
    alternatives,
  };
}

/** Activity node "Suggest Alternative Dates / Categories" */
async function suggestAlternatives({ checkIn, nights, guests, category }) {
  const dates = [];
  for (const shift of [1, -1, 2, -2, 3, 7]) {
    const ci = addDays(checkIn, shift);
    if (ci < hotelToday()) continue;
    const co = addDays(ci, nights);
    const count = (await findAvailable({ checkIn: ci, checkOut: co, guests })).length;
    if (count) dates.push({ checkIn: formatDateOnly(ci), checkOut: formatDateOnly(co), availableRooms: count });
    if (dates.length >= 3) break;
  }
  const co = addDays(checkIn, nights);
  const all = await findAvailable({ checkIn, checkOut: co, guests });
  const byCategory = {};
  for (const r of all) byCategory[r.roomType.category] = (byCategory[r.roomType.category] || 0) + 1;
  const categories = Object.entries(byCategory).filter(([c]) => c !== category).map(([c, n]) => ({ category: c, availableRooms: n }));
  return { dates, categories };
}

/** Guest.viewRoomDetails() */
export async function getRoom(id) {
  const room = await prisma.room.findUnique({ where: { id }, include: { roomType: true } });
  if (!room) throw notFound('Room');
  return roomView(room);
}

/** Public catalogue of room types and rates (SE-2: browsing without login). */
export async function listRoomTypes() {
  const types = await prisma.roomType.findMany({ include: { _count: { select: { rooms: true } } }, orderBy: { baseRate: 'asc' } });
  return types.map((t) => ({ ...t, baseRate: toNumber(t.baseRate), roomCount: t._count.rooms, _count: undefined }));
}

export { roomView };
