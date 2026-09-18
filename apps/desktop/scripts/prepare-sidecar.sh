#!/usr/bin/env bash
# Copy the Go backend into apps/desktop/src-tauri/binaries with the host target
# triple name expected by Tauri externalBin. Does not require developer home paths.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
BIN_DIR="$ROOT/bin"
OUT_DIR="$ROOT/apps/desktop/src-tauri/binaries"
mkdir -p "$OUT_DIR" "$BIN_DIR"

GOOS="${GOOS:-$(go env GOOS)}"
GOARCH="${GOARCH:-$(go env GOARCH)}"
OUT_NAME="serverui-server"
if [[ "$GOOS" == "windows" ]]; then
  OUT_NAME="serverui-server.exe"
fi

if [[ ! -f "$BIN_DIR/$OUT_NAME" ]]; then
  echo "Building Go backend (${GOOS}/${GOARCH})..."
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
