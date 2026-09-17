# Architecture

ServerUI is a browser control panel. The browser never opens SSH. The Go backend owns
server records, encrypted credentials, and SSH sessions.

```
Browser
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

## Why the browser does not SSH

SSH credentials and private keys must not live in `localStorage`, frontend bundles, or
GET responses. The UI sends a ServerUI `serverId`. The backend looks up the stored
server, decrypts credentials in memory, and dials SSH.

## Server records

PostgreSQL tables:

- `servers` — id, name, host, port, username, auth type, status, timestamps
- `server_credentials` — encrypted secret, cascaded on server delete

Passwords and private keys are encrypted with AES-256-GCM using
`SERVERUI_CREDENTIAL_ENCRYPTION_KEY` before insert. List/get APIs return public fields
only.

## SSH

`internal/ssh` provides password and OpenSSH private-key authentication. Passphrase-
protected keys are rejected with a clear error until that feature exists.

A connection pool is keyed by server ID. Files, terminal, and metrics reuse the
connection for the selected server. Switching servers disconnects the previous session
when appropriate.

## Files

SFTP over the pooled SSH client. Paths are cleaned in `internal/filesystem` to block
traversal. Every file route requires `serverId`.

## Terminal

xterm.js in the browser talks WebSocket to `apps/server`. The backend opens an SSH
session and PTY on the selected server. The browser cannot pass host/user/password on
the socket URL.

## Metrics

The backend runs small remote commands (`/proc/stat`, `/proc/meminfo`, `df`) on the
selected server and parses the result. Caches are per server ID so switching servers
does not reuse stale numbers.

## Isolation

A request for server A must not use server B credentials or connections. File, terminal,
and metrics handlers resolve the target only from the stored server ID.

Contact: [contact@skyrekon.com](mailto:contact@skyrekon.com)
