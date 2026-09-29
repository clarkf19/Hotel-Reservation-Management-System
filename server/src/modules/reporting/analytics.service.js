/**
 * DFD Level 1 process 6.0 "Reporting & Administration" (D7 Reports & Analytics)
 * SRS 4.7 Analytics and Operational Dashboard: Dashboard.Occupancy, Dashboard.Revenue (segmented by
 * booking channel), Dashboard.Cancellations, Dashboard.Export ; 4.7.2 booking-trend widgets
 * UML: HotelManager.viewDashboard(), HotelManager.viewReports(), FinanceStaff.viewFinancialReports(), Report.generate()
 * Activity (Hotel Manager lane): View Operational Dashboard -> View Occupancy -> View Booking Trends ->
 *   View Revenue Summary -> View Cancellation Statistics -> Generate Report -> Export Report (PDF / CSV)
 * Every figure is computed from live database records.
 */
import { prisma } from '../../lib/prisma.js';
import { badRequest } from '../../lib/errors.js';
import { addDays, formatDateOnly, hotelToday, parseDateOnly } from '../../lib/dates.js';
import { round2, toNumber } from '../../lib/money.js';
import { getSettings } from '../../lib/settings.js';
import { AuditLog } from '../../domain/AuditLog.js';
import { Report } from '../../domain/Report.js';
import { UNSELLABLE_ROOM_STATUSES } from '../../domain/Room.js';

const SOLD = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'];
const DAY = 86_400_000;

function range(from, to) {
  const f = parseDateOnly(from);
  const t = parseDateOnly(to);
  if (t < f) throw badRequest('"to" must be on or after "from".');
  if ((t - f) / DAY > 366) throw badRequest('Reports are limited to one year.');
  return { f, t, days: Math.round((t - f) / DAY) + 1 };
}

function channelLabel(r) {
  return r.source === 'OTA' ? r.otaChannel?.channelName ?? 'OTA' : { DIRECT: 'Direct (web/app)', RECEPTIONIST: 'Front desk', AI_CONCIERGE: 'AI Concierge' }[r.source] ?? r.source;
}

async function roomInventory() {
  const rooms = await prisma.room.findMany({ include: { roomType: true } });
  return { rooms, sellable: rooms.filter((r) => !UNSELLABLE_ROOM_STATUSES.includes(r.status)).length || rooms.length };
}

/** Room-nights sold per day in [f, t], overall and per category. */
async function occupancySeries(f, t) {
  const { rooms, sellable } = await roomInventory();
  const res = await prisma.reservation.findMany({
    where: { status: { in: SOLD }, checkInDate: { lte: t }, checkOutDate: { gt: f } },
    select: { checkInDate: true, checkOutDate: true, totalAmount: true, room: { select: { roomType: { select: { category: true, typeName: true } } } } },
  });
  const byCategoryCount = {};
  for (const r of rooms) byCategoryCount[r.roomType.typeName] = (byCategoryCount[r.roomType.typeName] || 0) + 1;
  const series = [];
  for (let d = f; d <= t; d = addDays(d, 1)) {
    const staying = res.filter((r) => r.checkInDate <= d && r.checkOutDate > d);
    series.push({ date: formatDateOnly(d), occupied: staying.length, occupancy: round2((staying.length / sellable) * 100) });
  }
  return { series, res, sellable, byCategoryCount };
}

