#!/usr/bin/env bash
set -euo pipefail

OUTPUT_PATH="${1:-}"
if [[ -z "$OUTPUT_PATH" ]]; then
  echo "Usage: scripts/backup-db.sh /path/to/backup.dump" >&2
  exit 1
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

pg_dump "$DATABASE_URL" --format=custom --file="$OUTPUT_PATH"
echo "Backup written to $OUTPUT_PATH"
