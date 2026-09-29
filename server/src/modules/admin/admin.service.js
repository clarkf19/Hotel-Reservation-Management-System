/**
 * UC-4 Manage Users & Access Control ; SRS 4.2 (User.Role.Assign, BR-2) ; SE-6 audit
 * UML: SystemAdministrator.manageUsers(), manageRoles(), managePermissions(), viewAuditLogs(), systemSettings()
 * Activity (System Administrator lane): Manage Users -> Manage Roles and Permissions -> Manage System Configuration
 *   -> Manage OTA Connections -> Record and View Audit Logs
 * DFD: 6.0 Reporting & Administration ("User Management / Configuration Updates", "Configuration Status / Audit Logs")
 */
import { prisma } from '../../lib/prisma.js';
import { badRequest, conflict, notFound, unprocessable } from '../../lib/errors.js';
import { DEFAULT_SETTINGS, getSettings, invalidateSettings } from '../../lib/settings.js';
import { AuditLog } from '../../domain/AuditLog.js';
import { PROTECTED_ADMIN_PERMISSIONS, ROLES } from '../../domain/rbac.js';
import { generateGuestId, hashPassword } from '../auth/auth.service.js';

function userView(u) {
  return {
    id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role.roleName, isActive: u.isActive,
    guestId: u.guest?.guestId ?? null, employeeId: u.staff?.employeeId ?? null, department: u.staff?.department ?? null,
    lastLoginAt: u.lastLoginAt, lockedUntil: u.lockedUntil, createdAt: u.createdAt, mfaEnabled: u.mfaEnabled,
  };
}
const userInclude = { role: true, guest: { select: { guestId: true } }, staff: { select: { employeeId: true, department: true } } };

export async function listUsers(q = {}) {
  const where = {};
  if (q.role) where.role = { roleName: q.role };
  if (q.search) where.OR = [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }];
  if (q.status === 'active') where.isActive = true;
  if (q.status === 'inactive') where.isActive = false;
  const rows = await prisma.user.findMany({ where, include: userInclude, orderBy: [{ roleId: 'desc' }, { name: 'asc' }], take: 500 });
  return rows.map(userView);
}

/** manageUsers(): create. UC-4 exception "Duplicate user -> creation is rejected". */
export async function createUser(admin, { name, email, phone, password, role, department }) {
  if (await prisma.user.findUnique({ where: { email: email.toLowerCase() } })) throw conflict('DUPLICATE_USER', 'A user with this e-mail already exists.');
  const roleRow = await prisma.role.findUnique({ where: { roleName: role } });
  if (!roleRow) throw badRequest('Unknown role.');
  const created = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { name, email: email.toLowerCase(), phone, passwordHash: await hashPassword(password), roleId: roleRow.id } });
    if (role === ROLES.GUEST) {
      const g = await tx.guest.create({ data: { userId: u.id, guestId: await generateGuestId(tx) } });
      await tx.guestProfile.create({ data: { guestId: g.id } });
      await tx.loyaltyAccount.create({ data: { guestId: g.id } });
    } else {
      const prefix = { [ROLES.RECEPTIONIST]: 'FD', [ROLES.HOTEL_MANAGER]: 'MG', [ROLES.FINANCE_STAFF]: 'FN', [ROLES.SYSTEM_ADMINISTRATOR]: 'AD' }[role];
      const count = await tx.staffMember.count();
      await tx.staffMember.create({ data: { userId: u.id, employeeId: `${prefix}-${String(1001 + count)}`, department: department || role } });
    }
    await AuditLog.record({ action: 'USER_CREATED', entityType: 'User', entityId: u.id, performedBy: admin.id, details: { email: u.email, role } }, tx);
    return u;
  });
  return userView(await prisma.user.findUnique({ where: { id: created.id }, include: userInclude }));
}

/** manageUsers(): update / deactivate ; User.Role.Assign (BR-2: only the System Administrator) */
export async function updateUser(admin, id, { name, phone, isActive, role, unlock }) {
  const user = await prisma.user.findUnique({ where: { id }, include: userInclude });
  if (!user) throw notFound('User');
  if (id === admin.id && (isActive === false || (role && role !== user.role.roleName))) {
    throw unprocessable('SELF_LOCKOUT', 'You cannot deactivate yourself or change your own role.');
  }
  let roleId;
  if (role && role !== user.role.roleName) {
    const r = await prisma.role.findUnique({ where: { roleName: role } });
    if (!r) throw badRequest('Invalid role.');
    // UC-4 exception: "Invalid role/permission change -> update is rejected"
    if ((role === ROLES.GUEST) !== Boolean(user.guest)) throw unprocessable('INVALID_ROLE_CHANGE', 'Guest accounts and staff accounts cannot be converted into each other.');
    roleId = r.id;
  }
  const updated = await prisma.user.update({
    where: { id },
    data: { name, phone, isActive, roleId, ...(unlock ? { lockedUntil: null, failedLoginAttempts: 0 } : {}) },
    include: userInclude,
  });
  if (isActive === false || roleId) await prisma.userSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  await AuditLog.record({
    action: roleId ? 'ROLE_CHANGED' : isActive === false ? 'USER_DEACTIVATED' : isActive === true ? 'USER_ACTIVATED' : unlock ? 'USER_UNLOCKED' : 'USER_UPDATED',
    entityType: 'User', entityId: id, performedBy: admin.id,
    details: { ...(roleId ? { from: user.role.roleName, to: role } : {}), name, phone, isActive },
  });
  return userView(updated);
}

