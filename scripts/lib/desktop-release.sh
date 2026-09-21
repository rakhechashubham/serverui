#!/usr/bin/env bash
# Shared helpers for ServerUI desktop release artifact naming and collection.
# Sourced by collect-desktop-artifacts.sh and GitHub Actions steps.
#
# Supported release platforms (user-facing suffixes):
#   macos-arm64  → ServerUI-<ver>-arm64.dmg (+ optional .app.tar.gz)
#   macos-x64    → ServerUI-<ver>-x64.dmg (+ optional .app.tar.gz)
#   windows-x64  → ServerUI-<ver>-x64-setup.exe (+ optional .msi)
#   linux-x64    → ServerUI-<ver>-x86_64.AppImage + ServerUI-<ver>-amd64.deb
#
# shellcheck shell=bash

desktop_release_dest_name() {
  # Args: version platform kind
  # kind: dmg | app.tar.gz | app.tar.gz.sig | setup.exe | setup.exe.sig | msi | msi.sig | AppImage | AppImage.sig | deb
  local version="$1"
  local platform="$2"
  local kind="$3"
  local product="ServerUI"

  case "$platform:$kind" in
    macos-arm64:dmg) echo "${product}-${version}-arm64.dmg" ;;
    macos-arm64:app.tar.gz) echo "${product}-${version}-arm64.app.tar.gz" ;;
    macos-arm64:app.tar.gz.sig) echo "${product}-${version}-arm64.app.tar.gz.sig" ;;
    macos-x64:dmg) echo "${product}-${version}-x64.dmg" ;;
    macos-x64:app.tar.gz) echo "${product}-${version}-x64.app.tar.gz" ;;
    macos-x64:app.tar.gz.sig) echo "${product}-${version}-x64.app.tar.gz.sig" ;;
    windows-x64:setup.exe) echo "${product}-${version}-x64-setup.exe" ;;
    windows-x64:setup.exe.sig) echo "${product}-${version}-x64-setup.exe.sig" ;;
    windows-x64:msi) echo "${product}-${version}-x64.msi" ;;
    windows-x64:msi.sig) echo "${product}-${version}-x64.msi.sig" ;;
    linux-x64:AppImage) echo "${product}-${version}-x86_64.AppImage" ;;
    linux-x64:AppImage.sig) echo "${product}-${version}-x86_64.AppImage.sig" ;;
    linux-x64:deb) echo "${product}-${version}-amd64.deb" ;;
    *)
      echo "Unknown platform/kind: $platform / $kind" >&2
      return 1
      ;;
  esac
}

desktop_release_platform_meta() {
  # Prints: rust_triple goos goarch runner_hint
  case "$1" in
    macos-arm64) echo "aarch64-apple-darwin darwin arm64 macos-14" ;;
    macos-x64) echo "x86_64-apple-darwin darwin amd64 macos-14(cross)" ;;
    windows-x64) echo "x86_64-pc-windows-msvc windows amd64 windows-latest" ;;
    linux-x64) echo "x86_64-unknown-linux-gnu linux amd64 ubuntu-22.04" ;;
    *)
      echo "Unknown platform: $1" >&2
      return 1
      ;;
  esac
}

desktop_release_classify() {
  # Classify a basename into a kind for the given platform. Prints kind or empty.
  local platform="$1"
  local base="$2"
  case "$platform" in
    macos-arm64|macos-x64)
      case "$base" in
        *.app.tar.gz.sig) echo "app.tar.gz.sig" ;;
        *.app.tar.gz) echo "app.tar.gz" ;;
        *.dmg) echo "dmg" ;;
      esac
      ;;
    windows-x64)
      case "$base" in
        *-setup.exe.sig) echo "setup.exe.sig" ;;
        *-setup.exe) echo "setup.exe" ;;
        *.msi.sig) echo "msi.sig" ;;
        *.msi) echo "msi" ;;
      esac
      ;;
    linux-x64)
      case "$base" in
        *.AppImage.sig) echo "AppImage.sig" ;;
        *.AppImage) echo "AppImage" ;;
        *.deb) echo "deb" ;;
      esac
      ;;
  esac
}

desktop_release_collect() {
  # Args: version platform bundle_dir out_dir
  local version="$1"
  local platform="$2"
  local bundle_dir="$3"
  local out_dir="$4"
  local collected=0

  mkdir -p "$out_dir"

  local f base kind dest
  shopt -s nullglob
  local candidates=(
    "$bundle_dir"/dmg/*.dmg
    "$bundle_dir"/macos/*.app.tar.gz
    "$bundle_dir"/macos/*.app.tar.gz.sig
    "$bundle_dir"/nsis/*
    "$bundle_dir"/msi/*
    "$bundle_dir"/appimage/*
    "$bundle_dir"/deb/*.deb
  )
  shopt -u nullglob

  for f in "${candidates[@]}"; do
    [[ -f "$f" ]] || continue
    base="$(basename "$f")"
    kind="$(desktop_release_classify "$platform" "$base" || true)"
    [[ -n "$kind" ]] || continue
    dest="$(desktop_release_dest_name "$version" "$platform" "$kind")"
    cp "$f" "$out_dir/$dest"
    echo "Collected $dest"
    collected=$((collected + 1))
  done

  if [[ "$collected" -eq 0 ]]; then
    echo "No release artifacts collected for $platform from $bundle_dir" >&2
    return 1
  fi
}

desktop_release_write_sha256sums() {
  # Args: directory (writes SHA256SUMS inside it for final distributables)
  local dir="$1"
  (
    cd "$dir"
    rm -f SHA256SUMS
    shopt -s nullglob
    local files=(
      *.dmg
      *.app.tar.gz
      *-setup.exe
      *.msi
      *.AppImage
      *.deb
    )
    shopt -u nullglob
    if [[ ${#files[@]} -eq 0 ]]; then
      echo "No distributable files in $dir for SHA256SUMS" >&2
      return 1
    fi
    if command -v sha256sum >/dev/null 2>&1; then
      while IFS= read -r f; do
        sha256sum "$f"
      done < <(printf '%s\n' "${files[@]}" | LC_ALL=C sort) > SHA256SUMS
    else
      while IFS= read -r f; do
        shasum -a 256 "$f"
      done < <(printf '%s\n' "${files[@]}" | LC_ALL=C sort) > SHA256SUMS
    fi
    echo "Wrote $dir/SHA256SUMS"
  )
}

desktop_release_required_kinds() {
  # Required artifact kinds per platform (optional kinds omitted).
  case "$1" in
    macos-arm64|macos-x64) echo "dmg" ;;
    windows-x64) echo "setup.exe" ;;
    linux-x64) echo "AppImage deb" ;;
    *) return 1 ;;
  esac
}

desktop_release_verify_required() {
  local version="$1"
  local platform="$2"
  local out_dir="$3"
  local kind dest missing=0
  for kind in $(desktop_release_required_kinds "$platform"); do
    dest="$(desktop_release_dest_name "$version" "$platform" "$kind")"
    if [[ ! -f "$out_dir/$dest" ]]; then
      echo "Missing required artifact: $dest" >&2
      missing=1
    fi
  done
  [[ "$missing" -eq 0 ]]
}
