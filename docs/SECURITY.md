# Security & privacy

## Authentication

| Who | How |
| --- | --- |
| Clients | Phone number + 6-digit SMS code. Codes are stored as HMACs, expire in 5 minutes, allow a limited number of attempts and have a resend cooldown. Optional password (scrypt). |
| Staff, teachers | Email or phone + password (scrypt, parameters stored with the hash). Temporary passwords are shown once and should be changed after the first sign-in. |
| Owners, admins | Additionally a 6-digit code from an authenticator app (two-factor sign-in, required for the roles in `AUTH_2FA_REQUIRED_ROLES`, default `SUPER_ADMIN,ADMIN`). |

- **Access token:** JWT signed with `AUTH_SECRET`, 15 minutes, kept only in memory by the web app (never in `localStorage`).
- **Refresh token:** random, stored as a SHA-256 hash in `auth_sessions`, sent as an `httpOnly`, `Secure` (production), `SameSite=Strict` cookie restricted to `/api/auth`. Each refresh rotates it; the previous token stays valid for 60 seconds only to absorb aborted responses and parallel tabs. Sign-out revokes the session; blocked users are cut off on their next request.
- **Two-factor sign-in (TOTP, RFC 6238):** after the password, phone code or password reset, a
  user with 2FA (or a role that requires it) gets `AUTH_TOTP_REQUIRED` / `AUTH_TOTP_SETUP_REQUIRED`
  with a 10-minute challenge token instead of a session; `POST /api/auth/totp/verify` exchanges it
  for a session. First sign-in shows a QR code and, after the first valid code, eight one-time
  recovery codes (stored as SHA-256 hashes). Secrets are AES-256-GCM encrypted with a key derived
  from `AUTH_SECRET` (rotating it means resetting 2FA for everyone). Codes can't be replayed; five
  wrong codes lock the step for 15 minutes. A super admin resets a lost phone in Admin → Staff
  (`POST /api/admin/staff/:id/reset-2fa`, audited); for the last owner use
  `node dist/scripts/reset-2fa.js --email …` on the server.
- Cookie-authenticated endpoints additionally check the `Origin` header against the allowed origins (defence in depth against CSRF).
- Rate limiting on sign-in endpoints (see [API.md](API.md)).
- **SMS budget protection** (against SMS-pumping bots): SMS codes go only to +7 numbers, at most
  `AUTH_SMS_DAILY_LIMIT` SMS codes per 24 hours (the API logs an error when the cap is hit and
  members are pointed to Telegram), and a Cloudflare Turnstile captcha after
  `CAPTCHA_FREE_REQUESTS_PER_HOUR` sign-in code requests from one IP. Password-reset codes go only
  to registered numbers.

## Authorisation

- Every admin endpoint declares the permissions it needs; the guard checks them on each request
  against the user's roles (permissions are cached briefly and invalidated when roles change).
- Built-in roles: Super admin (everything), Admin (everything except staff and role management),
  Manager (front desk: clients, CRM follow-ups, schedule, bookings, attendance, Kaspi payment requests and confirmations — no refunds or revenue figures), Marketing (CRM, segments,
  broadcasts, announcements, automations, analytics), Teacher (own sessions, attendance,
  feedback). Custom roles can be created in Admin → Staff & roles.
- Sensitive capabilities are separate permissions: `finance.view` (revenue), `payments.refund`,
  `bookings.override` (capacity / penalty overrides), `teachers.view_rates`, `data.export`,
  `clients.delete` (archive, anonymise), `roles.manage`, `staff.manage`.
- Teachers only see and mark their own sessions, within a time window around the session.
- Client endpoints only ever act on the caller's own profile — or a child profile they are a
  linked guardian of (`X-Acting-Client` is verified server-side).
- The UI hides what a user can't do, but the API is the enforcement point.

## Input and output handling

- All request bodies are validated (class-validator, whitelist + reject unknown fields); query
  parameters are typed; database access goes through Prisma (parameterised).
- Uploaded files: size limits per purpose, content sniffed from the bytes (not the file name),
  stored under random keys; path traversal is impossible by construction.
- Markdown content (rules, about, legal texts) is rendered without raw HTML.
- Errors never expose stack traces or SQL; they carry a request id for support.
- HTTP security headers via helmet (API) and Next.js headers (web): CSP in production,
  `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
  (camera allowed only for the QR scanner on the same origin).

## Audit log

Every staff action that changes money, visits, bookings, sessions, settings, roles, staff,
legal documents or personal data is recorded with the actor, time, IP, before/after values and
the reason where one is required (visit adjustments, refunds, cancellations on behalf of a
client, anonymisation). Viewing requires `audit.view`. Exports are logged too.

## Personal data (GDPR-style)

- **Consent:** acceptance of the Terms and Privacy Policy is required and recorded per document
  version with time and device; the public offer is accepted at purchase. Marketing consent is
  separate, optional and can be withdrawn in the app at any time.
- **Access:** clients download all their data as JSON from Profile → Privacy & data.
- **Deletion:** clients request deletion in the app; staff complete it by anonymising the
  profile (name, contacts, birth date, photo, notes, communications, notifications, push
  subscriptions and sign-in credentials are erased; sessions are revoked). Payment and booking
  records stay for accounting, without personal data. Requests can be declined with an audited
  reason.
- **Minimisation:** staff lists and assignee pickers expose names only; phone numbers are
  shown only where staff need them.
- **Secrets:** configuration via environment variables only; `.env` files are git-ignored;
  integration secrets are never returned by the API.

## Operational recommendations

- Serve only over HTTPS; keep `COOKIE_SECURE=true`.
- Use a long random `AUTH_SECRET` per environment and rotate it if it leaks (everyone signs in again).
- Give staff the least privileged role that fits; review roles quarterly.
- Restrict database access to the API host; enable encrypted backups.
- Keep dependencies updated (`npm audit`, Dependabot/Renovate).
