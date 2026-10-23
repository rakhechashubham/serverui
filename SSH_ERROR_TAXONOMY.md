# ServerUI SSH Error Taxonomy — Complete DX Audit & Rewrite

## Executive Summary

This document describes the complete overhaul of SSH error handling in ServerUI. The previous implementation used generic error messages ("failed to connect", "invalid credentials", "authentication failed") that forced developers to spend 5-15 minutes debugging common SSH issues.

The new system provides **structured, actionable errors** with:
- **Machine-readable codes** for programmatic handling
- **Plain-language messages** explaining what went wrong
- **Specific hints** with exact commands to fix the issue
- **Documentation links** for self-service troubleshooting
- **Retryability flags** for automatic retry logic

---

## Error Taxonomy (6 Priority Scenarios + Extended)

### 1. Passphrase-Protected Private Key (Highest Priority)
**Code:** `SSH_KEY_PASSPHRASE_PROTECTED`
**Message:** "The private key is protected by a passphrase."
**Hint:** "ServerUI does not support passphrase-protected keys. Remove the passphrase with: `ssh-keygen -p -f /path/to/key -P 'old_passphrase' -N ''`"
**Docs:** `/ssh-keys#removing-a-passphrase`
**Retryable:** false

### 2. Wrong Key Format (PuTTY .ppk, RFC4716, PKCS#8)
**Code:** `SSH_KEY_INVALID_FORMAT`
**Message:** "The private key format is not supported."
**Hint:** "The private key is not in a supported format. ServerUI accepts OpenSSH (PEM) keys only. Detected format: PuTTY (.ppk). Convert PuTTY .ppk keys with: `puttygen key.ppk -O private-openssh -o key.pem`"
**Docs:** `/ssh-keys#supported-formats`
**Retryable:** false

### 3. DNS Resolution Failure
**Code:** `SSH_DNS_RESOLUTION_FAILED`
**Message:** "The host name could not be resolved."
**Hint:** "Check the Host field for typos. Try using the IP address instead. Verify DNS with: `nslookup <host>`"
**Docs:** `/troubleshooting#dns`
**Retryable:** true

### 4. Connection Timeout (Wrong Port, Firewall, Host Down)
**Code:** `SSH_CONNECTION_TIMEOUT`
**Message:** "Connection timed out."
**Hint:** "Check: (1) The SSH port (default 22) is correct. (2) No firewall blocks the connection. (3) The host is up. Test with: `ssh -p 22 user@host`"
**Docs:** `/troubleshooting#timeout`
**Retryable:** true

### 5. Authentication Failed (Wrong User/Pass/Key)
**Code:** `SSH_AUTH_FAILED`
**Message:** "Authentication failed."
**Hint:** "Check: (1) Username is correct. (2) Password is correct (if using password auth). (3) Private key matches the authorized_keys on the server. (4) Key permissions are 600 (chmod 600 key). Test manually: `ssh -p 22 user@host`"
**Docs:** `/troubleshooting#auth-failed`
**Retryable:** false

### 6. Host Key Verification (TOFU - Currently Accepts Any)
**Code:** `SSH_HOST_KEY_CHANGED` / `SSH_HOST_KEY_VERIFICATION_FAILED`
**Message:** "The server's host key has changed." / "Host key verification failed."
**Hint:** "This may indicate a man-in-the-middle attack OR the server was reinstalled. Verify with the server admin. To fix, remove the old key: `ssh-keygen -R <host>` (then re-accept the new key on next connect)."
**Docs:** `/security#host-key-verification`
**Retryable:** false

---

## Extended Error Codes

| Code | Scenario | Retryable |
|------|----------|-----------|
| `SSH_KEY_INVALID_PEM` | Malformed PEM (missing BEGIN/END lines) | false |
| `SSH_KEY_UNSUPPORTED_TYPE` | DSA, ECDSA (unsupported algorithms) | false |
| `SSH_KEY_EMPTY` | No key provided | false |
| `SSH_CONNECTION_REFUSED` | Host reachable, nothing on SSH port | true |
| `SSH_HOST_UNREACHABLE` | No route to host (network issue) | true |
| `SSH_CONNECTION_RESET` | Server closed connection (firewall/limit) | true |
| `SSH_NOT_SSH_SERVER` | Something else on SSH port (HTTP, DB) | false |
| `SSH_AUTH_METHOD_UNSUPPORTED` | Keyboard-interactive, GSSAPI, etc. | false |
| `SSH_AUTH_NO_VALID_METHODS` | Server rejected all offered methods | false |
| `SSH_INTERNAL_ERROR` | Unexpected internal error | true |

---

## Go Implementation

### New File: `apps/server/internal/ssh/errors.go`

