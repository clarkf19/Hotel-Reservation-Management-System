/**
 * Background jobs (run in-process while the API is up):
 *  - OTA synchronisation every otaSyncIntervalSeconds (<= 60 s)   Channel.Sync.Inventory / .Status (SD-3)
 *  - expire digital keys whose stay has ended                     Room.Access.Revoke
 *  - release expired payment holds                                 Fig. 2 payment timeout / robustness
 *  - refresh exchange rates every 24 h                             SI-5.1
 *  - check-in reminders for tomorrow's arrivals                    CI-3
 *  - keep room statuses current (RESERVED for today's arrivals)    Reservation.Status.Update
 */
import { prisma } from '../lib/prisma.js';
import { getSettings } from '../lib/settings.js';
import { addDays, formatDateOnly, hotelToday } from '../lib/dates.js';
import { runWithTrace } from '../lib/trace.js';
import { DigitalKey } from '../domain/DigitalKey.js';
import { Room } from '../domain/Room.js';
import { releaseExpiredHolds } from '../modules/reservations/holds.js';
import { syncReservations } from '../modules/channels/channelSync.service.js';
import { currencyExchangeRateService } from '../integrations/CurrencyExchangeRateService.js';
import { notificationService } from '../integrations/NotificationService.js';

const timers = [];

async function safe(name, fn) {
  try {
    await runWithTrace(fn);
  } catch (err) {
    console.error(`[job:${name}]`, err.message);
  }
}

async function sendCheckInReminders() {
  const tomorrow = addDays(hotelToday(), 1);
  const settings = await getSettings();
  const due = await prisma.reservation.findMany({ where: { status: 'CONFIRMED', checkInDate: tomorrow }, include: { guest: true, room: true } });
  for (const r of due) {
    const already = await prisma.notification.findFirst({ where: { userId: r.guest.userId, type: 'CHECKIN_REMINDER', body: { contains: `HRMS-${String(r.reservationNumber).padStart(6, '0')}` } } });
    if (already) continue;
    await notificationService.notifyUser(r.guest.userId, {
      type: 'CHECKIN_REMINDER', channels: ['EMAIL', 'SMS', 'IN_APP'],
      subject: 'See you tomorrow!',
      body: `Reminder for HRMS-${String(r.reservationNumber).padStart(6, '0')}: check-in on ${formatDateOnly(r.checkInDate)} from ${settings.checkInTime}, room ${r.room.roomNumber}. Complete online check-in in the app to skip the front desk.`,
    });
  }
}

async function refreshRoomStatuses() {
  const rooms = await prisma.room.findMany({ where: { status: { in: ['AVAILABLE', 'RESERVED', 'OCCUPIED'] } }, select: { id: true } });
  for (const r of rooms) await Room.updateStatus(r.id);
}

export async function startScheduler() {
  const settings = await getSettings();
  const every = (ms, name, fn) => timers.push(setInterval(() => safe(name, fn), ms));
  every(Math.min(60, settings.otaSyncIntervalSeconds) * 1000, 'ota-sync', () => syncReservations());
  every(60_000, 'maintenance', async () => {
    await DigitalKey.expireOverdue();
    await releaseExpiredHolds();
  });
  every(10 * 60_000, 'room-status', refreshRoomStatuses);
  every(60 * 60_000, 'reminders', sendCheckInReminders);
  every(24 * 60 * 60_000, 'exchange-rates', () => currencyExchangeRateService.refreshAll());
  // first run shortly after start-up
  setTimeout(() => safe('startup', async () => {
    await currencyExchangeRateService.refreshAll();
    await refreshRoomStatuses();
    await sendCheckInReminders();
    await DigitalKey.expireOverdue();
  }), 2000);
  console.log(`[jobs] scheduler started (OTA sync every ${Math.min(60, settings.otaSyncIntervalSeconds)} s)`);
}

export function stopScheduler() {
  timers.forEach(clearInterval);
}
