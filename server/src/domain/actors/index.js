/**
 * UML actor classes (Exp 3 class diagram) — generalisation hierarchy:
 *
 *            «abstract» User  (userId, name, email, phone, passwordHash, isActive, createdAt;
 *                              login(), logout(), updateProfile())
 *      ┌──────────┬──────────────┬──────────────┬────────────────────┐
 *    Guest   Receptionist   HotelManager   FinanceStaff   SystemAdministrator
 *
 * Each authenticated request gets an actor object (req.actor). Controllers invoke the
 * *class-diagram method* on it, e.g. req.actor.makeReservation(...), and the method
 * delegates to the service that implements the corresponding DFD process. This keeps
 * the documented class operations as the real entry points of the running system.
 */
import * as auth from '../../modules/auth/auth.service.js';
import * as rooms from '../../modules/reservations/room.service.js';
import * as reservations from '../../modules/reservations/reservation.service.js';
import * as access from '../../modules/access/access.service.js';
import * as guests from '../../modules/guests/guest.service.js';
import * as concierge from '../../modules/guest-services/concierge.service.js';
import * as channels from '../../modules/channels/channelSync.service.js';
import * as analytics from '../../modules/reporting/analytics.service.js';
import * as inventory from '../../modules/inventory/inventory.service.js';
import * as finance from '../../modules/finance/finance.service.js';
import * as admin from '../../modules/admin/admin.service.js';
import { ROLES } from '../rbac.js';

/** «abstract» User */
export class User {
  constructor(ctx) {
    if (new.target === User) throw new TypeError('User is abstract');
    this.ctx = ctx;
    this.userId = ctx.id;
    this.name = ctx.name;
    this.email = ctx.email;
    this.phone = ctx.phone;
  }
  // login() is performed by auth.service.login() before an actor exists.
  logout() { return auth.logout(this.ctx); }
  updateProfile(data) { return auth.updateContact(this.ctx, data); }
}

export class Guest extends User {
  get guestId() { return this.ctx.guestId; }
  searchRooms(criteria) { return rooms.searchRooms(criteria, this.ctx.guestPk); }
  viewRoomDetails(roomId) { return rooms.getRoom(roomId); }
  makeReservation(input) { return reservations.createReservation(this.ctx, input); }
  modifyReservation(id, input) { return reservations.modifyReservation(this.ctx, id, input); }
  cancelReservation(id, input) { return reservations.cancelReservation(this.ctx, id, input); }
  viewStayHistory() { return reservations.stayHistory(this.ctx); }
  manageLoyalty() { return guests.getLoyalty(this.ctx); }
  chatWithAIConcierge(input) { return concierge.chat(this.ctx, input); }
  // UC-2 guest services also available to Guest
  completeDigitalCheckIn(id, input) { return access.checkIn(this.ctx, id, input); }
  expressCheckOut(id, input) { return access.checkOut(this.ctx, id, input); }
}

export class Receptionist extends User {
  get employeeId() { return this.ctx.employeeId; }
  createReservation(input) { return reservations.createReservation(this.ctx, input); }
  modifyReservation(id, input) { return reservations.modifyReservation(this.ctx, id, input); }
  cancelReservation(id, input) { return reservations.cancelReservation(this.ctx, id, input); }
  checkInGuest(id, input) { return access.checkIn(this.ctx, id, input); }
  checkOutGuest(id, input) { return access.checkOut(this.ctx, id, input); }
  resolveOTAConflicts(syncId, input) { return channels.resolveConflicts(this.ctx, syncId, input); }
}

export class HotelManager extends User {
  get employeeId() { return this.ctx.employeeId; }
  viewDashboard() { return analytics.dashboard(); }
  viewReports() { return analytics.listReports(this.ctx); }
  manageRates(roomTypeId, input) { return inventory.updateRate(this.ctx, roomTypeId, input); }
  manageInventory(roomId, data) { return inventory.saveRoom(this.ctx, roomId, data); }
  // front-desk style reservation handling granted to managers by default
  createReservation(input) { return reservations.createReservation(this.ctx, input); }
  modifyReservation(id, input) { return reservations.modifyReservation(this.ctx, id, input); }
  cancelReservation(id, input) { return reservations.cancelReservation(this.ctx, id, input); }
}

export class FinanceStaff extends User {
  get employeeId() { return this.ctx.employeeId; }
  verifyPayments(paymentId, input) { return finance.verifyPayment(this.ctx, paymentId, input); }
  reconcileRevenue(input) { return finance.reconcile(this.ctx, input); }
  generateInvoice(invoiceId) { return finance.invoicePdf(this.ctx, invoiceId); }
  viewFinancialReports() { return analytics.listReports(this.ctx); }
}

export class SystemAdministrator extends User {
  get adminId() { return this.ctx.employeeId; }
  manageUsers() { return admin.listUsers(); }
  manageRoles() { return admin.rolesMatrix(); }
  managePermissions(roleId, permissionId, granted) { return admin.setRolePermission(this.ctx, roleId, permissionId, granted); }
  viewAuditLogs(q) { return admin.auditLogs(q); }
  systemSettings() { return admin.listSettings(); }
}

const ACTOR_BY_ROLE = {
  [ROLES.GUEST]: Guest,
  [ROLES.RECEPTIONIST]: Receptionist,
  [ROLES.HOTEL_MANAGER]: HotelManager,
  [ROLES.FINANCE_STAFF]: FinanceStaff,
  [ROLES.SYSTEM_ADMINISTRATOR]: SystemAdministrator,
};

export function createActor(ctx) {
  const Cls = ACTOR_BY_ROLE[ctx.role];
  return Cls ? new Cls(ctx) : null;
}
