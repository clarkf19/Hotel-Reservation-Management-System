# Decisions on documentation conflicts, and implementation assumptions

The submitted documents (Exp 1–7) are the source of truth. This file lists:

1. **Decisions (D-n)**: places where two documents disagree. Each entry says which reading the code follows and why. Each can be changed, and the files to touch are named.
2. **Implementation assumptions (A-n)**: things the documents do not specify ("Not specified in the documentation") that a running system still needs.

---

## 1. Decisions on documentation conflicts

### D-1 · Reservation states
| | |
|---|---|
| **Conflict** | The SRS data dictionary lists `draft · pending payment · confirmed · checked-in · checked-out · cancelled`. SRS Figure 2 shows `Inquiry · Pending Reservation · Pending Payment · Confirmed · Checked-In · Completed · Cancelled`. |
| **Decision** | The **data dictionary values are stored** (`ReservationStatus` enum). **Figure 2's events drive the transitions.** Mapping: Inquiry → room search (not persisted); Pending Reservation → `DRAFT`; Pending Payment → `PENDING_PAYMENT`; Completed → `CHECKED_OUT`. |
| **Why** | BR-6, BR-7 and Guest.Rewards.Accrue all refer to "Checked-Out", which exists only in the data dictionary. |
| **Code** | `server/src/domain/Reservation.js` (`RESERVATION_TRANSITIONS`), `server/prisma/schema.prisma` |

### D-2 · Payment states
| | |
|---|---|
| **Conflict** | The data dictionary lists `initiated · processing · verified · failed · captured · refunded`. SRS Figure 3 shows `Initiated · Pending Payment · Successful · Completed · Failed`. |
| **Decision** | The data dictionary values are stored. Mapping: Fig. 3 "Pending payment" → `PROCESSING`; "Successful" → `VERIFIED` then `CAPTURED`; "Completed" → captured payment with an invoice. `REFUNDED` is kept because BR-8 cancellations need refunds. |
| **Code** | `server/src/domain/Payment.js` |

### D-3 · Reservation ↔ Payment multiplicity
| | |
|---|---|
| **Conflict** | Figure 4 (ER) shows Reservation m : 1 Payment. The class diagram shows Reservation 1 : 0..* Payment. |
| **Decision** | Class diagram: **one reservation has 0..\* payments.** This covers the reservation payment, retries after a failure, the modification top-up and the final settlement at check-out. |
| **Code** | `payments.reservationId` foreign key |

### D-4 · Who resolves OTA conflicts
| | |
|---|---|
| **Conflict** | SD-3/CD-3 show `ChannelSync.resolveConflicts()` resolving conflicts automatically. The SRS (Channel.Sync.Conflict), the use case "Resolve Booking Sync Conflict" and the activity diagram ("Handle OTA Conflicts" in the Receptionist lane) say a **Receptionist** reconciles them manually. |
| **Decision** | Conflicts are **detected automatically** by `detectConflicts()` during `syncReservations()`. They are then **resolved by a Receptionist**, who triggers `Receptionist.resolveOTAConflicts()` → `ChannelSync.resolveConflicts()` → `updateBookingStatus()` → `pushAvailability()`. |
| **Why** | Every SD-3 message is still executed in order, and the SRS, use case and activity diagram are all satisfied. |
| **Code** | `server/src/modules/channels/channelSync.service.js` |

### D-5 · When the invoice is generated
| | |
|---|---|
| **Conflict** | DFD Level 2 (3.3 "Update Reservation & Generate Invoice") and Figure 3 ("Completed: Invoice issued") put the invoice at payment time. SRS Invoice.Generate says "automatically after check-out". |
| **Decision** | **The invoice is generated at check-out** (SRS). DFD 3.3 is implemented as "update reservation + store payment record", and a payment receipt is sent at booking time. |
| **Code** | `server/src/modules/access/access.service.js` (`checkOut`) |

