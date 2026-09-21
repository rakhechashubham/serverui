#!/usr/bin/env bash
# Copy the Go backend into apps/desktop/src-tauri/binaries with the host/target
# triple name expected by Tauri externalBin. Does not require developer home paths.
#
# Env:
#   GOOS / GOARCH              Target for the Go build (defaults to host)
#   TAURI_ENV_TARGET_TRIPLE    Rust triple for the sidecar filename (defaults to rustc host)
#   FORCE_SIDECAR_REBUILD=1    Always rebuild the Go binary (default when GOOS/GOARCH set)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
BIN_DIR="$ROOT/bin"
OUT_DIR="$ROOT/apps/desktop/src-tauri/binaries"
mkdir -p "$OUT_DIR" "$BIN_DIR"

HOST_GOOS="$(go env GOOS)"
HOST_GOARCH="$(go env GOARCH)"
GOOS="${GOOS:-$HOST_GOOS}"
GOARCH="${GOARCH:-$HOST_GOARCH}"

OUT_NAME="serverui-server"
if [[ "$GOOS" == "windows" ]]; then
  OUT_NAME="serverui-server.exe"
fi

# Rebuild when forced, when missing, or when targeting a non-host OS/arch
# (avoid shipping a host binary under a foreign triple name).
NEED_BUILD=0
if [[ "${FORCE_SIDECAR_REBUILD:-}" == "1" ]]; then
  NEED_BUILD=1
elif [[ ! -f "$BIN_DIR/$OUT_NAME" ]]; then
  NEED_BUILD=1
elif [[ "$GOOS" != "$HOST_GOOS" || "$GOARCH" != "$HOST_GOARCH" ]]; then
  NEED_BUILD=1
fi

if [[ "$NEED_BUILD" -eq 1 ]]; then
  echo "Building Go backend (${GOOS}/${GOARCH})..."
  rm -f "$BIN_DIR/$OUT_NAME"
  GOOS="$GOOS" GOARCH="$GOARCH" go -C "$ROOT/apps/server" build -trimpath -ldflags="-s -w" -o "$BIN_DIR/$OUT_NAME" ./cmd/server
fi

if [[ -n "${TAURI_ENV_TARGET_TRIPLE:-}" ]]; then
  TRIPLE="$TAURI_ENV_TARGET_TRIPLE"
elif command -v rustc >/dev/null 2>&1; then
  TRIPLE="$(rustc -vV | awk '/^host:/{print $2}')"
else
  echo "rustc not found and TAURI_ENV_TARGET_TRIPLE is unset" >&2
  exit 1
fi

SRC="$BIN_DIR/$OUT_NAME"
if [[ "$GOOS" == "windows" || "$OUT_NAME" == *.exe ]]; then
  DEST="$OUT_DIR/serverui-server-${TRIPLE}.exe"
else
  DEST="$OUT_DIR/serverui-server-${TRIPLE}"
fi

cp "$SRC" "$DEST"
chmod +x "$DEST" 2>/dev/null || true
echo "Sidecar ready: $DEST"
