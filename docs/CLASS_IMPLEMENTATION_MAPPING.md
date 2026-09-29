# UML class diagram (Exp 3) → implementation

Every one of the 27 classes and interfaces in the submitted class diagram has a named counterpart in the code. Each class's operations are real methods, called by the running system.

**Kinds:**
- **Actor facade**: the object attached to each authenticated request as `req.actor`. Controllers call the class-diagram method on it.
- **Domain class**: business rules.
- **Entity**: a database table.
- **Integration**: an «interface» realised by a simulated external system.

## Actors — generalisation `Guest / Receptionist / HotelManager / FinanceStaff / SystemAdministrator ──▷ User`

| UML class | Implementation file | Kind | Responsibility | DB entity | APIs | Frontend |
|---|---|---|---|---|---|---|
| **User** «abstract» (login, logout, updateProfile) | `server/src/domain/actors/index.js` (`class User`, abstract); `modules/auth/auth.service.js` | Actor facade + service | Authentication, sessions, contact details | `users`, `user_sessions`, `password_reset_tokens` | `POST /api/auth/login`, `/logout`, `/me`, `/password/*` | Sign in, Profile |
| **Guest** (guestId; searchRooms, viewRoomDetails, makeReservation, modifyReservation, cancelReservation, viewStayHistory, manageLoyalty, chatWithAIConcierge) | `domain/actors/index.js` (`class Guest extends User`) | Actor facade | Guest self-service. Each method delegates to its DFD process service. | `guests` (8-char `guestId`) | `/api/rooms/search`, `/api/reservations*`, `/api/me/*`, `/api/concierge/*` | All `/guest/*` screens |
| **Receptionist** (employeeId; createReservation, modifyReservation, cancelReservation, checkInGuest, checkOutGuest, resolveOTAConflicts) | `domain/actors/index.js` (`class Receptionist extends User`) | Actor facade | Front-desk operations | `staff_members` | `/api/reservations*`, `/check-in`, `/check-out`, `/api/channels/conflicts/:id/resolve` | `/front-desk/*` |
| **HotelManager** (viewDashboard, viewReports, manageRates, manageInventory) | `domain/actors/index.js` | Actor facade | Analytics, rates, inventory | `staff_members` | `/api/dashboard`, `/api/reports`, `/api/room-types/:id/rate`, `/api/rooms` | `/manager/*` |
| **FinanceStaff** (verifyPayments, reconcileRevenue, generateInvoice, viewFinancialReports) | `domain/actors/index.js`; `modules/finance/finance.service.js` | Actor facade + service | Payment verification, reconciliation, invoices | `staff_members` | `/api/payments*`, `/api/invoices*` | `/finance/*` |
| **SystemAdministrator** (adminId; manageUsers, manageRoles, managePermissions, viewAuditLogs, systemSettings) | `domain/actors/index.js`; `modules/admin/admin.service.js` | Actor facade + service | Users, RBAC, configuration, audit | `staff_members` (`employeeId` = adminId) | `/api/admin/*`, `/api/channels` (POST/PATCH) | `/admin/*` |

## Access control

| UML class | Implementation | Kind | DB | Notes |
|---|---|---|---|---|
| **Role** (getPermissions) | `server/src/domain/rbac.js`; `middleware/auth.js` (`authorize`) | Entity + catalogue | `roles` | User 0..\* — assigned to — 1 Role (`users.roleId`) |
| **Permission** (getPermissionName) | `domain/rbac.js` (`PERMISSIONS`) | Entity | `permissions`, `role_permissions` | Role grants 0..\* Permission. Many-to-many join (A-10). |
| **AuditLog** (record) | `server/src/domain/AuditLog.js` (`AuditLog.record()`) | Domain class + entity | `audit_logs` | User 1 — creates — 0..\* AuditLog (`performedBy`). SE-6. |

## Guest preferences & loyalty

| UML class | Implementation | Kind | DB | APIs / screen |
|---|---|---|---|---|
| **GuestProfile** (updatePreferences) | `modules/guests/guest.service.js` (`updateProfile`) | Entity + service | `guest_profiles` (Guest 1 : 0..1) | `PUT /api/me/profile` · Profile |
| **LoyaltyAccount** (accruePoints, redeemPoints, getBalance) | `server/src/domain/LoyaltyAccount.js` | Domain class + entity | `loyalty_accounts` (Guest 1 : 0..1), `loyalty_transactions` (Fig. 4 entity) | `GET /api/me/loyalty`, points redeemed in `POST /api/reservations`, accrued at check-out · Loyalty |

## Rooms, reservations and payments

