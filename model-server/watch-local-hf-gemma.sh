#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${PORT:-8080}"
WATCH_INTERVAL="${PASSE_WATCH_INTERVAL:-20}"
LOG_DIR="${PASSE_LOG_DIR:-/tmp}"
MODEL_PATH="${GEMMA_MODEL_PATH:-google/gemma-2-2b-it}"
LOCAL_FILES_ONLY="${GEMMA_LOCAL_FILES_ONLY:-1}"
ORIGINS="${CORS_ORIGINS:-https://anyclaw.store,https://*.anyclaw.store,https://*.trycloudflare.com,https://izrai4103-lgtm.github.io,https://*.github.io,http://localhost:*,http://127.0.0.1:*}"

health_ok() {
  curl -m 3 -fsS "$1" >/dev/null 2>&1
}

start_server() {
  if health_ok "http://127.0.0.1:$PORT/health"; then
    return
  fi
  (
    cd "$ROOT_DIR"
    setsid env \
      PORT="$PORT" \
      GEMMA_MODEL_PATH="$MODEL_PATH" \
      GEMMA_LOCAL_FILES_ONLY="$LOCAL_FILES_ONLY" \
      CORS_ORIGINS="$ORIGINS" \
      python3 model-server/hf-gemma-server.py > "$LOG_DIR/passeo-hf-gemma.log" 2>&1 < /dev/null &
  )
}

ensure_running() {
  start_server
  sleep 1
}

print_status() {
  printf 'Model path: %s\n' "$MODEL_PATH"
  printf 'Local files only: %s\n' "$LOCAL_FILES_ONLY"
  if health_ok "http://127.0.0.1:$PORT/health"; then
    printf 'HF Gemma server: hidup (http://127.0.0.1:%s)\n' "$PORT"
    curl -m 5 -fsS "http://127.0.0.1:$PORT/health" || true
    printf '\n'
  else
    printf 'HF Gemma server: mati (http://127.0.0.1:%s)\n' "$PORT"
  fi
}

case "${1:-watch}" in
  once)
    ensure_running
    print_status
    ;;
  status)
    print_status
    ;;
  watch)
    while true; do
      ensure_running
      sleep "$WATCH_INTERVAL"
    done
    ;;
  *)
    printf 'Usage: %s [once|watch|status]\n' "$0" >&2
    exit 2
    ;;
esac
