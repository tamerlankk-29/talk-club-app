# Business rules

All rules live in the API. Values marked ⚙️ are defaults that admins change in
**Admin → Settings** without code changes; every change is validated and audited.
The pure rule functions are in `apps/api/src/domain/` and are covered by unit tests;
the end-to-end scenarios are covered by integration tests (see [TESTING.md](TESTING.md)).

## Club and sessions

- Location: Talk Club, Zheltoksan Street 118, offices 314–316, Almaty (timezone Asia/Almaty). Rooms: Office 314, 315, 316.
- Opening hours ⚙️: Monday–Saturday 12:30–20:00, Sunday closed (Admin → Settings → Location & rooms).
- A session lasts 90 minutes ⚙️ and holds up to 7 participants ⚙️. Saving a session warns (without blocking) when the room is too small, the teacher isn't marked available or is inactive, or the time is outside opening hours.
- A room or a teacher can never be in two overlapping sessions — enforced by the database, not just the UI.
- Weekly **templates** (e.g. Mon/Wed/Fri 18:30, Office 314, Intermediate, Michael) generate sessions 4 weeks ahead ⚙️, every night. Editing a template updates future generated sessions that were not edited by hand; sessions with bookings are never deleted by a template change.
- A session's displayed status is computed, never stored: Scheduled (booking not open yet / closed) · Open · Almost full (≤ 2 seats ⚙️) · Full · In progress · Completed · Cancelled.

## Who can book what

| Rule | Default | Error code |
| --- | --- | --- |
| Booking opens N days before the start | 21 days ⚙️ | `BOOKING_NOT_OPEN_YET` |
| Online booking closes N minutes before the start | 0 = until the start ⚙️ | `BOOKING_CLOSED` |
| Session already started / cancelled | — | `BOOKING_SESSION_STARTED`, `BOOKING_SESSION_CANCELLED` |
| One active booking per client per session | — | `BOOKING_ALREADY_BOOKED` |
| Group restricted to client types (Kids, Teens, Business…) | per group type | `BOOKING_CATEGORY_NOT_ALLOWED` |
| Level within the session's range ± tolerance | block, tolerance 1 level ⚙️ (or warn / off) | `BOOKING_LEVEL_MISMATCH` |
| No overlapping bookings for one client | on ⚙️ | `BOOKING_OVERLAP` |
| Free seat (seats held for waitlist offers count as taken) | capacity 7 | `BOOKING_SESSION_FULL`, `BOOKING_OFFER_RESERVED` |
| A membership valid on the session date with visits left | — | `BOOKING_NO_ACTIVE_MEMBERSHIP`, `BOOKING_NO_VISITS_LEFT`, `BOOKING_MEMBERSHIP_EXPIRES_BEFORE_SESSION`, `BOOKING_PLAN_NOT_VALID_FOR_SESSION` |

- Unknown client level → the level rule is skipped (the teacher sets the level later).
- Staff can override capacity and rules (`bookings.override` permission); overrides are recorded on the booking and in the audit log.
- The schedule shows each signed-in client a precomputed **bookability** for every session (can book / trial / waitlist / why not), produced by the same function that makes the final decision inside the booking transaction.

## Memberships

| Plan | Visits | Price | Validity |
| --- | --- | --- | --- |
| LITE | 4 | 15,000 ₸ | 35 days |
| STANDARD | 8 | 26,000 ₸ | 35 days |
| INTENSIVE | 12 | 36,000 ₸ | 35 days |
| UNLIMITED | 20 | 50,000 ₸ | 35 days |

Plans, prices and validity are editable (Admin → Memberships → Plans); changes apply to new purchases only.

- **Validity:** a membership purchased (activated) on day D is valid through the end of club-local day D + 35. Example: purchased 24 September → valid until 29 October inclusive.
- **Activation:** when the payment is confirmed (or when staff grant a membership). A pending Kaspi request does not give visits yet.
- **Which membership pays:** if a client has several, the usable one that expires first is used.
- **Visit ledger:** every change is a transaction with a reason — purchase, grant, booking (−1), cancellation in time (+1), session cancelled by the club (+1), staff return (+1), staff adjustment (±N), extension (date change). The balance can't go below zero (database check).
- **Expiry:** unused visits expire with the membership; bookings already made for sessions before the expiry stay valid.
- **Low visits / expiring** notifications go out automatically (2 visits left ⚙️; 7, 3 and 1 days before expiry — editable automations).
- Staff can extend, change the end date, adjust visits or cancel a membership — always with a mandatory reason (ledger + audit log).

## Booking, cancellation and no-shows

