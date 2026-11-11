#!/usr/bin/env bash
# First-time setup of the Talk Club production server (Ubuntu 22.04 / 24.04), run as root
# from the cloned repository:
#
#   cd /opt/talkclub && sudo bash scripts/server-setup.sh
#
# It installs Docker and a firewall, asks for the secrets (typed here on the server, never
# sent anywhere else), writes .env with permissions 600, starts everything with HTTPS and
# creates the owner account. Safe to run again: an existing .env is kept, only missing
# values are asked for and an existing owner account is left alone.
set -euo pipefail
cd "$(dirname "$0")/.."

[ "$(id -u)" = 0 ] || { echo "Run as root: sudo bash scripts/server-setup.sh"; exit 1; }

step() { printf '\n\033[1;35m▶ %s\033[0m\n' "$1"; }

step "System packages, automatic security updates, fail2ban"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git openssl ufw fail2ban unattended-upgrades >/dev/null
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null
systemctl enable --now fail2ban >/dev/null

step "Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker >/dev/null

step "Firewall: only SSH, HTTP and HTTPS are open"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
ufw status | sed 's/^/  /'

if [ "$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)" -lt 3000 ] && ! swapon --show | grep -q .; then
  step "Swap file (2 GB) so the app can be built on a small server"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

step "Settings and secrets (.env)"
[ -f .env ] || cp .env.compose.example .env
chmod 600 .env

get_env() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
set_env() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" .env; then
    KEY="$key" VALUE="$value" awk 'BEGIN { FS = OFS = "=" } $1 == ENVIRON["KEY"] { print ENVIRON["KEY"], ENVIRON["VALUE"]; next } { print }' .env > .env.tmp
    mv .env.tmp .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
  chmod 600 .env
}
# Asks only when the value is still empty. $3 = "secret" hides what you type.
ask() {
  local key="$1" prompt="$2" mode="${3:-}" current value
  current="$(get_env "$key")"
  if [ -n "$current" ] && [ "$current" != "change-this-password" ]; then return; fi
  if [ "$mode" = secret ]; then read -r -s -p "  $prompt: " value; echo; else read -r -p "  $prompt: " value; fi
  set_env "$key" "$value"
}
random() { openssl rand -base64 96 | tr -d '/+=\n' | cut -c1-"$1"; }

set_env NODE_ENV production
[ -n "$(get_env AUTH_SECRET)" ] || set_env AUTH_SECRET "$(random 64)"
pw="$(get_env POSTGRES_PASSWORD)"
{ [ -n "$pw" ] && [ "$pw" != "change-this-password" ]; } || set_env POSTGRES_PASSWORD "$(random 32)"
[ -n "$(get_env TELEGRAM_WEBHOOK_SECRET)" ] || set_env TELEGRAM_WEBHOOK_SECRET "$(random 40)"
if [ -z "$(get_env PUSH_VAPID_PUBLIC_KEY)" ]; then
  keys="$(docker run --rm node:22-alpine npx -y web-push@3.6.7 generate-vapid-keys --json)"
  set_env PUSH_VAPID_PUBLIC_KEY "$(printf '%s' "$keys" | sed -E 's/.*"publicKey":"([^"]+)".*/\1/')"
  set_env PUSH_VAPID_PRIVATE_KEY "$(printf '%s' "$keys" | sed -E 's/.*"privateKey":"([^"]+)".*/\1/')"
fi
echo "  Generated: AUTH_SECRET, POSTGRES_PASSWORD, TELEGRAM_WEBHOOK_SECRET, push keys (kept in .env only)"

echo "  Now type the values from the instruction. Press Enter to leave an optional one empty."
domain="$(get_env APP_DOMAIN)"
read -r -p "  Domain [${domain:-app.talkclub.kz}]: " value
domain="${value:-${domain:-app.talkclub.kz}}"
set_env APP_DOMAIN "$domain"
set_env APP_URL "https://$domain"
set_env CORS_ORIGINS "https://$domain"
set_env COOKIE_SECURE true
set_env WEB_BIND 127.0.0.1
set_env COMPOSE_PROFILES production
ask ACME_EMAIL "E-mail for the HTTPS certificate"
ask TELEGRAM_BOT_TOKEN "Telegram bot token from @BotFather (hidden)" secret
ask ALERT_TELEGRAM_CHAT_ID "Your Telegram chat id for server alerts (from @userinfobot)"
ask TURNSTILE_SITE_KEY "Cloudflare Turnstile site key (optional)"
ask TURNSTILE_SECRET_KEY "Cloudflare Turnstile secret key (optional, hidden)" secret
ask MOBIZON_API_KEY "Mobizon API key (optional, hidden)" secret
ask SENTRY_DSN "Sentry DSN (optional)"

step "Checking that $domain points to this server"
ip="$(curl -fsS4 https://api.ipify.org || true)"
dns="$(getent ahostsv4 "$domain" | awk 'NR==1 {print $1}' || true)"
if [ -n "$ip" ] && [ "$dns" != "$ip" ]; then
  echo "  ⚠ $domain resolves to '${dns:-nothing}', this server is $ip."
  echo "    Add an A record $domain → $ip at your domain registrar; HTTPS starts working once it does."
else
  echo "  ✓ $domain → $ip"
fi

step "Building and starting Talk Club (the first build takes 5–10 minutes)"
mkdir -p backups
chmod 700 backups
set_env APP_VERSION "$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
docker compose up -d --build
docker image prune -f >/dev/null

step "Owner account"
if docker compose exec -T api node dist/scripts/create-admin.js --check </dev/null >/dev/null 2>&1; then
  echo "  ✓ An owner account already exists (add colleagues in Admin → Staff & roles)"
else
  echo "  The owner signs in with this e-mail and password, then sets up a second step (authenticator app)."
  owner_email=""
  while ! printf '%s' "$owner_email" | grep -qE '^[^@ ]+@[^@ ]+\.[^@ ]+$'; do read -r -p "  Owner e-mail: " owner_email; done
  owner_name=""
  while [ -z "$owner_name" ]; do read -r -p "  Owner name (shown in the admin panel): " owner_name; done
  while true; do
    read -r -s -p "  Owner password (at least 12 characters, hidden): " owner_password; echo
    if [ "${#owner_password}" -lt 12 ]; then echo "    Too short."; continue; fi
    read -r -s -p "  Repeat the password: " owner_password2; echo
    [ "$owner_password" = "$owner_password2" ] && break
    echo "    The passwords differ, try again."
  done
  ADMIN_PASSWORD="$owner_password" docker compose exec -T -e ADMIN_PASSWORD api \
    node dist/scripts/create-admin.js --email "$owner_email" --name "$owner_name" </dev/null | sed 's/^/  /'
  unset owner_password owner_password2
fi

step "Done"
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
echo
echo "  App:     https://$domain"
echo "  Health:  https://$domain/api/health"
echo "  Logs:    docker compose logs -f api"
echo "  Backup:  docker compose exec backup sh /usr/local/bin/backup.sh now"
echo "  Update:  bash scripts/deploy.sh"
