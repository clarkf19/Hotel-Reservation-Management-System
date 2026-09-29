-- =====================================================================
-- Domain constraints that Prisma's schema language cannot express.
-- =====================================================================

-- BR-3 / Reservation.Prevent.DoubleBooking:
-- two active reservations may never overlap on the same room.
-- Dates are half-open [check-in, check-out) so a guest may check in on the
-- day another guest checks out. DRAFT, CHECKED_OUT and CANCELLED reservations
-- do not hold inventory.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_no_double_booking"
  EXCLUDE USING gist (
    "roomId" WITH =,
    daterange("checkInDate", "checkOutDate", '[)') WITH &&
  )
  WHERE ("status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN'));

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_dates_valid" CHECK ("checkOutDate" > "checkInDate"),
  ADD CONSTRAINT "reservations_guests_positive" CHECK ("numGuests" > 0),
  ADD CONSTRAINT "reservations_amount_nonneg" CHECK ("totalAmount" >= 0),
  -- a confirmed (or later) reservation always has a reservation number
  ADD CONSTRAINT "reservations_number_when_confirmed"
    CHECK ("status" IN ('DRAFT', 'PENDING_PAYMENT') OR ("status" = 'CANCELLED') OR "reservationNumber" IS NOT NULL);

-- SRS data dictionary: reservation number = unique, sequential integer, initial value 1
CREATE SEQUENCE IF NOT EXISTS "reservation_number_seq" START WITH 1 INCREMENT BY 1;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "payments_refund_not_exceeding" CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= "amount");

ALTER TABLE "loyalty_accounts"
  ADD CONSTRAINT "loyalty_balance_nonneg" CHECK ("pointsBalance" >= 0);

ALTER TABLE "rooms"
  ADD CONSTRAINT "rooms_capacity_positive" CHECK ("capacity" > 0);

ALTER TABLE "digital_keys"
  ADD CONSTRAINT "digital_keys_window_valid" CHECK ("expiryDate" > "issueDate");

-- SRS data dictionary: guest ID = 8-character alphanumeric string
ALTER TABLE "guests"
  ADD CONSTRAINT "guests_guest_id_format" CHECK ("guestId" ~ '^[A-Z0-9]{8}$');
