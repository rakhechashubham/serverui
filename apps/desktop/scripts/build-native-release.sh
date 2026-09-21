#!/usr/bin/env bash
# Build a native Windows or Linux release into dist/windows or dist/linux.
# Must run on the matching OS host (no fragile cross-compilation).
#
# Usage:
#   apps/desktop/scripts/build-native-release.sh windows-x64
#   apps/desktop/scripts/build-native-release.sh linux-x64
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DESKTOP_DIR="$ROOT/apps/desktop"
SERVER_DIR="$ROOT/apps/server"
BIN_DIR="$ROOT/bin"
SIDECAR_DIR="$DESKTOP_DIR/src-tauri/binaries"
TARGET_DIR="$DESKTOP_DIR/src-tauri/target"

# shellcheck source=../../../scripts/lib/desktop-release.sh
source "$ROOT/scripts/lib/desktop-release.sh"

PLATFORM="${1:-}"
if [[ -z "$PLATFORM" ]]; then
  echo "Usage: $0 <windows-x64|linux-x64>" >&2
  exit 1
fi

case "$PLATFORM" in
  windows-x64|linux-x64) ;;
  *)
    echo "Unsupported platform '$PLATFORM' (expected windows-x64 or linux-x64)" >&2
    echo "For macOS use: apps/desktop/scripts/build-macos-release.sh" >&2
    exit 1
    ;;
esac

read -r RUST_TRIPLE GOOS GOARCH _ <<<"$(desktop_release_platform_meta "$PLATFORM")"

HOST_OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$PLATFORM" in
  windows-x64)
    case "$HOST_OS" in
      mingw*|msys*|cygwin*|windows*) ;;
      *)
        if [[ "${OS:-}" != "Windows_NT" ]]; then
          echo "Windows release builds must run on Windows (got OS=$(uname -s))." >&2
          echo "Use GitHub Actions (windows-latest) or a Windows machine." >&2
          echo "See: make desktop-build-all" >&2
          exit 1
        fi
        ;;
    esac
    OUT_DIR="$ROOT/dist/windows"
    BUNDLES="nsis,msi"
    ;;
  linux-x64)
    case "$HOST_OS" in
      linux*) ;;
      *)
        echo "Linux release builds must run on Linux (got OS=$(uname -s))." >&2
        echo "Use GitHub Actions (ubuntu-22.04) or a Linux machine." >&2
        echo "See: make desktop-build-all" >&2
        exit 1
        ;;
    esac
    OUT_DIR="$ROOT/dist/linux"
    BUNDLES="appimage,deb"
    ;;
esac

for cmd in go rustc cargo rustup node npm; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required command not found: $cmd" >&2
    exit 1
  fi
done

node "$DESKTOP_DIR/scripts/sync-version.mjs"
VERSION="$(node -p "require('$DESKTOP_DIR/src-tauri/tauri.conf.json').version")"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid version in tauri.conf.json: $VERSION" >&2
  exit 1
fi

if [[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  BUILD_CMD=(npm run build --)
  echo "TAURI_SIGNING_PRIVATE_KEY set; building with updater artifacts"
else
  BUILD_CMD=(npm run build:unsigned --)
  echo "Building unsigned desktop bundle (no updater signatures)"
fi

ensure_rust_target() {
  local triple="$1"
  if ! rustup target list --installed | grep -qx "$triple"; then
    echo "Installing Rust target $triple..."
    rustup target add "$triple"
  fi
}

verify_binary_arch() {
  local path="$1"
  local label="$2"
  if ! command -v file >/dev/null 2>&1; then
    echo "  (file not available; skip arch check for $label)"
    return 0
  fi
  local info
  info="$(file -b "$path" 2>/dev/null || true)"
  case "$PLATFORM" in
    windows-x64)
      if [[ "$info" != *"x86-64"* && "$info" != *"x86_64"* && "$info" != *"PE32+"* ]]; then
        echo "Architecture check failed for $label: $info" >&2
        exit 1
      fi
      ;;
    linux-x64)
      if [[ "$info" != *"x86-64"* && "$info" != *"x86_64"* ]]; then
        echo "Architecture check failed for $label: $info" >&2
        exit 1
      fi
      ;;
  esac
  echo "  ✓ $label: $info"
}

echo
echo "────────────────────────────────────────"
echo "Building $PLATFORM"
echo "  Rust target: $RUST_TRIPLE"
echo "  Go target:   $GOOS/$GOARCH"
echo "────────────────────────────────────────"

ensure_rust_target "$RUST_TRIPLE"

mkdir -p "$BIN_DIR" "$SIDECAR_DIR" "$OUT_DIR"
rm -f "$BIN_DIR/serverui-server" "$BIN_DIR/serverui-server.exe"
rm -f "$SIDECAR_DIR/serverui-server-${RUST_TRIPLE}" "$SIDECAR_DIR/serverui-server-${RUST_TRIPLE}.exe"

echo "Building Go sidecar ($GOOS/$GOARCH)..."
FORCE_SIDECAR_REBUILD=1 \
  TAURI_ENV_TARGET_TRIPLE="$RUST_TRIPLE" \
  GOOS="$GOOS" GOARCH="$GOARCH" \
  "$DESKTOP_DIR/scripts/prepare-sidecar.sh"

SIDECAR="$SIDECAR_DIR/serverui-server-${RUST_TRIPLE}"
if [[ "$GOOS" == "windows" ]]; then
  SIDECAR="${SIDECAR}.exe"
fi
if [[ ! -f "$SIDECAR" ]]; then
  echo "Missing sidecar: $SIDECAR" >&2
  exit 1
fi
verify_binary_arch "$SIDECAR" "Go sidecar"

HOST_TRIPLE="$(rustc -vV | awk '/^host:/{print $2}')"
BUNDLE_ROOT="$TARGET_DIR/release/bundle"
if [[ "$RUST_TRIPLE" != "$HOST_TRIPLE" ]]; then
  BUNDLE_ROOT="$TARGET_DIR/$RUST_TRIPLE/release/bundle"
fi
rm -rf "$BUNDLE_ROOT/nsis" "$BUNDLE_ROOT/msi" "$BUNDLE_ROOT/appimage" "$BUNDLE_ROOT/deb"

echo "Building Tauri bundle (--target $RUST_TRIPLE --bundles $BUNDLES)..."
(
  cd "$DESKTOP_DIR"
  if [[ "$RUST_TRIPLE" == "$HOST_TRIPLE" ]]; then
    "${BUILD_CMD[@]}" --bundles "$BUNDLES"
  else
    "${BUILD_CMD[@]}" --target "$RUST_TRIPLE" --bundles "$BUNDLES"
  fi
)

# Native host builds often land under target/release/bundle.
if [[ ! -d "$BUNDLE_ROOT" && -d "$TARGET_DIR/release/bundle" ]]; then
  BUNDLE_ROOT="$TARGET_DIR/release/bundle"
fi

find "$OUT_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
mkdir -p "$OUT_DIR"

chmod +x "$ROOT/scripts/collect-desktop-artifacts.sh"
"$ROOT/scripts/collect-desktop-artifacts.sh" \
  --version "$VERSION" \
  --platform "$PLATFORM" \
  --bundle-dir "$BUNDLE_ROOT" \
  --out-dir "$OUT_DIR" \
  --verify \
  --checksums

echo
echo "Release build complete: $PLATFORM"
echo "Version: $VERSION"
echo "Output: $OUT_DIR"
ls -la "$OUT_DIR"
