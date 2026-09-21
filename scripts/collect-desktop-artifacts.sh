#!/usr/bin/env bash
# Collect and rename Tauri bundle outputs into standardized release names.
#
# Usage:
#   scripts/collect-desktop-artifacts.sh \
#     --version 0.1.0 \
#     --platform macos-arm64|macos-x64|windows-x64|linux-x64 \
#     --bundle-dir apps/desktop/src-tauri/target/release/bundle \
#     --out-dir dist/macos
#
# Optional:
#   --checksums   Write SHA256SUMS in --out-dir after collection
#   --verify      Fail if required artifacts for the platform are missing
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/desktop-release.sh
source "$ROOT/scripts/lib/desktop-release.sh"

VERSION=""
PLATFORM=""
BUNDLE_DIR=""
OUT_DIR=""
DO_CHECKSUMS=0
DO_VERIFY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    --bundle-dir) BUNDLE_DIR="$2"; shift 2 ;;
    --out-dir) OUT_DIR="$2"; shift 2 ;;
    --checksums) DO_CHECKSUMS=1; shift ;;
    --verify) DO_VERIFY=1; shift ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$VERSION" || -z "$PLATFORM" || -z "$BUNDLE_DIR" || -z "$OUT_DIR" ]]; then
  echo "Required: --version --platform --bundle-dir --out-dir" >&2
  exit 1
fi

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid version: $VERSION" >&2
  exit 1
fi

desktop_release_platform_meta "$PLATFORM" >/dev/null
if [[ ! -d "$BUNDLE_DIR" ]]; then
  echo "Bundle directory not found: $BUNDLE_DIR" >&2
  exit 1
fi

desktop_release_collect "$VERSION" "$PLATFORM" "$BUNDLE_DIR" "$OUT_DIR"

if [[ "$DO_VERIFY" -eq 1 ]]; then
  desktop_release_verify_required "$VERSION" "$PLATFORM" "$OUT_DIR"
fi

if [[ "$DO_CHECKSUMS" -eq 1 ]]; then
  desktop_release_write_sha256sums "$OUT_DIR"
fi