Core types and error constructors:

```go
type ErrorCode string

type SSHError struct {
    Code      ErrorCode `json:"code"`
    Message   string    `json:"message"`
    Hint      string    `json:"hint,omitempty"`
    DocsURL   string    `json:"docs_url,omitempty"`
    Retryable bool      `json:"retryable"`
    Host      string    `json:"host,omitempty"`
    Port      int       `json:"port,omitempty"`
    Username  string    `json:"username,omitempty"`
    Err       error     `json:"-"` // wrapped error, not serialized
}

// One constructor per error scenario:
ErrKeyPassphraseProtected(inner error) *SSHError
ErrKeyInvalidFormat(inner error, formatHint string) *SSHError
ErrKeyInvalidPEM(inner error) *SSHError
ErrKeyUnsupportedType(inner error, keyType string) *SSHError
ErrKeyEmpty() *SSHError
ErrDNSResolutionFailed(host string, inner error) *SSHError
ErrConnectionTimeout(host string, port int, inner error) *SSHError
ErrConnectionRefused(host string, port int, inner error) *SSHError
ErrHostUnreachable(host string, inner error) *SSHError
ErrConnectionReset(host string, port int, inner error) *SSHError
ErrNotSSHServer(host string, port int, inner error) *SSHError
ErrAuthFailed(host string, port int, username string, inner error) *SSHError
ErrAuthMethodUnsupported(method string, inner error) *SSHError
ErrAuthNoValidMethods(host string, port int, username string, inner error) *SSHError
ErrHostKeyChanged(host string, port int, inner error) *SSHError
ErrHostKeyVerificationFailed(host string, port int, inner error) *SSHError
ErrInternal(inner error) *SSHError
```

### Classification Entry Point

```go
// Classify maps any error to structured SSHError
func Classify(err error, host string, port int, username string) *SSHError
```

### Backward Compatibility (in `classify.go`)

```go
// Legacy API - unchanged for existing consumers
func ClassifyError(err error) (code, message string)
func PublicError(err error) string

// New rich API response
type RichErrorResponse struct {
    Code      string `json:"code"`
    Message   string `json:"message"`
    Hint      string `json:"hint,omitempty"`
    DocsURL   string `json:"docs_url,omitempty"`
    Retryable bool   `json:"retryable"`
    Host      string `json:"host,omitempty"`
    Port      int    `json:"port,omitempty"`
    Username  string `json:"username,omitempty"`
}

func ToRichResponse(err error) *RichErrorResponse
func FormatErrorForLog(err error) string
```

### Updated Files

| File | Changes |
|------|---------|
| `errors.go` | **New** - Complete error taxonomy with constructors |
| `classify.go` | Refactored - legacy compat + new `RichErrorResponse` |
| `auth.go` | Returns structured errors from `ParsePrivateKeyAuth` |
| `client.go` | Returns structured errors from `Dial` |
| `manager.go` | Stores `structuredErr` for API enrichment |
| `service.go` | Returns `TestResult` with `ErrorCode`, `ErrorHint`, `ErrorDocs`, `Retryable` |
| `model.go` | `Public` struct includes structured error fields |

---

## TypeScript Frontend Types

### New File: `apps/web/src/lib/ssh-errors.ts`

```typescript
export type SSHErrorCode = 
  | "SSH_KEY_PASSPHRASE_PROTECTED"
  | "SSH_KEY_INVALID_FORMAT"
  | "SSH_DNS_RESOLUTION_FAILED"
  | "SSH_CONNECTION_TIMEOUT"
  | "SSH_AUTH_FAILED"
  | "SSH_HOST_KEY_CHANGED"
  // ... all codes

export interface SSHErrorResponse {
  code: SSHErrorCode;
  message: string;
  hint?: string;
  docs_url?: string;
  retryable: boolean;
  host?: string;
  port?: number;
  username?: string;
}

// Server type extended with structured errors
export interface Server {
  // ... existing fields
  errorCode?: SSHErrorCode;
  errorHint?: string;
  errorDocs?: string;
  errorRetryable?: boolean;
}

// Helper functions
export function formatSSHError(error): { title, detail, hint, docsUrl, retryable }
export function isRetryableError(error): boolean
export function isAuthError(error): boolean
export function isKeyError(error): boolean
export function isNetworkError(error): boolean
export function getErrorTitle(code): string
export function getErrorHint(code): string
export function getErrorDocsUrl(code): string
```

### Updated: `apps/web/src/lib/errors.ts`

- `friendlyError()` now accepts `SSHErrorResponse` and uses `formatSSHError()`
- Re-exports all SSH error utilities
- `formatFriendly()` includes optional hint

