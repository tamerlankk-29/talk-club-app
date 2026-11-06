# Testing

## What's covered

| Suite | File | Covers |
| --- | --- | --- |
| Unit — cancellation policy | `apps/api/test/unit/cancellation-policy.spec.ts` | Deadline at 20:00 the previous day (and the hours-before mode), boundaries to the millisecond, grace period, session started |
| Unit — domain rules | `apps/api/test/unit/domain-rules.spec.ts` | Session status, level tolerance, membership validity (D + 35 days, end of day), membership selection, booking policy decisions, weekly recurrence |
| Unit — API contract hygiene | `apps/api/test/unit/dto-names.spec.ts` | DTO class names are unique, so OpenAPI schemas can't merge silently |
| Integration — booking & membership rules | `apps/api/test/integration/booking-rules.spec.ts` | Specification cases 1–7; expiry; 35-day validity after a Kaspi payment; double booking; room/teacher overlap constraints; **12 concurrent bookings for 7 seats → exactly 7**; **2 concurrent bookings with 1 visit left → exactly 1**; level tolerance; session cancellation returns visits |
| Integration — authentication | `apps/api/test/integration/auth.spec.ts` | SMS-code registration with consent records, sign-in, wrong codes, password sign-in, refresh rotation, the 60-second grace for a just-replaced token, parallel refreshes, expiry of the grace, logout |
| Integration — club operations | `apps/api/test/integration/operations.spec.ts` | Online purchase via the provider callback, declined payments, Kaspi request → confirm → partial refund limits, client cancelling own requests, **permission boundaries per role**, acting for unmanaged profiles, waitlist offers / holds / expiry, teacher attendance windows, auto no-shows, data export and anonymisation |

Integration tests run the real NestJS application against a real PostgreSQL database
through HTTP (Supertest): guards, validation, transactions, row locks, triggers of domain
events and database constraints are all exercised. The ledger invariant
(`visitsRemaining` == sum of ledger deltas) is asserted after every balance change.

## Running

```bash
npm run db:start          # embedded PostgreSQL (creates talkclub and talkclub_test)
npm test                  # unit + integration (sequential)
npm run test:unit         # fast, no database needed
npm run test:integration
npm run test:cov -w apps/api   # with coverage
```

The integration suite uses `TEST_DATABASE_URL` (default `…/talkclub_test`). Before the
suite starts, migrations are applied (`prisma migrate deploy`); each test file starts
from an empty database. As a safety net, the helpers refuse to truncate any database
whose name doesn't contain "test".

Time-dependent rules are tested at exact instants: tests set the API's `ClockService`
(`t.clock.set(at('2026-10-05 10:00'))`, club-local time) and advance it.

## Writing a new test

```ts
const c = await f.client();                                   // client with an account and token
const m = await f.membership(c.clientId, { visits: 5 });      // granted through the real ledger service
const s = await f.session({ startsAt: at('2026-10-07 18:30') });
const res = await t.http().post(`/api/sessions/${s}/book`).set(c.auth()).send({}).expect(201);
expect(await f.visitsRemaining(m)).toBe(4);                   // also asserts cache == ledger
```

Use `f.staff(ROLE_KEYS.MANAGER)` / `f.teacher('Name', true)` for staff tokens.

## Static checks

```bash
npm run lint      # TypeScript strict type-checking of API and web
npm run build     # production builds (catches Next.js build-time issues)
```

## Manual verification checklist (before a release)

- Client: sign up with a phone code → buy a membership (test checkout in dev) → book → see the
  confirmation with the free-cancellation time → cancel before/after the deadline → check the
  visit ledger.
- Admin: confirm a Kaspi payment; create a weekly template and see sessions generated; mark
  attendance; cancel a session and verify visits returned; run a report export.
- Teacher: today's sessions, one-tap attendance, QR check-in from a phone, feedback visible in
  the client's progress page.
- PWA: install on Android and iPhone, offline page when the network is off, push notification
  received and opening the right page.
