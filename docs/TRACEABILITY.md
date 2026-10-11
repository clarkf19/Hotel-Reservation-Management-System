# Traceability — Hotel Reservation Management System (Release 1.0)

This document traces the submitted documentation through to the working application:

**SRS → Use case → Class → Sequence → Activity → DFD → API → Database → Frontend → Status**

**Document keys:**
- **SRS**: Exp 1/2 SRS
- **UC**: Exp 2 use case diagram and descriptions
- **Class**: Exp 3 class diagram
- **SD / CD**: Exp 4 sequence and collaboration diagrams
- **Activity**: Exp 5 activity diagram
- **DFD**: Exp 6 data flow diagrams
- **WBS**: Exp 7

**Status meanings:**
- **TESTED**: covered by the automated suite (`server/tests`, 68 tests).
- **IMPLEMENTED**: working in the application and checked by hand.

Where the documents disagree, the reading that was chosen is recorded in [`docs/ASSUMPTIONS.md`](ASSUMPTIONS.md) (D-1 … D-14).

In the application itself:
- Turn on **Viva mode** to see this mapping on every screen.
- Open **Traceability** in the sidebar for the filterable matrix.

---

## Feature traceability

### F1 · Role-Based Access Control (SRS 4.2)

| Layer | Trace |
|---|---|
| **SRS** | User.Login, User.Login.Lockout, User.Password.Reset, User.Role, User.Role.Assign, User.Logout, User.Session.Timeout; UI-4, UI-5, SE-2, SE-3, SE-5, BR-2, BR-9 |
| **Use case** | UC-4 Manage Users & Access Control; Manage Users; Manage Roles & Permissions |
| **Classes** | User (login, logout, updateProfile) and its 5 specialisations; Role; Permission; AuditLog |
| **Sequence** | — (no diagram) |
| **Activity** | Login to HRMS → ◇ Valid Credentials? → Identify User Role and Permissions; System Administrator lane |
| **DFD** | 1.0 User Authentication & Profile Management; D1 User Data; 6.0 (user management) |
| **API** | `POST /api/auth/login`, `/mfa/verify`, `/logout`, `/register`, `/password/forgot`, `/password/reset`; `GET/POST/PATCH /api/admin/users`; `GET /api/admin/roles`; `PUT /api/admin/roles/:rid/permissions/:pid` |
| **Database** | `users`, `roles`, `permissions`, `role_permissions`, `user_sessions`, `password_reset_tokens`, `audit_logs` |
| **Backend** | `middleware/auth.js` (authenticate + authorize on **every** route), `modules/auth`, `modules/admin`, `domain/rbac.js`, `domain/actors` |
| **Frontend** | Sign in (one-click demo accounts), Register, Forgot/Reset password, role-specific navigation, Admin → Users, Roles & permissions |
| **WBS** | 1.4.1 User Authentication & Profile; 1.4.6 Reporting & Administration |
| **Status** | **TESTED**: login, lockout, logout, idle timeout, registration, RBAC, runtime permission change, BR-2, forbidden URLs, SE-5 |

### F2 · Reservation and Smart Room Allocation (SRS 4.1)

