#!/usr/bin/env bash
# Desktop security / lifecycle integration checks (no Tauri GUI automation).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BIN="${ROOT}/bin/serverui-server"
if [[ ! -x "$BIN" ]]; then
  echo "Building Go backend..."
  make build-server
fi

if [[ ! -f .env ]]; then
  echo "Missing .env (run make setup-env)" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ -z "${SERVERUI_CREDENTIAL_ENCRYPTION_KEY:-}" ]]; then
  echo "SERVERUI_CREDENTIAL_ENCRYPTION_KEY empty" >&2
  exit 1
fi

TOKEN="$(openssl rand -hex 32)"
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
export SERVERUI_DESKTOP=1
export SERVERUI_LISTEN_HOST=127.0.0.1
export HTTP_PORT="$PORT"
export SERVERUI_LOCAL_AUTH_TOKEN="$TOKEN"
export POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
unset DATABASE_URL || true

LOG="$(mktemp)"
"$BIN" >"$LOG" 2>&1 &
PID=$!

cleanup() {
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
  fi
  rm -f "$LOG"
}
trap cleanup EXIT

echo "Waiting for backend on 127.0.0.1:${PORT}..."
ready=0
for _ in $(seq 1 40); do
  if curl -sf -H "X-ServerUI-Local-Token: ${TOKEN}" "http://127.0.0.1:${PORT}/healthz" >/dev/null; then
    ready=1
    break
  fi
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "Backend exited early:" >&2
    cat "$LOG" >&2
    exit 1
  fi
  sleep 0.25
done
if [[ "$ready" -ne 1 ]]; then
  echo "Backend did not become ready" >&2
  cat "$LOG" >&2
  exit 1
fi

echo "OK readiness"

code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/healthz")"
[[ "$code" == "401" ]] || { echo "missing token expected 401 got $code" >&2; exit 1; }
echo "OK missing token → 401"

code="$(curl -s -o /dev/null -w '%{http_code}' -H "X-ServerUI-Local-Token: wrong" "http://127.0.0.1:${PORT}/healthz")"
[[ "$code" == "401" ]] || { echo "bad token expected 401 got $code" >&2; exit 1; }
echo "OK bad token → 401"

code="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer ${TOKEN}" "http://127.0.0.1:${PORT}/healthz")"
[[ "$code" == "401" ]] || { echo "bearer must not work, got $code" >&2; exit 1; }
echo "OK bearer rejected"

body="$(curl -sf -H "X-ServerUI-Local-Token: ${TOKEN}" "http://127.0.0.1:${PORT}/api/servers")"
echo "$body" | grep -q '"servers"' || { echo "servers list failed: $body" >&2; exit 1; }
echo "OK authenticated /api/servers"

# WebSocket auth: missing token should fail handshake (401 before upgrade).
code="$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "http://127.0.0.1:${PORT}/ws/terminal?serverId=test")"
[[ "$code" == "401" ]] || { echo "ws missing token expected 401 got $code" >&2; exit 1; }
echo "OK websocket missing token → 401"

# Loopback listen check
if command -v lsof >/dev/null 2>&1; then
  listen="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN || true)"
  echo "$listen" | grep -q "127.0.0.1:${PORT}" || { echo "not loopback bound: $listen" >&2; exit 1; }
  if echo "$listen" | grep -E '0\.0\.0\.0|\*' >/dev/null; then
    echo "unexpected non-loopback listen: $listen" >&2
    exit 1
  fi
  echo "OK loopback bind"
fi

# Logs must not contain the token
if grep -F "$TOKEN" "$LOG" >/dev/null 2>&1; then
  echo "token found in backend log" >&2
  exit 1
fi
echo "OK token not logged"

# Shutdown cleanup
kill -TERM "$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true
PID=0
sleep 0.5
if command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "port still listening after shutdown" >&2
    exit 1
  fi
fi
echo "OK clean shutdown"

trap - EXIT
echo
echo "desktop-e2e: all checks passed"
exit 0
