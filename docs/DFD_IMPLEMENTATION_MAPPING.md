# Data Flow Diagrams (Exp 6) → implementation

## Level 0

The single process "0 Hotel Reservation Management System" is the Express API (`server/src/app.js`) together with the React client. Each external entity maps to a part of the implementation:

| Level 0 entity | Realised as |
|---|---|
| Guest, Receptionist, Hotel Manager, Finance Staff, System Administrator | Authenticated users with those roles (`roles` table), each with their own screens |
| Payment Gateway | `integrations/PaymentGateway.js` (mock PSP) |
| OTA / Channel Manager | `integrations/ota/OTAPlatform.js` (mock OTA platforms A/B/C) |
| AI Concierge Service | `integrations/AIConciergeService.js` |
| Notification Service | `integrations/NotificationService.js` |
| Smart Lock Controller | `integrations/SmartLockController.js` |
| *(no DFD)* Currency Exchange Rate Service | `integrations/CurrencyExchangeRateService.js` (decision D-13) |

## Level 1 processes

| DFD process | Backend module | Main API | Data stores → tables | Frontend screens |
|---|---|---|---|---|
| **1.0 User Authentication & Profile Management** | `modules/auth/auth.service.js`, `modules/guests/guest.service.js`, `middleware/auth.js` | `/api/auth/*`, `/api/me/profile`, `/api/me/loyalty` | **D1 User Data** → `users`, `roles`, `permissions`, `role_permissions`, `user_sessions`, `guests`, `guest_profiles`, `loyalty_accounts` | Sign in, Register, Profile, Loyalty |
| **2.0 Room Search & Reservation Management** | `modules/reservations/room.service.js`, `reservation.service.js`, `holds.js` | `/api/rooms/search`, `/api/reservations*` | **D2 Room Inventory** → `rooms`, `room_types`; **D3 Reservation Data** → `reservations` | Book a stay, Booking, My reservations, Front desk reservations |
| **3.0 Payment Processing** | `domain/Payment.js` (called from 2.0 and 4.0) | `/api/reservations/:id/pay`, `/check-out`, `/api/payments*` | **D4 Payment Records** → `payments`, `invoices` | Booking (payment step), Check-out, Finance |
| **4.0 Check-in / Check-out & Access Management** | `modules/access/access.service.js`, `domain/DigitalKey.js` | `/check-in`, `/check-out`, `/digital-key`, `/api/access/*` | **D5 Room Access Logs** → `room_access_logs`, `digital_keys` | Digital check-in, Digital key, Check-out, Room board |
| **5.0 Guest Services (Concierge)** | `modules/guest-services/concierge.service.js`, `serviceRequest.service.js` | `/api/concierge/*`, `/api/service-requests*` | **D6 Service Requests** → `service_requests`, `ai_conversations`, `faq_entries` | AI Concierge, Service requests, Service desk |
| **6.0 Reporting & Administration** | `modules/reporting/analytics.service.js`, `modules/admin/admin.service.js`, `modules/finance/finance.service.js`, `modules/inventory/inventory.service.js` | `/api/dashboard`, `/api/reports*`, `/api/admin/*` | **D7 Reports & Analytics** → `reports`, plus `audit_logs`, `system_settings` | Dashboard, Reports, Finance, Admin |

### Level 1 flows (examples)

| Flow | Where it happens |
|---|---|
| Guest → 1.0 "Login Details"; 1.0 → Guest "Authentication Result / User Profile / Role Information" | `POST /api/auth/login` response |
| 1.0 → 2.0 "Authenticated User Details" | `authenticate` middleware attaches `req.user` / `req.actor` |
| 2.0 → 3.0 "Reservation Details (for payment)" | `payReservation()` passes reservation id and amount to `Payment.process()` |
| 3.0 ↔ Payment Gateway "Payment Request / Payment Response" | `authorize()` / `capture()` |
| 3.0 → 4.0 "Confirmed Reservation Details" | `checkIn()` requires status `CONFIRMED` |
| 4.0 ↔ Smart Lock "Digital Key / Access Request; Access Result" | `presentKeyAtDoor()` |
| 5.0 ↔ AI Concierge "Guest Query; Response / Escalation Details" | `chat()` → `handleQuery()` |
| 6.0 ↔ Hotel Manager / Finance / Admin | dashboard, reports, reconciliation, admin endpoints |

## Level 2

### Process 2.0

| Sub-process | Implementation | Store |
|---|---|---|
| 2.1 Check Room Availability | `room.service.searchRooms()`, `Room.availabilityFilter()` | D2 (read) |
| 2.2 Select Room / Temporary Reservation | `createReservation()`: "Lock Room (Temporary Hold)" = `PENDING_PAYMENT` + `holdExpiresAt` | D2 (lock) |
| 2.3 Create Reservation | the row is stored in `reservations`. The Guest receives a booking ID; the **confirmation** is issued only after 3.0 (BR-5, decision in ASSUMPTIONS) | D3 |

### Process 3.0

| Sub-process | Implementation | Store |
|---|---|---|
| 3.1 Validate Payment Details | `Payment.validateDetails()` → `MockPaymentGateway.validateDetails()` (Luhn, expiry, CVV, UPI format) | — |
| 3.2 Process Payment | `Payment.process()` → `authorize()` / `capture()` | D4 |
| 3.3 Update Reservation & Generate Invoice | `Reservation.confirm()` (D3) + payment record (D4). The invoice is generated at check-out (decision D-5). | D3, D4 |
