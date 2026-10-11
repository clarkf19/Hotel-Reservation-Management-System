# REST API

**Base URL:** `http://localhost:4000/api`. The web client proxies `/api` to it.

**Format:** JSON in and out. Errors always look like this:

```json
{ "error": { "code": "ROOM_UNAVAILABLE", "message": "Human readable message", "details": {} } }
```

Stack traces are never returned.

**Authentication:** send `Authorization: Bearer <token>` (from `POST /auth/login`).

**Authorisation:** every protected route is checked on the server against the permissions of the user's role. The permission names are in `server/src/domain/rbac.js` and are editable under Admin → Roles & permissions.

**UML trace:** responses from routes that implement a documented scenario include a `trace` object:

```json
"trace": { "scenario": "SD-1 Making Room Reservation", "steps": [ { "seq": 1, "from": "HRMS", "to": "Payment", "message": "initiate()", "ref": "SD-1 msg 7-11", "activity": "Verify Payment", "dfd": "3.2 Process Payment", "atMs": 12 } ], "totalMs": 540 }
```

## Common status codes

| Code | Meaning |
|---|---|
| 400 `VALIDATION_ERROR` | Invalid input (zod) |
| 401 `UNAUTHENTICATED` / `SESSION_EXPIRED` / `SESSION_REVOKED` / `INVALID_CREDENTIALS` | Not signed in, session idle for 20 min, logged out, or wrong password |
| 402 `PAYMENT_FAILED` | Gateway declined or timed out; the reservation is not confirmed |
| 403 `FORBIDDEN` | Role lacks the permission |
| 404 `NOT_FOUND` | Missing, or another guest's data (SE-5) |
| 409 `ROOM_UNAVAILABLE` / `DUPLICATE` | Double booking prevented / duplicate record |
| 422 business-rule errors | e.g. `CHECKIN_NOT_ALLOWED`, `IDENTITY_NOT_VERIFIED`, `NOT_CANCELLABLE`, `PAYMENT_REQUIRED`, `INVALID_STATUS_TRANSITION` |
| 423 `ACCOUNT_LOCKED` | 5 failed sign-ins → 15-minute lock |

## Endpoints

### 1.0 Authentication & profile

| Method | Path | Guard | Purpose |
|---|---|---|---|
| POST | `/auth/login` | public | User.login(); returns `{ token, user }` or `{ mfaRequired, challengeId }` |
| POST | `/auth/mfa/verify` | public | Second factor (SE-3) |
| POST | `/auth/register` | public | Guest registration |
| POST | `/auth/logout` | signed in | User.logout() |
| GET | `/auth/me` | signed in | Current user and permissions |
| POST | `/auth/password/forgot` · `/auth/password/reset` · `/auth/password/change` | public / public / signed in | User.Password.Reset |
| GET · PUT | `/me/profile` | `profile.own` | GuestProfile |
| GET | `/me/loyalty` | `loyalty.own` | LoyaltyAccount |
| GET | `/me/stay-history` | `reservation.own` | Guest.Profile.History |
| GET | `/me/export` | `profile.own` | OR-3 data export |
| GET | `/notifications` · POST `/notifications/read-all` | signed in | In-app inbox |

### 2.0 Rooms & reservations

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/rooms/types` | public | Room types and rates (SE-2) |
| GET | `/rooms/search?checkIn&checkOut&guests&category&minPrice&maxPrice&accessible` | public (personalised if signed in) | Search + smart allocation |
| GET | `/rooms/:id` | public | Room details |
| GET | `/reservations?status&source&search&from&to&arrivingOn&departingOn` | signed in (own / all for staff) | List |
| POST | `/reservations` `{roomId, checkIn, checkOut, numGuests, specialRequests?, redeemPoints?, guestId? (staff)}` | `reservation.own` or `reservation.manage` | Create and lock the room (`PENDING_PAYMENT`) |
| GET | `/reservations/:id` | owner or staff | Detail + timeline |
| POST | `/reservations/:id/pay` `{method, details, payCurrency?}` | `payment.own` or `reservation.manage` | Pay → confirm (SD-1) |
| GET | `/payments/razorpay/config` | signed in | Whether real Razorpay is enabled, mode, public key id, demo charge |
| POST | `/reservations/:id/razorpay/order` | `payment.own` or `reservation.manage` | Lock the room + create a Razorpay Order |
| POST | `/reservations/:id/razorpay/verify` `{orderId, paymentId, signature}` | same | Verify the signature and the payment with Razorpay → confirm |
| POST | `/reservations/:id/razorpay/cancel` `{orderId?, reason?}` | same | Checkout closed → release the lock |
| PATCH | `/reservations/:id` `{checkIn?, checkOut?, roomId?, numGuests?, payment?}` | `reservation.own` or `reservation.manage` | Modify. Returns `requiresPayment` when the price increases. |
| GET | `/reservations/:id/cancellation-terms` | owner or staff | BR-8 preview |
| POST | `/reservations/:id/cancel` `{confirm: true}` | `reservation.own` or `reservation.manage` | Cancel with fee / refund |

### 3.0 / 4.0 Payment, check-in, access

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/access/identity-documents` | public | Accepted ID types |
| POST | `/reservations/:id/check-in` `{documentType, documentNumber, keyType}` | `checkin.own` or `frontdesk.checkin` | SD-2 |
| GET | `/reservations/:id/digital-key` | `checkin.own` or `frontdesk.checkin` | Key + access log |
| POST | `/reservations/:id/digital-key/revoke` · `/reissue` | front desk | Key management |
| POST | `/access/unlock` `{roomNumber, keyCode}` | signed in with a check-in permission | Smart lock simulation |
| GET | `/access/logs?roomNumber` | `frontdesk.checkin` or `audit.read` | D5 |
| GET | `/reservations/:id/checkout-summary` | `checkin.own` or `frontdesk.checkin` | Final charges |
| POST | `/reservations/:id/check-out` `{payment?}` | `checkin.own` or `frontdesk.checkin` | Express check-out |
| GET | `/invoices/:id/pdf` | owner or finance / front desk | Invoice PDF |

