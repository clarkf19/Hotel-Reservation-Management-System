/** DFD 1.0 User Authentication & Profile Management — REST endpoints (SRS 4.2) */
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/common.js';
import { authenticate } from '../middleware/auth.js';
import * as auth from '../modules/auth/auth.service.js';

const r = Router();
const email = z.string().trim().email('Enter a valid e-mail address.').max(120);
const password = z.string().min(8, 'Password must be at least 8 characters.').max(100).regex(/[A-Za-z]/, 'Password must contain a letter.').regex(/\d/, 'Password must contain a number.');

r.post('/login', validate(z.object({ email, password: z.string().min(1, 'Enter your password.') })), async (req, res) => {
  res.json(await auth.login(req.body, { ip: req.ip, userAgent: req.get('user-agent') }));
});

r.post('/mfa/verify', validate(z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code.') })), async (req, res) => {
  res.json(await auth.verifyMfa(req.body));
});

r.post('/register', validate(z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(80),
  email,
  phone: z.string().trim().regex(/^\+?[0-9 ]{8,16}$/, 'Enter a valid phone number.').optional().or(z.literal('')).transform((v) => v || null),
  password,
})), async (req, res) => {
  res.status(201).json(await auth.registerGuest(req.body, { ip: req.ip, userAgent: req.get('user-agent') }));
});

r.post('/logout', authenticate, async (req, res) => {
  await req.actor.logout();
  res.json({ loggedOut: true });
});

r.get('/me', authenticate, async (req, res) => {
  res.json({ user: await auth.me(req.user.id) });
});

r.post('/password/forgot', validate(z.object({ email })), async (req, res) => {
  res.json(await auth.requestPasswordReset(req.body.email));
});

r.post('/password/reset', validate(z.object({ token: z.string().min(20), password })), async (req, res) => {
  res.json(await auth.resetPassword(req.body));
});

r.post('/password/change', authenticate, validate(z.object({ currentPassword: z.string().min(1), newPassword: password })), async (req, res) => {
  res.json(await auth.changePassword(req.user, req.body));
});

export default r;
