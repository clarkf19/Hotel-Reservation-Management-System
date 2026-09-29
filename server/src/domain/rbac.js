/**
 * Role and Permission catalogue (UML: Role, Permission; SRS 4.2 Role-Based Access Control, UI-4, BR-2, BR-9).
 * The five roles are exactly the SRS user classes (SRS 2.3). Permission names are an
 * IMPLEMENTATION DECISION: the documents do not list individual permissions, so they
 * are derived from each role's use cases (Exp 2) and class methods (Exp 3).
 * These defaults are seeded into the roles / permissions / role_permissions tables;
 * the System Administrator can change grants at runtime (UC-4).
 */
export const ROLES = {
  GUEST: 'Guest',
  RECEPTIONIST: 'Receptionist',
  HOTEL_MANAGER: 'Hotel Manager',
  FINANCE_STAFF: 'Finance Staff',
  SYSTEM_ADMINISTRATOR: 'System Administrator',
};

export const PERMISSIONS = {
  // Guest self-service
  'reservation.own': 'Search, create, modify and cancel own reservations (UC-1)',
  'payment.own': 'Pay for own reservations (Reservation.Book.Payment)',
  'checkin.own': 'Online check-in, digital key and express check-out for own stays (UC-2)',
  'profile.own': 'View and update own profile and preferences (Guest.Profile.Manage)',
  'loyalty.own': 'View and redeem own loyalty points (Guest.Rewards.*)',
  'concierge.use': 'Chat with the AI concierge (AI.Query)',
  'service.own': 'Create and track own service requests',
  // Front desk
  'reservation.manage': 'View, create, modify and cancel any reservation (Receptionist)',
  'frontdesk.checkin': 'Check guests in and out at the front desk (Assist Guest Check-in / Check-out)',
  'room.status': 'Update room operational status (room board)',
  'guest.read': 'Look up guest records',
  'channel.conflict.resolve': 'Resolve OTA booking conflicts (Channel.Sync.Conflict)',
  'service.manage': 'Handle service requests and escalated AI queries (AI.Query.Escalate)',
  // Management
  'dashboard.view': 'View operational dashboards (Dashboard.Occupancy)',
  'report.operational': 'Generate occupancy, booking and cancellation reports',
  'report.export': 'Export reports as PDF or CSV (Dashboard.Export)',
  'rate.manage': 'Change room rates and push them to OTAs (Channel.Sync.Rate)',
  'inventory.manage': 'Manage rooms and room types',
  'channel.sync': 'Trigger OTA synchronisation manually',
  // Finance
  'payment.read': 'View all payments',
  'payment.verify': 'Verify payments (FinanceStaff.verifyPayments)',
  'payment.reconcile': 'Reconcile revenue against the gateway (FinanceStaff.reconcileRevenue)',
  'invoice.read': 'View and generate invoices (FinanceStaff.generateInvoice)',
  'report.financial': 'Generate revenue / financial reports (Dashboard.Revenue)',
  // Administration
  'user.manage': 'Create, update and deactivate users (Manage Users)',
  'role.manage': 'Assign roles and permissions (BR-2)',
  'settings.manage': 'Manage system configuration',
  'channel.connect.manage': 'Add, configure or disable OTA connections (Channel.Connect.Manage)',
  'audit.read': 'View audit logs',
  'notification.outbox': 'View the outbound notification log',
};

const FRONT_DESK = ['reservation.manage', 'frontdesk.checkin', 'room.status', 'guest.read', 'channel.conflict.resolve', 'service.manage'];

export const DEFAULT_GRANTS = {
  [ROLES.GUEST]: ['reservation.own', 'payment.own', 'checkin.own', 'profile.own', 'loyalty.own', 'concierge.use', 'service.own'],
  [ROLES.RECEPTIONIST]: FRONT_DESK,
  [ROLES.HOTEL_MANAGER]: ['dashboard.view', 'report.operational', 'report.export', 'report.financial', 'rate.manage', 'inventory.manage', 'channel.sync', 'reservation.manage', 'room.status', 'guest.read'],
  [ROLES.FINANCE_STAFF]: ['payment.read', 'payment.verify', 'payment.reconcile', 'invoice.read', 'report.financial', 'report.export'],
  [ROLES.SYSTEM_ADMINISTRATOR]: ['user.manage', 'role.manage', 'settings.manage', 'channel.connect.manage', 'channel.sync', 'audit.read', 'notification.outbox', 'dashboard.view', 'report.operational', 'report.export'],
};

/** Permissions that must never be removed from the System Administrator (prevents admin lock-out). */
export const PROTECTED_ADMIN_PERMISSIONS = ['user.manage', 'role.manage'];

export const STAFF_ROLES = [ROLES.RECEPTIONIST, ROLES.HOTEL_MANAGER, ROLES.FINANCE_STAFF, ROLES.SYSTEM_ADMINISTRATOR];