/** HotelManager.viewDashboard() — the operational dashboard. */
export async function dashboard() {
  const settings = await getSettings();
  const today = hotelToday();
  const { rooms, sellable } = await roomInventory();

  const inHouse = await prisma.reservation.findMany({ where: { status: 'CHECKED_IN' }, include: { room: { include: { roomType: true } } } });
  const staysToday = await prisma.reservation.findMany({ where: { status: { in: ['CONFIRMED', 'CHECKED_IN'] }, checkInDate: { lte: today }, checkOutDate: { gt: today } }, include: { room: { include: { roomType: true } } } });
  const [arrivals, departures, arrivalsDone, departuresDone] = await Promise.all([
    prisma.reservation.count({ where: { checkInDate: today, status: { in: ['CONFIRMED', 'CHECKED_IN'] } } }),
    prisma.reservation.count({ where: { checkOutDate: today, status: { in: ['CHECKED_IN', 'CHECKED_OUT'] } } }),
    prisma.reservation.count({ where: { checkInDate: today, status: 'CHECKED_IN' } }),
    prisma.reservation.count({ where: { checkOutDate: today, status: 'CHECKED_OUT' } }),
  ]);

  // Occupancy by category today (Dashboard.Occupancy)
  const byCategory = {};
  for (const r of rooms) {
    const k = r.roomType.typeName;
    byCategory[k] ??= { category: k, rooms: 0, occupied: 0 };
    byCategory[k].rooms++;
  }
  for (const s of staysToday) byCategory[s.room.roomType.typeName].occupied++;
  const occupancyByCategory = Object.values(byCategory).map((c) => ({ ...c, occupancy: round2((c.occupied / c.rooms) * 100) }));

  // 30 days back + 14 days forward (on-the-books)
  const { series } = await occupancySeries(addDays(today, -29), addDays(today, 14));

  // Revenue (cash basis: captured payments net of refunds, by payment date)
  const payments = await prisma.payment.findMany({
    where: { status: { in: ['CAPTURED', 'REFUNDED'] }, paidAt: { gte: addDays(today, -29) } },
    include: { reservation: { select: { source: true, otaChannel: { select: { channelName: true } } } } },
  });
  const revenueByDay = new Map();
  const byChannel = {};
  for (let d = addDays(today, -29); d <= today; d = addDays(d, 1)) revenueByDay.set(formatDateOnly(d), 0);
  for (const p of payments) {
    const net = toNumber(p.amount) - toNumber(p.refundedAmount);
    const k = formatDateOnly(new Date(p.paidAt.getTime() + 330 * 60_000));
    if (revenueByDay.has(k)) revenueByDay.set(k, round2(revenueByDay.get(k) + net));
    const ch = channelLabel(p.reservation);
    byChannel[ch] = round2((byChannel[ch] || 0) + net);
  }
  const revenueTrend = [...revenueByDay.entries()].map(([date, revenue]) => ({ date, revenue }));
  const revenue30 = round2(revenueTrend.reduce((s, x) => s + x.revenue, 0));

  // ADR / RevPAR over the last 30 days (room revenue of stays)
  const past = series.filter((s) => s.date <= formatDateOnly(today));
  const roomNights = past.reduce((s, x) => s + x.occupied, 0);
  const adr = roomNights ? round2(revenue30 / roomNights) : 0;
  const revpar = round2(revenue30 / (sellable * past.length));

  // Booking trends (created per day) and cancellations (Dashboard.Cancellations)
  const since = addDays(today, -29);
  const created = await prisma.reservation.findMany({ where: { createdAt: { gte: since }, status: { not: 'DRAFT' } }, select: { createdAt: true, status: true, source: true } });
  const bookingTrend = [];
  for (let d = since; d <= today; d = addDays(d, 1)) bookingTrend.push({ date: formatDateOnly(d), bookings: 0, cancellations: 0 });
  const idx = new Map(bookingTrend.map((b, i) => [b.date, i]));
  for (const r of created) {
    const i = idx.get(formatDateOnly(new Date(r.createdAt.getTime() + 330 * 60_000)));
    if (i == null) continue;
    bookingTrend[i].bookings++;
    if (r.status === 'CANCELLED') bookingTrend[i].cancellations++;
  }
  const cancelled = created.filter((r) => r.status === 'CANCELLED').length;

  const statusCounts = {};
  for (const r of rooms) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;

  const [openConflicts, openRequests, escalations] = await Promise.all([
    prisma.channelSync.count({ where: { syncStatus: 'CONFLICT' } }),
    prisma.serviceRequest.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.serviceRequest.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, isEscalation: true } }),
  ]);

  const occToday = round2((staysToday.length / sellable) * 100);
  return {
    generatedAt: new Date().toISOString(),
    hotelName: settings.hotelName,
    kpis: {
      occupancyToday: occToday, roomsOccupied: staysToday.length, sellableRooms: sellable, totalRooms: rooms.length,
      inHouseGuests: inHouse.reduce((s, r) => s + r.numGuests, 0), arrivals, arrivalsDone, departures, departuresDone,
      revenue30, adr, revpar, bookings30: created.length, cancellations30: cancelled,
      cancellationRate30: created.length ? round2((cancelled / created.length) * 100) : 0,
      openConflicts, openRequests, escalations,
    },
    occupancyByCategory,
    occupancyTrend: series,
    revenueTrend,
    revenueByChannel: Object.entries(byChannel).map(([channel, revenue]) => ({ channel, revenue })).sort((a, b) => b.revenue - a.revenue),
    bookingTrend,
    roomStatus: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
  };
}

