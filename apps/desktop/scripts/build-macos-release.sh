#!/usr/bin/env bash
# Build macOS release artifacts (arm64 and/or x64) into dist/macos/.
# Version is read from apps/desktop/src-tauri/tauri.conf.json (via sync-version.mjs).
#
# Usage:
#   apps/desktop/scripts/build-macos-release.sh arm64
#   apps/desktop/scripts/build-macos-release.sh x64
#   apps/desktop/scripts/build-macos-release.sh all
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DESKTOP_DIR="$ROOT/apps/desktop"
BIN_DIR="$ROOT/bin"
SIDECAR_DIR="$DESKTOP_DIR/src-tauri/binaries"
TARGET_DIR="$DESKTOP_DIR/src-tauri/target"
OUT_DIR="$ROOT/dist/macos"
PRODUCT_NAME="ServerUI"
APP_BINARY_NAME="serverui-desktop"

# shellcheck source=../../../scripts/lib/desktop-release.sh
source "$ROOT/scripts/lib/desktop-release.sh"

ARCH_ARG="${1:-}"
if [[ -z "$ARCH_ARG" ]]; then
  echo "Usage: $0 <arm64|x64|all>" >&2
  exit 1
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS release builds must run on macOS (Apple SDK required)." >&2
  exit 1
fi

for cmd in go rustc cargo rustup node npm file lipo tar shasum; do
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

declare -a BUILD_ARCHS=()
case "$ARCH_ARG" in
  arm64) BUILD_ARCHS=(arm64) ;;
  x64) BUILD_ARCHS=(x64) ;;
  all) BUILD_ARCHS=(arm64 x64) ;;
  *)
    echo "Unknown architecture '$ARCH_ARG' (expected arm64, x64, or all)" >&2
    exit 1
    ;;
esac

arch_label() {
  case "$1" in
    arm64) echo "Apple Silicon (arm64)" ;;
    x64) echo "Intel (x64)" ;;
  esac
}

rust_triple() {
  case "$1" in
    arm64) echo "aarch64-apple-darwin" ;;
    x64) echo "x86_64-apple-darwin" ;;
  esac
}

go_arch() {
  case "$1" in
    arm64) echo "arm64" ;;
    x64) echo "amd64" ;;
  esac
}

expected_macho() {
  case "$1" in
    arm64) echo "arm64" ;;
    x64) echo "x86_64" ;;
  esac
}

ensure_rust_target() {
  local triple="$1"
  if ! rustup target list --installed | grep -qx "$triple"; then
    echo "Installing Rust target $triple..."
    rustup target add "$triple"
  fi
}

verify_macho_arch() {
  local path="$1"
  local expected="$2"
  local label="$3"
  local info
  info="$(file -b "$path" 2>/dev/null || true)"
  if [[ "$info" != *"$expected"* ]]; then
    # lipo reports "Non-fat file: ... architecture: arm64" or "Architectures in the fat file: ..."
    local lipo_out
    lipo_out="$(lipo -info "$path" 2>/dev/null || true)"
    if [[ "$lipo_out" != *"$expected"* ]]; then
      echo "Architecture mismatch for $label:" >&2
      echo "  path:     $path" >&2
      echo "  expected: $expected" >&2
      echo "  file:     $info" >&2
      echo "  lipo:     $lipo_out" >&2
      exit 1
    fi
  fi
  echo "  ✓ $label architecture: $expected"
}

bundle_root_for_triple() {
  local triple="$1"
  local host
  host="$(rustc -vV | awk '/^host:/{print $2}')"
  if [[ "$triple" == "$host" ]]; then
    # Native builds may land in target/release or target/<triple>/release depending on CLI.
    if [[ -d "$TARGET_DIR/$triple/release/bundle" ]]; then
      echo "$TARGET_DIR/$triple/release/bundle"
    else
      echo "$TARGET_DIR/release/bundle"
    fi
  else
    echo "$TARGET_DIR/$triple/release/bundle"
  fi
}

