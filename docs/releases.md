# Desktop releases (Phase 4)

This document covers versioning, packaging, signing, checksums, updates, and the
intentional GitHub Releases process for the ServerUI desktop application.

## Audit snapshot (pre–Phase 4)

| Item | State before Phase 4 |
| ---- | -------------------- |
| Tauri | 2.x (`@tauri-apps/cli` ^2.11) |
| Rust | `rust-version = "1.77"` in Cargo.toml |
| Frontend build | Next.js static export via `prepare-frontend.mjs` → `apps/web/out` |
| Go sidecar | `externalBin: binaries/serverui-server` + `prepare-sidecar.sh` |
| Product name | `ServerUI` |
| Identifier | `com.serverui.desktop` (stable; do not change casually) |
| Version | `0.1.0` in tauri.conf / Cargo / package.json |
| Icons | Present (`png` / `icns` / `ico`); brand mark with white OS-tile background |
| Bundle targets | `dmg`, `nsis`, `msi`, `appimage`, `deb` (no RPM) |
| Signing | Prepared via CI secrets; absent → unsigned (documented) |
| Updater | Configured (`pubkey` + GitHub `latest.json`); signatures only when private key present |
| CI desktop matrix | macOS arm64 + x64, Windows x64, Linux x64 |

## Versioning

**Single source of truth:** `apps/desktop/src-tauri/tauri.conf.json` → `version`

Semantic Versioning: `MAJOR.MINOR.PATCH` (example: `1.0.0`).

Sync Cargo + desktop `package.json`:

```bash
node apps/desktop/scripts/sync-version.mjs          # sync current conf → others
node apps/desktop/scripts/sync-version.mjs 1.2.3    # bump + sync
```

Releases are deliberate. Do **not** auto-bump on every commit.

Release tags must match the conf version:

```text
v0.1.0  →  tauri.conf.json version "0.1.0"
```

The release workflow refuses mismatched tags.

## Application identity

| Field | Value |
| ----- | ----- |
| Product name | ServerUI |
| Bundle / window title | ServerUI |
| Identifier | `com.serverui.desktop` |
| Publisher | Skyrekon Private Limited |
| Category | DeveloperTool |

Keep `identifier` stable after public installs; updaters and OS identity depend on it.

## Icons

Canonical mark: `branding/serverui-icon-1024.png` (white square background for OS
tiles; source artwork in `branding/serverui-logo.png`).
Tauri packager icons live in `apps/desktop/src-tauri/icons/` (`32x32`, `128x128`,
`128x128@2x`, `icon.icns`, `icon.ico`) and are included in app bundles and
installers. Web UI uses `apps/web/public/brand/` plus favicons under `apps/web/public/`
and `apps/web/app/favicon.ico`.

To refresh platform icons after changing the master:

```bash
cd apps/desktop
npm run tauri -- icon ../../branding/serverui-icon-1024.png
```

Then rebuild installers so DMG / `.app` / Windows / Linux packages pick up the new set.

## Supported package formats

| Platform | Architecture | Rust target | Artifacts | CI runner | Notes |
| -------- | ------------ | ----------- | --------- | --------- | ----- |
| macOS | Apple Silicon (ARM64) | `aarch64-apple-darwin` | `.dmg` (+ `.app.tar.gz` updater) | `macos-14` | Native on arm64 runners |
| macOS | Intel (x86_64) | `x86_64-apple-darwin` | `.dmg` (+ `.app.tar.gz` updater) | `macos-14` + `--target` | Cross-built from Apple Silicon; arch verified with `file`/`lipo`. **Not** a universal binary. Runtime on Intel hardware is separate from CI build verification. |
| Windows | x64 | `x86_64-pc-windows-msvc` | NSIS `-setup.exe` (primary), optional `.msi` | `windows-latest` | MSI kept optional |
| Linux | x64 | `x86_64-unknown-linux-gnu` | `.AppImage`, `.deb` | `ubuntu-22.04` | No RPM / Flatpak / Snap |

**Not supported in this phase:** Windows ARM64, Linux ARM64, RPM, Flatpak, Snap, AUR.

### Artifact naming

