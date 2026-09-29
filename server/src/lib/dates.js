/**
 * Date helpers. Reservation dates are calendar dates (PostgreSQL DATE) in the
 * hotel's time zone; they are represented in JS as UTC-midnight Date objects.
 * IMPLEMENTATION ASSUMPTION: hotel time zone is Asia/Kolkata (single property).
 */
export const HOTEL_TIME_ZONE = 'Asia/Kolkata';
const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' -> Date at UTC midnight */
export function parseDateOnly(value) {
  if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!m) throw new Error(`Invalid date "${value}"`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

export function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date at the hotel. */
export function hotelToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: HOTEL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return parseDateOnly(parts);
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function nightsBetween(checkIn, checkOut) {
  return Math.round((parseDateOnly(checkOut) - parseDateOnly(checkIn)) / DAY_MS);
}

/** A hotel-local wall-clock time on a calendar date, as an absolute instant. e.g. atHotelTime(d, '14:00') */
export function atHotelTime(date, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  // Asia/Kolkata is UTC+05:30 with no daylight saving
  return new Date(parseDateOnly(date).getTime() + (h * 60 + m - 330) * 60 * 1000);
}

export function hoursUntil(instant, now = new Date()) {
  return (instant.getTime() - now.getTime()) / 3_600_000;
}
