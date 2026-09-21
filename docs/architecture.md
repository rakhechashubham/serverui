# Architecture

ServerUI is a control panel for Linux servers. The UI never opens SSH. The Go
backend owns server records, encrypted credentials, and SSH sessions.

## Current stack

### Web

```
Browser / UI
   │
   ▼
Next.js Web  (apps/web)
   │  HTTP / WebSocket
   ▼
Go API Server  (apps/server)
   ├── PostgreSQL
   └── SSH
        │
        ▼
     Target Linux server
```

### Desktop

```
Tauri  (apps/desktop)
   ├── WebView → Next.js UI (apps/web, shared)
   └── Child process → Go API (apps/server)
            ├── Local SQLite (app data)
            └── SSH → Target Linux server
```

| Layer | Responsibility |
| ----- | -------------- |
| Frontend (`apps/web`) | Desktop UI, server picker, files, terminal (xterm.js), metrics display |
| Desktop shell (`apps/desktop`) | Tauri window, Go child lifecycle, loopback port + local auth injection |
| Go backend (`apps/server`) | HTTP API, WebSocket terminal bridge, credential crypto, SSH pool, SFTP, metrics |
| PostgreSQL (web) / SQLite (desktop) | Server records and encrypted credential ciphertext |
| SSH / SFTP | Sessions to the selected Linux host |

## Runtime Architecture

ServerUI supports three ways to run the same product:

| Mode | Status | UI | Backend |
| ---- | ------ | -- | ------- |
| **Web** | Implemented | Browser + Next.js | Remote or same-host Go process (often via Docker) |
| **Desktop** | Implemented (Phase 2) | Tauri shell hosting the ServerUI UI | Local Go child process |
| **Source** | Supported | `apps/web` | `apps/server` built/run directly |

```
                         ServerUI
                            │
              ┌─────────────┴─────────────┐
              │                           │
             Web                       Desktop
              │                           │
        Remote / same-host           Local Go Backend
           Go Backend                  (child of Tauri)
              │                           │
              └─────────────┬─────────────┘
                            │
                           SSH
                            │
                            ▼
                       Linux Server
```

The UI talks to an **API / runtime abstraction** (`apps/web/src/lib/runtime`).
It must not hard-code where the Go process lives.

Conceptually:

```
ServerUI UI
    ↓
API / Runtime abstraction
    ↓
┌──────────────────────┐     ┌──────────────────────┐
│ Web                  │     │ Desktop              │
│ Remote Go Backend    │  or │ Local Go Backend     │
│ e.g. https://api.example.test
│                      │     │ e.g. http://127.0.0.1:<dynamic-port>
└──────────────────────┘     └──────────────────────┘
```

Docker Compose is a **deployment mechanism** for the web/self-hosted path. The
Go backend does not require Docker; `go run` / `make build` work against a
reachable PostgreSQL. Packaged and default desktop mode use **local SQLite** in
the OS app-data directory (no Postgres required). Optional desktop Postgres
testing remains available via `SERVERUI_STORAGE=postgres` and `make desktop-db`.

### Frontend runtime helpers

- `RuntimeMode`: `"web" | "desktop"`
- `currentRuntime()` — prefers in-memory Tauri-injected config, then env override
- `resolveApiOrigin()` — picks the browser-facing API base
- `apiUrl` / `wsUrl` — HTTP and WebSocket URLs used by the client
- `RuntimeProvider` — waits for desktop backend readiness inside Tauri

Same-origin empty base + Next.js rewrites (`SERVER_INTERNAL_URL`) remain the
production Docker path. Local `localhost:3000` development still targets
`http://127.0.0.1:8080` when no explicit base is set (web only).

### Desktop local API security

On each desktop launch Tauri:

1. Generates a random `SERVERUI_LOCAL_AUTH_TOKEN`
2. Binds Go to `127.0.0.1:<ephemeral-port>` (`SERVERUI_LISTEN_HOST`)
3. Injects `{ apiOrigin, localAuthToken }` into the UI via `get_runtime_config`
4. Stops the Go child on application exit

When the token env var is set, Go requires `X-ServerUI-Local-Token` (or
`localToken` query for WebSocket/media). Web/Docker leave the token unset.

See [docs/desktop.md](desktop.md).

## Why the UI does not SSH

SSH credentials and private keys must not live in `localStorage`, frontend
bundles, or GET responses. The UI sends a ServerUI `serverId`. The backend looks
up the stored server, decrypts credentials in memory, and dials SSH.

## Authentication flow (app)

There is no end-user login, SSO, or RBAC for ServerUI itself in this version.
Anyone who can reach the HTTP API can manage stored servers. Treat web
deployments as a trusted self-hosted control plane. Desktop mitigates local
exposure with loopback bind + per-launch token.