| Layer | Trace |
|---|---|
| **SRS** | Reservation.Search, .Search.Filter, .Allocate.Smart, .Book, .Book.Payment, .Book.Confirm, .Modify, .Cancel, .Cancel.Confirm, .Status.Update, .Prevent.DoubleBooking; BR-1, BR-3, BR-4, BR-5, BR-8; PE-3; SE-4 |
| **Use case** | UC-1 Manage Reservations; Search Available Rooms (+ «include» Filter Search Results, Recommend Best-Fit Room); Make Reservation (+ «include» Verify Payment, Generate Reservation Number); Modify Reservation; Cancel Reservation (+ «include» Confirm Cancellation) |
| **Classes** | Guest (searchRooms, viewRoomDetails, makeReservation, modifyReservation, cancelReservation); Receptionist.createReservation; Room (isAvailable, updateStatus); RoomType.getBaseRate; Reservation (checkAvailability, calculateAmount, confirm, modify, cancel); Payment (initiate, verify, refund); PaymentGateway; CurrencyExchangeRateService; NotificationService; ChannelSync |
| **Sequence** | **SD-1 / CD-1 Making Room Reservation**, all messages ([mapping](SEQUENCE_IMPLEMENTATION_MAPPING.md)) |
| **Activity** | Search Available Rooms → Check Room Availability → ◇ Rooms Available? (No: Suggest Alternative Dates / Categories; Yes: Perform Smart Room Allocation) → Select Room → Provide Payment Details → Lock Room Inventory → Verify Payment → ◇ Payment Successful? (No: Release Inventory Lock; Yes: Confirm Reservation) → **FORK** (Update Guest Profile & Loyalty ‖ Record Booking & Update Inventory ‖ Sync Booking Status to OTA) + Send Booking Confirmation → **JOIN** |
| **DFD** | 2.1 Check Room Availability, 2.2 Select Room / Temporary Reservation, 2.3 Create Reservation, 3.1 Validate Payment Details, 3.2 Process Payment, 3.3 Update Reservation; D2, D3, D4 |
| **API** | `GET /api/rooms/search`, `GET /api/rooms/:id`, `POST /api/reservations`, `POST /api/reservations/:id/pay`, `PATCH /api/reservations/:id`, `GET /api/reservations/:id/cancellation-terms`, `POST /api/reservations/:id/cancel` |
| **Database** | `rooms`, `room_types`, `reservations` (**EXCLUDE constraint `reservations_no_double_booking`**, sequence `reservation_number_seq`), `payments`, `loyalty_transactions` |
| **Frontend** | Book a stay (search, filters, smart ranking with reasons, alternatives), Booking (hold countdown, loyalty redemption, payment, confirmation), My reservations, Reservation detail (modify / cancel with BR-8 preview), Front desk → New reservation |
| **WBS** | 1.4.2 Room Search & Reservation; 1.4.3 Payment Processing |
| **Status** | **TESTED**: availability, filters, smart ranking, double booking (sequential, concurrent and database-level), creation, SD-1 message order, payment success, decline, timeout, retry, cancellation (free and within 48 h), modification |

### F3 · Multi-Channel Booking Synchronization (SRS 4.3)

