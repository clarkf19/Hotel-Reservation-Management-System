/**
 * Staff endpoints: front desk (Receptionist), channel manager (SRS 4.3), manager (SRS 4.7, rates/inventory),
 * finance (UC-3), administration (UC-4). Every route is guarded by a server-side permission check.
 */
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/common.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { forbidden } from '../lib/errors.js';
import * as guests from '../modules/guests/guest.service.js';
import * as channels from '../modules/channels/channelSync.service.js';
import * as inventory from '../modules/inventory/inventory.service.js';
import * as analytics from '../modules/reporting/analytics.service.js';
import * as finance from '../modules/finance/finance.service.js';
import * as admin from '../modules/admin/admin.service.js';
import { ROLES } from '../domain/rbac.js';

const r = Router();
const id = (v) => Number.parseInt(v, 10);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD dates.');

// Invoice PDF is used by guests too (own invoices) — ownership checked in the service
r.get('/invoices/:id/pdf', authenticate, async (req, res) => {
  const { filename, buffer } = await finance.invoicePdf(req.user, id(req.params.id));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(buffer);
});

r.use(authenticate);

// ---- Front desk --------------------------------------------------------------------------
r.get('/rooms-board', authorize('room.status', 'reservation.manage'), async (_req, res) => res.json({ rooms: await inventory.roomBoard() }));
r.patch('/rooms/:id/status', authorize('room.status'), validate(z.object({ status: z.enum(['AVAILABLE', 'CLEANING', 'MAINTENANCE', 'OUT_OF_SERVICE', 'OCCUPIED']) })), async (req, res) => {
  res.json({ room: await inventory.setRoomStatus(req.user, id(req.params.id), req.body.status) });
});
r.get('/guests', authorize('guest.read'), async (req, res) => res.json({ guests: await guests.searchGuests(req.query.search) }));

// ---- Channel manager (SRS 4.3, SD-3) ------------------------------------------------------
r.get('/channels', authorize('channel.conflict.resolve', 'channel.sync', 'channel.connect.manage'), async (_req, res) => res.json({ channels: await channels.listChannels() }));
r.get('/channels/sync-log', authorize('channel.conflict.resolve', 'channel.sync', 'channel.connect.manage'), async (req, res) => res.json({ syncs: await channels.listSyncLog({ channelId: req.query.channelId ? id(req.query.channelId) : undefined }) }));
r.get('/channels/availability', authorize('channel.conflict.resolve', 'channel.sync', 'channel.connect.manage'), async (_req, res) => res.json(await channels.availabilitySnapshot()));
r.post('/channels/sync', authorize('channel.sync', 'channel.conflict.resolve'), validate(z.object({ channelId: z.number().int().optional() })), async (req, res) => {
  res.json({ summary: await channels.syncReservations({ channelId: req.body.channelId, performedBy: req.user.id }) });
});
r.get('/channels/conflicts', authorize('channel.conflict.resolve', 'channel.sync'), async (req, res) => res.json({ conflicts: await channels.listConflicts({ status: req.query.status }) }));
r.get('/channels/conflicts/:id/options', authorize('channel.conflict.resolve'), async (req, res) => res.json(await channels.conflictOptions(id(req.params.id))));
r.post('/channels/conflicts/:id/resolve', authorize('channel.conflict.resolve'), validate(z.object({
  resolution: z.enum(['REASSIGN_ROOM', 'MOVE_EXISTING', 'REJECT_OTA_BOOKING']),
  targetRoomId: z.number().int().positive().optional(),
  note: z.string().max(300).optional(),
})), async (req, res) => {
  const result = req.actor.resolveOTAConflicts ? await req.actor.resolveOTAConflicts(id(req.params.id), req.body) : await channels.resolveConflicts(req.user, id(req.params.id), req.body);
  res.json(result);
});
/** Simulation of the external OTA side (demo tool) */
r.get('/channels/platform-bookings', authorize('channel.conflict.resolve', 'channel.sync', 'channel.connect.manage'), async (req, res) => res.json({ bookings: await channels.listPlatformBookings(req.query.channelId ? id(req.query.channelId) : undefined) }));
r.post('/channels/:id/simulate', authorize('channel.conflict.resolve', 'channel.sync', 'channel.connect.manage'), validate(z.object({
  action: z.enum(['book', 'cancel']).default('book'),
  roomNumber: z.string().max(10).optional(), guestName: z.string().max(80).optional(), guestEmail: z.string().email().optional(),
  checkIn: date.optional(), checkOut: date.optional(), numGuests: z.number().int().min(1).max(8).optional(), externalRef: z.string().optional(),
})), async (req, res) => res.json(await channels.simulateOtaBooking(req.user, id(req.params.id), req.body)));
/** Channel.Connect.Manage (System Administrator) */
const channelSchema = z.object({ channelName: z.string().min(2).max(60), code: z.string().regex(/^[A-Z0-9]{2,8}$/, 'Code: 2-8 capital letters/digits'), apiEndpoint: z.string().url().startsWith('https://', 'OTA APIs must use HTTPS (CO-2).'), status: z.enum(['CONNECTED', 'DISABLED', 'ERROR']).optional(), commissionPercent: z.number().min(0).max(50).optional() });
r.post('/channels', authorize('channel.connect.manage'), validate(channelSchema), async (req, res) => res.status(201).json({ channel: await channels.saveChannel(req.user, null, req.body) }));
r.patch('/channels/:id', authorize('channel.connect.manage'), validate(channelSchema.partial()), async (req, res) => res.json({ channel: await channels.saveChannel(req.user, id(req.params.id), req.body) }));