build_one_arch() {
  local arch="$1"
  local triple goarch expected label
  triple="$(rust_triple "$arch")"
  goarch="$(go_arch "$arch")"
  expected="$(expected_macho "$arch")"
  label="$(arch_label "$arch")"

  echo
  echo "────────────────────────────────────────"
  echo "Building $label"
  echo "  Rust target: $triple"
  echo "  Go target:   darwin/$goarch"
  echo "────────────────────────────────────────"

  ensure_rust_target "$triple"

  mkdir -p "$BIN_DIR" "$SIDECAR_DIR"
  # Force a fresh sidecar so a previous arch cannot be reused.
  rm -f "$BIN_DIR/serverui-server" "$BIN_DIR/serverui-server.exe"
  rm -f "$SIDECAR_DIR/serverui-server-${triple}" "$SIDECAR_DIR/serverui-server-${triple}.exe"

  echo "Building Go sidecar (darwin/$goarch)..."
  FORCE_SIDECAR_REBUILD=1 \
    TAURI_ENV_TARGET_TRIPLE="$triple" \
    GOOS=darwin GOARCH="$goarch" \
    "$DESKTOP_DIR/scripts/prepare-sidecar.sh"

  local sidecar="$SIDECAR_DIR/serverui-server-${triple}"
  if [[ ! -f "$sidecar" ]]; then
    echo "Missing sidecar after prepare: $sidecar" >&2
    exit 1
  fi
  verify_macho_arch "$sidecar" "$expected" "Go sidecar"

  # Drop stale DMG/app outputs for this target so we never collect an old arch.
  local bundle_root
  bundle_root="$(bundle_root_for_triple "$triple")"
  rm -rf "$bundle_root/dmg" "$bundle_root/macos"

  # Detach leftover ServerUI / Tauri temp DMG mounts that break bundle_dmg.sh.
  if command -v hdiutil >/dev/null 2>&1; then
    local vol
    for vol in "/Volumes/${PRODUCT_NAME}" "/Volumes/${PRODUCT_NAME} 1" /Volumes/dmg.*; do
      if [[ -d "$vol" ]]; then
        echo "  Detaching leftover volume: $vol"
        hdiutil detach "$vol" -force -quiet 2>/dev/null || true
      fi
    done
    # Best-effort: detach any rw.*.dmg images under the target tree.
    local stale
    while IFS= read -r stale; do
      [[ -n "$stale" ]] || continue
      hdiutil detach "$stale" -force -quiet 2>/dev/null || true
      rm -f "$stale"
    done < <(find "$TARGET_DIR" -name 'rw.*.dmg' 2>/dev/null || true)
  fi

  echo "Building Tauri bundle (--target $triple --bundles dmg)..."
  (
    cd "$DESKTOP_DIR"
    "${BUILD_CMD[@]}" --target "$triple" --bundles dmg
  )

  bundle_root="$(bundle_root_for_triple "$triple")"
  local dmg_src app_dir app_tar_src
  local mount_point=""
  local extract_dir=""

  shopt -s nullglob
  local dmgs=( "$bundle_root"/dmg/*.dmg )
  shopt -u nullglob
  if [[ ${#dmgs[@]} -eq 0 ]]; then
    echo "No DMG produced under $bundle_root/dmg" >&2
    exit 1
  fi
  dmg_src="${dmgs[0]}"

  # Verify the compiled release binary before packaging checks.
  local release_bin=""
  if [[ -f "$TARGET_DIR/$triple/release/$APP_BINARY_NAME" ]]; then
    release_bin="$TARGET_DIR/$triple/release/$APP_BINARY_NAME"
  elif [[ -f "$TARGET_DIR/release/$APP_BINARY_NAME" ]]; then
    release_bin="$TARGET_DIR/release/$APP_BINARY_NAME"
  fi
  if [[ -n "$release_bin" ]]; then
    verify_macho_arch "$release_bin" "$expected" "Release binary"
  fi

  shopt -s nullglob
  local updater_tars=( "$bundle_root"/macos/*.app.tar.gz )
  shopt -u nullglob

  app_dir="$bundle_root/macos/${PRODUCT_NAME}.app"
  if [[ ! -d "$app_dir" ]]; then
    shopt -s nullglob
    local apps=( "$bundle_root"/macos/*.app )
    shopt -u nullglob
    if [[ ${#apps[@]} -gt 0 ]]; then
      app_dir="${apps[0]}"
    else
      # Tauri removes the .app after DMG creation; recover it from the DMG.
      echo "  Recovering ${PRODUCT_NAME}.app from DMG for archive + verification..."
      extract_dir="$(mktemp -d "${TMPDIR:-/tmp}/serverui-macos-app.XXXXXX")"
      mount_point="$extract_dir/mnt"
      mkdir -p "$mount_point"
      if ! hdiutil attach "$dmg_src" -nobrowse -readonly -mountpoint "$mount_point" >/dev/null; then
        echo "Failed to mount DMG: $dmg_src" >&2
        rm -rf "$extract_dir"
        exit 1
      fi
      if [[ ! -d "$mount_point/${PRODUCT_NAME}.app" ]]; then
        echo "DMG does not contain ${PRODUCT_NAME}.app" >&2
        ls -la "$mount_point" >&2 || true
        hdiutil detach "$mount_point" -quiet 2>/dev/null || hdiutil detach "$mount_point" -force -quiet 2>/dev/null || true
        rm -rf "$extract_dir"
        exit 1
      fi
      cp -R "$mount_point/${PRODUCT_NAME}.app" "$extract_dir/${PRODUCT_NAME}.app"
      hdiutil detach "$mount_point" -quiet 2>/dev/null || hdiutil detach "$mount_point" -force -quiet 2>/dev/null || true
      mount_point=""
      app_dir="$extract_dir/${PRODUCT_NAME}.app"
    fi
  fi

  local app_bin="$app_dir/Contents/MacOS/$APP_BINARY_NAME"
  if [[ ! -f "$app_bin" ]]; then
    if [[ -f "$app_dir/Contents/MacOS/$PRODUCT_NAME" ]]; then
      app_bin="$app_dir/Contents/MacOS/$PRODUCT_NAME"
    else
      echo "Missing app executable under $app_dir/Contents/MacOS/" >&2
      ls -la "$app_dir/Contents/MacOS/" >&2 || true
      [[ -n "$extract_dir" ]] && rm -rf "$extract_dir"
      exit 1
    fi
  fi
  verify_macho_arch "$app_bin" "$expected" "App executable"

  local sidecar_in_app=""
  local candidate
  while IFS= read -r candidate; do
    sidecar_in_app="$candidate"
    break
  done < <(find "$app_dir/Contents/MacOS" -maxdepth 1 -type f -name 'serverui-server*' 2>/dev/null)
  if [[ -z "$sidecar_in_app" ]]; then
    while IFS= read -r candidate; do
      sidecar_in_app="$candidate"
      break
    done < <(find "$app_dir/Contents" -type f -name 'serverui-server*' 2>/dev/null)
  fi
  if [[ -n "$sidecar_in_app" ]]; then
    verify_macho_arch "$sidecar_in_app" "$expected" "Bundled Go sidecar"
  else
    echo "Bundled Go sidecar not found inside .app" >&2
    [[ -n "$extract_dir" ]] && rm -rf "$extract_dir"
    exit 1
  fi

  mkdir -p "$OUT_DIR"
  # User-facing names: ServerUI-<ver>-arm64.dmg / ServerUI-<ver>-x64.dmg
  local platform_key
  case "$arch" in
    arm64) platform_key="macos-arm64" ;;
    x64) platform_key="macos-x64" ;;
  esac
  local dest_dmg dest_tar
  dest_dmg="$OUT_DIR/$(desktop_release_dest_name "$VERSION" "$platform_key" dmg)"
  dest_tar="$OUT_DIR/$(desktop_release_dest_name "$VERSION" "$platform_key" app.tar.gz)"
  rm -f "$dest_dmg" "$dest_tar" "${dest_tar}.sig"

  cp "$dmg_src" "$dest_dmg"
  echo "  ✓ DMG → $(basename "$dest_dmg")"

  if [[ ${#updater_tars[@]} -gt 0 ]]; then
    app_tar_src="${updater_tars[0]}"
    cp "$app_tar_src" "$dest_tar"
    if [[ -f "${app_tar_src}.sig" ]]; then
      cp "${app_tar_src}.sig" "${dest_tar}.sig"
    fi
  else
    # Unsigned builds disable createUpdaterArtifacts; produce the updater-compatible archive.
    tar -C "$(dirname "$app_dir")" -czf "$dest_tar" "$(basename "$app_dir")"
  fi
  echo "  ✓ APP archive → $(basename "$dest_tar")"

  if [[ -n "$extract_dir" ]]; then
    rm -rf "$extract_dir"
    extract_dir=""
  fi

  if [[ ! -f "$dest_dmg" || ! -f "$dest_tar" ]]; then
    echo "Failed to collect artifacts for $arch" >&2
    exit 1
  fi
  if [[ "$(basename "$dest_dmg")" != *"${VERSION}"* ]]; then
    echo "DMG filename missing version $VERSION" >&2
    exit 1
  fi

  case "$arch" in
    arm64) ARM64_OK=1 ;;
    x64) X64_OK=1 ;;
  esac
}

ARM64_OK=0
X64_OK=0

mkdir -p "$OUT_DIR"
if [[ "$ARCH_ARG" == "all" ]]; then
  # Fresh multi-arch release directory; keep only macOS release artifacts.
  find "$OUT_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
fi

for arch in "${BUILD_ARCHS[@]}"; do
  build_one_arch "$arch"
done

echo
echo "Generating SHA256SUMS..."
desktop_release_write_sha256sums "$OUT_DIR"
echo "  ✓ SHA256SUMS"

echo
echo "macOS Release Build"
echo
echo "Version: $VERSION"
echo

if [[ " ${BUILD_ARCHS[*]} " == *" arm64 "* ]]; then
  echo "Apple Silicon:"
  if [[ "$ARM64_OK" -eq 1 ]]; then
    echo "✓ DMG"
    echo "✓ APP archive"
    echo "✓ Architecture verified"
  else
    echo "✗ Failed"
    exit 1
  fi
  echo
fi

if [[ " ${BUILD_ARCHS[*]} " == *" x64 "* ]]; then
  echo "Intel:"
  if [[ "$X64_OK" -eq 1 ]]; then
    echo "✓ DMG"
    echo "✓ APP archive"
    echo "✓ Architecture verified"
  else
    echo "✗ Failed"
    exit 1
  fi
  echo
fi

echo "Checksums:"
echo "✓ SHA256SUMS"
echo
echo "Output:"
echo "dist/macos/"
ls -la "$OUT_DIR"
