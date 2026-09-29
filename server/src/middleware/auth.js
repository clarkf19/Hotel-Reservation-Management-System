/**
 * Authentication and authorisation middleware (SRS 4.2: User.Login, User.Role,
 * User.Session.Timeout, User.Logout; SE-2; SE-5; BR-9).
 *
 * Every protected request is checked on the SERVER:
 *   1. the JWT signature is valid,
 *   2. the session it refers to exists, is not revoked (logout) and has been
 *      active within SESSION_IDLE_MINUTES (idle timeout),
 *   3. the user account is still active,
 *   4. the user's role grants the required permission (loaded from the database,
 *      so permission changes made by the administrator apply immediately).
 * Hiding buttons in the UI is only a convenience; this is the enforcement point.
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { createActor } from '../domain/actors/index.js';

const TOUCH_INTERVAL_MS = 30_000;

export function signSessionToken(user, sessionId) {
  return jwt.sign({ sub: user.id, sid: sessionId, role: user.role.roleName }, env.jwtSecret, { expiresIn: '12h' });
}

export async function loadAuthContext(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw unauthorized('Your session is invalid or has expired. Please sign in again.', 'SESSION_INVALID');
  }
  const session = await prisma.userSession.findUnique({
    where: { id: payload.sid },
    include: {
      user: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
          guest: { select: { id: true, guestId: true } },
          staff: { select: { employeeId: true, department: true } },
        },
      },
    },
  });
  if (!session || session.userId !== payload.sub || session.revokedAt) {
    throw unauthorized('You have been signed out. Please sign in again.', 'SESSION_REVOKED');
  }
  const idleMs = Date.now() - session.lastActivityAt.getTime();
  if (idleMs > env.sessionIdleMinutes * 60_000) {
    await prisma.userSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    throw unauthorized(`Your session ended after ${env.sessionIdleMinutes} minutes of inactivity. Please sign in again.`, 'SESSION_EXPIRED');
  }
  if (!session.user.isActive) throw unauthorized('This account has been deactivated.', 'ACCOUNT_INACTIVE');
  if (idleMs > TOUCH_INTERVAL_MS) {
    await prisma.userSession.update({ where: { id: session.id }, data: { lastActivityAt: new Date() } });
  }
  const u = session.user;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role.roleName,
    permissions: new Set(u.role.permissions.map((rp) => rp.permission.permissionName)),
    guestPk: u.guest?.id ?? null,
    guestId: u.guest?.guestId ?? null,
    employeeId: u.staff?.employeeId ?? null,
    sessionId: session.id,
  };
}

/** Require a valid session. Attaches req.user and req.actor (the UML actor object). */
export async function authenticate(req, _res, next) {
  if (req.user && req.actor) return next(); // already authenticated by an earlier router
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized());
  req.user = await loadAuthContext(token);
  req.actor = createActor(req.user);
  next();
}

/** Attach the user if a valid token is present, but allow anonymous access (SE-2 public browsing). */
export async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      req.user = await loadAuthContext(header.slice(7));
      req.actor = createActor(req.user);
    } catch {
      /* anonymous */
    }
  }
  next();
}

/** Require at least one of the listed permissions. */
export function authorize(...permissions) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!permissions.some((p) => req.user.permissions.has(p))) return next(forbidden());
    next();
  };
}

export const hasPermission = (user, permission) => Boolean(user?.permissions?.has(permission));
