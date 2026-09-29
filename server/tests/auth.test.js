/**
 * SRS 4.2 Role-Based Access Control — tests 1 (Login), 2 (RBAC) and 16 (Authorization failures)
 */
import { describe, expect, it } from 'vitest';
import { api, login, PASSWORD, prisma } from './helpers.js';

describe('1. Login (User.Login, User.Login.Lockout, User.Logout, User.Session.Timeout)', () => {
  it('authenticates a registered user and routes to the role dashboard', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'guest@hrms.test', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('Guest');
    expect(res.body.user.home).toBe('/guest');
    expect(res.body.user.guestId).toMatch(/^[A-Z0-9]{8}$/); // data dictionary: 8-character guest ID
  });

  it('rejects a wrong password without revealing which part was wrong', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'manager@hrms.test', password: 'nope1234' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('locks the account for 15 minutes after 5 consecutive failures', async () => {
    for (let i = 0; i < 5; i++) await api().post('/api/auth/login').send({ email: 'liam@hrms.test', password: 'wrong-pass1' });
    const res = await api().post('/api/auth/login').send({ email: 'liam@hrms.test', password: PASSWORD });
    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
    const u = await prisma.user.findUnique({ where: { email: 'liam@hrms.test' } });
    expect(Math.round((u.lockedUntil - Date.now()) / 60000)).toBeGreaterThanOrEqual(14);
    await prisma.user.update({ where: { id: u.id }, data: { lockedUntil: null, failedLoginAttempts: 0 } });
  });

  it('logout terminates the session so the token stops working', async () => {
    const s = await login('meera@hrms.test');
    expect((await api().get('/api/auth/me').set(s.auth)).status).toBe(200);
    expect((await api().post('/api/auth/logout').set(s.auth)).status).toBe(200);
    const after = await api().get('/api/auth/me').set(s.auth);
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('SESSION_REVOKED');
  });

  it('ends a session after 20 minutes of inactivity', async () => {
    const s = await login('meera@hrms.test');
    const session = await prisma.userSession.findFirst({ where: { userId: s.user.id, revokedAt: null }, orderBy: { createdAt: 'desc' } });
    await prisma.userSession.update({ where: { id: session.id }, data: { lastActivityAt: new Date(Date.now() - 21 * 60_000) } });
    const res = await api().get('/api/auth/me').set(s.auth);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('registers a new guest with a loyalty account (AS-1, UD-2)', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'Test Traveller', email: `traveller${Date.now()}@example.com`, password: 'Travel1234' });
    expect(res.status).toBe(201);
    expect(res.body.firstLogin).toBe(true);
    const dup = await api().post('/api/auth/register').send({ name: 'Test Traveller', email: 'guest@hrms.test', password: 'Travel1234' });
    expect(dup.status).toBe(409);
  });
});

describe('2. RBAC (User.Role, UI-4, BR-2, BR-9, SE-5)', () => {
  it('grants each role only its own functions', async () => {
    const manager = await login('manager@hrms.test');
    const finance = await login('finance@hrms.test');
    const admin = await login('admin@hrms.test');
    const reception = await login('reception@hrms.test');
    expect((await api().get('/api/dashboard').set(manager.auth)).status).toBe(200);
    expect((await api().get('/api/payments').set(finance.auth)).status).toBe(200);
    expect((await api().get('/api/admin/users').set(admin.auth)).status).toBe(200);
    expect((await api().get('/api/channels/conflicts').set(reception.auth)).status).toBe(200);
  });

  it('applies permission changes made by the administrator immediately', async () => {
    const admin = await login('admin@hrms.test');
    const finance = await login('finance@hrms.test');
    const role = await prisma.role.findUnique({ where: { roleName: 'Finance Staff' } });
    const perm = await prisma.permission.findUnique({ where: { permissionName: 'payment.read' } });
    await api().put(`/api/admin/roles/${role.id}/permissions/${perm.id}`).set(admin.auth).send({ granted: false }).expect(200);
    expect((await api().get('/api/payments').set(finance.auth)).status).toBe(403);
    await api().put(`/api/admin/roles/${role.id}/permissions/${perm.id}`).set(admin.auth).send({ granted: true }).expect(200);
    expect((await api().get('/api/payments').set(finance.auth)).status).toBe(200);
  });

  it('only the System Administrator can change roles (BR-2) and every change is audited', async () => {
    const admin = await login('admin@hrms.test');
    const target = await prisma.user.findUnique({ where: { email: 'reception2@hrms.test' } });
    const res = await api().patch(`/api/admin/users/${target.id}`).set(admin.auth).send({ role: 'Hotel Manager' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('Hotel Manager');
    const log = await prisma.auditLog.findFirst({ where: { action: 'ROLE_CHANGED', entityId: String(target.id) } });
    expect(log.details).toMatchObject({ from: 'Receptionist', to: 'Hotel Manager' });
    await api().patch(`/api/admin/users/${target.id}`).set(admin.auth).send({ role: 'Receptionist' }).expect(200);
  });
});

describe('16. Authorization failures are enforced by the backend', () => {
  it('rejects requests without a token', async () => {
    const res = await api().get('/api/reservations');
    expect(res.status).toBe(401);
  });

  it('a Guest cannot call administrator, manager or finance endpoints by URL', async () => {
    const guest = await login('guest@hrms.test');
    for (const [method, url] of [['get', '/api/admin/users'], ['get', '/api/admin/audit-logs'], ['get', '/api/dashboard'], ['get', '/api/payments'], ['post', '/api/payments/reconcile'], ['put', '/api/room-types/1/rate'], ['get', '/api/channels/conflicts']]) {
      const res = await api()[method](url).set(guest.auth).send({ baseRate: 1 });
      expect(res.status, `${method.toUpperCase()} ${url}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it("a Guest cannot see another guest's reservation (SE-5 / BR-9)", async () => {
    const guest = await login('guest@hrms.test');
    const other = await prisma.reservation.findFirst({ where: { guest: { user: { email: { not: 'guest@hrms.test' } } } } });
    const res = await api().get(`/api/reservations/${other.id}`).set(guest.auth);
    expect(res.status).toBe(404);
  });

  it('a Receptionist cannot change roles or system settings', async () => {
    const reception = await login('reception@hrms.test');
    expect((await api().patch('/api/admin/users/1').set(reception.auth).send({ role: 'System Administrator' })).status).toBe(403);
    expect((await api().put('/api/admin/settings/taxRatePercent').set(reception.auth).send({ value: 0 })).status).toBe(403);
  });

  it('Finance Staff cannot modify reservations (SRS 2.3)', async () => {
    const finance = await login('finance@hrms.test');
    const r = await prisma.reservation.findFirst({ where: { status: 'CONFIRMED' } });
    expect((await api().post(`/api/reservations/${r.id}/cancel`).set(finance.auth).send({ confirm: true })).status).toBe(403);
  });
});
