# Sequence & collaboration diagrams (Exp 4) → implementation

Every message below is recorded at runtime by `trace(from, to, message, …)` (`server/src/lib/trace.js`). The recorded trace is returned in the API response and replayed as a sequence diagram in the app: turn on **Viva mode** and open **Live UML**. The automated tests assert the message order (`server/tests/*.test.js`).

## SD-1 / CD-1 — Making Room Reservation

**Endpoints:**
1. `GET /api/rooms/search` (search)
2. `POST /api/reservations` (reserve and lock the room)
3. `POST /api/reservations/:id/pay` (pay and confirm)

**Service:** `server/src/modules/reservations/{room,reservation}.service.js`

| # (diagram) | Message | From → To | Implemented by |
|---|---|---|---|
| SD 1 / CD 1 | `searchRooms()` | Guest → HRMS | `room.service.searchRooms()` (actor `Guest.searchRooms()`) |
| SD 2 | `isAvailable()` | HRMS → Room | `Room.availabilityFilter()` / `Room.isAvailable()` |
| SD 3 / CD 2 | Available rooms | Room → HRMS | query result |
| SD 4 | Display available rooms and rates | HRMS → Guest | response `rooms[]` with `pricing` and `recommendation` |
| SD 5 / CD 3 | `makeReservation()` | Guest → HRMS | `Guest.makeReservation()` → `reservation.service.createReservation()` |
| SD 6 / CD 4-5 | `checkAvailability()` → Room available | HRMS → Reservation → Room | `Reservation.checkAvailability()` → `Room.isAvailable()` |
| SD 7 / CD 6 | `calculateAmount()` → Total amount | HRMS → Reservation | `Reservation.calculateAmount()` |
| (Activity) | Lock Room Inventory | HRMS → Room | insert `reservations` with status `PENDING_PAYMENT`, `holdExpiresAt` |
| SD 8 / CD 7 | `initiate()` | HRMS → Payment | `Payment.process()`: creates the `INITIATED` payment row |
| SD / CD 8 | `authorize(amount)` | Payment → PaymentGateway | `MockPaymentGateway.authorize()` |
| SD / CD 9 | Payment authorized | PaymentGateway → Payment | gateway response |
| SD / CD 10 | `verify()` | Payment → Payment | status `VERIFIED`, then `capture()` → `CAPTURED` |
| SD / CD 11 | Payment verified | Payment → HRMS | return value |
| SD / CD 12 | `confirm()` | HRMS → Reservation | `Reservation.confirm()`: assigns the sequential number, status `CONFIRMED` |
| SD | Reservation confirmed + reservation number | Reservation → HRMS | return value |
| SD / CD 13 | `updateStatus()` | HRMS → Room | `Room.updateStatus()` |
| SD / CD 14 | `syncReservations()` | HRMS → ChannelSync | fork branch → `channelSync.pushAvailabilityToAll()` |
| SD | Synchronization completed | ChannelSync → HRMS | return value |
| SD / CD 15 | `sendEmail(to, subject, body)` | HRMS → NotificationService | fork branch → `NotificationService.sendEmail()` (+ SMS, in-app) |
| CD 16 | confirmation sent | NotificationService → Guest | `notifications` row |
| SD | Reservation confirmed | HRMS → Guest | HTTP 200 response |

**Failure branch** (UC-1: payment failure → not confirmed):
1. Gateway declined or timed out.
2. **Release Inventory Lock**: the reservation becomes `DRAFT`.
3. `sendPush(payment problem)` (CI-2).
4. HTTP 402.

**Fork/join:** the four branches after "Confirm Reservation" run concurrently with `Promise.allSettled`. A failing branch (for example, an OTA being down) never undoes a confirmed booking.

## SD-2 / CD-2 — Digital Check-in + Digital Room Key

**Endpoints:**
1. `POST /api/reservations/:id/check-in`
2. `GET /api/reservations/:id/digital-key`
3. `POST /api/access/unlock`

