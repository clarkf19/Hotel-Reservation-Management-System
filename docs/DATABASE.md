# Database

**Engine and schema:**
- PostgreSQL 18, accessed through Prisma 6.
- Schema: `server/prisma/schema.prisma`.
- Migrations: `server/prisma/migrations/`.

**Where PostgreSQL runs locally:**
- It runs from the `embedded-postgres` npm package (`database/start-postgres.js`), so there is nothing to install.
- Port **5433**, user `hrms`, databases `hrms` (development) and `hrms_test` (automated tests).
- Alternative: `database/docker-compose.yml`, which uses the same port and credentials.

## Tables → documentation

| Table | UML class (Exp 3) | SRS data dictionary / Fig. 4 | DFD store |
|---|---|---|---|
| `users` | User | — | D1 User Data |
| `roles`, `permissions`, `role_permissions` | Role, Permission | — | D1 |
| `guests` | Guest | guest (guest ID = 8-char alphanumeric) | D1 |
| `staff_members` | Receptionist / HotelManager / FinanceStaff / SystemAdministrator | — | D1 |
| `user_sessions`, `password_reset_tokens` | (User.logout, session timeout, reset) | — | D1 |
| `guest_profiles` | GuestProfile | — | D1 |
| `loyalty_accounts`, `loyalty_transactions` | LoyaltyAccount | loyalty account; Fig. 4 Loyalty Transaction | D1 |
| `room_types` | RoomType | room category | D2 Room Inventory |
| `rooms` | Room | room | D2 |
| `reservations` | Reservation | reservation, reservation status, reservation number | D3 Reservation Data |
| `payments` | Payment | payment, payment status, currency code | D4 Payment Records |
| `invoices` | Invoice | invoice | D4 |
| `exchange_rates` | (CurrencyExchangeRateService cache) | currency code | — |
| `digital_keys` | DigitalKey | digital key | D5 |
| `room_access_logs` | — | — | **D5 Room Access Logs** |
| `ota_channels` | OTAChannel | — | — |
| `channel_syncs` | ChannelSync (conflicts are rows with `syncStatus = CONFLICT`) | — | — |
| `mock_ota_bookings` | *(simulated external OTA's own data)* | — | outside the system boundary |
| `ai_conversations` | AIConversation | — | D6 |
| `faq_entries` | (AIConciergeService knowledge base) | — | D6 |
| `service_requests` | — | — | **D6 Service Requests** |
| `reports` | Report | — | **D7 Reports & Analytics** |
| `audit_logs` | AuditLog | — | 6.0 |
| `notifications` | (NotificationService outbox) | — | — |
| `system_settings` | (SystemAdministrator.systemSettings) | — | 6.0 |

## Relationships (class-diagram multiplicities)

- User 0..\* → 1 Role (`users.roleId`)
- Role ↔ Permission (many-to-many, `role_permissions`; assumption A-10)
- User 1 → 0..\* AuditLog (`audit_logs.performedBy`)
- Guest 1 → 0..1 GuestProfile · 0..1 LoyaltyAccount (unique `guestId`)
- Guest 1 → 0..\* Reservation · 0..\* AIConversation
- RoomType 1 → 0..\* Room
- Room 1 → 0..\* Reservation
- Reservation 1 → 0..\* Payment · 0..1 Invoice (unique `reservationId`) · 0..1 DigitalKey (unique `reservationId`) · 0..\* ChannelSync
- OTAChannel 1 → 0..\* ChannelSync

## Constraints that keep the data valid

| Constraint | Enforces |
|---|---|
| `reservations_no_double_booking`: `EXCLUDE USING gist (roomId WITH =, daterange(checkInDate, checkOutDate, '[)') WITH &&) WHERE status IN ('PENDING_PAYMENT','CONFIRMED','CHECKED_IN')` | **BR-3 / Reservation.Prevent.DoubleBooking**, even under concurrent requests. Half-open ranges allow back-to-back stays. |
| `reservations_dates_valid` | check-out after check-in |
| `reservations_number_when_confirmed` | BR-5: no confirmed / checked-in / checked-out reservation without a reservation number |
| `reservation_number_seq` | Data dictionary: sequential integer starting at 1 |
| `payments_amount_positive`, `payments_refund_not_exceeding` | Refunds never exceed the payment |
| `loyalty_balance_nonneg` | Points cannot go negative |
| `guests_guest_id_format` | `^[A-Z0-9]{8}$` |
| `digital_keys_window_valid` | expiry after issue |
| Unique: `users.email`, `rooms.roomNumber`, `reservations.reservationNumber`, `(otaChannelId, externalRef)`, `payments.transactionRef`, `invoices.invoiceNumber`, `digital_keys.keyCode` | No duplicates |

**Indexes:**
- `reservations(roomId, checkInDate, checkOutDate)`, `(guestId)`, `(status)`
- `payments(reservationId)`, `(status)`
- `audit_logs(timestamp)`, `(entityType, entityId)`
- `channel_syncs(channelId, lastSyncAt)`, `(syncStatus)`
- `notifications(userId, createdAt)`

## Commands

```bash
npm --prefix server run db:deploy    # apply migrations
npm --prefix server run db:seed      # reset + load demo data
npm --prefix server run db:studio    # browse data in Prisma Studio
npm --prefix database run reset      # delete the local cluster entirely (then start again)
```