/** Report.generate() — builds one report as { title, summary, tables }. */
export async function buildReport(type, { from, to }) {
  const { f, t, days } = range(from, to);
  if (type === 'occupancy') {
    const { series, res, sellable, byCategoryCount } = await occupancySeries(f, t);
    const cat = {};
    for (const [k, n] of Object.entries(byCategoryCount)) cat[k] = { category: k, rooms: n, roomNights: 0 };
    for (const r of res) {
      const s = r.checkInDate > f ? r.checkInDate : f;
      const e = r.checkOutDate <= addDays(t, 1) ? r.checkOutDate : addDays(t, 1);
      cat[r.room.roomType.typeName].roomNights += Math.max(0, Math.round((e - s) / DAY));
    }
    const catRows = Object.values(cat).map((c) => ({ ...c, available: c.rooms * days, occupancy: `${round2((c.roomNights / (c.rooms * days)) * 100)}%` }));
    const sold = series.reduce((s, x) => s + x.occupied, 0);
    return {
      title: 'Occupancy Report', chart: { type: 'line', key: 'occupancy', data: series },
      summary: [{ label: 'Average occupancy', value: `${round2((sold / (sellable * days)) * 100)}%` }, { label: 'Room-nights sold', value: sold }, { label: 'Sellable rooms', value: sellable }, { label: 'Days', value: days }],
      tables: [
        { title: 'Occupancy by category', columns: [{ key: 'category', label: 'Category' }, { key: 'rooms', label: 'Rooms', numeric: true }, { key: 'roomNights', label: 'Room-nights sold', numeric: true }, { key: 'available', label: 'Room-nights available', numeric: true }, { key: 'occupancy', label: 'Occupancy', numeric: true }], rows: catRows },
        { title: 'Daily occupancy', columns: [{ key: 'date', label: 'Date' }, { key: 'occupied', label: 'Rooms occupied', numeric: true }, { key: 'occupancy', label: 'Occupancy %', numeric: true }], rows: series },
      ],
    };
  }
  if (type === 'revenue') {
    const payments = await prisma.payment.findMany({
      where: { status: { in: ['CAPTURED', 'REFUNDED'] }, paidAt: { gte: new Date(f.getTime() - 330 * 60_000), lt: new Date(addDays(t, 1).getTime() - 330 * 60_000) } },
      include: { reservation: { select: { source: true, otaChannel: { select: { channelName: true, commissionPercent: true } } } } },
    });
    const byChannel = {};
    const byMethod = {};
    const byPurpose = {};
    let gross = 0;
    let refunds = 0;
    let commission = 0;
    for (const p of payments) {
      const amt = toNumber(p.amount);
      const ref = toNumber(p.refundedAmount);
      const ch = channelLabel(p.reservation);
      byChannel[ch] ??= { channel: ch, transactions: 0, gross: 0, refunds: 0, net: 0, commission: 0 };
      byChannel[ch].transactions++;
      byChannel[ch].gross = round2(byChannel[ch].gross + amt);
      byChannel[ch].refunds = round2(byChannel[ch].refunds + ref);
      byChannel[ch].net = round2(byChannel[ch].net + amt - ref);
      if (p.reservation.otaChannel) {
        const c = round2(((amt - ref) * toNumber(p.reservation.otaChannel.commissionPercent)) / 100);
        byChannel[ch].commission = round2(byChannel[ch].commission + c);
        commission += c;
      }
      const m = p.methodSummary?.startsWith('Collected by') ? 'OTA collect' : p.paymentMethod;
      byMethod[m] = round2((byMethod[m] || 0) + amt - ref);
      byPurpose[p.purpose] = round2((byPurpose[p.purpose] || 0) + amt - ref);
      gross += amt;
      refunds += ref;
    }
    const net = round2(gross - refunds);
    return {
      title: 'Revenue Report (by booking channel)', chart: { type: 'bar', key: 'net', data: Object.values(byChannel) },
      summary: [{ label: 'Gross collected', value: `INR ${round2(gross).toLocaleString('en-IN')}` }, { label: 'Refunds', value: `INR ${round2(refunds).toLocaleString('en-IN')}` }, { label: 'Net revenue', value: `INR ${net.toLocaleString('en-IN')}` }, { label: 'OTA commission (est.)', value: `INR ${round2(commission).toLocaleString('en-IN')}` }],
      tables: [
        { title: 'Revenue by booking channel', columns: [{ key: 'channel', label: 'Channel' }, { key: 'transactions', label: 'Payments', numeric: true }, { key: 'gross', label: 'Gross', numeric: true }, { key: 'refunds', label: 'Refunds', numeric: true }, { key: 'net', label: 'Net', numeric: true }, { key: 'commission', label: 'Commission', numeric: true }], rows: Object.values(byChannel).sort((a, b) => b.net - a.net) },
        { title: 'By payment method', columns: [{ key: 'method', label: 'Method' }, { key: 'net', label: 'Net', numeric: true }], rows: Object.entries(byMethod).map(([method, n]) => ({ method, net: n })) },
        { title: 'By payment purpose', columns: [{ key: 'purpose', label: 'Purpose' }, { key: 'net', label: 'Net', numeric: true }], rows: Object.entries(byPurpose).map(([purpose, n]) => ({ purpose, net: n })) },
      ],
    };
  }
  if (type === 'cancellations') {
    const rows = await prisma.reservation.findMany({
      where: { createdAt: { gte: f, lt: addDays(t, 1) }, status: { not: 'DRAFT' } },
      include: { otaChannel: { select: { channelName: true } } },
    });
    const cancelled = rows.filter((r) => r.status === 'CANCELLED');
    const byChannel = {};
    for (const r of rows) {
      const ch = channelLabel(r);
      byChannel[ch] ??= { channel: ch, bookings: 0, cancellations: 0, rate: '0%', fees: 0 };
      byChannel[ch].bookings++;
      if (r.status === 'CANCELLED') { byChannel[ch].cancellations++; byChannel[ch].fees = round2(byChannel[ch].fees + toNumber(r.cancellationFee)); }
    }
    for (const c of Object.values(byChannel)) c.rate = `${round2((c.cancellations / c.bookings) * 100)}%`;
    const byReason = {};
    for (const r of cancelled) byReason[r.cancellationReason || 'Unspecified'] = (byReason[r.cancellationReason || 'Unspecified'] || 0) + 1;
    const fees = round2(cancelled.reduce((s, r) => s + toNumber(r.cancellationFee), 0));
    return {
      title: 'Cancellation Report', chart: { type: 'bar', key: 'cancellations', data: Object.values(byChannel) },
      summary: [{ label: 'Bookings', value: rows.length }, { label: 'Cancellations', value: cancelled.length }, { label: 'Cancellation rate', value: `${rows.length ? round2((cancelled.length / rows.length) * 100) : 0}%` }, { label: 'Fees retained (BR-8)', value: `INR ${fees.toLocaleString('en-IN')}` }],
      tables: [
        { title: 'By channel', columns: [{ key: 'channel', label: 'Channel' }, { key: 'bookings', label: 'Bookings', numeric: true }, { key: 'cancellations', label: 'Cancellations', numeric: true }, { key: 'rate', label: 'Rate', numeric: true }, { key: 'fees', label: 'Fees', numeric: true }], rows: Object.values(byChannel) },
        { title: 'By reason', columns: [{ key: 'reason', label: 'Reason' }, { key: 'count', label: 'Count', numeric: true }], rows: Object.entries(byReason).map(([reason, count]) => ({ reason, count })) },
      ],
    };
  }
  if (type === 'bookings') {
    const rows = await prisma.reservation.findMany({ where: { createdAt: { gte: f, lt: addDays(t, 1) }, status: { not: 'DRAFT' } }, include: { otaChannel: { select: { channelName: true } }, room: { include: { roomType: true } } } });
    const byDay = {};
    for (let d = f; d <= t; d = addDays(d, 1)) byDay[formatDateOnly(d)] = { date: formatDateOnly(d), bookings: 0, roomNights: 0, value: 0 };
    const byType = {};
    for (const r of rows) {
      const k = formatDateOnly(new Date(r.createdAt.getTime() + 330 * 60_000));
      const n = Math.round((r.checkOutDate - r.checkInDate) / DAY);
      if (byDay[k]) { byDay[k].bookings++; byDay[k].roomNights += n; byDay[k].value = round2(byDay[k].value + toNumber(r.totalAmount)); }
      const tn = r.room.roomType.typeName;
      byType[tn] ??= { roomType: tn, bookings: 0, roomNights: 0 };
      byType[tn].bookings++;
      byType[tn].roomNights += n;
    }
    const leadTimes = rows.map((r) => Math.max(0, Math.round((r.checkInDate - r.createdAt) / DAY)));
    return {
      title: 'Booking Trends Report', chart: { type: 'line', key: 'bookings', data: Object.values(byDay) },
      summary: [{ label: 'Bookings', value: rows.length }, { label: 'Room-nights', value: rows.reduce((s, r) => s + Math.round((r.checkOutDate - r.checkInDate) / DAY), 0) }, { label: 'Avg lead time', value: `${leadTimes.length ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) : 0} days` }, { label: 'Booking value', value: `INR ${round2(rows.reduce((s, r) => s + toNumber(r.totalAmount), 0)).toLocaleString('en-IN')}` }],
      tables: [
        { title: 'By room type', columns: [{ key: 'roomType', label: 'Room type' }, { key: 'bookings', label: 'Bookings', numeric: true }, { key: 'roomNights', label: 'Room-nights', numeric: true }], rows: Object.values(byType) },
        { title: 'Daily bookings', columns: [{ key: 'date', label: 'Date' }, { key: 'bookings', label: 'Bookings', numeric: true }, { key: 'roomNights', label: 'Room-nights', numeric: true }, { key: 'value', label: 'Value', numeric: true }], rows: Object.values(byDay) },
      ],
    };
  }
  throw badRequest('Unknown report type. Use occupancy, revenue, cancellations or bookings.');
}

