# Desktop Integration

Tauri shells the existing Next.js UI and starts the existing Go backend as a
child process. SSH, SFTP, PTY, credentials, and APIs remain in Go.

## Architecture

```
Tauri
 ├── WebView → apps/web (same UI as the browser app)
 └── Child process → apps/server (Go)
          ↓
     PostgreSQL
          ↓
         SSH
          ↓
     Target Linux servers
```

## Security (Phase 3)

- Loopback-only listen (`127.0.0.1`) in desktop mode
- Per-launch local API token (header / WS subprotocol)
- Desktop CORS allowlist (no `*` reflection)
- Custom Tauri command: `get_runtime_config` only (plus updater/process plugins)
- Encryption key prefers OS keychain; SSH secrets stay AES-GCM in Postgres

See [desktop-security.md](desktop-security.md) and [desktop-storage.md](desktop-storage.md).

## Backend lifecycle

1. Generate random local auth token
2. Reserve `127.0.0.1:0`
3. Resolve encryption key (keychain → `.env` fallback)
4. Spawn Go with `SERVERUI_DESKTOP=1`, loopback host, token, key
5. Poll `/healthz` with token until ready (or fail clearly)
6. Watch child; on unexpected exit mark status `stopped` (no auto-restart loop)
7. On app exit: SIGTERM/process-tree kill and clear token from memory

## Development

```bash
make setup-env
make desktop-db
make desktop-dev
```

```bash
make desktop-e2e      # local auth, loopback, shutdown checks
make desktop-build    # unsigned local bundle by default
```

## Install from releases

End users do not need to build from source. Download installers from
[GitHub Releases](https://github.com/rakhechashubham/serverui/releases):

| Platform | Artifact |
| -------- | -------- |
| macOS (Apple Silicon) | `ServerUI-*-macos-arm64.dmg` |
| Windows x64 | `ServerUI-*-windows-x64-setup.exe` or `.msi` |
| Linux x64 | `ServerUI-*-linux-x64.AppImage` or `.deb` |

Verify SHA-256 sums shipped with the release. Packaging, signing, updater, and
tag release process: [releases.md](releases.md).

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
- PostgreSQL is still required (SQLite investigation documented, not migrated).
- macOS Intel and Linux/Windows **runtime** verification depend on available hardware/CI; see [releases.md](releases.md).
- Icons are functional Tauri assets; a polished brand logo may still be swapped in later.
- Code signing / notarization require CI secrets; unsigned builds are expected until those are configured.
- Mobile browsers are not a supported target for the desktop shell metaphor.
- Applications / Domains / Databases / Editor remain Coming soon (no invented backends).
