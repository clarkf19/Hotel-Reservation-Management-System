# Demo accounts

Every account below is created by the seed (`npm run db:seed`) with the same password:

> **Password: `Hotel@2026`**

These are local demo credentials for a development database. They are not real secrets. The sign-in page also has one-click buttons for each role.

| Role | E-mail | Name | Good for demonstrating |
|---|---|---|---|
| **Guest** | `guest@hrms.test` | Aarav Sharma (Gold, 8-char Guest ID) | Has a stay **arriving today** in room 305 (online check-in → digital key → smart lock → concierge → check-out), a future stay in 12 days (modify / cancel), past stays with invoices, loyalty history, saved preferences (high floor, sea view, king bed) |
| **Guest** | `meera@hrms.test` | Meera Iyer | Currently **checked in** to accessible room 105, with accessibility needs in her profile, an open service request and an escalated AI question |
| **Guest** | `liam@hrms.test` | Liam Brown | A plain guest (used by the lockout test) |
| **Receptionist** | `reception@hrms.test` | Karan Mehta | Today board, **OTA conflicts** (one already flagged on OTA Platform A; one detected on the first sync from OTA Platform B), service desk, room board, front-desk check-in / check-out |
| **Receptionist** | `reception2@hrms.test` | Pooja Rao | Second front-desk user |
| **Hotel Manager** | `manager@hrms.test` | Vikram Menon | Dashboard, reports and exports, rates pushed to OTAs, room inventory |
| **Finance Staff** | `finance@hrms.test` | Anita Desai | Payments, verification, **reconciliation** (seeded with 3 deliberate discrepancies), invoices, revenue reports |
| **System Administrator** | `admin@hrms.test` | Rhea Kapoor | Users, role changes, permission matrix, settings, OTA connections, audit logs, notification outbox |

About 42 further guests with realistic names (`…@example.com`) exist for history and OTA bookings. Their password is the same.

## Test payment instruments

| Instrument | Result |
|---|---|
| Card `4242 4242 4242 4242` · expiry `12/30` · CVV `123` | Approved |
| Card `4000 0000 0000 0002` | Declined |
| Card `4000 0000 0009 0003` | Gateway timeout |
| UPI `fail@upi` | Declined |

## Test identity documents (online check-in)

| Type | Example that passes |
|---|---|
| Passport | `K1234567` |
| Aadhaar | `234567890123` |
| Driving licence | `MH0220190001234` |
| National ID | `ID987654` |

## Resetting the demo

The demo is time-relative: "arriving today" always means the day you run the seed. To restore everything:

```bash
npm run db:seed
```