/** manageRoles() / managePermissions(): the role -> permission matrix */
export async function rolesMatrix() {
  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({ include: { permissions: true, _count: { select: { users: true } } }, orderBy: { id: 'asc' } }),
    prisma.permission.findMany({ orderBy: { permissionName: 'asc' } }),
  ]);
  return {
    permissions,
    roles: roles.map((r) => ({ id: r.id, roleName: r.roleName, description: r.description, userCount: r._count.users, permissionIds: r.permissions.map((p) => p.permissionId) })),
  };
}

export async function setRolePermission(admin, roleId, permissionId, granted) {
  const [role, perm] = await Promise.all([prisma.role.findUnique({ where: { id: roleId } }), prisma.permission.findUnique({ where: { id: permissionId } })]);
  if (!role || !perm) throw notFound('Role or permission');
  if (!granted && role.roleName === ROLES.SYSTEM_ADMINISTRATOR && PROTECTED_ADMIN_PERMISSIONS.includes(perm.permissionName)) {
    throw unprocessable('PROTECTED_PERMISSION', 'This permission cannot be removed from the System Administrator (it would lock everyone out of administration).');
  }
  if (granted) await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId, permissionId } }, update: {}, create: { roleId, permissionId } });
  else await prisma.rolePermission.deleteMany({ where: { roleId, permissionId } });
  await AuditLog.record({ action: granted ? 'PERMISSION_GRANTED' : 'PERMISSION_REVOKED', entityType: 'Role', entityId: roleId, performedBy: admin.id, details: { role: role.roleName, permission: perm.permissionName } });
  return rolesMatrix();
}

/** systemSettings() */
export async function listSettings() {
  const values = await getSettings();
  return Object.entries(DEFAULT_SETTINGS).map(([key, d]) => ({ key, value: values[key], defaultValue: d.value, description: d.description }));
}

export async function updateSetting(admin, key, value) {
  if (!DEFAULT_SETTINGS[key]) throw badRequest('Unknown setting.');
  const def = DEFAULT_SETTINGS[key].value;
  if (typeof def === 'number' && (typeof value !== 'number' || Number.isNaN(value) || value < 0)) throw badRequest(`${key} must be a non-negative number.`);
  if (typeof def === 'string' && typeof value !== 'string') throw badRequest(`${key} must be text.`);
  if (/Time$/.test(key) && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw badRequest('Use HH:MM (24-hour) format.');
  if (key === 'otaSyncIntervalSeconds' && (value < 10 || value > 60)) throw badRequest('Channel.Sync.Inventory requires synchronisation within 60 seconds (use 10-60).');
  if (key === 'loyaltyTiers' && (!Array.isArray(value) || !value.every((t) => t.name && t.minLifetimePoints >= 0 && t.multiplier > 0))) throw badRequest('Invalid tier definition.');
  const before = (await getSettings())[key];
  await prisma.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value, description: DEFAULT_SETTINGS[key].description } });
  invalidateSettings();
  await AuditLog.record({ action: 'SETTING_CHANGED', entityType: 'SystemSetting', entityId: key, performedBy: admin.id, details: { from: before, to: value } });
  return listSettings();
}

/** viewAuditLogs() */
export async function auditLogs(q = {}) {
  const where = {};
  if (q.action) where.action = { contains: q.action.toUpperCase() };
  if (q.entityType) where.entityType = q.entityType;
  if (q.userId) where.performedBy = Number(q.userId);
  if (q.from || q.to) where.timestamp = { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(`${q.to}T23:59:59Z`) : undefined };
  const take = Math.min(Number(q.limit) || 100, 500);
  const skip = Math.max(0, Number(q.offset) || 0);
  const [rows, total, actions] = await Promise.all([
    prisma.auditLog.findMany({ where, include: { user: { select: { name: true, role: { select: { roleName: true } } } } }, orderBy: { timestamp: 'desc' }, take, skip }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ['action'], _count: true, orderBy: { _count: { action: 'desc' } }, take: 40 }),
  ]);
  return {
    total,
    actions: actions.map((a) => ({ action: a.action, count: a._count })),
    logs: rows.map((l) => ({ id: l.id, timestamp: l.timestamp, action: l.action, entityType: l.entityType, entityId: l.entityId, performedBy: l.user ? `${l.user.name} (${l.user.role.roleName})` : 'System', details: l.details, ipAddress: l.ipAddress })),
  };
}

export async function notificationOutbox(q = {}) {
  const rows = await prisma.notification.findMany({
    where: q.channel ? { channel: q.channel } : {},
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(q.limit) || 100, 300),
  });
  return rows.map((n) => ({ id: n.id, channel: n.channel, type: n.type, recipient: n.recipient, user: n.user.name, subject: n.subject, body: n.body, status: n.status, createdAt: n.createdAt }));
}

export async function systemHealth() {
  const [users, reservations, payments, keys, syncs] = await Promise.all([
    prisma.user.count(), prisma.reservation.count(), prisma.payment.count(), prisma.digitalKey.count({ where: { status: 'ACTIVE' } }),
    prisma.channelSync.findFirst({ orderBy: { lastSyncAt: 'desc' } }),
  ]);
  const rates = await prisma.exchangeRate.findMany({ orderBy: { currency: 'asc' } });
  return { database: 'connected', users, reservations, payments, activeKeys: keys, lastChannelSync: syncs?.lastSyncAt ?? null, exchangeRates: rates.map((r) => ({ currency: r.currency, rate: Number(r.rate), fetchedAt: r.fetchedAt })) };
}