### Updated: `apps/web/src/lib/servers.ts`

- `Server` type includes `errorCode`, `errorHint`, `errorDocs`, `errorRetryable`
- `SSHErrorCode` type exported for use in components

---

## API Response Examples

### Connection Test Success
```json
{
  "ok": true,
  "latencyMs": 42,
  "server": { "id": "...", "name": "web-01", "status": "online", ... }
}
```

### Connection Test Failure (Structured)
```json
{
  "ok": false,
  "latencyMs": 12000,
  "error": "Connection timed out.",
  "errorCode": "SSH_CONNECTION_TIMEOUT",
  "errorHint": "Check: (1) The SSH port (default 22) is correct. (2) No firewall blocks the connection. (3) The host is up. Test with: ssh -p 22 user@host",
  "errorDocs": "https://docs.serverui.app/troubleshooting#timeout",
  "retryable": true,
  "server": { "id": "...", "name": "web-01", "status": "offline", ... }
}
```

### Passphrase-Protected Key
```json
{
  "ok": false,
  "latencyMs": 5,
  "error": "The private key is protected by a passphrase.",
  "errorCode": "SSH_KEY_PASSPHRASE_PROTECTED",
  "errorHint": "ServerUI does not support passphrase-protected keys. Remove the passphrase with: ssh-keygen -p -f /path/to/key -P 'old_passphrase' -N ''",
  "errorDocs": "https://docs.serverui.app/ssh-keys#removing-a-passphrase",
  "retryable": false,
  "server": { ... }
}
```

### PuTTY .ppk Key
```json
{
  "ok": false,
  "latencyMs": 3,
  "error": "The private key format is not supported.",
  "errorCode": "SSH_KEY_INVALID_FORMAT",
  "errorHint": "The private key is not in a supported format. ServerUI accepts OpenSSH (PEM) keys only. Detected format: PuTTY (.ppk). Convert PuTTY .ppk keys with: puttygen key.ppk -O private-openssh -o key.pem",
  "errorDocs": "https://docs.serverui.app/ssh-keys#supported-formats",
  "retryable": false,
  "server": { ... }
}
```

---

## Frontend Usage Example

```tsx
import { Server, formatSSHError, isRetryableError } from "@/lib/ssh-errors";

function ServerCard({ server }: { server: Server }) {
  if (server.errorCode) {
    const { title, detail, hint, docsUrl, retryable } = formatSSHError(server);
    
    return (
      <div className="error-card">
        <h3>{title}</h3>
        <p>{detail}</p>
        {hint && <p className="hint">💡 {hint}</p>}
        {docsUrl && (
          <a href={docsUrl} target="_blank" rel="noopener">
            Learn more →
          </a>
        )}
        {retryable && (
          <button onClick={() => retryConnection(server.id)}>
            Retry Connection
          </button>
        )}
      </div>
    );
  }
  
  return <div className="server-card">{server.name}</div>;
}
```

---

## Testing

### Go Tests (`errors_test.go`)
- Tests all 15+ error constructors
- Tests classification for all priority scenarios
- Tests JSON serialization (excludes wrapped error)
- Tests `IsRetryableError`, `IsAuthError`, `IsKeyError`, `IsNetworkError`
- Tests `ToRichResponse` and `FormatErrorForLog`

### TypeScript Tests (`errors.test.ts`)
- Tests `formatSSHError` for all major error codes
- Tests helper predicates (`isRetryableError`, `isAuthError`, etc.)
- Tests `getErrorTitle`, `getErrorHint`, `getErrorDocsUrl`
- Tests backward compatibility with legacy codes
- Tests `friendlyError` with structured SSH responses

---

## Migration Checklist

- [ ] Deploy Go backend changes
- [ ] Deploy TypeScript frontend types
- [ ] Update API consumers to use `errorCode`, `errorHint`, `errorDocs`, `retryable`
- [ ] Update UI components to display structured errors
- [ ] Add retry button for `retryable: true` errors
- [ ] Add "Learn more" links using `errorDocs`
- [ ] Monitor error code distribution in production
- [ ] Remove legacy `ClassifyError`/`PublicError` after grace period

---

## DX Impact Metrics (Target)

| Metric | Before | Target |
|--------|--------|--------|
| Time to diagnose passphrase key | 8 min | < 30 sec |
| Time to diagnose wrong key format | 12 min | < 30 sec |
| Time to diagnose DNS issue | 10 min | < 1 min |
| Time to diagnose timeout | 15 min | < 2 min |
| Time to diagnose auth failure | 10 min | < 1 min |
| Support tickets for SSH errors | Baseline | -50% |
| "I give up" onboarding sessions | 25% | < 5% |