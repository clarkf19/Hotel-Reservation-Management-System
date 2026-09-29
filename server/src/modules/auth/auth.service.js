/**
 * DFD Level 1 process 1.0 "User Authentication & Profile Management" (data store D1 User Data)
 * SRS 4.2: User.Login, User.Login.Lockout, User.Password.Reset, User.Logout, User.Session.Timeout
 * UML: User.login(), User.logout(), User.updateProfile()
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { getSettings } from '../../lib/settings.js';
import { AppError, badRequest, conflict, unauthorized } from '../../lib/errors.js';
import { AuditLog } from '../../domain/AuditLog.js';
import { ROLES } from '../../domain/rbac.js';
import { signSessionToken } from '../../middleware/auth.js';
import { notificationService } from '../../integrations/NotificationService.js';

const GUEST_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const ROLE_HOME = {
  [ROLES.GUEST]: '/guest',
  [ROLES.RECEPTIONIST]: '/front-desk',
  [ROLES.HOTEL_MANAGER]: '/manager',
  [ROLES.FINANCE_STAFF]: '/finance',
  [ROLES.SYSTEM_ADMINISTRATOR]: '/admin',
};

export async function generateGuestId(db = prisma) {
  for (;;) {
    const id = Array.from(crypto.randomBytes(8), (b) => GUEST_ID_ALPHABET[b % GUEST_ID_ALPHABET.length]).join('');
    if (!(await db.guest.findUnique({ where: { guestId: id } }))) return id;
  }
}

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role.roleName,
    permissions: user.role.permissions.map((rp) => rp.permission.permissionName),
    guestId: user.guest?.guestId ?? null,
    employeeId: user.staff?.employeeId ?? null,
    mfaEnabled: user.mfaEnabled,
    home: ROLE_HOME[user.role.roleName],
    createdAt: user.createdAt,
  };
}

const userInclude = {
  role: { include: { permissions: { include: { permission: true } } } },
  guest: { select: { guestId: true } },
  staff: { select: { employeeId: true } },
};

/** User.login(): authenticate and open a session. */
export async function login({ email, password }, { ip, userAgent } = {}) {
  const settings = await getSettings();
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: userInclude });
  const genericFailure = unauthorized('Incorrect email or password.', 'INVALID_CREDENTIALS');
  if (!user) throw genericFailure;

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil - new Date()) / 60_000);
    throw new AppError(423, 'ACCOUNT_LOCKED', `Too many failed attempts. Your account is locked for ${minutes} more minute${minutes === 1 ? '' : 's'}.`);
  }
  if (!user.isActive) throw unauthorized('This account has been deactivated. Contact the System Administrator.', 'ACCOUNT_INACTIVE');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const attempts = user.failedLoginAttempts + 1;
    const lock = attempts >= settings.loginMaxAttempts;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: lock ? 0 : attempts, lockedUntil: lock ? new Date(Date.now() + settings.loginLockoutMinutes * 60_000) : null },
    });
    await AuditLog.record({ action: lock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED', entityType: 'User', entityId: user.id, performedBy: user.id, ipAddress: ip, details: { attempts } });
    if (lock) {
      throw new AppError(423, 'ACCOUNT_LOCKED', `Too many failed attempts. Your account is locked for ${settings.loginLockoutMinutes} minutes.`);
    }
    const left = settings.loginMaxAttempts - attempts;
    throw unauthorized(`Incorrect email or password. ${left} attempt${left === 1 ? '' : 's'} left before a temporary lock.`, 'INVALID_CREDENTIALS');
  }

  await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });

  // SE-3: optional multi-factor authentication - a one-time code sent over the simulated e-mail/SMS channel
  if (user.mfaEnabled) {
    const challengeId = crypto.randomUUID();
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    mfaChallenges.set(challengeId, { userId: user.id, codeHash: sha256(code), expiresAt: Date.now() + 5 * 60_000, attempts: 0, ip, userAgent });
    await notificationService.notifyUser(user.id, { type: 'MFA_CODE', subject: 'Your sign-in code', body: `Your one-time sign-in code is ${code}. It expires in 5 minutes.`, channels: ['EMAIL', 'SMS'] });
    return { mfaRequired: true, challengeId, simulatedCode: process.env.NODE_ENV === 'production' ? undefined : code };
  }
  return openSession(user, { ip, userAgent });
}