export const REPORT_PERMISSIONS = { occupancy: 'report.operational', bookings: 'report.operational', cancellations: 'report.operational', revenue: 'report.financial' };

/** Report.generate() + persist to D7 Reports & Analytics. */
export async function generateReport(user, type, params) {
  const body = await buildReport(type, params);
  const saved = await prisma.report.create({ data: { reportType: type, generatedById: user.id, parameters: params, data: body } });
  await AuditLog.record({ action: 'REPORT_GENERATED', entityType: 'Report', entityId: saved.id, performedBy: user.id, details: { type, ...params } });
  return { id: saved.id, reportType: type, generatedAt: saved.generatedAt, parameters: params, ...body };
}

export async function listReports(user) {
  const rows = await prisma.report.findMany({ include: { generatedBy: { select: { name: true } } }, orderBy: { generatedAt: 'desc' }, take: 50 });
  return rows.filter((r) => user.permissions.has(REPORT_PERMISSIONS[r.reportType])).map((r) => ({ id: r.id, reportType: r.reportType, title: r.data.title, generatedAt: r.generatedAt, generatedBy: r.generatedBy.name, parameters: r.parameters }));
}

/** Report.exportCSV() / Report.exportPDF() (Dashboard.Export) */
export async function exportReport(user, id, format) {
  const r = await prisma.report.findUnique({ where: { id } });
  if (!r) throw badRequest('Report not found.');
  if (!user.permissions.has(REPORT_PERMISSIONS[r.reportType])) throw badRequest('Report not found.');
  const report = { ...r.data, generatedAt: r.generatedAt, parameters: r.parameters };
  const settings = await getSettings();
  await AuditLog.record({ action: 'REPORT_EXPORTED', entityType: 'Report', entityId: id, performedBy: user.id, details: { format } });
  const base = `${r.reportType}-report-${r.parameters.from}_to_${r.parameters.to}`;
  if (format === 'csv') return { filename: `${base}.csv`, contentType: 'text/csv; charset=utf-8', body: Report.exportCSV(report) };
  return { filename: `${base}.pdf`, contentType: 'application/pdf', body: Report.exportPDF(report, settings.hotelName) };
}
