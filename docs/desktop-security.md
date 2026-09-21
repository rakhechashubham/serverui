# Desktop Security Threat Model

ServerUI desktop is a local control panel, not a multi-tenant SaaS. This document
describes realistic threats against the Phase 2/3 architecture and how they are
handled. It does not claim the product is “completely secure” or has zero attack
surface.

## Architecture under review

```
Tauri WebView
  → get_runtime_config (in-memory token + origin)
  → HTTP/WebSocket to http://127.0.0.1:<dynamic-port>
  → Go backend (SERVERUI_DESKTOP=1, local auth required)
  → SQLite or PostgreSQL (encrypted SSH secrets)
  → SSH to target Linux hosts
```

## Threat scenarios

| # | Scenario | Expected control |
| - | -------- | ---------------- |
| 1 | Attacker has access to the same machine | Local auth token is per-launch and in-memory; OS account compromise can still inspect process memory. Full disk encryption and OS login are assumed for physical access. |
| 2 | Attacker can make requests to localhost | Requests without the current token receive **401**. Health checks also require the token when desktop mode is enabled. |
| 3 | Attacker tries to discover the backend port | Port is ephemeral. Discovery alone is insufficient without the token. Binding is loopback-only. |
| 4 | Attacker calls the API without a token | **401 unauthorized**. |
| 5 | Attacker reuses an old token | Tokens are generated every launch and live only in process memory. After restart/shutdown the previous token is invalid. |
| 6 | Attacker opens `/ws/terminal` | Same local auth gate as HTTP. Preferred auth is WebSocket subprotocol `serverui-local.<token>`; query `localToken` remains a fallback for non-WS media URLs only. |
| 7 | Attacker reads frontend storage | Theme may use `localStorage`. The local API token and SSH secrets are **not** stored there. |
| 8 | Attacker inspects application logs | Logs must not contain tokens, passwords, private keys, or encryption keys. Errors are redacted. |
| 9 | Attacker connects from another machine | Desktop Go binds **127.0.0.1** only (forced in desktop mode). Non-loopback requires explicit `SERVERUI_ALLOW_NON_LOOPBACK=1` (developer escape hatch, unused by Tauri). |
| 10 | Attacker abuses the API while ServerUI is running | Anyone who can read the WebView/process memory or intercept the token on the local machine can call the API. Desktop mode assumes a single trusted interactive user. |

## Local authentication

- Header: `X-ServerUI-Local-Token` (HTTP)
- WebSocket: `Sec-WebSocket-Protocol: serverui-local.<token>` (preferred)
- Query: `localToken` only where headers/protocols are impossible (media/download)
- Comparison: constant-time
- `Authorization: Bearer …` is **not** accepted (avoids accidental alternate schemes)

## CORS / Origin

- **Web mode:** reflects request Origin (existing self-hosted behavior for split UI/API).
- **Desktop mode:** allowlist only (`http://localhost:*`, `http://127.0.0.1:*`, `tauri://localhost`, related Tauri hosts). Foreign origins are not reflected.

## Tauri IPC

Exposed custom command:

- `get_runtime_config` — no arguments; returns mode/status/origin/token for the current launch.

Also enabled (Phase 4, least privilege):

- `updater` plugin — check/download signed updates from the configured GitHub Releases endpoint; integrity verified with the embedded public key
- `process` plugin — relaunch after a user-approved update install

Not exposed:

- Shell execution
- Arbitrary filesystem APIs
- Generic network proxies

Update installs never run silently; the Settings UI requires an explicit user action.

## Credentials

- SSH secrets: AES-256-GCM via `crypto.Cipher` in PostgreSQL (web) or SQLite (desktop)
- Encryption key: env for web; desktop prefers OS keychain (`com.serverui.desktop`) with `.env` fallback for developers
- GET APIs never return passwords or private keys

## Residual risk (accepted for Phase 3)

- Same-user malware can often read process memory or attach to the WebView.
- Query-string tokens for media URLs may appear in reverse-proxy or browser network panels on the local machine.
- Web/self-hosted PostgreSQL remains an operator responsibility; desktop SQLite lives in the user app-data directory.
- OS keychain availability varies on Linux without a Secret Service daemon.

## Related docs

- [desktop.md](desktop.md)
- [desktop-storage.md](desktop-storage.md)
- [releases.md](releases.md)
- [architecture.md](architecture.md)
- [SECURITY.md](../SECURITY.md)