const mfaChallenges = new Map();
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export async function verifyMfa({ challengeId, code }) {
  const ch = mfaChallenges.get(challengeId);
  if (!ch || ch.expiresAt < Date.now()) throw unauthorized('This sign-in code has expired. Please sign in again.', 'MFA_EXPIRED');
  if (++ch.attempts > 5 || ch.codeHash !== sha256(String(code))) {
    if (ch.attempts > 5) mfaChallenges.delete(challengeId);
    throw unauthorized('That code is not correct.', 'MFA_INVALID');
  }
  mfaChallenges.delete(challengeId);
  const user = await prisma.user.findUnique({ where: { id: ch.userId }, include: userInclude });
  return openSession(user, ch);
}

async function openSession(user, { ip, userAgent } = {}) {
  const session = await prisma.userSession.create({ data: { userId: user.id, userAgent: userAgent?.slice(0, 200) } });
  const firstLogin = !user.lastLoginAt;
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await AuditLog.record({ action: 'LOGIN_SUCCESS', entityType: 'User', entityId: user.id, performedBy: user.id, ipAddress: ip });
  return { token: signSessionToken(user, session.id), user: publicUser(user), firstLogin, sessionIdleMinutes: env.sessionIdleMinutes };
}

/** Guest self-registration (AS-1: valid e-mail; UD-2: guided walkthrough on first sign-in). */
export async function registerGuest({ name, email, phone, password }, meta) {
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) throw conflict('EMAIL_TAKEN', 'An account with this e-mail already exists.');
  const role = await prisma.role.findUnique({ where: { roleName: ROLES.GUEST } });
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name, email: email.toLowerCase(), phone, passwordHash, roleId: role.id } });
    const guest = await tx.guest.create({ data: { userId: user.id, guestId: await generateGuestId(tx) } });
    await tx.guestProfile.create({ data: { guestId: guest.id } });
    await tx.loyaltyAccount.create({ data: { guestId: guest.id } });
    await AuditLog.record({ action: 'GUEST_REGISTERED', entityType: 'User', entityId: user.id, performedBy: user.id }, tx);
  });
  const result = await login({ email, password }, meta);
  const hotel = (await getSettings()).hotelName;
  await notificationService.notifyUser(result.user.id, {
    type: 'WELCOME',
    subject: `Welcome to ${hotel}`,
    body: `Hi ${name}, your guest account is ready. Your Guest ID is ${result.user.guestId}.`,
  });
  return result;
}

/** User.logout(): terminate the active session (User.Logout). */
export async function logout(user) {
  await prisma.userSession.update({ where: { id: user.sessionId }, data: { revokedAt: new Date() } });
  await AuditLog.record({ action: 'LOGOUT', entityType: 'User', entityId: user.id, performedBy: user.id });
}

export async function me(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: userInclude });
  return publicUser(user);
}

/** User.Password.Reset step 1: e-mail a link valid for 30 minutes. Always answers the same way (no account enumeration). */
export async function requestPasswordReset(email) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.isActive) return { sent: true };
  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 30 * 60_000) },
  });
  const link = `${env.clientOrigin}/reset-password?token=${token}`;
  await notificationService.sendEmail({ userId: user.id, email: user.email }, 'Reset your password', `Use this link within 30 minutes to choose a new password: ${link}`, 'PASSWORD_RESET');
  await AuditLog.record({ action: 'PASSWORD_RESET_REQUESTED', entityType: 'User', entityId: user.id, performedBy: user.id });
  // Development convenience: e-mail is simulated, so the link is also returned to the caller.
  return { sent: true, simulatedEmailLink: process.env.NODE_ENV === 'production' ? undefined : link };
}

/** User.Password.Reset step 2. */
export async function resetPassword({ token, password }) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw badRequest('This reset link is invalid or has expired. Please request a new one.');
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(password), failedLoginAttempts: 0, lockedUntil: null } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.userSession.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await AuditLog.record({ action: 'PASSWORD_RESET', entityType: 'User', entityId: record.userId, performedBy: record.userId });
  return { reset: true };
}

export async function changePassword(user, { currentPassword, newPassword }) {
  const record = await prisma.user.findUnique({ where: { id: user.id } });
  if (!(await bcrypt.compare(currentPassword, record.passwordHash))) throw badRequest('Current password is incorrect.');
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  await AuditLog.record({ action: 'PASSWORD_CHANGED', entityType: 'User', entityId: user.id, performedBy: user.id });
  return { changed: true };
}

/** User.updateProfile(): contact details stored on the User record. */
export async function updateContact(user, { name, phone, mfaEnabled }) {
  await prisma.user.update({ where: { id: user.id }, data: { name, phone, mfaEnabled } });
  await AuditLog.record({ action: 'PROFILE_UPDATED', entityType: 'User', entityId: user.id, performedBy: user.id });
  return me(user.id);
}