## Credential flow

1. UI submits password or private key only on create/update (`POST`/`PUT`).
2. Backend validates input, encrypts with AES-256-GCM (`crypto.Cipher` /
   `crypto.Box`) using `SERVERUI_CREDENTIAL_ENCRYPTION_KEY`.
3. Ciphertext is stored in `server_credentials` (PostgreSQL for web, SQLite for desktop).
4. List/get APIs return public fields only — never secrets.
5. On connect / test / terminal / files / metrics, the backend decrypts in
   memory, builds an SSH auth method, and dials through `internal/ssh`.
6. Decrypted material is not sent back to the UI and must not be logged.

Desktop resolves the AES master key via the OS keychain when available (injected
into the Go process env). Do not move private keys into browser JavaScript.

## Server records

Shared logical tables (Postgres or SQLite):

- `servers` — id, name, host, port, username, auth type, status, timestamps
- `server_credentials` — encrypted secret, cascaded on server delete
- `schema_migrations` — schema version bookkeeping

See [desktop-storage.md](desktop-storage.md).

## SSH connection lifecycle

`internal/ssh` provides password and OpenSSH private-key authentication.
Passphrase-protected keys are rejected with a clear error until that feature
exists.

A connection pool is keyed by server ID:

1. **Create/update** — optional connection test; pool entry forgotten on change
2. **Connect** — `Pool.Ensure` dials and watches the client
3. **Reuse** — files, terminal, and metrics share the pooled client
4. **Disconnect / delete** — close and remove the pool entry
5. **Shutdown** — `DisconnectAll` on process exit

The SSH layer belongs to the backend. Web vs desktop only changes how the UI
reaches that backend.

## Files

SFTP over the pooled SSH client. Paths are cleaned in `internal/filesystem` to
block traversal. Every file route requires `serverId`. The frontend never talks
SFTP directly.

## Terminal

xterm.js talks WebSocket to `apps/server` (`/ws/terminal?serverId=…`). The
backend opens an SSH session and PTY. The socket URL must not carry
host/user/password. Desktop appends `localToken` for local API auth.

## Metrics

The backend runs small remote commands (`/proc/stat`, `/proc/meminfo`, `df`) on
the selected server and parses the result. Caches are per server ID.

## Isolation

A request for server A must not use server B credentials or connections. File,
terminal, and metrics handlers resolve the target only from the stored server
ID.

The desktop shell remounts with `key={selectedServer.id}` when switching
servers so window state, WebSockets, and pollers do not leak across hosts.

## Product shell (Phase 5)

Shared UI information architecture:

1. Server selection / first-run welcome
2. Boot (SSH connect)
3. Desktop: TopBar (current server + switcher) → windows → Dock

Working apps: Dashboard (metrics), Files, Terminal, Settings, About, file Viewer.  
Coming soon placeholders: Editor, Applications, Domains, Databases.

Keyboard (desktop shell; Terminal input is not overridden for ⌘/Ctrl+W):

| Shortcut | Action |
| -------- | ------ |
| ⌘/Ctrl+K | Server menu |
| ⌘/Ctrl+, | Settings |
| ⌘/Ctrl+W | Close focused window |
| Esc | Clear menus / focus |

See [product-audit.md](product-audit.md) and [manual-qa.md](manual-qa.md).

## Configuration categories

See `.env.example` and [README](../README.md#environment-configuration).

| Category | Examples |
| -------- | -------- |
| Runtime / ports | `HTTP_PORT`, `WEB_PORT`, `SERVERUI_LISTEN_HOST` |
| Database | `POSTGRES_*`, optional `DATABASE_URL` |
| Credentials (backend only) | `SERVERUI_CREDENTIAL_ENCRYPTION_KEY` |
| Desktop local auth | `SERVERUI_LOCAL_AUTH_TOKEN` (Tauri-generated, not committed) |
| API (browser) | optional `NEXT_PUBLIC_API_BASE` |
| Deployment / rewrites | `SERVER_INTERNAL_URL` (Next.js server-side only) |

`POSTGRES_HOST` defaults to `127.0.0.1` for native runs. Compose sets
`POSTGRES_HOST=postgres` explicitly.

## Build & development

| Path | Command |
| ---- | ------- |
| Web (Docker) | `make dev` / `make start` |
| Desktop | `make desktop-dev` (SQLite); optional `SERVERUI_STORAGE=postgres make desktop-db` |
| Desktop bundle | `make desktop-build` |
| Source checks | `make test` / `make lint` / `make build` |

## API contract

HTTP and WebSocket routes under `/api/*` and `/ws/*` are stable. The frontend
may point at a remote or local Go process without changing those paths.

Contact: [contact@skyrekon.com](mailto:contact@skyrekon.com)