// ---- Manager: dashboard, reports, rates, inventory (SRS 4.7) -----------------------------
r.get('/dashboard', authorize('dashboard.view'), async (req, res) => res.json(req.actor.viewDashboard ? await req.actor.viewDashboard() : await analytics.dashboard()));
r.get('/reports', authorize('report.operational', 'report.financial'), async (req, res) => res.json({ reports: await analytics.listReports(req.user) }));
r.post('/reports', validate(z.object({ type: z.enum(['occupancy', 'revenue', 'cancellations', 'bookings']), from: date, to: date })), async (req, res) => {
  if (!req.user.permissions.has(analytics.REPORT_PERMISSIONS[req.body.type])) throw forbidden();
  res.status(201).json({ report: await analytics.generateReport(req.user, req.body.type, { from: req.body.from, to: req.body.to }) });
});
r.get('/reports/:id/export', authorize('report.export'), async (req, res) => {
  const out = await analytics.exportReport(req.user, id(req.params.id), req.query.format === 'csv' ? 'csv' : 'pdf');
  res.setHeader('Content-Type', out.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
  res.send(out.body);
});
r.get('/room-types', authorize('inventory.manage', 'rate.manage'), async (_req, res) => res.json({ roomTypes: await inventory.listRoomTypes() }));
r.put('/room-types/:id/rate', authorize('rate.manage'), validate(z.object({ baseRate: z.number().positive().max(1_000_000) })), async (req, res) => {
  res.json(await inventory.updateRate(req.user, id(req.params.id), req.body));
});
const roomSchema = z.object({ roomNumber: z.string().regex(/^[0-9A-Z-]{1,10}$/), roomTypeId: z.number().int(), floor: z.number().int().min(0).max(100), capacity: z.number().int().min(1).max(10), baseRate: z.number().positive().optional(), accessible: z.boolean().optional(), view: z.string().max(30).optional(), features: z.array(z.string().max(40)).max(12).optional() });
r.post('/rooms', authorize('inventory.manage'), validate(roomSchema), async (req, res) => res.status(201).json({ room: await inventory.saveRoom(req.user, null, req.body) }));
r.patch('/rooms/:id', authorize('inventory.manage'), validate(roomSchema.partial()), async (req, res) => res.json({ room: await inventory.saveRoom(req.user, id(req.params.id), req.body) }));

// ---- Finance (UC-3) ------------------------------------------------------------------------
r.get('/payments', authorize('payment.read'), async (req, res) => res.json(await finance.listPayments(req.query)));
r.post('/payments/:id/verify', authorize('payment.verify'), validate(z.object({ note: z.string().max(200).optional() })), async (req, res) => res.json({ payment: await req.actor.verifyPayments(id(req.params.id), req.body) }));
r.post('/payments/reconcile', authorize('payment.reconcile'), validate(z.object({ apply: z.boolean().default(false) })), async (req, res) => res.json(await req.actor.reconcileRevenue(req.body)));
r.get('/invoices', authorize('invoice.read'), async (req, res) => res.json({ invoices: await finance.listInvoices(req.query) }));

// ---- Administration (UC-4) ------------------------------------------------------------------
r.get('/admin/users', authorize('user.manage'), async (req, res) => res.json({ users: await admin.listUsers(req.query) }));
r.post('/admin/users', authorize('user.manage'), validate(z.object({
  name: z.string().trim().min(2).max(80), email: z.string().trim().email(), phone: z.string().max(20).optional(),
  password: z.string().min(8).regex(/[A-Za-z]/).regex(/\d/, 'Password must contain a number.'),
  role: z.enum(Object.values(ROLES)), department: z.string().max(60).optional(),
})), async (req, res) => res.status(201).json({ user: await admin.createUser(req.user, req.body) }));
r.patch('/admin/users/:id', authorize('user.manage'), validate(z.object({ name: z.string().min(2).max(80).optional(), phone: z.string().max(20).optional(), isActive: z.boolean().optional(), role: z.enum(Object.values(ROLES)).optional(), unlock: z.boolean().optional() })), async (req, res) => {
  if (req.body.role && !req.user.permissions.has('role.manage')) throw forbidden('Only the System Administrator may change roles (BR-2).');
  res.json({ user: await admin.updateUser(req.user, id(req.params.id), req.body) });
});
r.get('/admin/roles', authorize('role.manage'), async (_req, res) => res.json(await admin.rolesMatrix()));
r.put('/admin/roles/:roleId/permissions/:permissionId', authorize('role.manage'), validate(z.object({ granted: z.boolean() })), async (req, res) => {
  res.json(await admin.setRolePermission(req.user, id(req.params.roleId), id(req.params.permissionId), req.body.granted));
});
r.get('/admin/settings', authorize('settings.manage'), async (_req, res) => res.json({ settings: await admin.listSettings() }));
r.put('/admin/settings/:key', authorize('settings.manage'), validate(z.object({ value: z.any() })), async (req, res) => res.json({ settings: await admin.updateSetting(req.user, req.params.key, req.body.value) }));
r.get('/admin/audit-logs', authorize('audit.read'), async (req, res) => res.json(await admin.auditLogs(req.query)));
r.get('/admin/notifications', authorize('notification.outbox'), async (req, res) => res.json({ notifications: await admin.notificationOutbox(req.query) }));
r.get('/admin/health', authorize('settings.manage', 'audit.read'), async (_req, res) => res.json(await admin.systemHealth()));

export default r;