| UML class | Implementation | Kind | DB | APIs / screen |
|---|---|---|---|---|
| **RoomType** (getBaseRate) | `server/src/domain/RoomType.js` | Domain class + entity | `room_types` | `GET /api/rooms/types`, `PUT /api/room-types/:id/rate` · Landing, Rates |
| **Room** (isAvailable, updateStatus) | `server/src/domain/Room.js` | Domain class + entity | `rooms` (RoomType 1 : 0..\* Room) | `GET /api/rooms/search`, `PATCH /api/rooms/:id/status` · Search, Room board |
| **Reservation** (checkAvailability, calculateAmount, confirm, modify, cancel) | `server/src/domain/Reservation.js` + `modules/reservations/reservation.service.js` | Domain class (state machine) + entity | `reservations` (Guest 1 : 0..\*; Room 1 : 0..\*) + **exclusion constraint** | `/api/reservations*` · Booking, Reservations |
| **Payment** (initiate, verify, refund) | `server/src/domain/Payment.js` | Domain class + entity | `payments` (Reservation 1 : 0..\*) | `POST /api/reservations/:id/pay`, `/check-out`, `/api/payments*` · Booking, Check-out, Finance |
| **Invoice** (generatePDF) | `server/src/domain/Invoice.js` (+ `lib/pdf.js`) | Domain class + entity | `invoices` (Reservation 1 : 0..1) | `GET /api/invoices/:id/pdf` · Check-out, Finance → Invoices |
| **DigitalKey** (issueKey, verifyKey, revokeKey) | `server/src/domain/DigitalKey.js` | Domain class + entity | `digital_keys` (Reservation 1 : 0..1), `room_access_logs` (D5) | `/check-in`, `/digital-key`, `/api/access/unlock` · Digital key |

## Channel synchronisation

| UML class | Implementation | Kind | DB | APIs / screen |
|---|---|---|---|---|
| **OTAChannel** (connect, disconnect, updateInventory, updateRates) | `modules/channels/channelSync.service.js` (`pushAvailabilityToAll`, `saveChannel`) | Entity + service | `ota_channels` | `GET/POST/PATCH /api/channels` · Channel manager, Admin → OTA connections |
| **ChannelSync** (syncReservations, detectConflicts, resolveConflicts) | `modules/channels/channelSync.service.js` | Service + entity | `channel_syncs` (OTAChannel 1 : 0..\*; Reservation 1 : 0..\*). Conflicts are rows with `syncStatus = CONFLICT`. | `POST /api/channels/sync`, `/api/channels/conflicts*` · OTA conflicts |

## Reporting and concierge

| UML class | Implementation | Kind | DB | APIs / screen |
|---|---|---|---|---|
| **Report** (generate, exportPDF, exportCSV) | `server/src/domain/Report.js` + `modules/reporting/analytics.service.js` | Domain class + entity | `reports` (D7) | `POST /api/reports`, `GET /api/reports/:id/export` · Reports |
| **AIConversation** (addMessage) | `modules/guest-services/concierge.service.js` (`chat`) | Entity + service | `ai_conversations` (Guest 1 : 0..\*) | `POST /api/concierge/messages` · AI Concierge |

## «interface» classes (external actors) — simulated integrations

| UML interface | Implementation | Methods implemented | What it simulates |
|---|---|---|---|
| **AIConciergeService** (handleQuery) | `integrations/AIConciergeService.js`: `KnowledgeBaseConcierge`, `ClaudeConcierge` | `handleQuery(query)` | The knowledge-base NLP. Uses a real Claude model only when `ANTHROPIC_API_KEY` is set. |
| **PaymentGateway** (authorize, capture, refund) | `integrations/PaymentGateway.js`: `MockPaymentGateway` | `authorize(amount)`, `capture(txnId)`, `refund(txnId)`, plus `validateDetails`, `getSettlementReport` | A sandbox PSP with a ledger file; test cards for approve, decline and timeout |
| **CurrencyExchangeRateService** (getExchangeRate) | `integrations/CurrencyExchangeRateService.js` | `getExchangeRate(currency)`, cached ≤ 24 h | A rates provider |
| **NotificationService** (sendEmail, sendSMS, sendPush) | `integrations/NotificationService.js` | `sendEmail`, `sendSMS`, `sendPush` (+ `sendInApp`) | Writes to the `notifications` outbox |
| **SmartLockController** (unlock) | `integrations/SmartLockController.js`: `SimulatedSmartLockController` | `unlock(keyCode)` | A door lock with auto re-lock |
| **OTAPlatform** (pushAvailability, pullBookings, updateBookingStatus, getBookingDetails) | `integrations/ota/OTAPlatform.js`: `MockOTAPlatform` | All four | Partner OTA platforms A, B and C, with their own booking store (`mock_ota_bookings`) |

## Dependencies («uses»)

The dependency arrows in the diagram are realised as imports:
- Payment → PaymentGateway, CurrencyExchangeRateService (`Payment.js`)
- ChannelSync → OTAPlatform (`channelSync.service.js`)
- DigitalKey → SmartLockController (`access.service.js` wires the key registry into the lock)
- AIConversation → AIConciergeService (`concierge.service.js`)
- Reservation → NotificationService (`reservation.service.js`)

## Classes added in the implementation (not in the class diagram)

These are all supporting tables. None adds a new behavioural class.

| Addition | Why |
|---|---|
| `StaffMember` table | Holds `employeeId` / `adminId` for the four staff subclasses |
| `UserSession`, `PasswordResetToken` | User.Logout, User.Session.Timeout, User.Password.Reset |
| `LoyaltyTransaction` | SRS Figure 4 entity "Loyalty Transaction" |
| `RoomAccessLog` | DFD data store D5 "Room Access Logs" |
| `ServiceRequest` | DFD data store D6 "Service Requests" |
| `FaqEntry` | "Maintained knowledge base" (AI.FAQ.Answer) |
| `ExchangeRate` | Cache required by SI-5.1 |
| `SystemSetting` | `SystemAdministrator.systemSettings()` |
| `Notification` | Outbox of NotificationService |
| `MockOtaBooking` | The *external* OTA's data (simulation only) |
