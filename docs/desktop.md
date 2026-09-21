# Desktop Integration

Tauri shells the existing Next.js UI and starts the existing Go backend as a
child process. SSH, SFTP, PTY, credentials, and APIs remain in Go.

## Architecture

```
Tauri
 ├── WebView → apps/web (same UI as the browser app)
 └── Child process → apps/server (Go)
          ↓
     Local SQLite (app data directory)
          ↓
         SSH
          ↓
     Target Linux servers
```

Web/self-hosted continues to use PostgreSQL. Desktop packaged mode does **not**
require PostgreSQL, Docker, Node, Go, Rust, or a manual `.env`.

## First-run (packaged)

1. User installs and launches ServerUI  
2. Tauri resolves the OS app-data directory and ensures it exists  
3. Encryption key is resolved (OS keychain preferred)  
4. Go sidecar starts with `SERVERUI_STORAGE=sqlite` and `SERVERUI_DATABASE_PATH`  
5. Go creates/migrates `serverui.db` if needed  
6. Health check with per-launch local token  
7. UI loads — user can add an SSH server  

If startup fails, the UI surfaces a sanitized error (not a hang on
“Starting ServerUI backend…”).

## Security

- Loopback-only listen (`127.0.0.1`) in desktop mode
- Per-launch local API token (header / WS subprotocol)
- Desktop CORS allowlist (no `*` reflection)
- Custom Tauri command: `get_runtime_config` only (plus updater/process plugins)
- Encryption key prefers OS keychain; SSH secrets stay AES-GCM ciphertext in SQLite

See [desktop-security.md](desktop-security.md) and [desktop-storage.md](desktop-storage.md).

## Backend lifecycle

1. Ensure app-data directory exists  
2. Generate random local auth token  
3. Reserve `127.0.0.1:0`  
4. Resolve encryption key (keychain → `.env` fallback for developers)  
5. Spawn Go with desktop + SQLite env (or Postgres if explicitly overridden)  
6. Poll `/healthz` with token until ready (fail-fast if child exits)  
7. Watch child; on unexpected exit mark status `stopped`  
8. On app exit: SIGTERM/process-tree kill and clear token from memory  

## Local data

| Item | Location |
| ---- | -------- |
| SQLite DB | `<app-data>/serverui.db` |
| Master encryption key | OS keychain service `com.serverui.desktop` (preferred) |

Backup: quit the app, copy `serverui.db` (and protect the keychain key). The DB
contains **encrypted** secrets, not plaintext passwords. Details:
[desktop-storage.md](desktop-storage.md).

## Development

Default desktop-dev uses SQLite (no Postgres required):

```bash
make setup-env
make desktop-dev
```

Optional Postgres compatibility testing:

```bash
make desktop-db
SERVERUI_STORAGE=postgres make desktop-dev
```

```bash
make desktop-e2e      # local auth, loopback, SQLite, shutdown checks
make desktop-build    # unsigned local bundle by default
make desktop-build-macos          # arm64 + x64 → dist/macos/
make desktop-build-windows-x64    # Windows host → dist/windows/
make desktop-build-linux-x64      # Linux host → dist/linux/
make desktop-build-all            # CI instructions for full matrix
```

## Install from releases

End users do not need to build from source. Download installers from
[GitHub Releases](https://github.com/rakhechashubham/serverui/releases):

| Platform | Artifact |
| -------- | -------- |
| macOS (Apple Silicon) | `ServerUI-<version>-arm64.dmg` |
| macOS (Intel) | `ServerUI-<version>-x64.dmg` |
| Windows x64 | `ServerUI-<version>-x64-setup.exe` (optional `.msi`) |
| Linux x64 | `ServerUI-<version>-x86_64.AppImage` and `ServerUI-<version>-amd64.deb` |

Not in scope: Windows ARM64, Linux ARM64, RPM, Flatpak, Snap.

Verify with `SHA256SUMS`. Packaging, signing, updater, and tag release process:
[releases.md](releases.md).

**Signing/notarization:** not claimed complete unless CI secrets are configured
and verified. Unsigned local builds remain useful for development.

## Product experience

Shared with the web UI:

- First-run welcome when no servers exist
- Add / test / connect / switch servers
- Desktop TopBar server menu (switch, all servers, leave server)
- Dashboard metrics with last-updated
- Files with delete confirmation
- Settings (About, runtime; updates on desktop only)

Shortcuts: ⌘/Ctrl+K server menu, ⌘/Ctrl+, Settings, ⌘/Ctrl+W close window,
Esc clear menus. Terminal keystrokes are not stolen for close.

Manual QA: [manual-qa.md](manual-qa.md). Audit: [product-audit.md](product-audit.md).

## Updates

In the desktop app: **Settings → Check for updates**. Updates install only when
you choose **Install and restart**. Metadata comes from GitHub Releases
`latest.json` and is signature-verified.

## Known limitations

- Full GUI click-through E2E inside Tauri is not automated; `desktop-e2e` covers the local API/security surface.
- Windows/Linux **runtime** verification of installers depends on available hardware/CI.
- No automatic import from early 0.1.0 desktop Postgres inventories (see desktop-storage.md).
- Brand logo source: `branding/serverui-icon-1024.png` (regenerate Tauri icons via `npm run tauri -- icon` in `apps/desktop`).
- Code signing / notarization require CI secrets; unsigned builds are expected until those are configured.
- Mobile browsers are not a supported target for the desktop shell metaphor.
- Applications / Domains / Databases / Editor remain Coming soon (no invented backends).

## What data leaves the computer

ServerUI desktop does **not** send your SSH credentials or server inventory to a
ServerUI cloud. The Go process dials **your** configured Linux hosts over SSH
from the local machine. Update checks (when enabled) contact the configured
GitHub Releases endpoint for signed update metadata.
