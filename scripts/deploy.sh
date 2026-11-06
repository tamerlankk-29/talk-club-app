#!/usr/bin/env bash
# Updates the production server to the latest main: pulls, rebuilds and restarts.
# Database migrations run automatically before the new API starts.
#
#   cd /opt/talkclub && bash scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
version="$(git rev-parse --short HEAD)"
if grep -q '^APP_VERSION=' .env; then sed -i "s/^APP_VERSION=.*/APP_VERSION=$version/" .env; else echo "APP_VERSION=$version" >> .env; fi
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
echo "Deployed $version"
