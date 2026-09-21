#!/usr/bin/env bash
# Targeted checks for desktop release naming / updater JSON helpers.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/desktop-release.sh
source "$ROOT/scripts/lib/desktop-release.sh"

fail=0
assert_eq() {
  local got="$1" want="$2" label="$3"
  if [[ "$got" != "$want" ]]; then
    echo "FAIL $label: got='$got' want='$want'" >&2
    fail=1
  else
    echo "OK   $label"
  fi
}

assert_eq "$(desktop_release_dest_name 0.1.0 macos-arm64 dmg)" "ServerUI-0.1.0-arm64.dmg" "macos arm64 dmg"
assert_eq "$(desktop_release_dest_name 0.1.0 macos-x64 dmg)" "ServerUI-0.1.0-x64.dmg" "macos x64 dmg"
assert_eq "$(desktop_release_dest_name 0.1.0 windows-x64 setup.exe)" "ServerUI-0.1.0-x64-setup.exe" "windows setup"
assert_eq "$(desktop_release_dest_name 0.1.0 windows-x64 msi)" "ServerUI-0.1.0-x64.msi" "windows msi"
assert_eq "$(desktop_release_dest_name 0.1.0 linux-x64 AppImage)" "ServerUI-0.1.0-x86_64.AppImage" "linux AppImage"
assert_eq "$(desktop_release_dest_name 0.1.0 linux-x64 deb)" "ServerUI-0.1.0-amd64.deb" "linux deb"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/in" "$TMP/out"
# Fake collect inputs
mkdir -p "$TMP/in/dmg" "$TMP/in/nsis" "$TMP/in/appimage" "$TMP/in/deb"
echo dmg > "$TMP/in/dmg/ServerUI_0.1.0_aarch64.dmg"
echo exe > "$TMP/in/nsis/ServerUI_0.1.0_x64-setup.exe"
echo img > "$TMP/in/appimage/ServerUI_0.1.0_amd64.AppImage"
echo deb > "$TMP/in/deb/ServerUI_0.1.0_amd64.deb"

desktop_release_collect 0.1.0 macos-arm64 "$TMP/in" "$TMP/out/macos"
test -f "$TMP/out/macos/ServerUI-0.1.0-arm64.dmg"
desktop_release_collect 0.1.0 windows-x64 "$TMP/in" "$TMP/out/windows"
test -f "$TMP/out/windows/ServerUI-0.1.0-x64-setup.exe"
desktop_release_collect 0.1.0 linux-x64 "$TMP/in" "$TMP/out/linux"
test -f "$TMP/out/linux/ServerUI-0.1.0-x86_64.AppImage"
test -f "$TMP/out/linux/ServerUI-0.1.0-amd64.deb"
desktop_release_write_sha256sums "$TMP/out/linux"
test -f "$TMP/out/linux/SHA256SUMS"
echo "OK   collect + SHA256SUMS"

# Updater JSON: no sig → no latest.json
mkdir -p "$TMP/upd"
cp "$TMP/out/macos/ServerUI-0.1.0-arm64.dmg" "$TMP/upd/"
# fake updater archive without sig
echo tar > "$TMP/upd/ServerUI-0.1.0-arm64.app.tar.gz"
node "$ROOT/scripts/generate-updater-latest-json.mjs" \
  --version 0.1.0 --tag v0.1.0 --repo example/serverui --dir "$TMP/upd"
if [[ -f "$TMP/upd/latest.json" ]]; then
  echo "FAIL updater wrote latest.json without signatures" >&2
  fail=1
else
  echo "OK   updater skips latest.json without .sig"
fi

# With sig → latest.json for darwin-aarch64
echo sigdata > "$TMP/upd/ServerUI-0.1.0-arm64.app.tar.gz.sig"
echo tar > "$TMP/upd/ServerUI-0.1.0-x64.app.tar.gz"
echo sigx > "$TMP/upd/ServerUI-0.1.0-x64.app.tar.gz.sig"
node "$ROOT/scripts/generate-updater-latest-json.mjs" \
  --version 0.1.0 --tag v0.1.0 --repo example/serverui --dir "$TMP/upd"
test -f "$TMP/upd/latest.json"
node -e '
const j=require(process.argv[1]);
if (!j.platforms["darwin-aarch64"] || !j.platforms["darwin-x86_64"]) {
  console.error(j);
  process.exit(1);
}
' "$TMP/upd/latest.json"
echo "OK   updater maps darwin-aarch64 + darwin-x86_64"

if [[ "$fail" -ne 0 ]]; then
  echo "desktop release helper tests failed" >&2
  exit 1
fi
echo "All desktop release helper checks passed."
