# Deployment

## Environments

| | Development | Staging | Production |
| --- | --- | --- | --- |
| Purpose | Building features | Rehearsal with realistic data, client acceptance | Live club |
| Database | Embedded PostgreSQL 17 (`npm run db:start`) or Docker | Managed PostgreSQL 17 or the compose `db` service | Managed PostgreSQL 17 with automated backups |
| `NODE_ENV` | `development` | `staging` | `production` |
| SMS code echo (`AUTH_OTP_DEV_ECHO`) | `true` | `false` (enforced) | `false` (enforced) |
| Test checkout (`PAYMENT_MOCK_ONLINE_ENABLED`) | `true` | `false` (enforced) | `false` (enforced) |
| Demo seed | `npm run db:reseed` | Optional, via the compose `demo` profile with `NODE_ENV=development` in that container only | **Never** |
| HTTPS | Not required (localhost) | Required | Required |

`staging` behaves exactly like `production` (same validation, secure cookies) — use a
separate database, VAPID keys and `AUTH_SECRET`.

## Containers (recommended)

The repository ships `apps/api/Dockerfile`, `apps/web/Dockerfile` and `docker-compose.yml`:

```bash
cp .env.compose.example .env        # set AUTH_SECRET, POSTGRES_PASSWORD, APP_URL, VAPID keys
docker compose up -d --build        # db → migrate (prisma migrate deploy) → api → web
docker compose logs -f api
```

| Service | Image / target | Notes |
| --- | --- | --- |
| `db` | `postgres:17-alpine` | Volume `pgdata`; not published — only the API reaches it over the compose network |
| `migrate` | API `migrate` target | Runs `prisma migrate deploy`, then exits; `api` starts only after it succeeds |
| `api` | API `runtime` target | Lean image (production dependencies only), runs as `node`, health check on `/api/health`, uploads volume; not published (reached through `web`) |
| `web` | Next.js standalone | Proxies `/api/*` to `http://api:4000` (baked in at build time via `API_INTERNAL_URL`) |
| `seed` | API `tools` target, profile `demo` | `docker compose --profile demo run --rm seed` — demo data for staging trials only |

Upgrades: `git pull && docker compose up -d --build` — migrations run automatically before the
new API starts.

### Reverse proxy and HTTPS