| Layer | Trace |
|---|---|
| **SRS** | Channel.Sync.Inventory, .Sync.Rate, .Sync.Status, .Sync.Conflict, .Connect.Manage; BR-10; SI-2.1, SI-2.2; CO-2, CO-4; DE-1 |
| **Use case** | Sync Room Inventory, Sync Rate Updates, Sync Booking Status (OTA actor); Resolve Booking Sync Conflict (Receptionist); Manage OTA Connections (Admin); Manage Channels & Rates (Manager); UC-1 step 7 and its exception |
| **Classes** | OTAChannel (connect, disconnect, updateInventory, updateRates); ChannelSync (syncReservations, detectConflicts, resolveConflicts); «interface» OTAPlatform; Receptionist.resolveOTAConflicts |
| **Sequence** | **SD-3 / CD-3 OTA Booking Synchronization + Conflict Resolution**, both alt branches (decision D-4) |
| **Activity** | OTA lane: Update Availability / Rates / Status ‖ Pull OTA Bookings → Detect Booking Conflicts → ◇ Conflict Detected? (Yes: Receptionist "Handle OTA Conflicts"; No: Update OTA Booking Status) |
| **DFD** | Level 0 OTA / Channel Manager ↔ HRMS (decision D-13) |
| **API** | `POST /api/channels/sync`, `GET /api/channels`, `GET /api/channels/conflicts`, `GET /api/channels/conflicts/:id/options`, `POST /api/channels/conflicts/:id/resolve`, `POST /api/channels/:id/simulate`, `POST/PATCH /api/channels` |
| **Database** | `ota_channels`, `channel_syncs`, `reservations` (`source = OTA`, `externalRef`), `mock_ota_bookings` (the simulated OTA's own store) |
| **Frontend** | Front desk / Manager → Channel manager (channel cards, side-by-side conflict comparison, 3 resolution strategies, OTA-side view, sync log, OTA website simulator); Admin → OTA connections; Manager → Rates (rate push) |
| **Background** | Scheduler syncs every 30 s (≤ 60 s requirement) |
| **WBS** | No dedicated work package (A-20); implemented alongside 1.4.2 |
| **Status** | **TESTED**: import, OTA-side cancellation, OTA outage, conflict detection, no re-flagging, REASSIGN_ROOM, REJECT, guest forbidden |

### F4 · AI Virtual Concierge (SRS 4.4)

| Layer | Trace |
|---|---|
| **SRS** | AI.Query, AI.Booking, AI.FAQ.Answer, AI.Query.Escalate; SI-3.1 |
| **Use case** | Chat with AI Concierge; «extend» Handle Escalated AI Query (Receptionist); UC-2 step 3 |
| **Classes** | Guest.chatWithAIConcierge; AIConversation.addMessage; «interface» AIConciergeService.handleQuery |
| **Activity** | Chat with AI Concierge (FAQs / Requests) → ◇ Need Additional Services? → Submit Service Request; Process Concierge Request → Process Natural-Language Request (NLP) → Provide FAQ / Booking Assistance ‖ Provide Local Recommendations → ◇ Request Resolved? → Escalate to Receptionist → Handle Escalated Guest Request |
| **DFD** | 5.0 Guest Services (Concierge); D6 Service Requests |
| **API** | `POST /api/concierge/messages`, `GET /api/concierge`, `GET /api/concierge/history`, `GET/POST/PATCH /api/service-requests` |
| **Database** | `ai_conversations`, `faq_entries`, `service_requests` |
| **Frontend** | AI Concierge chat (source badge on every reply, room cards for booking help), Service requests, Front desk → Service desk (AI escalations) |
| **WBS** | 1.4.5 Guest Services / Concierge |
| **Status** | **TESTED**: FAQ, service request intent, booking assistance, escalation and reply, date parser |

### F5 · Guest Preference and Loyalty Management (SRS 4.5)

| Layer | Trace |
|---|---|
| **SRS** | Guest.Profile.Manage, Guest.Profile.History, Guest.Rewards.Accrue, Guest.Rewards.Redeem; BR-6; OR-3 |
| **Use case** | Manage Profile & Preferences, View Stay History, Manage Loyalty Rewards |
| **Classes** | GuestProfile.updatePreferences; LoyaltyAccount (accruePoints, redeemPoints, getBalance); Guest.viewStayHistory, manageLoyalty |
| **Activity** | Update Guest Profile & Loyalty Account (fork branch; decision D-6) |
| **DFD** | 1.0; D1 |
| **API** | `GET/PUT /api/me/profile`, `GET /api/me/loyalty`, `GET /api/me/stay-history`, `GET /api/me/export` |
| **Database** | `guest_profiles`, `loyalty_accounts`, `loyalty_transactions` |
| **Frontend** | Profile & preferences (these feed smart allocation), Loyalty (tier card, progress, history), redemption on the Booking page |
| **WBS** | 1.4.1 |
| **Status** | **TESTED**: points only after check-out, none at booking time, tiers, redemption limit |

### F6 · Digital Check-in and Contactless Services (SRS 4.6)

| Layer | Trace |
|---|---|
| **SRS** | CheckIn.Online, CheckIn.Verify.Identity, Room.Access.Issue, Room.Access.Revoke, Payment.Contactless.Process, CheckOut.Express, Invoice.Generate; BR-7; HI-1, HI-3; 5.2 Safety |
| **Use case** | Online Check-in (+ «include» Verify Guest Identity, Issue Digital Key); Express Check-out (+ «include» Process Contactless Payment); Assist Guest Check-in / Check-out; Send Invoice; UC-2 steps 4-6 |
| **Classes** | DigitalKey (issueKey, verifyKey, revokeKey); «interface» SmartLockController.unlock; Receptionist (checkInGuest, checkOutGuest); Payment; Invoice.generatePDF; LoyaltyAccount.accruePoints |
| **Sequence** | **SD-2 / CD-2 Digital Check-in + Digital Room Key**, messages 1-10 and the alt branch |
| **Activity** | Complete Digital Check-In → Verify Identity → Verify Check-In Eligibility → ◇ Check-In Allowed? → Issue Time-Bound Digital Key → Present Digital Key → (Smart Lock) Validate Digital Key → ◇ Key Valid? → Unlock Room / Deny Access; Initiate Express Check-Out → Calculate Final Charges → Process Final Payment → ◇ Payment Successful? (No: retry) → Revoke Digital Key → Generate Invoice → Send Invoice / Checkout Confirmation → Receive Invoice |
| **DFD** | 4.0 Check-in / Check-out & Access Management; D5 Room Access Logs; 3.0 (final payment) |
| **API** | `POST /api/reservations/:id/check-in`, `GET /api/reservations/:id/digital-key`, `POST /api/access/unlock`, `GET /api/reservations/:id/checkout-summary`, `POST /api/reservations/:id/check-out`, `POST …/digital-key/revoke\|reissue`, `GET /api/invoices/:id/pdf` |
| **Database** | `digital_keys`, `room_access_logs`, `payments` (FINAL_SETTLEMENT), `invoices` |
| **Frontend** | Digital check-in wizard, Digital key (QR / NFC card, animated smart-lock door simulator, access log), Express check-out, front-desk check-in/out, key revoke / re-issue |
| **Background** | Expired keys are marked EXPIRED every minute (Room.Access.Revoke) |
| **WBS** | 1.4.4 Check-in / Check-out & Access |
| **Status** | **TESTED**: check-in rejected before date, invalid ID, successful check-in and message order, key generation, unlock own room, wrong room, forged key, expired key, background expiry, full check-out with a declined-then-approved final payment, key revoked, invoice PDF, loyalty accrual |

### F7 · Analytics and Operational Dashboard (SRS 4.7)

| Layer | Trace |
|---|---|
| **SRS** | Dashboard.Occupancy, Dashboard.Revenue, Dashboard.Cancellations, Dashboard.Export; 4.7.2 booking-trend widgets |
| **Use case** | View Occupancy Dashboard, View Revenue Dashboard, View Cancellation Analytics, Export Report, Generate Financial / Revenue Report, Verify & Reconcile Payments; UC-3 |
| **Classes** | HotelManager (viewDashboard, viewReports); FinanceStaff (verifyPayments, reconcileRevenue, generateInvoice, viewFinancialReports); Report (generate, exportPDF, exportCSV) |
| **Activity** | Hotel Manager lane: View Operational Dashboard → View Occupancy → View Booking Trends → View Revenue Summary → View Cancellation Statistics → Generate Report → Export Report → Manage Room Rates → Manage Room Inventory. Finance lane: Verify Payments → Reconcile Revenue → Generate Financial Reports → Export Report |
| **DFD** | 6.0 Reporting & Administration; D7 Reports & Analytics; D4 (reconciliation) |
| **API** | `GET /api/dashboard`, `POST /api/reports`, `GET /api/reports`, `GET /api/reports/:id/export?format=pdf\|csv`, `GET /api/payments`, `POST /api/payments/:id/verify`, `POST /api/payments/reconcile`, `GET /api/invoices` |
| **Database** | `reports`, `reservations`, `payments`, `rooms`, `invoices` |
| **Frontend** | Manager dashboard (8 KPIs, 6 live charts), Reports (4 report types, PDF/CSV), Rates & inventory, Finance → Payments / Reconciliation / Invoices / Financial reports |
| **WBS** | 1.4.6 Reporting & Administration |
| **Status** | **TESTED**: dashboard computed from the database, revenue report with CSV and PDF, reconciliation exceptions, finance-only report permission |

### Cross-cutting requirements

| Requirement | Implementation | Status |
|---|---|---|
| BR-1 exactly one holder | `reservations.guestId` NOT NULL; receptionist must select a guest | IMPLEMENTED |
| BR-3 / DoubleBooking | App check + PostgreSQL `EXCLUDE USING gist (roomId =, daterange &&)` | TESTED (concurrent) |
| BR-4 base currency | All amounts stored in INR; `Payment.originalAmount/Currency/exchangeRate` for foreign payers | IMPLEMENTED |
| BR-5 confirm after payment | `Reservation.confirm()` is only reachable after `Payment.process()` succeeds; CHECK constraint requires a number when confirmed | TESTED |
| BR-7 no early check-in | `checkInEligibility()` | TESTED |
| BR-8 cancellation fee | `Reservation.cancellationTerms()` | TESTED |
| BR-9 / SE-5 own data only | `loadReservationFor()` returns 404 for other guests' data | TESTED |
| SE-4 no raw card data | Gateway receives the number in memory only; DB stores brand + last 4 | TESTED |
| SE-6 audit of bookings/payments | `AuditLog.record()` in every booking and payment path | TESTED |
| CI-1/2/3 communications | NotificationService: confirmation (e-mail+SMS), payment problem (push), check-in reminder (scheduler) | IMPLEMENTED |
| CI-4 TLS | Local development runs over HTTP; production must use HTTPS (deployment concern) | NOT IN SCOPE LOCALLY |
| SI-5.1 FX ≤ 24 h | `CurrencyExchangeRateService` cache + daily refresh job | IMPLEMENTED |
| UD-1 help centre | `/help`, searchable | IMPLEMENTED |
| UD-2 first-run walkthrough | Guest home onboarding modal | IMPLEMENTED |
| UI-4 role-based UI | Role-specific navigation and route guards (server enforces) | IMPLEMENTED |
| UI-5 Help & Logout on all pages | App shell top bar | IMPLEMENTED |
| 5.4 Robustness (recoverable draft) | Failed payment or expired hold → `DRAFT`, "Resume booking" | TESTED |
| OR-3 data export | `GET /api/me/export` | IMPLEMENTED |
| PE-1…PE-4, availability, scalability | Architecture supports them (stateless API, indexed queries); not load-tested | NOT MEASURED |

## Requirement-level matrix

The row-per-requirement matrix covering all 41 SRS Section 4 tags is served by the application at **/traceability**. It comes from `client/src/lib/requirements.js`, so the document and the running system cannot drift apart.

## WBS (Exp 7) → repository

| WBS | Delivered by |
|---|---|
| 1.1 Project Planning, 1.2 Requirements Analysis | Exp 1–2 documents (input to this build) |
| 1.3.1 System Architecture | `docs/ARCHITECTURE.md` |
| 1.3.2 Database Design | `server/prisma/schema.prisma`, migrations, `docs/DATABASE.md` |
| 1.3.3 User Interface Design | `client/src/index.css` (design system), `client/src/components/ui` |
| 1.3.4 Module Design | `server/src/modules/*` (one module per DFD process) |
| 1.4.1 User Authentication & Profile | `modules/auth`, `modules/guests`, `middleware/auth.js` |
| 1.4.2 Room Search & Reservation | `modules/reservations`, `domain/Room.js`, `domain/Reservation.js` |
| 1.4.3 Payment Processing | `domain/Payment.js`, `integrations/PaymentGateway.js`, `modules/finance` |
| 1.4.4 Check-in / Check-out & Access | `modules/access`, `domain/DigitalKey.js`, `integrations/SmartLockController.js` |
| 1.4.5 Guest Services / Concierge | `modules/guest-services`, `integrations/AIConciergeService.js` |
| 1.4.6 Reporting & Administration | `modules/reporting`, `modules/admin`, `modules/inventory` |
| 1.5.1 Unit / 1.5.2 Integration / 1.5.3 System testing | `server/tests` (domain unit tests + API integration tests); manual end-to-end checklist in `tests/README.md` |
| 1.6 Deployment | `README.md` (local deployment), `database/` (embedded PostgreSQL or Docker) |
