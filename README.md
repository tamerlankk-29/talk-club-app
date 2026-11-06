# Talk Club — club management platform

The operating system for **Talk Club**, an English Speaking Club in Almaty
(Zheltoksan Street 118, offices 314–316): a mobile-first client app (installable PWA),
an admin panel with CRM, a teacher panel, and a REST API with the booking,
membership and payment engine behind them.

Everything is real: PostgreSQL, authentication, role-based permissions, server-side
business rules, an audit log and automated tests. External services that need
contracts (Kaspi Pay, SMS, WhatsApp, Telegram, email) sit behind adapters with
working development implementations, so they can be connected without touching
business logic.

| Part | Who | Where |
| --- | --- | --- |
| Client app (PWA) | Members, parents, guests | `/` — schedule, booking, membership, payments, notifications, profile |
| Admin panel | Owner, admins, managers, marketing | `/admin` — dashboard, clients & CRM, schedule, attendance, payments, marketing, reports, settings |
| Teacher panel | Teachers | `/teacher` — today's sessions, one-tap attendance, QR check-in, feedback |
| API + docs | Apps and integrations | `http://localhost:4000/api` · OpenAPI UI at `/api/docs` |

## Highlights

- **Booking engine** — capacity (7 per group), level matching, booking window,
  overlap checks, waitlist with timed seat offers, trial sessions. Concurrency-safe:
  row locks plus database constraints make double-booking and overselling impossible.
- **Membership engine** — LITE 4 / STANDARD 8 / INTENSIVE 12 / UNLIMITED 20 visits,
  35-day validity. Every visit change is an entry in a **visit ledger**, so balances
  are auditable and can't drift.
- **Cancellation policy** — free until 20:00 the day before (configurable); later
  cancellations and no-shows use the visit. Clients always see the exact deadline
  before they book or cancel.
- **Payments** — Kaspi invoice workflow (request → client pays → admin confirms →
  membership activates), cash/card, refunds, and a provider interface for online
  payments (test checkout included for development).
- **CRM** — lead pipeline (new lead → active client → expiring → renewed/lost),
  tasks, communication log, tags, segments, broadcasts, announcements and
  rule-based automations (reminders, follow-ups, win-back).
- **Notifications** — editable templates, in-app inbox, Web Push, and SMS / WhatsApp /
  Telegram / email adapters; reminders and staff alerts.
- **Reports** — revenue, attendance, occupancy, conversion funnel, renewals, teacher
  stats; CSV/XLSX exports. Altegio import for migrating history.
- **Security & privacy** — JWT + rotating httpOnly refresh cookie, SMS-code sign-in,
  configurable roles/permissions checked on every request, audit log, data export,
  account deletion (anonymisation) and consent records.

## Tech stack

- **API:** NestJS 11, TypeScript 5.9, Prisma 6, PostgreSQL 17, class-validator, zod (settings), Jest + Supertest
- **Web:** Next.js 15 (App Router), React 19, Tailwind CSS 4, TanStack Query, openapi-fetch (types generated from the API's OpenAPI document), Radix UI, Recharts
- **Monorepo:** npm workspaces — `apps/api`, `apps/web`

## Quick start (local development)

Requirements: **Node.js 20.18+** (22 recommended). No Docker needed — the dev database
is an embedded PostgreSQL 17 managed by npm scripts. (Prefer containers? See
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).)

```bash
npm install
cp apps/api/.env.example apps/api/.env      # then set AUTH_SECRET (see the comment in the file)
cp apps/web/.env.example apps/web/.env.local
npm run db:start                            # terminal 1 — PostgreSQL on localhost:5433 (keep running)
npm run db:migrate                          # apply migrations
npm run db:seed                             # demo club: 5 weeks of history (development only)
npm run dev:api                             # terminal 2 — API on http://localhost:4000
npm run dev:web                             # terminal 3 — web on http://localhost:3000
```

`npm run db:reseed` rebuilds the demo data for today's date (local databases only).

### Demo accounts (development seed only)

| Role | Sign in with | Password |
| --- | --- | --- |
| Super admin | `owner@talkclub.kz` | `TalkClub2026!` |
| Admin | `admin@talkclub.kz` | `TalkClub2026!` |
| Manager | `manager@talkclub.kz` | `TalkClub2026!` |
| Marketing | `marketing@talkclub.kz` | `TalkClub2026!` |
| Teacher (Michael) | `michael@talkclub.kz` | `TalkClub2026!` |
| Teacher (Kevin) | `kevin@talkclub.kz` | `TalkClub2026!` |
| Client (Tamerlan) | phone `+7 701 555 01 01` (the SMS code is shown on screen in dev) or `tamerlan@example.com` | `Client2026!` |
| Parent with a child profile | phone `+7 701 555 01 10` or `aigerim@example.com` | `Client2026!` |

These exist only in the development seed. Never run the seed against a real database
(it refuses non-local hosts and `NODE_ENV=production`).

## Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev:api` / `npm run dev:web` | Start the API / web app in watch mode |
| `npm test` | All API tests (unit + integration; needs the dev database running) |
| `npm run lint` | Type-check API and web |
| `npm run build` | Production build of both apps |
| `npm run api:openapi` | Regenerate `apps/api/openapi.json` |
| `npm run api:types` | Regenerate the web app's typed API client from it |
| `npm run db:migrate` | Create/apply migrations in development |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — modules, data flow, key design decisions
- [Business rules](docs/BUSINESS_RULES.md) — booking, cancellation, memberships, waitlist, attendance, CRM
- [Database](docs/DATABASE.md) — data model, constraints, migrations, seed
- [API](docs/API.md) — conventions, authentication, errors, generated client
- [Integrations](docs/INTEGRATIONS.md) — Kaspi/payments, messaging channels, Web Push, Altegio, storage
- [Deployment](docs/DEPLOYMENT.md) — environments, Docker, configuration, backups, go-live checklist
- [Testing](docs/TESTING.md) — test strategy and how to run the suites
- [Security & privacy](docs/SECURITY.md) — auth, permissions, data protection
- [Admin guide](docs/ADMIN_GUIDE.md) — everyday tasks for club staff

## Repository layout

```
apps/
  api/                 NestJS API
    prisma/            schema, migrations, demo seed
    src/domain/        pure business rules (cancellation, levels, membership, recurrence)
    src/modules/       feature modules (bookings, memberships, payments, crm, …)
    test/              unit + integration tests
  web/                 Next.js app
    src/app/(client)/  client PWA routes        src/app/admin/   admin panel
    src/app/teacher/   teacher panel            src/components/  UI kit and feature components
    public/sw.js       service worker (offline shell, caching, push)
docs/                  documentation
scripts/dev-db.mjs     embedded PostgreSQL for development
docker-compose.yml     containerised stack (PostgreSQL 17, API, web)
```