### D-6 · Loyalty at booking time
| | |
|---|---|
| **Conflict** | The activity diagram forks "Update Guest Profile & Loyalty Account" right after "Confirm Reservation". BR-6 says points are credited only after Checked-Out. |
| **Decision** | That fork branch updates the **profile / booking history only**. **Points are credited at check-out** (BR-6). Points being *redeemed* are debited at confirmation. |
| **Code** | `reservation.service.js` (`runConfirmationFork`), `access.service.js` |

### D-7 · Reservation number format
| | |
|---|---|
| **Conflict** | The data dictionary says "unique, sequential integer, initial value 1". The class diagram says `reservationNumber: String`. |
| **Decision** | Stored as a sequential **integer** from a PostgreSQL sequence starting at 1, assigned only on confirmation (BR-5). It is displayed as the string `HRMS-000123`. |
| **Code** | migration `20260929141000_domain_constraints`, `Reservation.confirm()` |

### D-8 · Guest ID type
| | |
|---|---|
| **Conflict** | The data dictionary says "8-character alphanumeric string". The class diagram says `guestId: int`. |
| **Decision** | Two identifiers: the integer primary key (class diagram), and a unique 8-character `guestId` string enforced by a CHECK constraint (data dictionary). |

### D-9 · Room ↔ RoomType ↔ Category
| | |
|---|---|
| **Conflict** | Figure 4 shows Room 1 : m RoomType and a separate Category entity. The class diagram shows RoomType contains 0..\* Room, and the data dictionary lists a room category enum. |
| **Decision** | Class diagram: a RoomType has many Rooms. Category is an enum on RoomType (`STANDARD / DELUXE / SUITE / ACCESSIBLE`). `Room.accessible` (data dictionary) is also stored. |

### D-10 · Early check-out edge in Figure 2
| | |
|---|---|
| **Conflict** | Figure 2 draws Checked-In → Cancelled ("early check-out or reservation cancelled"). |
| **Decision** | An early departure is processed as a normal **check-out**, so the stay is invoiced and earns points. A checked-in stay cannot be cancelled. |

### D-11 · Figure 3 referenced for digital keys
| | |
|---|---|
| **Conflict** | Room.Access.Issue says keys follow "the state-transition rules in Figure 3", but Figure 3 is the payment state diagram. |
| **Decision** | DigitalKey has its own lifecycle: `ACTIVE → REVOKED` (check-out or staff action) and `ACTIVE → EXPIRED` (end of stay, background job). |

### D-12 · Actors in the context diagram
| | |
|---|---|
| **Conflict** | SRS Figure 1 shows "Hotel Staff (Housekeeping / Maintenance / F&B)" and "Hotel Database" as external entities. The SRS user classes and DFD Level 0 do not. |
| **Decision** | The five SRS user classes are implemented. Housekeeping appears only as the `CLEANING` room status. The database is an internal data store, not an actor. |

### D-13 · External entities missing from DFD Level 1
| | |
|---|---|
| **Conflict** | DFD Level 0 includes the OTA / Channel Manager and the Notification Service, but Level 1 omits them. Currency Exchange appears in no DFD. |
| **Decision** | All three are implemented as integrations (`integrations/`) called from the processes that need them. `docs/DFD_IMPLEMENTATION_MAPPING.md` shows where each Level 0 flow is realised. |

### D-14 · Sequence-diagram lifelines not in the class diagram
| | |
|---|---|
| **Conflict** | SD-1/2/3 use a "Hotel Reservation Management System" lifeline, and CD-1 has no such object. SD-2 uses `verifyReservation()` and "verify Guest identity", which are not class methods. |
| **Decision** | The HRMS lifeline is the application service layer (`modules/*/*.service.js`). The two SD-2 messages are implemented in `access.service.js` (`checkInEligibility`, `verifyIdentity`) and appear in the execution trace under their diagram names. |

---

## 2. Implementation assumptions (not specified in the documentation)

