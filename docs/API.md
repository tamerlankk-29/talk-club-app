# API

Base URL: `/api` (e.g. `http://localhost:4000/api`; through the web app the same paths are
available on its origin). Interactive documentation: **`/api/docs`** (Swagger UI), raw
OpenAPI 3 JSON at `/api/docs-json` and committed as `apps/api/openapi.json`.

## Areas

| Prefix | Audience | Examples |
| --- | --- | --- |
| `/auth` | Everyone | OTP request/verify, register, password login, refresh, logout, password reset/change |
| `/public` | Anonymous | Club profile & content, teachers, levels, payment methods, legal texts, trial requests |
| `/sessions`, `/bookings`, `/waitlist` | Clients (schedule is public) | Schedule with per-viewer bookability, book, cancel with preview, calendar (.ics), waitlist |
| `/my/*`, `/me` | Signed-in clients | Home, profile, membership & ledger, bookings, attendance, payments, family, referral, data export, deletion request |
| `/notifications` | Signed-in users | Inbox, unread count, preferences, Web Push subscription |
| `/teacher/*` | Teachers | Own sessions, attendance, feedback |
| `/attendance/check-in` | Teachers, admins | QR check-in |
| `/admin/*` | Staff (per permission) | Clients, CRM, schedule, bookings, memberships, payments, marketing, reports, settings, staff & roles, audit, imports/exports |
| `/health` | Monitoring | Liveness + database check |

## Authentication

- `Authorization: Bearer <accessToken>` — access tokens live 15 minutes.
- Web clients get the refresh token as an `httpOnly` cookie (`tc_rt`, path `/api/auth`) and
  call `POST /api/auth/refresh` to get a new access token. Native apps send
  `X-Client-Platform: native` to receive and send the refresh token in the body instead.
- Parents acting for a child send `X-Acting-Client: <childClientId>` on client endpoints.
- Every admin endpoint declares its required permission(s); the OpenAPI document lists them per
  operation, and `GET /api/admin/permissions` returns the catalogue.

### Sign-in flow (clients)

```http
POST /api/auth/otp/request        { "phone": "+7 701 555 01 01" }
POST /api/auth/otp/verify         { "phone": "+77015550101", "code": "123456" }
  → { "status": "AUTHENTICATED", "auth": { accessToken, expiresIn, user } }
  → { "status": "REGISTRATION_REQUIRED", "registrationToken": "…" }
POST /api/auth/register           { registrationToken, firstName, acceptTerms: true, marketingConsent, … }
```

## Errors

Every error has the same envelope and an HTTP status that matches the situation:

```json
{
  "error": {
    "code": "BOOKING_NO_VISITS_LEFT",
    "message": "You have no visits left on your membership.",
    "details": null,
    "requestId": "f3c1…"
  }
}
```

- `code` is stable — branch on it in clients. The full catalogue is in
  `apps/api/src/common/errors/error-codes.ts` and in the OpenAPI description.
- `message` is safe to show to end users; internal details never leak.
- Validation errors (`VALIDATION_FAILED`, 400) list per-field messages:
  `details.fields` (`{ "email": "email must be an email" }`) and `details.messages`.
- Settings validation (`SETTINGS_INVALID`) returns `details.issues: [{ path, message }]`.

## Conventions

- JSON bodies; unknown fields are rejected.
- Dates are ISO 8601 instants in UTC. Club-local values are provided alongside where useful
  (`localDate`, `startTime`, `endTime` in Asia/Almaty) — clients don't need timezone logic.
- Money is whole tenge (`26000`).
- Paged admin lists accept `page` and `pageSize` and return `{ items, total, page, pageSize }` (the audit log returns `{ items, meta }`).
- Rate limits per client IP: OTP request 5/min, verify 10/min, register 5/min, login 10/min,
  refresh 30/min, everything else 300/min. Exceeding returns `RATE_LIMITED` (429).
- File downloads (`calendar.ics`, exports, data export) use `Content-Disposition` filenames.

## Typed client (web)

The web app never hand-writes request types:

```bash
npm run api:openapi   # NestJS → apps/api/openapi.json (Swagger plugin infers DTOs)
npm run api:types     # openapi-typescript → apps/web/src/lib/api/schema.ts
```

`apps/web/src/lib/api/client.ts` wraps `openapi-fetch` with token handling (refresh on 401,
acting-client header) and turns error envelopes into `ApiError` (`code`, `message`,
`details`). A unit test keeps DTO class names unique so schemas can't silently merge.

## Webhooks

`POST /api/payments/webhooks/:provider` receives payment provider callbacks. Providers verify
signatures (`PAYMENT_WEBHOOK_SECRET`) in their `parseWebhook` implementation; confirmation is
idempotent. See [INTEGRATIONS.md](INTEGRATIONS.md).