- **Booking** deducts one visit immediately (the seat and the visit are reserved together).
- **Free cancellation** ⚙️: until **20:00 on the day before** the session (alternative mode: N hours before). Cancelling before the deadline returns the visit.
- **Late cancellation**: after the deadline the booking is cancelled but the visit is **not** returned. The client must confirm explicitly ("Cancel anyway"); the API rejects a late cancellation without that confirmation (`BOOKING_LATE_CANCELLATION_CONFIRMATION_REQUIRED`).
- **Grace period** ⚙️ (default off): a booking cancelled within N minutes of being made is free even after the deadline.
- **No-show**: a booked client who isn't marked present becomes a no-show; the visit stays used.
- Clients can't cancel once the session has started; staff can (and may waive the penalty with `bookings.override`).
- **Session cancelled by the club**: every booking is cancelled, every visit returned, booked and waitlisted clients are notified.
- **Moving** a booking (staff) cancels and rebooks atomically, keeping the visit; the client is notified.

### Specification scenarios (all covered by integration tests)

1. 5 visits → book → 4 left.
2. Cancel before 20:00 the previous day → visit returned (4 → 5).
3. Cancel after the deadline → booking cancelled, visit not returned.
4. No-show → visit stays deducted.
5. 0 visits → booking refused (`BOOKING_NO_VISITS_LEFT`).
6. Expired membership → booking refused.
7. Full session (7/7) → booking refused, waitlist offered.

## Waitlist

- Available when a session is full ⚙️.
- When a seat frees up, the first person waiting is **offered** it and the seat is **held for 60 minutes** ⚙️; they get a notification and a "Book the place" button. If they don't claim it, the offer passes to the next person.
- Closer than 60 minutes ⚙️ to the start, holds stop: everyone waiting is notified and the first to book wins.
- Claiming books normally (uses a visit and all booking rules apply).

## Attendance

- Teachers mark their own sessions from 30 minutes before the start ⚙️ until 24 hours after the end ⚙️; admins can mark and correct any session.
- Statuses: present, late (both count as attended), absent (no-show). Methods: manual, QR, automatic.
- **QR check-in:** the client app shows a rotating code (valid 5 minutes); a teacher or admin scans it and the client is marked present in their session.
- **Auto-finalisation:** unmarked bookings are finalised 3 hours after the end ⚙️ as no-shows ⚙️.
- Attendance never changes the visit balance (the visit was used at booking); returning a visit for a no-show is an explicit, audited staff action.

## Trials

- Trial session price 1,500 ₸ ⚙️, one per client ⚙️, only in sessions open to trials.
- Clients can book a trial themselves ⚙️ (if they never had a membership) or leave a request on the website; staff schedule requests into a session.
- After the trial staff record attendance and the outcome (interested / bought / not interested); automations create follow-up tasks.

## Payments

- **Kaspi invoice workflow:** staff create a payment request (or the client starts one in the app) → the client pays the Kaspi invoice → staff confirm it with the Kaspi reference → the membership activates instantly and the client is notified.
- Cash / card at the desk: the same flow, or "payment already received" to record and activate in one step.
- Online providers (Kaspi Pay API, bank acquiring) confirm automatically by webhook — the provider interface is ready; a test checkout is available in development.
- Refunds (full or partial) are recorded with a reason, optionally cancelling the membership; requires `payments.refund`.
- The client must accept the current public offer when buying; the acceptance is stored with the version, time and device.

## CRM lifecycle

Lead stages: New lead → Contacted → Interested → Trial booked → Trial attended →
Membership purchased → Active client → Membership expiring → Renewed / Inactive / Lost.

- Stages move automatically from real events (registration, trial booking/attendance, payment, expiry, inactivity) and can be moved manually on the pipeline board.
- Thresholds ⚙️: expiring soon = 7 days, inactive after 14 days without a visit, new client for 14 days, VIP from 8 visits per 30 days, lead lost after 30 days.
- Segments (system ones such as "Expiring soon", "Inactive", "Trial — not converted", "VIP / high frequency", plus custom rule-based ones) drive broadcasts, announcements and automations.

## Notifications

- Transactional messages (bookings, cancellations, payments, waitlist offers) are always sent; reminders can be switched off by the client; marketing messages only reach clients who opted in.
- Channels per template ⚙️: in-app, push, WhatsApp, Telegram, SMS, email. SMS is used only as a fallback when the client has no push-enabled device.
- Session reminders: 24 hours and 2 hours before ⚙️.
- Staff alerts ⚙️: new registration, trial request, payment received, session full, cancellations, no-shows, waitlist demand, data requests (expiring-membership alerts are off by default).

## Referrals

Each client has a personal code and link (`/register?ref=CODE`). A friend who registers with it is linked to the referrer; the reward ⚙️ is credited by staff once the friend buys a membership.

## Privacy

- Consent to Terms and Privacy Policy is required at registration and recorded per version; marketing consent is separate and optional.
- Clients can download their data (JSON) and request account deletion. Staff complete deletion by anonymising the profile: personal data is erased, financial records are kept without it.
