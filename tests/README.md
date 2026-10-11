# Tests

## Automated tests

The automated tests live in `server/tests/` because they need the server's dependencies. Run them with:

```bash
npm test
```

This runs `vitest` in the server. Before the tests start, the global setup:
1. Applies the migrations to the separate `hrms_test` database.
2. Loads the deterministic demo seed.

Your development data is never touched. PostgreSQL must be running (`npm run db`).

| # | Required test | File · test |
|---|---|---|
| 1 | Login | `auth.test.js` › 1. Login (success, wrong password, lockout, logout, idle timeout, registration) |
| 2 | RBAC | `auth.test.js` › 2. RBAC (per-role access, live permission change, BR-2 role change audited) |
| 3 | Room availability | `reservations.test.js` › 3. Room availability (ranking, overlap and adjacency, filters, date validation) |
| 4 | Double booking prevention | `reservations.test.js` › 4. Double booking (sequential, **3 concurrent requests**, database constraint) |
| 5 | Reservation creation | `reservations.test.js` › 5 + 7 (lock → confirm, SD-1 message order, fork side effects, receptionist booking) |
| 6 | Reservation cancellation | `reservations.test.js` › 6 (explicit confirm, free refund, one-night fee within 48 h, modification) |
| 7 | Payment success | `reservations.test.js` › 5 + 7 (captured, no raw card data stored) |
| 8 | Payment failure | `reservations.test.js` › 8 (decline → draft + lock released + CI-2 notice, timeout, retry, invalid card) |
| 9 | Digital check-in | `checkin.test.js` › 9 (rejected before date, invalid ID, success + SD-2 order) |
| 10 | Digital key generation | `checkin.test.js` › 10 (single time-bound key, unlock own room, wrong room, forged key) |
| 11 | Digital key expiration | `checkin.test.js` › 11 (expired key denied, background expiry job) |
| 12 | OTA synchronization | `ota.test.js` › 12 (import + SD-3 order, OTA-side cancellation, OTA outage) |
| 13 | OTA conflict detection | `ota.test.js` › 13 (flagged not imported, OTA told PENDING_RECONCILIATION, no re-flagging) |
| 14 | OTA conflict resolution | `ota.test.js` › 14 (REASSIGN_ROOM, REJECT_OTA_BOOKING, guest forbidden) |
| 15 | Checkout | `checkin.test.js` › 15 (service charges, declined then approved final payment, key revoked, invoice PDF, loyalty after check-out, none at booking) |
| 16 | Authorization failures | `auth.test.js` › 16 (no token, guest calling admin/manager/finance URLs, other guest's reservation, receptionist role change, finance cannot cancel) |
| + | Concierge, analytics, finance, domain unit tests | `services.test.js` |
| + | Razorpay gateway, test mode only (fake Razorpay API): order, signature, capture, forged signature, wrong amount, closed checkout, refund, reconciliation, **live keys refused** | `razorpay.test.js` |

The latest run: **6 files, 69 tests, all passing.**

## Manual end-to-end checklist (viva demo)

Turn on **Viva mode** (top bar) before starting. After each step, **Live UML** shows the executed sequence diagram.

1. **Guest** (`guest@hrms.test`) → Book a stay:
   1. Search tomorrow → +2 nights. Note the *Best match* badge and its reasons.
   2. Select a room → Reserve (room locked, countdown shown).
   3. Pay with card `…0002` → *Payment unsuccessful* (Release Inventory Lock).
   4. Pay with `…4242` → *Reservation confirmed* with an HRMS number.
   5. Open Live UML → SD-1.
2. Home → **Check in online** for today's stay (passport `K1234567`) → digital key issued. Live UML → SD-2.
3. Digital key → *Tap phone on lock* (door opens), then choose another room (Deny Access). Access log updates.
4. AI Concierge:
   1. "What time is check-in?" (knowledge base).
   2. "Can I get extra towels?" (service request created).
   3. An unusual question (escalated to reception).
5. Reservation → **Express check-out** → pay the extras → invoice PDF, key revoked, loyalty points credited.
6. **Receptionist** (`reception@hrms.test`):
   1. OTA conflicts → compare *OTA says / HRMS says* → resolve (move the OTA guest).
   2. Use the OTA simulator to create a conflict → *Sync now* → Live UML → SD-3.
   3. Service desk → reply to the escalation.
   4. Room board → set a room to Available.
7. **Manager** (`manager@hrms.test`):
   1. Dashboard charts.
   2. Reports → Revenue → Export PDF/CSV.
   3. Rates → change a rate → pushed to 3 OTAs.
8. **Finance** (`finance@hrms.test`): Payments → Verify; Reconciliation → Run (3 seeded exceptions); Invoices → PDF.
9. **Admin** (`admin@hrms.test`): Users → change a role; Roles & permissions → revoke a permission (the affected user is blocked immediately); Settings; Audit logs.
10. Security check: while signed in as the guest, open `http://localhost:5173/admin` → redirected. Calling `GET /api/admin/users` with the guest token → **403**.
