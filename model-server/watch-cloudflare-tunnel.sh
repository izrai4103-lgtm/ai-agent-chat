#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8080}"
WATCH_INTERVAL="${PASSE_TUNNEL_WATCH_INTERVAL:-30}"
LOG_FILE="${PASSE_TUNNEL_LOG:-/tmp/passeo-cloudflared.log}"
URL_FILE="${PASSE_TUNNEL_URL_FILE:-/tmp/passeo-cloudflared-url.txt}"

tunnel_pid() {
  ps -eo pid,args | awk -v port="$PORT" '
    $0 ~ "cloudflared tunnel --url http://127.0.0.1:" port && $0 !~ /awk/ { print $1; exit }
  '
}

current_url() {
  if [ -s "$URL_FILE" ]; then
    cat "$URL_FILE"
    return
  fi
  if [ -s "$LOG_FILE" ]; then
    grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG_FILE" | tail -1 || true
  fi
}

health_ok() {
  curl -m 8 -fsS "$1/health" >/dev/null 2>&1
}

start_tunnel() {
  local pid
  pid="$(tunnel_pid || true)"
  if [ -n "$pid" ]; then
    return
  fi
  : > "$LOG_FILE"
  setsid cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate > "$LOG_FILE" 2>&1 < /dev/null &
  sleep 8
  local url
  url="$(current_url || true)"
  if [ -n "$url" ]; then
    printf '%s\n' "$url" > "$URL_FILE"
  fi
}

ensure_running() {
  local pid url
  pid="$(tunnel_pid || true)"
  url="$(current_url || true)"
  if [ -n "$pid" ] && [ -n "$url" ] && health_ok "$url"; then
    return
  fi
  if [ -n "$pid" ] && [ -z "$url" ]; then
    kill "$pid" 2>/dev/null || true
    sleep 1
  fi
  start_tunnel
}

print_status() {
  local pid url
  pid="$(tunnel_pid || true)"
  url="$(current_url || true)"
  if [ -n "$pid" ]; then
    printf 'Tunnel: hidup (pid %s)\n' "$pid"
  else
    printf 'Tunnel: mati\n'
  fi
  if [ -n "$url" ]; then
    printf 'URL: %s\n' "$url"
    if health_ok "$url"; then
      printf 'Health: OK\n'
    else
      printf 'Health: gagal\n'
    fi
  else
    printf 'URL: belum ada\n'
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
