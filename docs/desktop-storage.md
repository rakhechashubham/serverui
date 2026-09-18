# Desktop Storage Investigation

Investigation only (Phase 3). PostgreSQL is **not** replaced in this phase.

## What PostgreSQL stores today

From `apps/server/internal/db/schema.sql`:

| Table | Contents |
| ----- | -------- |
| `servers` | id, name, host, port, username, auth_type, status, last_error, last_seen, timestamps |
| `server_credentials` | encrypted_secret (AES-256-GCM ciphertext), auth_type, timestamps |

There is no Session/user/RBAC table. Application “login” does not exist.

## What must persist locally on desktop

| Data | Sensitivity | Current store | Notes |
| ---- | ----------- | ------------- | ----- |
| Server inventory | Low–medium | PostgreSQL | Needed across launches |
| SSH passwords / private keys | High | PostgreSQL ciphertext | Decrypted only in Go memory for SSH |
| Credential encryption key | Critical | Env (web) / OS keychain preferred (desktop) | Protects all ciphertext |
| Local API token | High | Process memory only | Per-launch; never persisted |
| Theme preference | None | `localStorage` | UI only |

## What can be ephemeral

- Local API port and token (every launch)
- SSH connection pool / PTY sessions (process lifetime)
- Metrics cache

## Could SQLite simplify distribution?

| Factor | Assessment |
| ------ | ---------- |
| Schema | Simple; mostly portable SQL (`TIMESTAMPTZ` / `NOW()` are Postgres-flavored but adaptable) |
| Ops | SQLite would remove the desktop Postgres dependency and help offline bundles |
| Concurrency | Desktop is single-user; SQLite is likely enough |
| Risk | Migration, backup, and dual-driver support would touch Go store code broadly |

**Recommendation:** Keep PostgreSQL for Phase 3/4 stability. Plan a Phase 4+ optional SQLite driver behind the existing `servers.Store` interface if packaging friction remains high.

## OS keychain role (Phase 3)

Implemented boundary:

- **OS keychain** may hold `SERVERUI_CREDENTIAL_ENCRYPTION_KEY` for the desktop app (`com.serverui.desktop`).
- **PostgreSQL** continues to hold encrypted SSH secrets.
- **Frontend** never sees the encryption key or SSH private material.

This avoids rewriting the credential model while improving where the master key lives on desktop.

## Decision

**PostgreSQL remains the desktop database in Phase 3.**

Reasons:

1. Existing schema, migrations, and tests already assume it.
2. Docker web workflow must stay unchanged.
3. Replacing it now would destabilize Phase 2 without improving the primary desktop threat model (local token + loopback).
4. Master-key placement in the OS keychain addresses the highest-value desktop secret without a storage engine swap.

## Follow-ups (Phase 4+)

- Optional SQLite `servers.Store` implementation
- Bundled Postgres or embedded engine packaging
- Backup/export of encrypted server inventory
- Documented key rotation for OS keychain + ciphertext