### 5.0 Guest services

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/concierge` · `/concierge/history` | `concierge.use` | Mode, suggestions, history |
| POST | `/concierge/messages` `{message, sessionId?}` | `concierge.use` | Chat turn |
| GET | `/service-requests/catalog` | signed in | Service catalogue |
| GET | `/service-requests?status&escalations` | `service.own` or `service.manage` | List |
| POST | `/service-requests` `{category, description, reservationId?}` | `service.own` | Create |
| PATCH | `/service-requests/:id` `{status?, staffNote?, charge?, assignToMe?}` | owner (cancel only) or `service.manage` | Handle |

### Channel manager (SRS 4.3)

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/channels` · `/channels/sync-log` · `/channels/availability` · `/channels/platform-bookings` | channel permissions | Overview |
| POST | `/channels/sync` `{channelId?}` | `channel.sync` or `channel.conflict.resolve` | SD-3 |
| GET | `/channels/conflicts?status=CONFLICT\|RESOLVED\|ALL` | `channel.conflict.resolve` or `channel.sync` | Conflicts |
| GET | `/channels/conflicts/:id/options` | `channel.conflict.resolve` | Candidate rooms |
| POST | `/channels/conflicts/:id/resolve` `{resolution: REASSIGN_ROOM\|MOVE_EXISTING\|REJECT_OTA_BOOKING, targetRoomId?, note?}` | `channel.conflict.resolve` | Resolve |
| POST | `/channels/:id/simulate` `{action: book\|cancel, …}` | channel permissions | Simulate a guest on the OTA website |
| POST · PATCH | `/channels` · `/channels/:id` | `channel.connect.manage` | Channel.Connect.Manage |

### 6.0 Reporting & administration

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/dashboard` | `dashboard.view` | Operational dashboard |
| GET · POST | `/reports` (`{type, from, to}`) | `report.operational` / `report.financial` by type | Report.generate() |
| GET | `/reports/:id/export?format=pdf\|csv` | `report.export` | Dashboard.Export |
| GET | `/room-types` · PUT `/room-types/:id/rate` | `inventory.manage` / `rate.manage` | Rates + OTA push |
| GET | `/rooms-board` · PATCH `/rooms/:id/status` | `room.status` | Room board |
| POST · PATCH | `/rooms` · `/rooms/:id` | `inventory.manage` | Inventory |
| GET | `/guests?search` | `guest.read` | Guest look-up |
| GET | `/payments` · POST `/payments/:id/verify` · POST `/payments/reconcile` `{apply}` | finance permissions | Finance |
| GET | `/invoices` | `invoice.read` | Invoices |
| GET · POST · PATCH | `/admin/users` | `user.manage` (role change also needs `role.manage`) | Users |
| GET | `/admin/roles` · PUT `/admin/roles/:roleId/permissions/:permissionId` `{granted}` | `role.manage` | Permission matrix |
| GET | `/admin/settings` · PUT `/admin/settings/:key` `{value}` | `settings.manage` | Configuration |
| GET | `/admin/audit-logs?action&entityType&limit&offset` | `audit.read` | Audit |
| GET | `/admin/notifications` | `notification.outbox` | Outbox |
| GET | `/admin/health` | `settings.manage` or `audit.read` | Health and exchange rates |
| GET | `/health` · `/public/info` | public | Liveness / hotel info |

## Sandbox payment instruments (mock gateway)

| Instrument | Result |
|---|---|
| Card `4242 4242 4242 4242`, any future expiry, any CVV | Approved |
| Card `4000 0000 0000 0002` | Declined (insufficient funds) |
| Card `4000 0000 0009 0003` | Gateway timeout |
| UPI `fail@upi` | Declined |
| Any other valid UPI ID / bank / wallet | Approved |
