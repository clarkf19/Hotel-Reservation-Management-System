/**
 * Requirement-level traceability matrix (every functional requirement tag of SRS Section 4).
 * Mirrors TRACEABILITY.md at the repository root.
 */
export const REQUIREMENTS = [
  // 4.1
  ['4.1', 'Reservation.Search', 'Search Available Rooms', 'Guest.searchRooms(), Room.isAvailable()', 'SD-1 1-2', 'Search Available Rooms → Check Room Availability', '2.1', 'GET /api/rooms/search', 'rooms, reservations', 'Book a stay'],
  ['4.1', 'Reservation.Search.Filter', '«include» Filter Search Results', 'Guest.searchRooms()', '—', 'Search Available Rooms', '2.1', 'GET /api/rooms/search?category&minPrice&maxPrice&accessible', 'rooms, room_types', 'Book a stay (filters)'],
  ['4.1', 'Reservation.Allocate.Smart', '«include» Recommend Best-Fit Room', 'GuestProfile, Room', '—', 'Perform Smart Room Allocation', '2.1 → 2.2', 'GET /api/rooms/search (recommendation)', 'guest_profiles', 'Book a stay ("Best match")'],
  ['4.1', 'Reservation.Book', 'Make Reservation', 'Guest.makeReservation(), Reservation', 'SD-1 3-6', 'Select Room → Lock Room Inventory', '2.2, 2.3', 'POST /api/reservations', 'reservations', 'Booking page'],
  ['4.1', 'Reservation.Book.Payment', '«include» Verify Payment', 'Payment.initiate()/verify(), PaymentGateway.authorize()', 'SD-1 7-11', 'Verify Payment → ◇ Payment Successful?', '3.1, 3.2', 'POST /api/reservations/:id/pay', 'payments', 'Booking page (payment)'],
  ['4.1', 'Reservation.Book.Confirm', '«include» Generate Reservation Number', 'Reservation.confirm()', 'SD-1 12', 'Confirm Reservation', '3.3', 'POST /api/reservations/:id/pay', 'reservations (reservation_number_seq)', 'Confirmation screen'],
  ['4.1', 'Reservation.Modify', 'Modify Reservation', 'Guest.modifyReservation(), Reservation.modify()', '—', 'Manage Reservations (View / Modify)', '2.0', 'PATCH /api/reservations/:id', 'reservations, payments', 'Reservation detail → Modify'],
  ['4.1', 'Reservation.Cancel', 'Cancel Reservation', 'Guest.cancelReservation(), Reservation.cancel(), Payment.refund()', '—', '—', '2.0', 'POST /api/reservations/:id/cancel', 'reservations, payments', 'Reservation detail → Cancel'],
  ['4.1', 'Reservation.Cancel.Confirm', '«include» Confirm Cancellation', 'Reservation.cancel()', '—', '—', '2.0', 'GET /api/reservations/:id/cancellation-terms', '—', 'Cancellation dialog'],
  ['4.1', 'Reservation.Status.Update', '—', 'Reservation (state machine)', '—', 'all reservation nodes', 'D3', 'all reservation endpoints + scheduler', 'reservations.status', 'Status badges / timeline'],
  ['4.1', 'Reservation.Prevent.DoubleBooking', 'Make Reservation (NFR reliability)', 'Room.isAvailable(), Reservation.checkAvailability()', 'SD-1 4-5', 'Check Room Availability', 'D2/D3', 'POST /api/reservations', 'EXCLUDE constraint reservations_no_double_booking', 'Error toast "room just booked"'],
  // 4.2
  ['4.2', 'User.Login', 'UC-4 step 5', 'User.login()', '—', 'Login to HRMS → ◇ Valid Credentials?', '1.0', 'POST /api/auth/login', 'users, user_sessions', 'Sign in'],
  ['4.2', 'User.Login.Lockout', 'UC-4 step 5', 'User', '—', '◇ Valid Credentials?', '1.0', 'POST /api/auth/login (423)', 'users.lockedUntil', 'Sign in (locked message)'],
  ['4.2', 'User.Password.Reset', 'UC-4 step 5', 'User', '—', '—', '1.0', 'POST /api/auth/password/forgot|reset', 'password_reset_tokens', 'Forgot / reset password'],
  ['4.2', 'User.Role', 'UC-4 step 3', 'Role, Permission', '—', 'Identify User Role and Permissions', '1.0', 'authorize() middleware on every route', 'roles, role_permissions', 'Role-specific navigation'],
  ['4.2', 'User.Role.Assign', 'Manage Roles & Permissions', 'SystemAdministrator.manageRoles()', '—', 'Manage Roles and Permissions', '6.0', 'PATCH /api/admin/users/:id, PUT /api/admin/roles/...', 'users.roleId, role_permissions', 'Admin → Users, Roles'],
  ['4.2', 'User.Logout', 'UC-4 step 5', 'User.logout()', '—', '—', '1.0', 'POST /api/auth/logout', 'user_sessions.revokedAt', 'Log out button'],
  ['4.2', 'User.Session.Timeout', 'UC-4 step 5', 'User', '—', '—', '1.0', 'authenticate() middleware', 'user_sessions.lastActivityAt', 'Session-expired toast'],
  // 4.3
  ['4.3', 'Channel.Sync.Inventory', 'Sync Room Inventory', 'OTAChannel.updateInventory(), OTAPlatform.pushAvailability()', 'SD-3 8-9', 'Update Availability / Rates / Status', 'L0 OTA flows', 'scheduler + POST /api/channels/sync', 'channel_syncs', 'Channel manager'],
  ['4.3', 'Channel.Sync.Rate', 'Sync Rate Updates / Manage Channels & Rates', 'HotelManager.manageRates(), OTAChannel.updateRates()', '—', 'Manage Room Rates', 'L0 OTA flows', 'PUT /api/room-types/:id/rate', 'room_types, channel_syncs', 'Rates & inventory'],
  ['4.3', 'Channel.Sync.Status', 'Sync Booking Status', 'ChannelSync.syncReservations(), OTAPlatform.pullBookings()/updateBookingStatus()', 'SD-3 1-6', 'Pull OTA Bookings → Update OTA Booking Status', 'L0 OTA flows', 'POST /api/channels/sync', 'reservations (source OTA), channel_syncs', 'Channel manager'],
  ['4.3', 'Channel.Sync.Conflict', 'Resolve Booking Sync Conflict', 'ChannelSync.detectConflicts()/resolveConflicts(), Receptionist.resolveOTAConflicts()', 'SD-3 4, 7 (alt)', 'Detect Booking Conflicts → ◇ Conflict Detected? → Handle OTA Conflicts', '—', 'GET/POST /api/channels/conflicts…', 'channel_syncs (CONFLICT)', 'OTA conflicts'],
  ['4.3', 'Channel.Connect.Manage', 'Manage OTA Connections', 'SystemAdministrator, OTAChannel.connect()/disconnect()', '—', 'Manage OTA Connections', '6.0', 'POST/PATCH /api/channels', 'ota_channels', 'Admin → OTA connections'],
  // 4.4
  ['4.4', 'AI.Query', 'Chat with AI Concierge', 'Guest.chatWithAIConcierge(), AIConversation, AIConciergeService.handleQuery()', '—', 'Chat with AI Concierge → Process NLP Request', '5.0', 'POST /api/concierge/messages', 'ai_conversations', 'AI Concierge'],
  ['4.4', 'AI.Booking', 'Chat with AI Concierge', 'AIConciergeService, Guest.searchRooms()', 'SD-1 (source AI_CONCIERGE)', 'Provide FAQ / Booking Assistance', '5.0 → 2.0', 'POST /api/concierge/messages', 'reservations.source', 'AI Concierge (room cards)'],
  ['4.4', 'AI.FAQ.Answer', 'Chat with AI Concierge', 'AIConciergeService (knowledge base)', '—', 'Provide FAQ / Booking Assistance, Provide Local Recommendations', '5.0', 'POST /api/concierge/messages', 'faq_entries', 'AI Concierge'],
  ['4.4', 'AI.Query.Escalate', '«extend» Handle Escalated AI Query', 'Receptionist', '—', '◇ Request Resolved? → Escalate to Receptionist', '5.0 → D6', 'POST /api/concierge/messages, PATCH /api/service-requests/:id', 'service_requests.isEscalation', 'Service desk'],
  // 4.5
  ['4.5', 'Guest.Profile.Manage', 'Manage Profile & Preferences', 'User.updateProfile(), GuestProfile.updatePreferences()', '—', 'Update Guest Profile & Loyalty Account', '1.0', 'PUT /api/me/profile', 'guest_profiles', 'Profile'],
  ['4.5', 'Guest.Profile.History', 'View Stay History', 'Guest.viewStayHistory()', '—', '—', '1.0 / D3', 'GET /api/me/stay-history', 'reservations', 'Profile → Stay history'],
  ['4.5', 'Guest.Rewards.Accrue', 'Manage Loyalty Rewards', 'LoyaltyAccount.accruePoints()', '—', '(after check-out, BR-6)', '4.0', 'POST /api/reservations/:id/check-out', 'loyalty_accounts, loyalty_transactions', 'Loyalty'],
  ['4.5', 'Guest.Rewards.Redeem', 'Manage Loyalty Rewards', 'LoyaltyAccount.redeemPoints()', '—', '—', '2.0', 'POST /api/reservations (redeemPoints)', 'loyalty_transactions', 'Booking page (redeem)'],
  // 4.6
  ['4.6', 'CheckIn.Online', 'Online Check-in', 'Guest, Reservation, Receptionist.checkInGuest()', 'SD-2 1-3', 'Verify Check-In Eligibility → ◇ Check-In Allowed?', '4.0', 'POST /api/reservations/:id/check-in', 'reservations', 'Digital check-in'],
  ['4.6', 'CheckIn.Verify.Identity', '«include» Verify Guest Identity', '—', 'SD-2 "verify Guest identity"', 'Verify Identity', '4.0', 'POST /api/reservations/:id/check-in', 'reservations.identityDocument', 'Digital check-in (step 2)'],
  ['4.6', 'Room.Access.Issue', '«include» Issue Digital Key', 'DigitalKey.issueKey()', 'SD-2 4-6', 'Issue Time-Bound Digital Key', '4.0', 'POST /api/reservations/:id/check-in', 'digital_keys', 'Digital key'],
  ['4.6', 'Room.Access.Revoke', 'Express Check-out', 'DigitalKey.revokeKey()', '—', 'Revoke Digital Key', '4.0', 'check-out + scheduler', 'digital_keys.status', 'Digital key (revoked)'],
  ['4.6', 'Payment.Contactless.Process', '«include» Process Contactless Payment', 'Payment, PaymentGateway', '—', 'Process Final Payment', '3.0', 'POST /api/reservations/:id/check-out', 'payments (FINAL_SETTLEMENT)', 'Express check-out'],
  ['4.6', 'CheckOut.Express', 'Express Check-out', 'Receptionist.checkOutGuest()', '—', 'Initiate Express Check-Out → Calculate Final Charges', '4.0', 'POST /api/reservations/:id/check-out', 'reservations', 'Express check-out'],
  ['4.6', 'Invoice.Generate', 'Send Invoice', 'Invoice.generatePDF(), NotificationService.sendEmail()', '—', 'Generate Invoice → Send Invoice', '4.0 / D4', 'GET /api/invoices/:id/pdf', 'invoices', 'Invoice download'],
  // 4.7
  ['4.7', 'Dashboard.Occupancy', 'View Occupancy Dashboard', 'HotelManager.viewDashboard()', '—', 'View Occupancy', '6.0 / D7', 'GET /api/dashboard', 'reservations, rooms', 'Manager dashboard'],
  ['4.7', 'Dashboard.Revenue', 'View Revenue Dashboard', 'Report.generate()', '—', 'View Revenue Summary', '6.0 / D7', 'POST /api/reports {revenue}', 'payments, reports', 'Reports'],
  ['4.7', 'Dashboard.Cancellations', 'View Cancellation Analytics', 'Report.generate()', '—', 'View Cancellation Statistics', '6.0 / D7', 'POST /api/reports {cancellations}', 'reservations, reports', 'Reports'],
  ['4.7', 'Dashboard.Export', 'Export Report', 'Report.exportPDF()/exportCSV()', '—', 'Export Report (PDF / CSV)', '6.0 / D7', 'GET /api/reports/:id/export', 'reports', 'Reports → Export'],
];

export const REQ_COLUMNS = ['Section', 'Requirement', 'Use case', 'Class', 'Sequence', 'Activity', 'DFD', 'API', 'Database', 'Screen'];
