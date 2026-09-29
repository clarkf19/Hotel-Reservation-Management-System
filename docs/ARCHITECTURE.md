# Architecture

```
┌─────────────────────────── client/ (React 19 + Vite + Tailwind 4) ───────────────────────────┐
│ pages/{public,guest,frontdesk,manager,finance,admin}   components/{ui,booking,charts,viva}     │
│ lib/api.js (JWT, errors, UML trace capture)   lib/auth.jsx   lib/traceability.js             │
└──────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                   /api (Vite dev proxy) │ JSON over HTTP
┌──────────────────────────────── server/ (Node 24 + Express 5) ────────────────────────────────┐
│ routes/*.routes.js      validate (zod) → authenticate → authorize(permission) → controller     │
│        │  controller calls the UML actor method:  req.actor.makeReservation(...)               │
│ domain/actors           User ▷ Guest | Receptionist | HotelManager | FinanceStaff | SysAdmin    │
│ modules/ (one per DFD Level 1 process)                                                        │
│   auth (1.0) · reservations (2.0) · payment in domain/Payment (3.0) · access (4.0)            │
│   guest-services (5.0) · reporting / admin / finance / inventory (6.0) · channels (SRS 4.3)    │
│ domain/                 Reservation · Room · RoomType · Payment · Invoice · DigitalKey ·        │
│                         LoyaltyAccount · Report · AuditLog · rbac   (business rules)           │
│ integrations/           PaymentGateway · OTAPlatform · SmartLockController ·                   │
│                         NotificationService · CurrencyExchangeRateService · AIConciergeService │
│ lib/trace.js            AsyncLocalStorage tracer → "trace" in every scenario response          │
│ jobs/scheduler.js       OTA sync (30 s) · key expiry · hold release · FX refresh · reminders   │
└──────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                         Prisma │
                        PostgreSQL 18 (database/, port 5433) — exclusion constraint for BR-3
```

## Layers

| Layer | Responsibility | Why |
|---|---|---|
| **Routes** | HTTP, input validation (zod), permission checks | Security is enforced on the server (UI-4 alone would not be enough) |
| **Actor facades** (`domain/actors`) | The UML user classes. Each class-diagram operation is a real method that controllers call. | Keeps the class diagram as the application's entry points |
| **Modules** (`modules/*`) | The DFD Level 1 processes. They orchestrate the sequence-diagram scenarios. | "HRMS" lifeline of SD-1/2/3 |
| **Domain** (`domain/*`) | Business rules: state machines, pricing, BR-3/5/6/7/8, key validity, loyalty | Testable without HTTP |
| **Integrations** | The six «interface» classes, each realised by a simulator with the same methods | Real providers can replace them without touching callers |
| **Persistence** | Prisma models + SQL constraints | Integrity is guaranteed by the database |

## Key runtime behaviours

- **Double booking:** checked twice. The app checks availability first, then the PostgreSQL GiST exclusion constraint is the final guard. Concurrent requests for the same room produce exactly one winner, and the loser gets `409 ROOM_UNAVAILABLE`.
- **Inventory lock:** `PENDING_PAYMENT` rows carry `holdExpiresAt`. An expired hold becomes a recoverable `DRAFT`.
- **Payment:** runs outside database transactions, because it calls an external system. Confirmation happens in its own transaction. If confirmation fails after money was taken, the payment is refunded automatically.
- **Activity fork/join:** after a reservation is confirmed, OTA sync, confirmation messages, the profile update and the inventory record run concurrently (`Promise.allSettled`). A failing branch cannot undo the booking.
- **Sessions:** each JWT points to a `user_sessions` row. The server enforces logout (revoked row) and the 20-minute idle timeout.
- **Viva Mode trace:** services call `trace()` at every documented message. The per-request trace is attached to JSON responses, and the client renders it as a sequence diagram.

## Technology choices

| Choice | Reason |
|---|---|
| React + Vite + Tailwind + Recharts | The stack you requested. Fast dev server. |
| Express 5 | Native async error handling |
| Prisma 6 + PostgreSQL | Relational integrity, migrations, typed queries (OE-3: relational database) |
| `embedded-postgres` | PostgreSQL was not installed on the machine and Docker Desktop was not running. This runs genuine PostgreSQL binaries from npm with no system install. Docker Compose is provided as an alternative. |
| JWT + bcryptjs | You requested these. bcryptjs is pure JS, so it needs no native build on Windows. |
| Vitest + Supertest | API-level integration tests against a separate `hrms_test` database |
| `@anthropic-ai/sdk` (optional) | The AI concierge LLM mode, used only if `ANTHROPIC_API_KEY` is set |
