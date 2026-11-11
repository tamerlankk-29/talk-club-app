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
2. Create the owner account (one-off, refuses to run if a super admin already exists).
   `scripts/server-setup.sh` asks for the owner's e-mail, name and password and does this for you;
   by hand it is:

   ```bash
   docker compose exec -e ADMIN_PASSWORD='a-strong-password' api \
     node dist/scripts/create-admin.js --email owner@talkclub.kz --name "Aida"
   # without containers: npm run create-admin -w apps/api -- --email … --name …
   ```

   Without `ADMIN_PASSWORD` a temporary password is generated and printed once. Add other staff
   from Admin → Staff & roles. On the first sign-in the owner sets up an authenticator app and
   saves the recovery codes (two-factor sign-in is required for owners and admins).
3. Replace the legal templates (Admin → Settings → Legal documents) with lawyer-approved texts.
4. Fill in the club profile (replace the placeholder phone, e-mail and Instagram), opening hours,
   map coordinates, teachers (photos, bios), plans and prices, and create the weekly templates
   (Admin → Schedule → Weekly templates).
   The club texts (About, How it works, Rules, FAQ) and the starting address, plan descriptions and
   lead sources come in English, Russian and Kazakh. Admin → Settings → App content has a language
   switch: Russian and Kazakh show the standard translation until you save your own text for that
   language. A text you edit elsewhere (address, plan description) is shown as written in every
   language.
5. Import existing clients from Altegio (Admin → Import & export) — dry run first.
6. Configure VAPID keys and messaging providers; send a test notification from Admin → Notifications.

## Production server (single VPS)

For one club a single VPS (2 vCPU, 4 GB RAM, Ubuntu 24.04) is enough. Everything runs from this
repository with the `production` compose profile, which adds two services:

| Service | What it does |
| --- | --- |
| `caddy` | HTTPS on ports 80/443 for `APP_DOMAIN`, Let's Encrypt certificates renewed automatically (`deploy/Caddyfile`) |
| `backup` | Nightly backup at `BACKUP_AT` (Almaty time) into `./backups`, kept `BACKUP_KEEP_DAYS` days, monthly restore test, Telegram alerts (`deploy/backup.sh`) |

First start, as root. The repository is private, so the server gets its own read-only deploy key
(no personal token is stored on the server, and `git pull` in `scripts/deploy.sh` needs no password):

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 && cat ~/.ssh/id_ed25519.pub
# add the printed line in GitHub → repository → Settings → Deploy keys (read-only), then:
git clone git@github.com:tamerlankk-29/talk-club-app.git /opt/talkclub
cd /opt/talkclub && bash scripts/server-setup.sh
```

The script installs Docker, a firewall (SSH, 80 and 443 only), fail2ban and automatic security
updates, generates `AUTH_SECRET`, the database password, the Telegram webhook secret and the push
keys, asks for the rest (bot token, alert chat id, Turnstile, Mobizon, Sentry), writes `.env` with
permissions 600, starts everything and creates the owner account (e-mail, name and a password of
at least 12 characters, typed twice). Secrets are typed on the server only. The script is safe to
run again: existing values and an existing owner are kept, so if the first build stops half-way
(for example a network hiccup while downloading fonts), just run it once more.

Updates: `bash scripts/deploy.sh` (pull, rebuild, migrate, restart).

## Backups

- **Nightly** (`backup` service): `pg_dump -Fc` of the database and a tarball of the `uploads`
  volume into `./backups/db` and `./backups/uploads`, older than 30 days removed.
- **Off-site copy:** set `BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_ACCESS_KEY` and
  `BACKUP_S3_SECRET_KEY` (any S3-compatible storage, e.g. PS.kz Object Storage) and each backup is
  uploaded too. Without it the backups live on the same server, which does not protect against
  losing the server.
- **Restore test:** on the 1st of each month the newest dump is restored into a scratch database
  and checked; the result goes to Telegram. Run it any time:
  `docker compose exec backup sh /usr/local/bin/backup.sh restore-test`.
- **Backup now:** `docker compose exec backup sh /usr/local/bin/backup.sh now`.
- **Restore for real** (stops the app, replaces the database):

  ```bash
  docker compose stop api web
  docker compose exec -T db pg_restore -U talkclub -d talkclub --clean --if-exists < backups/db/talkclub-YYYY-MM-DD.dump
  docker compose start api web
  ```

## Monitoring

- `GET /api/health` returns 200 when the API and database respond. It is used by the container
  health checks; point an uptime monitor at `https://<domain>/api/health` (e.g. UptimeRobot, free,
  with Telegram alerts).
- **Errors:** set `SENTRY_DSN` and every 5xx response and failed background job is reported to
  Sentry, tagged with the request id or job name. Request bodies, headers, cookies and user data are
  not sent.
- Logs are Nest logs on stdout (`docker compose logs -f api`); every request has an id echoed in
  error responses (`requestId`) to find the matching log line.
- Watch: delivery failures (Admin → Notifications → Delivery log), pending payments and unmarked
  attendance (dashboard alerts).

## Go-live checklist

- [ ] HTTPS on the public domain; `APP_URL`/`CORS_ORIGINS` set; `COOKIE_SECURE=true`
- [ ] Strong `AUTH_SECRET` and database password stored in a secret manager, not in git
- [ ] `AUTH_OTP_DEV_ECHO=false`, `PAYMENT_MOCK_ONLINE_ENABLED=false`, `MOBIZON_API_KEY` set (or codes via Telegram only)
- [ ] VAPID keys configured; push tested on Android and an iPhone (installed to Home Screen)
- [ ] Legal texts reviewed by a lawyer and published
- [ ] Backups scheduled and a restore tested
- [ ] Demo data never loaded into production
- [ ] Staff accounts created with the least privilege they need