**Service:** `server/src/modules/access/access.service.js`

| # (CD-2) | Message | From → To | Implemented by |
|---|---|---|---|
| 1 | initiate online check-in | Guest → HRMS | `Guest.completeDigitalCheckIn()` / `Receptionist.checkInGuest()` → `checkIn()` |
| 2 | `verifyReservation()` | HRMS → Reservation | `checkInEligibility()`: confirmed, date arrived (BR-7), stay not over |
| 3 | reservation verified | Reservation → HRMS | eligibility result |
| (SD-2) | verify Guest identity | HRMS → HRMS | `verifyIdentity()` (CheckIn.Verify.Identity) |
| 4 | `issueKey()` | HRMS → DigitalKey | `DigitalKey.issueKey()` (time-bound token) |
| 5 | digital key issued | DigitalKey → HRMS | row in `digital_keys`; reservation → `CHECKED_IN` |
| 6 | digital room key | HRMS → Guest | response `digitalKey` |
| 7 | `verifyKey()` | Guest → DigitalKey | `DigitalKey.verifyKey()` |
| 8 | key verified | DigitalKey → Guest | verdict |
| 9 | `unlock(keyCode)` | Guest → SmartLockController | `SimulatedSmartLockController.unlock()` |
| 10 | room unlocked | SmartLockController → Guest | `granted: true`, logged to `room_access_logs` |

**Alternative branch** `[Reservation not confirmed or check-in date not arrived]`:
- CD-2 "2: verification failed" and "6: check-in rejected" are both traced.
- The API returns 422 `CHECKIN_NOT_ALLOWED`.

**Activity "Key Valid? — No" → Deny Access:** covers an unknown, revoked, expired, not-yet-valid or wrong-room key.

## SD-3 / CD-3 — OTA Booking Synchronization + Conflict Resolution

**Endpoints:**
1. `POST /api/channels/sync` (also run by the background scheduler every 30 s)
2. `POST /api/channels/conflicts/:id/resolve`

**Service:** `server/src/modules/channels/channelSync.service.js`

| # (CD-3) | Message | From → To | Implemented by |
|---|---|---|---|
| 1 | `syncReservations()` | HRMS → ChannelSync | `syncReservations()` |
| 2 | `pullBookings()` | ChannelSync → OTAPlatform | `MockOTAPlatform.pullBookings()` |
| 3 | booking details | OTAPlatform → ChannelSync | pending OTA bookings |
| 4 | `detectConflicts()` | ChannelSync → ChannelSync | `detectConflicts()`: already booked, out of service, unknown room, capacity |
| 5 | `updateBookingStatus()` | ChannelSync → OTAPlatform | `MockOTAPlatform.updateBookingStatus('CONFIRMED')` |
| 6 | status updated | OTAPlatform → ChannelSync | — |
| — | synchronization successful | ChannelSync → HRMS | `channel_syncs` row `SUCCESS` |
| 7 | `resolveConflicts()` | ChannelSync → ChannelSync | `resolveConflicts()`, triggered by `Receptionist.resolveOTAConflicts()` (decision D-4) |
| 5′-6′ | `updateBookingStatus()` → status updated | ChannelSync ↔ OTAPlatform | after resolution (`CONFIRMED` or `REJECTED`) |
| — | conflict resolved | ChannelSync → HRMS | `channel_syncs.syncStatus = RESOLVED` |
| 8 | `pushAvailability()` | HRMS → OTAPlatform | `pushAvailabilityToAll()` |
| 9 | availability updated | OTAPlatform → HRMS | — |

**Conflict branch:**
- The booking is **flagged, not imported**: a `channel_syncs` row with `CONFLICT`, and the OTA is told `PENDING_RECONCILIATION`.
- Receptionists are notified.
- The booking waits in **Front desk → OTA conflicts**.
