# Desktop Storage

ServerUI uses **different storage engines by delivery mode**.

| Mode | Engine | Why |
| ---- | ------ | --- |
| **Web / self-hosted** | PostgreSQL | Multi-process, Compose-friendly, existing deployments |
| **Desktop (packaged + default `make desktop-dev`)** | SQLite file in the OS app-data directory | Zero-config single-user local install |

PostgreSQL support is **not** removed. Web mode is unchanged.

## What is stored

From the shared logical schema (`servers`, `server_credentials`):

| Table | Contents |
| ----- | -------- |
| `servers` | id, name, host, port, username, auth_type, status, last_error, last_seen, timestamps |
| `server_credentials` | `encrypted_secret` (AES-256-GCM ciphertext), auth_type, timestamps |
| `schema_migrations` | Applied schema version bookkeeping |

There is no Session/user/RBAC table. Application “login” does not exist.

## Desktop SQLite location

Tauri resolves the platform application data directory (bundle id `com.serverui.desktop`) and stores:

```text
<app-data-dir>/serverui.db
```

Typical paths (examples; exact root follows the OS / Tauri PathResolver):

| OS | Typical directory |
| -- | ----------------- |
| macOS | `~/Library/Application Support/com.serverui.desktop/` |
| Windows | `%APPDATA%\com.serverui.desktop\` |
| Linux | `~/.local/share/com.serverui.desktop/` (or `$XDG_DATA_HOME/...`) |

The database is created automatically on first launch. Users do **not** run migrations manually.

Do **not** store `serverui.db` in the install bundle, CWD, or project tree for packaged apps.

## Configuration

| Variable | Role |
| -------- | ---- |
| `SERVERUI_STORAGE` | `postgres` (default) or `sqlite` |
| `SERVERUI_DATABASE_PATH` | Required when `SERVERUI_STORAGE=sqlite` — absolute path to `.db` file |
| `DATABASE_URL` / `POSTGRES_*` | Web / optional desktop Postgres override only |

Desktop Tauri sets:

```text
SERVERUI_DESKTOP=1
SERVERUI_STORAGE=sqlite
SERVERUI_DATABASE_PATH=<app-data>/serverui.db
```

Developer override for Postgres desktop testing:

```bash
make desktop-db
SERVERUI_STORAGE=postgres make desktop-dev
```

## Credential security (unchanged model)

```text
SSH secret
  → AES-256-GCM (crypto.Box)
  → encrypted_secret column (Postgres or SQLite)
  → decrypted only in Go memory for SSH
```

- Frontend never receives stored passwords/private keys.
- Desktop master key prefers OS keychain (`com.serverui.desktop`) with `.env` fallback for developers.
- Do not treat SQLite as “encrypted DB”; protect the machine account + master key + ciphertext.

## Backup guidance (desktop)

1. Quit ServerUI.
2. Copy `serverui.db` from the app-data directory to a secure backup location.
3. Optionally also back up/export OS keychain guidance for the encryption key account (`credential-encryption-key` under service `com.serverui.desktop`) — without the key, ciphertext cannot be decrypted.
4. Never share a raw DB dump as if it were safe: it still contains encrypted secrets that are valuable to an attacker who also obtains the key.

There is no UI “export plaintext credentials” feature by design.

## Migration from ServerUI 0.1.0 desktop (Postgres)

Early desktop builds expected an **external** PostgreSQL instance. Data lived in the operator’s Postgres, not in an app-owned file.

Phase A packaged desktop uses a **new local SQLite file** and does **not** auto-import from Postgres (to avoid silent data loss / risky transforms).

If you previously used desktop with Postgres and need that inventory:

- Keep using Postgres temporarily via `SERVERUI_STORAGE=postgres` in developer mode, or
- Re-add servers in the new SQLite-backed app, or
- Perform a careful manual export/import (not automated in this phase).

ServerUI never deletes an external Postgres database during SQLite startup.

## Web mode

Unchanged:

```text
Next.js → Go → PostgreSQL → SSH/SFTP
```

Compose / `.env` / `DATABASE_URL` continue to work.

## Driver notes

- PostgreSQL: `github.com/jackc/pgx/v5`
- SQLite: `modernc.org/sqlite` (pure Go, no CGO — simplifies sidecar cross-compiles)

Schema version: `schema_migrations.version` / `db.CurrentSchemaVersion` (currently `1`).
