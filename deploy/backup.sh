#!/bin/sh
# Nightly backups of the database and uploaded files, kept for BACKUP_KEEP_DAYS (30).
# On the 1st of each month the newest dump is restored into a scratch database and
# checked (restore test). Failures and restore-test results go to Telegram when
# TELEGRAM_BOT_TOKEN and ALERT_TELEGRAM_CHAT_ID are set. Optional off-site copy to
# S3-compatible storage (e.g. PS.kz Object Storage) when BACKUP_S3_BUCKET is set.
#
# Runs inside the "backup" compose service. Run one now:  docker compose exec backup sh /usr/local/bin/backup.sh now
set -eu
# Dumps hold members' personal data: readable by root only.
umask 077

KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
AT="${BACKUP_AT:-02:30}"
DIR=/backups
export PGHOST=db PGUSER="$POSTGRES_USER" PGPASSWORD="$POSTGRES_PASSWORD"

notify() {
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${ALERT_TELEGRAM_CHAT_ID:-}" ] || return 0
  command -v curl >/dev/null || apk add --no-cache curl >/dev/null 2>&1 || return 0
  curl -fsS -o /dev/null "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${ALERT_TELEGRAM_CHAT_ID}" --data-urlencode "text=$1" || true
}

offsite() {
  [ -n "${BACKUP_S3_BUCKET:-}" ] || return 0
  command -v aws >/dev/null || apk add --no-cache aws-cli >/dev/null
  AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_KEY" \
    aws s3 cp "$1" "s3://${BACKUP_S3_BUCKET}/talkclub/$(basename "$1")" --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
}

backup() {
  day=$(date +%F)
  mkdir -p "$DIR/db" "$DIR/uploads"
  pg_dump -Fc -d "$POSTGRES_DB" -f "$DIR/db/talkclub-$day.dump.part"
  mv "$DIR/db/talkclub-$day.dump.part" "$DIR/db/talkclub-$day.dump"
  tar -czf "$DIR/uploads/uploads-$day.tar.gz" -C /uploads .
  offsite "$DIR/db/talkclub-$day.dump"
  offsite "$DIR/uploads/uploads-$day.tar.gz"
  find "$DIR/db" "$DIR/uploads" -type f -mtime "+$KEEP_DAYS" -delete
  echo "$(date -Iseconds) backup ok: $(du -h "$DIR/db/talkclub-$day.dump" | cut -f1)"
}

restore_test() {
  latest=$(ls -1 "$DIR"/db/talkclub-*.dump | tail -1)
  dropdb --if-exists restore_test
  createdb restore_test
  pg_restore --no-owner -d restore_test "$latest"
  clients=$(psql -d restore_test -tAc 'select count(*) from clients')
  bookings=$(psql -d restore_test -tAc 'select count(*) from bookings')
  dropdb restore_test
  notify "Talk Club: monthly restore test passed ($(basename "$latest"): $clients clients, $bookings bookings)."
  echo "$(date -Iseconds) restore test ok: $clients clients, $bookings bookings"
}

run_once() {
  if ! out=$(backup 2>&1); then
    echo "$out"
    notify "Talk Club: nightly backup FAILED on $(hostname). Check: docker compose logs backup"
    return 1
  fi
  echo "$out"
  if [ "$(date +%d)" = "01" ]; then
    if ! out=$(restore_test 2>&1); then
      echo "$out"
      notify "Talk Club: monthly restore test FAILED. Check: docker compose logs backup"
    else
      echo "$out"
    fi
  fi
}

case "${1:-loop}" in
  now) run_once ;;
  restore-test) restore_test ;;
  loop)
    echo "Backups every day at $AT ($TZ), kept $KEEP_DAYS days"
    while true; do
      now=$(date +%s)
      next=$(date -d "$(date +%F) $AT" +%s 2>/dev/null || date -D '%Y-%m-%d %H:%M' -d "$(date +%F) $AT" +%s)
      [ "$next" -le "$now" ] && next=$((next + 86400))
      sleep $((next - now))
      run_once || true
    done
    ;;
esac