The PWA (installation, service worker, push, camera for QR check-in) requires HTTPS. Put a TLS
proxy in front of `web` only — the API doesn't need to be public because the browser reaches it
through the web app. Example with Caddy (automatic Let's Encrypt certificates):

```
app.talkclub.kz {
  encode zstd gzip
  reverse_proxy web:3000
}
```

or nginx:

```nginx
server {
  listen 443 ssl http2;
  server_name app.talkclub.kz;
  ssl_certificate     /etc/letsencrypt/live/app.talkclub.kz/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/app.talkclub.kz/privkey.pem;
  client_max_body_size 12m;   # imports up to 10 MB
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Set `APP_URL=https://app.talkclub.kz`, `CORS_ORIGINS=https://app.talkclub.kz` and keep
`COOKIE_SECURE=true`. The API trusts `X-Forwarded-*` headers from the proxy (for client IPs in
rate limiting and audit logs).

## Without containers

```bash
npm ci
npm run build                                   # API (dist/) and web (.next/standalone)
cd apps/api && npx prisma migrate deploy && node dist/main.js     # API on PORT (4000)
cd apps/web && node .next/standalone/apps/web/server.js            # web on 3000
```

Copy `apps/web/.next/static` to `.next/standalone/apps/web/.next/static` and `apps/web/public`
to `.next/standalone/apps/web/public` (the Dockerfile shows the exact layout). Run both under a
process manager (systemd, PM2) behind the reverse proxy.

## Configuration

API variables (see `apps/api/.env.example` for all of them):

| Variable | Required in production | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | `postgresql://user:pass@host:5432/talkclub?schema=public` |
| `AUTH_SECRET` | yes | ≥ 32 random characters; changing it signs everyone out |
| `APP_URL` | yes | Public URL of the web app; used in links and checkout redirects |
| `CORS_ORIGINS` | if the API is called cross-origin | Comma-separated |
| `COOKIE_SECURE` | default true in production | Must stay true behind HTTPS |
| `PUSH_VAPID_PUBLIC_KEY` / `PRIVATE_KEY` / `SUBJECT` | for push | `npx web-push generate-vapid-keys` |
| `NOTIFY_*_PROVIDER` + credentials | per channel | See [INTEGRATIONS.md](INTEGRATIONS.md) |
| `AUTH_SMS_DAILY_LIMIT` | default 200 | Most SMS codes per 24 hours |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | recommended | Captcha after a few code requests from one network; both or neither |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | for codes in Telegram | Secret ≥ 24 characters in production; the webhook is registered on start |
| `PAYMENT_WEBHOOK_SECRET`, `KASPI_*` | when online payments are connected | |
| `STORAGE_LOCAL_DIR` | yes (persistent volume) | Uploaded photos and images |
| `JOBS_ENABLED` | default true | Jobs are safe with several instances (advisory locks) |
| `AUTH_OTP_DEV_ECHO`, `PAYMENT_MOCK_ONLINE_ENABLED` | must be false | The API refuses to start otherwise |
| `API_DOCS_ENABLED` | no | `/api/docs` is served only outside production/staging unless this is `true` |

Web variables: `API_INTERNAL_URL` (build time) — where the Next.js server proxies `/api/*`.

The API validates its configuration at startup and exits with a clear message listing every
problem (missing secret, dev-only flags enabled, …).

## First production start

1. Deploy and let migrations run. On first start the API creates the reference data: the
   Talk Club program, the Zheltoksan 118 location with offices 314–316, levels, group types,
   membership plans, payment methods, lead sources, notification templates, default
   automations, legal document templates and the built-in roles.
2. Create the owner account (one-off, refuses to run if a super admin already exists):

   ```bash
   docker compose exec -e ADMIN_PASSWORD='a-strong-password' api \
     node dist/scripts/create-admin.js --email owner@talkclub.kz --name "Aida"
   # without containers: npm run create-admin -w apps/api -- --email … --name …
   ```

   Without `ADMIN_PASSWORD` a temporary password is generated and printed once. Add other staff
   from Admin → Staff & roles.
3. Replace the legal templates (Admin → Settings → Legal documents) with lawyer-approved texts.
4. Fill in the club profile, opening hours, map coordinates, teachers (photos, bios), plans and
   prices, and create the weekly templates (Admin → Schedule → Weekly templates).
5. Import existing clients from Altegio (Admin → Import & export) — dry run first.
6. Configure VAPID keys and messaging providers; send a test notification from Admin → Notifications.

## Backups

- **Database:** daily automated backups with point-in-time recovery (managed PostgreSQL), or a
  nightly `pg_dump -Fc` from the `db` container to off-site storage, kept for at least 30 days:

  ```bash
  docker compose exec -T db pg_dump -U talkclub -Fc talkclub > backup-$(date +%F).dump
  # restore: pg_restore -U talkclub -d talkclub --clean backup-YYYY-MM-DD.dump
  ```

- **Uploads:** back up the `uploads` volume (or use object storage with versioning).
- Test a restore on staging regularly.

## Monitoring

- `GET /api/health` — 200 when the API and database respond (used by the container health checks).
- Logs are JSON-friendly Nest logs on stdout; every request has an id echoed in error responses
  (`requestId`) to find the matching log line.
- Watch: job failures (`Job … failed`), delivery failures (Admin → Notifications → Delivery log),
  pending payments and unmarked attendance (dashboard alerts).

## Go-live checklist

- [ ] HTTPS on the public domain; `APP_URL`/`CORS_ORIGINS` set; `COOKIE_SECURE=true`
- [ ] Strong `AUTH_SECRET` and database password stored in a secret manager, not in git
- [ ] `AUTH_OTP_DEV_ECHO=false`, `PAYMENT_MOCK_ONLINE_ENABLED=false`, real SMS provider for sign-in codes
- [ ] VAPID keys configured; push tested on Android and an iPhone (installed to Home Screen)
- [ ] Legal texts reviewed by a lawyer and published
- [ ] Backups scheduled and a restore tested
- [ ] Demo data never loaded into production
- [ ] Staff accounts created with the least privilege they need
