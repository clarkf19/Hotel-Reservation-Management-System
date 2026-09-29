# Activity diagram (Exp 5) → working logic

Every **decision**, **fork/join** and action node of the swimlane activity diagram is executed by code. It is not only drawn on a screen. Nodes marked ◇ are decisions.

## Decisions

| Activity node | Lane | Implemented by | Outcomes |
|---|---|---|---|
| ◇ **Valid Credentials?** | HRMS | `auth.service.login()` | No → 401 plus an attempt counter, then a 423 lock after 5 tries. Yes → session, role, permissions ("Identify User Role and Permissions") |
| ◇ **Rooms Available?** | HRMS | `room.service.searchRooms()`, `Reservation.checkAvailability()` | No → `suggestAlternatives()` ("Suggest Alternative Dates / Categories"), or 409 on booking. Yes → "Perform Smart Room Allocation" (`scoreRoom()`) |
| ◇ **Payment Successful?** (booking) | HRMS | `reservation.service.payReservation()` after `Payment.process()` | No → "Release Inventory Lock" (status `DRAFT`) + guest notified. Yes → "Confirm Reservation" |
| ◇ **Check-In Allowed?** | HRMS | `access.service.checkInEligibility()` | No → "check-in rejected" (422). Yes → identity check, then "Issue Time-Bound Digital Key" |
| ◇ **Key Valid?** | Smart Lock | `DigitalKey.verifyKey()` + `SimulatedSmartLockController.unlock()` | No → "Deny Access". Yes → "Unlock Room". Both are logged in D5. |
| ◇ **Need Additional Services?** | Guest | `concierge.service.chat()` (service-intent detection) and the Service requests screen | Yes → "Submit Service Request". No → continue the conversation |
| ◇ **Request Resolved?** | HRMS | `concierge.service.chat()`: knowledge-base confidence below threshold, or LLM says ESCALATE | No → "Escalate to Receptionist" (service request marked as an escalation + notification). Yes → answer |
| ◇ **Conflict Detected?** | OTA / Channel Manager | `channelSync.detectConflicts()` | Yes → flagged for Receptionist "Handle OTA Conflicts". No → "Update OTA Booking Status" |
| ◇ **Payment Successful?** (check-out) | HRMS | `access.service.checkOut()` | No → 402, the guest retries ("Process Final Payment" loop). Yes → "Revoke Digital Key" → "Generate Invoice" |

## Fork / join

| Activity | Implementation |
|---|---|
| FORK after **Confirm Reservation** → Update Guest Profile & Loyalty Account ‖ Record Booking and Update Inventory ‖ Sync Booking Status to OTA Channels (+ Send Booking Confirmation) → JOIN | `reservation.service.runConfirmationFork()` runs the four branches concurrently with `Promise.allSettled`. The join waits for all of them. A failing branch is logged and never rolls back the confirmed booking. The fork and join markers appear in the Live UML trace. |
| OTA lane parallel start: Update Availability / Rates / Status ‖ Pull OTA Bookings | `syncReservations()` pulls bookings, and `pushAvailabilityToAll()` publishes inventory. The background scheduler also runs them independently. |
| AI lane: Provide FAQ / Booking Assistance ‖ Provide Local Recommendations | One NLP step classifies the request, and the intent recorded on the conversation is `FAQ`, `BOOKING_ASSISTANCE` or `LOCAL_RECOMMENDATION` |

## Staff lanes

| Lane | Nodes → screens / endpoints |
|---|---|
| Receptionist | Manage Reservations (View / Modify) → `/front-desk/reservations`. Handle OTA Conflicts → `/front-desk/channels`. Handle Escalated Guest Request → `/front-desk/requests` |
| Hotel Manager | View Operational Dashboard, View Occupancy, View Booking Trends, View Revenue Summary, View Cancellation Statistics → `/manager` (`GET /api/dashboard`). View Guest Feedback Summary → **not implemented**: the SRS has no feedback requirement and no document defines feedback data. Generate Report / Export Report → `/manager/reports`. Manage Room Rates / Room Inventory → `/manager/rates` |
| Finance Staff | Verify Payments → `/finance`. Reconcile Revenue → `/finance/reconcile`. Generate Financial Reports / Export → `/finance/reports` |
| System Administrator | Manage Users → `/admin`. Manage Roles and Permissions → `/admin/roles`. Manage System Configuration → `/admin/settings`. Manage OTA Connections → `/admin/channels`. Record and View Audit Logs → `AuditLog.record()` everywhere + `/admin/audit` |
