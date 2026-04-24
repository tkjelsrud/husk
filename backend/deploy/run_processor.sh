#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/tkjelsrud/husk"
LOG_DIR="$ROOT/backend/.state"
ENV_FILE="$ROOT/backend/.env"

mkdir -p "$LOG_DIR"

if [ ! -f "$ENV_FILE" ]; then
  printf '%s backend env missing\n' "$(date -Iseconds)" >> "$LOG_DIR/processor.log"
  exit 0
fi

set -a
. "$ENV_FILE"
set +a

if [ ! -x "$ROOT/.venv/bin/python" ]; then
  printf '%s venv missing\n' "$(date -Iseconds)" >> "$LOG_DIR/processor.log"
  exit 0
fi

if [ -n "${FIREBASE_SERVICE_ACCOUNT_PATH:-}" ] && [ ! -f "$FIREBASE_SERVICE_ACCOUNT_PATH" ]; then
  printf '%s firebase service account missing\n' "$(date -Iseconds)" >> "$LOG_DIR/processor.log"
  exit 0
fi

if [ -z "${FIREBASE_SERVICE_ACCOUNT_PATH:-}" ] && [ ! -f "$HOME/.config/gcloud/application_default_credentials.json" ]; then
  printf '%s firebase adc missing\n' "$(date -Iseconds)" >> "$LOG_DIR/processor.log"
  exit 0
fi

if [ -n "${OPENCODE_BIN:-}" ] && [ ! -x "$OPENCODE_BIN" ]; then
  printf '%s opencode binary missing\n' "$(date -Iseconds)" >> "$LOG_DIR/processor.log"
  exit 0
fi

cd "$ROOT"
exec "$ROOT/.venv/bin/python" -m backend.processor.main --once >> "$LOG_DIR/processor.log" 2>&1