```text
ServerUI-<version>-arm64.dmg
ServerUI-<version>-x64.dmg
ServerUI-<version>-arm64.app.tar.gz          # optional updater archive
ServerUI-<version>-x64.app.tar.gz
ServerUI-<version>-x64-setup.exe
ServerUI-<version>-x64.msi                  # optional
ServerUI-<version>-x86_64.AppImage
ServerUI-<version>-amd64.deb
SHA256SUMS
ServerUI-<version>-SHA256SUMS.txt           # same sums, versioned filename on GitHub Releases
latest.json                                 # only when updater signatures exist
```

Local outputs land under `dist/macos/`, `dist/windows/`, `dist/linux/` (gitignored).

### Local build commands

```bash
make desktop-build                 # current host architecture
make desktop-build-macos-arm64
make desktop-build-macos-x64
make desktop-build-macos           # both macOS arches on a Mac
make desktop-build-windows-x64     # Windows host only
make desktop-build-linux-x64       # Linux host only
make desktop-build-all            # prints how to cut a full CI release
```

`desktop-build-all` does **not** pretend a Mac can produce production Windows/Linux
installers locally. Full matrix builds run in GitHub Actions.

## Go sidecar packaging

Users must **not** need Go, Node, Rust, or Tauri CLI.

Production flow:

1. CI/`prepare-sidecar.sh` builds `apps/server` for the target `GOOS`/`GOARCH`
2. Binary copied to `apps/desktop/src-tauri/binaries/serverui-server-<triple>[.exe]`
3. Tauri `externalBin` embeds it in the app bundle
4. At runtime Tauri starts the sidecar (Phase 2/3 lifecycle)

No developer home paths are hardcoded.

## Production configuration

Bundles must not include:

- `.env` with secrets
- SSH private keys
- local auth tokens
- developer API keys / DB passwords

Runtime secrets continue to use Phase 3 behavior: per-launch local token (memory
only) and OS keychain / generated encryption key. Build-time config must not
embed those secrets.

`.gitignore` already excludes `.env`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, and
sidecar binaries under `binaries/serverui-server-*`.

## Development vs production builds

| | Development (`make desktop-dev`) | Production (`make desktop-build` / release CI) |
| - | --- | --- |
| Frontend | Next.js `dev` URL | Static export `apps/web/out` |
| Signing | Unsigned | Optional Apple / Authenticode / updater keys via CI secrets |
| Updater artifacts | Disabled locally by default | Enabled when `TAURI_SIGNING_PRIVATE_KEY` is set |
| Logging | Dev-friendly | Optimized release profile (`lto`, `strip`) |
| Version | Working tree | Tag-aligned SemVer |

Local production-ish build (unsigned updater artifacts):

```bash
make desktop-build
```

This uses `tauri.unsigned.conf.json` unless `TAURI_SIGNING_PRIVATE_KEY` is set.

## Code signing architecture

**Never commit** certificates, private keys, passwords, or updater private keys.

### Updater signatures (all platforms)

| Secret | Purpose |
| ------ | ------- |
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of the minisign private key |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Optional password |

Public key is embedded in `tauri.conf.json` → `plugins.updater.pubkey`.

Generate (maintainers):

```bash
cd apps/desktop
npm run tauri signer generate -w /path/to/serverui-updater.key
# Commit ONLY the .pub contents into tauri.conf.json
# Store private key in GitHub Actions secrets — never in git
```

If the private key is lost, regenerate and ship a new public key only with a
breaking reinstall note (existing installs cannot verify new signatures).

### macOS (Developer ID + notarization)

