-- Integrity rules that Prisma's schema language cannot express.
-- These are the database-level safety net behind the service-layer checks:
-- even a buggy code path cannot overbook a room, a teacher, or a visit balance.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─── Sessions ────────────────────────────────────────────────────────────
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_time_range_chk" CHECK ("ends_at" > "starts_at"),
  ADD CONSTRAINT "sessions_capacity_chk" CHECK ("capacity" > 0);

-- A room can host only one scheduled session at a time (back-to-back is fine: '[)' range).
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_no_room_overlap"
  EXCLUDE USING gist ("room_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("status" = 'SCHEDULED' AND "room_id" IS NOT NULL);

-- A teacher can lead only one scheduled session at a time.
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_no_teacher_overlap"
  EXCLUDE USING gist ("teacher_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("status" = 'SCHEDULED' AND "teacher_id" IS NOT NULL);

ALTER TABLE "session_templates"
  ADD CONSTRAINT "session_templates_start_time_chk" CHECK ("start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT "session_templates_values_chk" CHECK ("duration_minutes" > 0 AND "capacity" > 0),
  ADD CONSTRAINT "session_templates_days_chk" CHECK ("days_of_week" <@ ARRAY[1,2,3,4,5,6,7] AND cardinality("days_of_week") > 0);

ALTER TABLE "rooms"
  ADD CONSTRAINT "rooms_capacity_chk" CHECK ("capacity" > 0);

-- ─── Memberships & visit ledger ──────────────────────────────────────────
ALTER TABLE "membership_plans"
  ADD CONSTRAINT "membership_plans_values_chk" CHECK ("visits" > 0 AND "price" >= 0 AND "validity_days" > 0);

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_visits_remaining_chk" CHECK ("visits_remaining" >= 0),
  ADD CONSTRAINT "memberships_visits_total_chk" CHECK ("visits_total" >= 0),
  ADD CONSTRAINT "memberships_period_chk" CHECK ("expires_at" > "starts_at");

ALTER TABLE "membership_transactions"
  ADD CONSTRAINT "membership_transactions_balance_chk" CHECK ("balance_after" >= 0);

-- ─── Bookings & waitlist ─────────────────────────────────────────────────
-- active_slot is TRUE exactly while a booking holds a seat, NULL otherwise (never FALSE),
-- so the unique index (session_id, client_id, active_slot) blocks double-booking.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_active_slot_chk" CHECK (
    ("status" IN ('BOOKED', 'ATTENDED', 'NO_SHOW') AND "active_slot" IS TRUE)
    OR ("status" IN ('CANCELLED', 'LATE_CANCELLED') AND "active_slot" IS NULL)
  ),
  ADD CONSTRAINT "bookings_membership_required_chk" CHECK ("kind" <> 'MEMBERSHIP' OR "membership_id" IS NOT NULL);

ALTER TABLE "waitlist_entries"
  ADD CONSTRAINT "waitlist_entries_active_slot_chk" CHECK (
    ("status" IN ('WAITING', 'OFFERED') AND "active_slot" IS TRUE)
    OR ("status" NOT IN ('WAITING', 'OFFERED') AND "active_slot" IS NULL)
  );

-- ─── Payments ────────────────────────────────────────────────────────────
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_chk" CHECK ("amount" >= 0 AND "refunded_amount" >= 0 AND "refunded_amount" <= "amount");

-- ─── Feedback ────────────────────────────────────────────────────────────
ALTER TABLE "teacher_feedback"
  ADD CONSTRAINT "teacher_feedback_scores_chk" CHECK (
    ("participation" IS NULL OR "participation" BETWEEN 1 AND 5)
    AND ("fluency" IS NULL OR "fluency" BETWEEN 1 AND 5)
    AND ("vocabulary" IS NULL OR "vocabulary" BETWEEN 1 AND 5)
    AND ("confidence" IS NULL OR "confidence" BETWEEN 1 AND 5)
    AND ("pronunciation" IS NULL OR "pronunciation" BETWEEN 1 AND 5)
    AND ("conversation" IS NULL OR "conversation" BETWEEN 1 AND 5)
  );
