#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODEL="${HERMES_MODEL:-gemma2:2b}"
PORT="${PORT:-8080}"
OLLAMA_URL="${HERMES_UPSTREAM_URL:-http://127.0.0.1:11434}"
WATCH_INTERVAL="${PASSE_WATCH_INTERVAL:-20}"
LOG_DIR="${PASSE_LOG_DIR:-/tmp}"
ORIGINS="${CORS_ORIGINS:-https://anyclaw.store,https://*.anyclaw.store,https://izrai4103-lgtm.github.io,https://*.github.io,http://localhost:*,http://127.0.0.1:*}"

health_ok() {
  curl -m 3 -fsS "$1" >/dev/null 2>&1
}

start_ollama() {
  if health_ok "$OLLAMA_URL/api/tags"; then
    return
  fi
  setsid env OLLAMA_ORIGINS="$ORIGINS" ollama serve > "$LOG_DIR/passeo-ollama.log" 2>&1 < /dev/null &
}

start_proxy() {
  if health_ok "http://127.0.0.1:$PORT/health"; then
    return
  fi
  (
    cd "$ROOT_DIR"
    setsid env \
      HERMES_MODEL="$MODEL" \
      HERMES_UPSTREAM_URL="$OLLAMA_URL" \
      CORS_ORIGINS="$ORIGINS" \
      PORT="$PORT" \
      node model-server/server.js > "$LOG_DIR/passeo-model-proxy.log" 2>&1 < /dev/null &
  )
}

ensure_running() {
  start_ollama
  sleep 2
  start_proxy
  sleep 1
}

print_status() {
  printf 'Model: %s\n' "$MODEL"
  if health_ok "$OLLAMA_URL/api/tags"; then
    printf 'Ollama: hidup (%s)\n' "$OLLAMA_URL"
  else
    printf 'Ollama: mati (%s)\n' "$OLLAMA_URL"
  fi
  if health_ok "http://127.0.0.1:$PORT/health"; then
    printf 'Proxy: hidup (http://127.0.0.1:%s)\n' "$PORT"
    curl -m 5 -fsS "http://127.0.0.1:$PORT/health" || true
    printf '\n'
  else
    printf 'Proxy: mati (http://127.0.0.1:%s)\n' "$PORT"
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