| Secret | Purpose |
| ------ | ------- |
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | PKCS#12 password |
| `APPLE_KEYCHAIN_PASSWORD` | Temporary CI keychain password |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Example Org (TEAMID)` |
| `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` | Notarization |

When secrets are absent, CI produces **unsigned** `.dmg` builds (Gatekeeper will
warn). Notarization is **not** claimed tested until credentials are configured
and a signed build is verified on a Mac.

### Windows (Authenticode)

| Secret | Purpose |
| ------ | ------- |
| `WINDOWS_CERTIFICATE` | Base64-encoded `.pfx` (wire into future signing step) |
| `WINDOWS_CERTIFICATE_PASSWORD` | PFX password |

Tauri can sign when certificate env vars / config are supplied. Until secrets
exist, Windows installers are **unsigned**. Do not fake signing.

### Linux

No Apple/Microsoft-style code signing. Integrity is via SHA-256 checksums on
GitHub Releases. Optional future: package-store signing.

## CI workflows

| Workflow | File | Trigger | Purpose |
| -------- | ---- | ------- | ------- |
| Desktop CI | `.github/workflows/desktop.yml` | PR/push (paths) + manual | Unsigned matrix build + artifacts |
| Desktop Release | `.github/workflows/desktop-release.yml` | Tag `v*.*.*` + manual | Signed-if-configured build, release, checksums, `latest.json` |
| Core CI | `.github/workflows/ci.yml` | PR/push | Web, Go, Docker, secret-file guard |

### Release flow

```text
1. Land changes on main
2. node apps/desktop/scripts/sync-version.mjs X.Y.Z
3. Commit version bump
4. git tag vX.Y.Z && git push origin vX.Y.Z
5. Desktop Release workflow:
     validate tag ≡ tauri.conf.json
     → build macOS arm64 + macOS x64 + Windows x64 + Linux x64
     → rebuild Go sidecar per GOOS/GOARCH + Tauri triple
     → sign when secrets present (never fake)
     → upload artifacts with standardized names
     → GitHub Release + notes
     → SHA256SUMS
     → latest.json only when .sig files exist
```

Do not publish releases from arbitrary pushes to `main`.

### Failed release handling

1. Fix the issue on a branch / main
2. If the tag pointed at a bad commit: delete the GitHub Release (keep or delete
   tag intentionally), retag after the fix, or cut `vX.Y.Z+1`
3. Never reuse a tag for different bits once users may have downloaded it
4. Publish corrected checksums on the new release only

### Rollback / recovery

- Uninstall does not automatically wipe PostgreSQL data volumes
- Reinstall the previous release artifact from GitHub Releases
- App config / keychain entries typically survive reinstall; treat DB backups as
  operator responsibility
- Updater does not auto-rollback; keep prior installers available

## Auto-update

- **Source:** GitHub Releases `latest.json`
  (`plugins.updater.endpoints` in `tauri.conf.json`)
- **Integrity:** minisign via embedded `pubkey`; updates fail closed if
  verification fails
- **UX:** Settings → Check for updates → optional Install and restart  
  No silent background installs. No automatic channel zoo (stable only; tags are
  SemVer). Nightly is out of scope unless added later with a separate endpoint.
- **Channel:** stable (tagged SemVer). Development builds are unsigned/local.

Update testing with two versions requires signed artifacts and matching private
key. Without CI secrets, treat updater as **configured but not runtime-verified**.

## Verify checksums

```bash
# macOS
shasum -a 256 -c SHA256SUMS

# Linux
sha256sum -c SHA256SUMS
```

Only files listed in the SUMS file were published for that release (installers /
updater archives). Intermediate build trees are not included.

## Install / uninstall data behavior

| Data | Typical location / fate |
| ---- | ------------------------ |
| SQLite (packaged desktop) | OS app-data dir for `com.serverui.desktop` (`serverui.db`) |
| PostgreSQL | Web / self-hosted only (Compose/host). Not required by packaged desktop |
| App config / WebView data | OS app-data directories for `com.serverui.desktop` |
| Keychain master key | OS keychain entry; often remains after uninstall |
| Logs | OS logs / temp; not guaranteed wiped |
| Cached updates | Cleared by OS/updater temps |

Do not assume uninstall is a full crypto erase.

## Reproducible toolchain

| Tool | Version |
| ---- | ------- |
| Node.js | 22.x |
| npm | 10.x (ships with Node 22) |
| Go | from `apps/server/go.mod` (1.26.x) |
| Rust | stable (MSRV 1.77+) |
| Tauri CLI | `@tauri-apps/cli` ^2.11 |

Clean checkout:

```bash
git clone <repository-url>
cd serverui
cp .env.example .env && make setup-env   # local runtime only; not packaged
npm ci --prefix apps/web
npm ci --prefix apps/desktop
make desktop-build
```

## Security regression (must remain true)

Packaging must not weaken Phase 3:

- Loopback-only Go listen in desktop mode
- Per-launch local auth token (not persisted, not logged)
- WebSocket auth via `serverui-local.<token>`
- Minimal Tauri capabilities (`core` + updater + process only)
- AES-GCM credential storage + OS keychain master key preference
- Sanitized errors

See [desktop-security.md](desktop-security.md).