| # | Topic | Assumption | Configurable? |
|---|---|---|---|
| A-1 | Property | A single hotel ("Solstice Bay Hotel", fictional) in the Asia/Kolkata time zone. BR-9's "property they are assigned to" is therefore the whole hotel. | Hotel name in Settings |
| A-2 | Pricing | Nightly rate = `Room.baseRate` (initially `RoomType.baseRate`). Flat 12 % tax on room and service charges. | `taxRatePercent` |
| A-3 | Check-in / check-out times | 14:00 / 11:00 hotel time. The digital key stays valid 60 min after check-out time. | Settings |
| A-4 | Payment hold | The room is locked for 10 min while payment is pending (Fig. 2 "within time limit"). An expired hold releases the room and keeps a recoverable draft (SRS 5.4 Robustness). Drafts older than 24 h are cancelled. | `paymentHoldMinutes` |
| A-5 | BR-8 fee | "One-night charge" = total ÷ nights (one night's rate including tax). The remainder is refunded. | `freeCancellationHours` |
| A-6 | Modification | Allowed for confirmed stays that have not started. A higher price is paid first; a lower price is refunded. | — |
| A-7 | Smart allocation | Score (0–100) = party-size fit + accessibility match + preference matches (floor, view, bed type, quiet, near elevator) + price. Every score is returned with its reasons. | code (`room.service.js`) |
| A-8 | Loyalty rules | 5 points per ₹100 of room charges × tier multiplier. Tiers: Silver 0 (×1), Gold 2 500 (×1.25), Platinum 7 500 (×1.5) lifetime points. 1 point = ₹1. At most 50 % of room charges can be paid with points. | Settings |
| A-9 | Identity verification | Passport / Aadhaar / driving licence / national ID, validated by format. Only the type and last 4 characters are stored. | code |
| A-10 | Permissions | The documents name roles but not permissions. 30 permissions were derived from each role's use cases and class methods (`server/src/domain/rbac.js`). Role→permission is many-to-many in the database. | Admin → Roles & permissions |
| A-11 | Session | JWT that points to a server-side session row. Idle timeout 20 min (User.Session.Timeout). Absolute lifetime 12 h. | `SESSION_IDLE_MINUTES` |
| A-12 | MFA (SE-3) | Optional one-time 6-digit code sent over the simulated e-mail/SMS channel. | Profile toggle |
| A-13 | External services | The payment gateway (plus an optional **Razorpay test-mode** gateway, `integrations/RazorpayGateway.js`, enabled by `rzp_test_` keys; live keys are refused so no real money can move), OTA platforms, smart locks, notifications and exchange rates are **simulations** with the same interfaces as the class diagram. No real money, OTA, lock or message is involved. | `integrations/` |
| A-14 | AI Concierge | Works without any API key using the knowledge base. If `ANTHROPIC_API_KEY` is set, a Claude model answers from the same knowledge base. Every reply shows its real source. | `.env` |
| A-15 | Service catalogue | Amenities, housekeeping, maintenance, wake-up calls and room service are free. Late check-out ₹1 500, early check-in ₹1 500, extra bed ₹2 000, transfer ₹1 800, spa ₹3 500. | code |
| A-16 | OTA bookings | Treated as prepaid by the OTA (payment recorded as "Collected by <OTA>") and excluded from gateway reconciliation. The guest account is created automatically. | — |
| A-17 | Revenue | Cash basis: captured payments minus refunds, by payment date. ADR and RevPAR are over the last 30 days. | — |
| A-18 | Localisation (OR-2) | The UI is English only. The regional language is TBD-4 in the SRS itself. | — |
| A-19 | Channel.Sync.Inventory | Background sync every 30 s (the requirement is ≤ 60 s), plus an immediate push on every inventory change. | `otaSyncIntervalSeconds` (10–60) |
| A-20 | WBS | There is no dedicated WBS package for Multi-Channel Sync or Loyalty. Their code sits with 1.4.2 (reservations) and 1.4.1 (profile), as shown in TRACEABILITY.md. | — |
