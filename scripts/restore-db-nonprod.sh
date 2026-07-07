#!/usr/bin/env bash
set -euo pipefail

BACKUP_PATH="${1:-}"
if [[ -z "$BACKUP_PATH" ]]; then
  echo "Usage: scripts/restore-db-nonprod.sh /path/to/backup.dump" >&2
  exit 1
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi
if [[ "${NODE_ENV:-development}" == "production" ]]; then
  echo "Refusing to restore while NODE_ENV=production" >&2
  exit 1
fi

pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$BACKUP_PATH"
echo "Restore completed from $BACKUP_PATH"
