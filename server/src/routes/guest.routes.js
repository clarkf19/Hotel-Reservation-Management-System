/** Guest self-service: profile, loyalty, history (SRS 4.5), concierge + service requests (SRS 4.4, DFD 5.0), notifications */
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/common.js';
import { authenticate, authorize } from '../middleware/auth.js';
import * as guests from '../modules/guests/guest.service.js';
import * as concierge from '../modules/guest-services/concierge.service.js';
import * as services from '../modules/guest-services/serviceRequest.service.js';
import { prisma } from '../lib/prisma.js';
import { SUPPORTED_CURRENCIES } from '../integrations/CurrencyExchangeRateService.js';

const r = Router();
r.use(authenticate);

// ---- Profile & preferences (Guest.Profile.Manage) --------------------------------------
r.get('/me/profile', authorize('profile.own'), async (req, res) => res.json({ profile: await guests.getProfile(req.user) }));
r.put('/me/profile', authorize('profile.own'), validate(z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().regex(/^\+?[0-9 ]{8,16}$/, 'Enter a valid phone number.').optional(),
  mfaEnabled: z.boolean().optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  nationality: z.string().max(60).optional(),
  address: z.string().max(200).optional(),
  accessibilityNeeds: z.string().max(200).optional(),
  preferredCurrency: z.enum(SUPPORTED_CURRENCIES).optional(),
  preferences: z.object({
    floor: z.enum(['HIGH', 'LOW', 'ANY']).optional(),
    view: z.string().max(30).optional(),
    bedType: z.string().max(30).optional(),
    quiet: z.boolean().optional(),
    nearElevator: z.boolean().optional(),
    pillow: z.string().max(30).optional(),
    dietary: z.string().max(60).optional(),
    lastRoomType: z.string().optional(),
    onboardingDone: z.boolean().optional(),
  }).optional(),
})), async (req, res) => res.json({ profile: await guests.updateProfile(req.user, req.body) }));

r.get('/me/loyalty', authorize('loyalty.own'), async (req, res) => res.json(await req.actor.manageLoyalty()));
r.get('/me/stay-history', authorize('reservation.own'), async (req, res) => res.json({ stays: await req.actor.viewStayHistory() }));
r.get('/me/export', authorize('profile.own'), async (req, res) => {
  const data = await guests.exportMyData(req.user);
  res.setHeader('Content-Disposition', `attachment; filename="hrms-data-${req.user.guestId}.json"`);
  res.json(data);
});

// ---- AI Concierge (SRS 4.4) -------------------------------------------------------------
r.get('/concierge', authorize('concierge.use'), async (_req, res) => res.json(await concierge.conciergeInfo()));
r.get('/concierge/history', authorize('concierge.use'), async (req, res) => res.json({ messages: await concierge.history(req.user, req.query.sessionId) }));
r.post('/concierge/messages', authorize('concierge.use'), validate(z.object({ message: z.string().trim().min(1, 'Type a message.').max(500), sessionId: z.string().uuid().optional() })), async (req, res) => {
  res.json(await req.actor.chatWithAIConcierge(req.body));
});

// ---- Service requests (D6) --------------------------------------------------------------
r.get('/service-requests/catalog', (_req, res) => res.json({ catalog: services.catalog() }));
r.get('/service-requests', authorize('service.own', 'service.manage'), async (req, res) => res.json({ requests: await services.listServiceRequests(req.user, req.query) }));
r.post('/service-requests', authorize('service.own'), validate(z.object({ category: z.string(), description: z.string().trim().min(3, 'Describe your request.').max(500), reservationId: z.number().int().positive().optional() })), async (req, res) => {
  res.status(201).json({ request: await services.createServiceRequest(req.user, req.body) });
});
r.patch('/service-requests/:id', authorize('service.own', 'service.manage'), validate(z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  staffNote: z.string().max(500).optional(),
  charge: z.number().min(0).max(100000).optional(),
  assignToMe: z.boolean().optional(),
})), async (req, res) => res.json({ request: await services.updateServiceRequest(req.user, Number(req.params.id), req.body) }));

// ---- Notifications (in-app inbox) -------------------------------------------------------
r.get('/notifications', async (req, res) => {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: req.user.id, channel: req.query.channel || undefined }, orderBy: { createdAt: 'desc' }, take: 60 }),
    prisma.notification.count({ where: { userId: req.user.id, channel: 'IN_APP', readAt: null } }),
  ]);
  res.json({ notifications: items, unread });
});
r.post('/notifications/read-all', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

export default r;
