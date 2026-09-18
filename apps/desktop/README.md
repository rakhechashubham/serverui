# ServerUI Desktop

Tauri shell around the shared Next.js UI and the existing Go backend.

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

The Go process still owns SSH, SFTP, terminal PTY, credentials, and APIs.
Tauri only starts/stops the backend, picks a loopback port, injects runtime
config into the UI, and hosts the updater/process plugins.

## Prerequisites

- Node.js 22+, Go 1.26+, Rust (rustc/cargo), platform Tauri dependencies
- Workspace `.env` with `SERVERUI_CREDENTIAL_ENCRYPTION_KEY` (`make setup-env`)
- PostgreSQL reachable on `127.0.0.1:5432` (use `make desktop-db` to publish
  Compose Postgres to the host)

## Development

```bash
# from repository root
make setup-env
make desktop-db          # optional if Postgres is already local
make desktop-dev
```

`make desktop-dev` builds the Go binary, starts Next.js on port 3000, and opens
the Tauri window. Closing the window stops the Go child process.

## Build

```bash
make desktop-build                 # host-arch local bundle
make desktop-build-macos-arm64     # Apple Silicon → dist/macos/
make desktop-build-macos-x64       # Intel → dist/macos/
make desktop-build-macos           # arm64 + x64 → dist/macos/
```

`make desktop-build` produces a Tauri bundle for the current machine. The
`desktop-build-macos*` targets collect versioned DMGs, `.app.tar.gz` archives,
and `SHA256SUMS` under `dist/macos/`. Each architecture rebuilds the matching
Go sidecar (`darwin/arm64` or `darwin/amd64`) before packaging.

Without `TAURI_SIGNING_PRIVATE_KEY`, builds use `tauri.unsigned.conf.json`
(updater artifact signing disabled).

Version source of truth: `src-tauri/tauri.conf.json`. Sync with:

```bash
make desktop-version
make desktop-version VERSION=1.2.3
```

Release packaging, CI matrix, signing secrets, and checksums:
[docs/releases.md](../../docs/releases.md).

## Local API security

Each launch:

1. Tauri generates a random token
2. Go listens on `127.0.0.1:<dynamic-port>` only (`SERVERUI_DESKTOP=1` forces loopback)
3. HTTP requires `X-ServerUI-Local-Token`
4. WebSocket prefers `Sec-WebSocket-Protocol: serverui-local.<token>`
5. Media/download URLs may use `localToken` query (headers unavailable)
6. The UI receives origin + token via `get_runtime_config` (memory only)
7. Encryption key prefers the OS keychain (`com.serverui.desktop`)

See [docs/desktop-security.md](../../docs/desktop-security.md).

## Commands

| Command | Purpose |
| ------- | ------- |
| `make desktop-db` | Start Postgres with host port 5432 |
| `make desktop-dev` | Dev: Next + Tauri + local Go |
| `make desktop-build` | Production-ish desktop bundle |
| `make desktop-version` | Sync/bump SemVer |
| `make build-server` | Build `bin/serverui-server` only |

See [docs/desktop.md](../../docs/desktop.md) and [docs/architecture.md](../../docs/architecture.md).
