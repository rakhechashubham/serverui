package sshx

import (
	"encoding/json"
	"fmt"
	"net"
	"strings"
)

// ErrorCode is a machine-readable error code for SSH connection failures.
// Use these codes in API responses for client-side handling and i18n.
type ErrorCode string

const (
	// Key-related errors
	CodeKeyPassphraseProtected ErrorCode = "SSH_KEY_PASSPHRASE_PROTECTED"
	CodeKeyInvalidFormat       ErrorCode = "SSH_KEY_INVALID_FORMAT"
	CodeKeyInvalidPEM          ErrorCode = "SSH_KEY_INVALID_PEM"
	CodeKeyUnsupportedType     ErrorCode = "SSH_KEY_UNSUPPORTED_TYPE"
	CodeKeyEmpty               ErrorCode = "SSH_KEY_EMPTY"

	// Network/connection errors
	CodeDNSResolutionFailed ErrorCode = "SSH_DNS_RESOLUTION_FAILED"
	CodeConnectionTimeout   ErrorCode = "SSH_CONNECTION_TIMEOUT"
	CodeConnectionRefused   ErrorCode = "SSH_CONNECTION_REFUSED"
	CodeHostUnreachable     ErrorCode = "SSH_HOST_UNREACHABLE"
	CodeConnectionReset     ErrorCode = "SSH_CONNECTION_RESET"
	CodeNotSSHServer        ErrorCode = "SSH_NOT_SSH_SERVER"

	// Authentication errors
	CodeAuthFailed           ErrorCode = "SSH_AUTH_FAILED"
	CodeAuthMethodUnsupported ErrorCode = "SSH_AUTH_METHOD_UNSUPPORTED"
	CodeAuthNoValidMethods   ErrorCode = "SSH_AUTH_NO_VALID_METHODS"

	// Host key / TOFU errors
	CodeHostKeyChanged       ErrorCode = "SSH_HOST_KEY_CHANGED"
	CodeHostKeyVerification  ErrorCode = "SSH_HOST_KEY_VERIFICATION_FAILED"

	// Generic/internal
	CodeInternalError        ErrorCode = "SSH_INTERNAL_ERROR"
)

// SSHError is a structured error returned by SSH operations.
// It includes a machine-readable code, user-facing message, actionable hint,
// and a documentation URL for self-service troubleshooting.
type SSHError struct {
	Code     ErrorCode `json:"code"`
	Message  string    `json:"message"`
	Hint     string    `json:"hint,omitempty"`
	DocsURL  string    `json:"docs_url,omitempty"`
	Retryable bool     `json:"retryable"`
	Host     string    `json:"host,omitempty"`     // Target host for context
	Port     int       `json:"port,omitempty"`     // Target port for context
	Username string    `json:"username,omitempty"` // Username for context
	Err      error     `json:"-"`                  // Wrapped error (not serialized)
}

// Error implements the error interface.
func (e *SSHError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return string(e.Code)
}

// Unwrap returns the wrapped error for errors.Is/As support.
func (e *SSHError) Unwrap() error {
	return e.Err
}

// MarshalJSON implements custom JSON marshaling to exclude the Err field.
func (e *SSHError) MarshalJSON() ([]byte, error) {
	type Alias SSHError
	return json.Marshal(&struct {
		*Alias
		Error string `json:"error,omitempty"` // String representation of wrapped error
	}{
		Alias: (*Alias)(e),
		Error: "",
	})
}

// WithContext adds connection context to the error.
func (e *SSHError) WithContext(host string, port int, username string) *SSHError {
	e.Host = host
	e.Port = port
	e.Username = username
	return e
}

// IsRetryable returns true if the operation might succeed on retry.
func (e *SSHError) IsRetryable() bool {
	return e.Retryable
}

// ============================================================================
// Error constructors — one per error scenario
// ============================================================================

// ErrKeyPassphraseProtected returns an error for passphrase-protected keys.
func ErrKeyPassphraseProtected(inner error) *SSHError {
	return &SSHError{
		Code:     CodeKeyPassphraseProtected,
		Message:  "The private key is protected by a passphrase.",
		Hint:     "ServerUI does not support passphrase-protected keys. Remove the passphrase with: ssh-keygen -p -f /path/to/key -P 'old_passphrase' -N ''",
		DocsURL:  "https://docs.serverui.app/ssh-keys#removing-a-passphrase",
		Retryable: false,
		Err:      inner,
	}
}

// ErrKeyInvalidFormat returns an error for non-OpenSSH/PEM key formats (e.g., PuTTY .ppk, RFC4716).
func ErrKeyInvalidFormat(inner error, formatHint string) *SSHError {
	hint := "The private key is not in a supported format. ServerUI accepts OpenSSH (PEM) keys only."
	if formatHint != "" {
		hint += " Detected format: " + formatHint + "."
	}
	hint += " Convert PuTTY .ppk keys with: puttygen key.ppk -O private-openssh -o key.pem"
	return &SSHError{
		Code:     CodeKeyInvalidFormat,
		Message:  "The private key format is not supported.",
		Hint:     hint,
		DocsURL:  "https://docs.serverui.app/ssh-keys#supported-formats",
		Retryable: false,
		Err:      inner,
	}
}

// ErrKeyInvalidPEM returns an error for malformed PEM keys.
func ErrKeyInvalidPEM(inner error) *SSHError {
	return &SSHError{
		Code:     CodeKeyInvalidPEM,
		Message:  "The private key is not a valid PEM-encoded key.",
		Hint:     "Paste the full key including the -----BEGIN OPENSSH PRIVATE KEY----- and -----END OPENSSH PRIVATE KEY----- lines. Ensure no extra whitespace or missing lines.",
		DocsURL:  "https://docs.serverui.app/ssh-keys#pem-format",
		Retryable: false,
		Err:      inner,
	}
}

// ErrKeyUnsupportedType returns an error for unsupported key algorithms (e.g., DSA).
func ErrKeyUnsupportedType(inner error, keyType string) *SSHError {
	hint := "This key type is not supported."
	if keyType != "" {
		hint += " Detected key type: " + keyType + "."
	}
	hint += " Generate a new key with: ssh-keygen -t ed25519 -f ~/.ssh/serverui_key"
	return &SSHError{
		Code:     CodeKeyUnsupportedType,
		Message:  "The private key uses an unsupported algorithm.",
		Hint:     hint,
		DocsURL:  "https://docs.serverui.app/ssh-keys#supported-algorithms",
		Retryable: false,
		Err:      inner,
	}
}

// ErrKeyEmpty returns an error when no key was provided.
func ErrKeyEmpty() *SSHError {
	return &SSHError{
		Code:     CodeKeyEmpty,
		Message:  "No private key was provided.",
		Hint:     "Paste your private key in the Private Key field, or switch to Password authentication.",
		DocsURL:  "https://docs.serverui.app/ssh-keys",
		Retryable: false,
	}
}

// ErrDNSResolutionFailed returns an error when the hostname cannot be resolved.
func ErrDNSResolutionFailed(host string, inner error) *SSHError {
	return &SSHError{
		Code:     CodeDNSResolutionFailed,
		Message:  "The host name could not be resolved.",
		Hint:     "Check the Host field for typos. Try using the IP address instead. Verify DNS with: nslookup " + host,
		DocsURL:  "https://docs.serverui.app/troubleshooting#dns",
		Retryable: true,
		Err:      inner,
	}.WithContext(host, 0, "")
}

// ErrConnectionTimeout returns an error for connection timeouts (wrong port, firewall, host down).
func ErrConnectionTimeout(host string, port int, inner error) *SSHError {
	return &SSHError{
		Code:     CodeConnectionTimeout,
		Message:  "Connection timed out.",
		Hint:     "Check: (1) The SSH port (default 22) is correct. (2) No firewall blocks the connection. (3) The host is up. Test with: ssh -p " + fmt.Sprintf("%d", port) + " user@" + host,
		DocsURL:  "https://docs.serverui.app/troubleshooting#timeout",
		Retryable: true,
		Err:      inner,
	}.WithContext(host, port, "")
}

// ErrConnectionRefused returns an error when the connection is actively refused.
func ErrConnectionRefused(host string, port int, inner error) *SSHError {
	return &SSHError{
		Code:     CodeConnectionRefused,
		Message:  "Connection refused — nothing is listening on the SSH port.",
		Hint:     "The host is reachable but no SSH server accepts connections on port " + fmt.Sprintf("%d", port) + ". Verify the SSH service is running and the port is correct.",
		DocsURL:  "https://docs.serverui.app/troubleshooting#connection-refused",
		Retryable: true,
		Err:      inner,
	}.WithContext(host, port, "")
}

// ErrHostUnreachable returns an error when the host is unreachable (no route).
func ErrHostUnreachable(host string, inner error) *SSHError {
	return &SSHError{
		Code:     CodeHostUnreachable,
		Message:  "The host is unreachable from this network.",
		Hint:     "Check the IP/hostname. Verify network connectivity with: ping " + host + " or traceroute " + host,
		DocsURL:  "https://docs.serverui.app/troubleshooting#unreachable",
		Retryable: true,
		Err:      inner,
	}.WithContext(host, 0, "")
}

// ErrConnectionReset returns an error when the connection is reset by peer.
func ErrConnectionReset(host string, port int, inner error) *SSHError {
	return &SSHError{
		Code:     CodeConnectionReset,
		Message:  "The server closed the connection unexpectedly.",
		Hint:     "This often means a firewall or connection limit dropped the session. Check server logs and firewall rules.",
		DocsURL:  "https://docs.serverui.app/troubleshooting#connection-reset",
		Retryable: true,
		Err:      inner,
	}.WithContext(host, port, "")
}

// ErrNotSSHServer returns an error when the remote service is not SSH.
func ErrNotSSHServer(host string, port int, inner error) *SSHError {
	return &SSHError{
		Code:     CodeNotSSHServer,
		Message:  "The service on this port is not a compatible SSH server.",
		Hint:     "Verify the SSH port is correct (default 22). Something else (HTTP, database, etc.) is listening on port " + fmt.Sprintf("%d", port) + ".",
		DocsURL:  "https://docs.serverui.app/troubleshooting#not-ssh",
		Retryable: false,
		Err:      inner,
	}.WithContext(host, port, "")
}

// ErrAuthFailed returns an error for authentication failures.
func ErrAuthFailed(host string, port int, username string, inner error) *SSHError {
	return &SSHError{
		Code:     CodeAuthFailed,
		Message:  "Authentication failed.",
		Hint:     "Check: (1) Username is correct. (2) Password is correct (if using password auth). (3) Private key matches the authorized_keys on the server. (4) Key permissions are 600 (chmod 600 key). Test manually: ssh -p " + fmt.Sprintf("%d", port) + " " + username + "@" + host,
		DocsURL:  "https://docs.serverui.app/troubleshooting#auth-failed",
		Retryable: false,
		Err:      inner,
	}.WithContext(host, port, username)
}

// ErrAuthMethodUnsupported returns an error for unsupported auth methods.
func ErrAuthMethodUnsupported(method string, inner error) *SSHError {
	return &SSHError{
		Code:     CodeAuthMethodUnsupported,
		Message:  "The authentication method is not supported.",
		Hint:     "ServerUI supports password and private key (OpenSSH PEM) authentication. Method '" + method + "' is not available.",
		DocsURL:  "https://docs.serverui.app/authentication",
		Retryable: false,
		Err:      inner,
	}
}

// ErrAuthNoValidMethods returns an error when no auth methods remain.
func ErrAuthNoValidMethods(host string, port int, username string, inner error) *SSHError {
	return &SSHError{
		Code:     CodeAuthNoValidMethods,
		Message:  "No valid authentication methods remain.",
		Hint:     "The server rejected all offered credentials. Verify the server allows password or public key auth for user '" + username + "'. Check /etc/ssh/sshd_config for PasswordAuthentication and PubkeyAuthentication.",
		DocsURL:  "https://docs.serverui.app/troubleshooting#no-auth-methods",
		Retryable: false,
		Err:      inner,
	}.WithContext(host, port, username)
}

// ErrHostKeyChanged returns an error when the host key has changed (TOFU).
func ErrHostKeyChanged(host string, port int, inner error) *SSHError {
	return &SSHError{
		Code:     CodeHostKeyChanged,
		Message:  "The server's host key has changed.",
		Hint:     "This may indicate a man-in-the-middle attack OR the server was reinstalled. Verify with the server admin. To fix, remove the old key: ssh-keygen -R " + host + " (then re-accept the new key on next connect).",
		DocsURL:  "https://docs.serverui.app/security#host-key-verification",
		Retryable: false,
		Err:      inner,
	}.WithContext(host, port, "")
}

// ErrHostKeyVerificationFailed returns an error for host key verification failures.
func ErrHostKeyVerificationFailed(host string, port int, inner error) *SSHError {
	return &SSHError{
		Code:     CodeHostKeyVerification,
		Message:  "Host key verification failed.",
		Hint:     "ServerUI currently accepts any host key (TOFU). If you see this, the connection was rejected due to a key mismatch. See: https://docs.serverui.app/security#host-key-verification",
		DocsURL:  "https://docs.serverui.app/security#host-key-verification",
		Retryable: false,
		Err:      inner,
	}.WithContext(host, port, "")
}

// ErrInternal returns a generic internal error.
func ErrInternal(inner error) *SSHError {
	return &SSHError{
		Code:     CodeInternalError,
		Message:  "An unexpected error occurred.",
		Hint:     "Please try again. If the problem persists, contact support with the error details.",
		DocsURL:  "https://docs.serverui.app/support",
		Retryable: true,
		Err:      inner,
	}
}

// ============================================================================
// Classification — maps raw errors to SSHError
// ============================================================================

// Classify maps a raw error to a structured SSHError.
// This is the single entry point for error classification used by all callers.
func Classify(err error, host string, port int, username string) *SSHError {
	if err == nil {
		return nil
	}

	// Already structured?
	if se, ok := err.(*SSHError); ok {
		return se.WithContext(host, port, username)
	}

	msg := strings.ToLower(err.Error())

	// 1. Key errors (check first — they can appear in handshake errors too)
	if strings.Contains(msg, "passphrase") {
		return ErrKeyPassphraseProtected(err).WithContext(host, port, username)
	}
	if strings.Contains(msg, "private key is required") || strings.Contains(msg, "no key found") {
		return ErrKeyEmpty().WithContext(host, port, username)
	}
	if strings.Contains(msg, "invalid private key") || strings.Contains(msg, "no key found") {
		// Try to detect format
		formatHint := detectKeyFormat(err.Error())
		return ErrKeyInvalidFormat(err, formatHint).WithContext(host, port, username)
	}
	if strings.Contains(msg, "unsupported key type") || strings.Contains(msg, "unknown key type") {
		return ErrKeyUnsupportedType(err, extractKeyType(err.Error())).WithContext(host, port, username)
	}

	// 2. Auth failures (match before connection errors)
	if strings.Contains(msg, "unable to authenticate") ||
		strings.Contains(msg, "no supported methods remain") ||
		strings.Contains(msg, "no valid methods") {
		return ErrAuthNoValidMethods(host, port, username, err)
	}
	if strings.Contains(msg, "permission denied") ||
		strings.Contains(msg, "auth failed") ||
		strings.Contains(msg, "authentication failed") {
		return ErrAuthFailed(host, port, username, err)
	}

	// 3. DNS resolution
	if strings.Contains(msg, "no such host") ||
		strings.Contains(msg, "lookup ") ||
		strings.Contains(msg, "server misbehaving") {
		return ErrDNSResolutionFailed(host, err)
	}

	// 4. Connection refused
	if strings.Contains(msg, "connection refused") {
		return ErrConnectionRefused(host, port, err)
	}

	// 5. Timeout
	if strings.Contains(msg, "i/o timeout") ||
		strings.Contains(msg, "timeout") ||
		strings.Contains(msg, "deadline exceeded") {
		return ErrConnectionTimeout(host, port, err)
	}

	// 6. Host unreachable
	if strings.Contains(msg, "no route to host") ||
		strings.Contains(msg, "network is unreachable") ||
		strings.Contains(msg, "host is down") {
		return ErrHostUnreachable(host, err)
	}

	// 7. Connection reset
	if strings.Contains(msg, "connection reset") ||
		strings.Contains(msg, "broken pipe") {
		return ErrConnectionReset(host, port, err)
	}

	// 8. Not SSH server
	if strings.Contains(msg, "handshake failed") &&
		(strings.Contains(msg, "version string") ||
			strings.Contains(msg, "no common algorithm") ||
			strings.Contains(msg, "kex") ||
			strings.Contains(msg, "protocol")) {
		return ErrNotSSHServer(host, port, err)
	}

	// 9. Host key issues
	if strings.Contains(msg, "host key") ||
		strings.Contains(msg, "known hosts") ||
		strings.Contains(msg, "fingerprint") {
		if strings.Contains(msg, "changed") || strings.Contains(msg, "mismatch") {
			return ErrHostKeyChanged(host, port, err)
		}
		return ErrHostKeyVerificationFailed(host, port, err)
	}

	// Default
	return ErrInternal(err).WithContext(host, port, username)
}

// ============================================================================
// Helper functions for classification
// ============================================================================

// detectKeyFormat attempts to identify the key format from the error or key content.
func detectKeyFormat(errMsg string) string {
	lower := strings.ToLower(errMsg)
	if strings.Contains(lower, "putty") || strings.Contains(lower, ".ppk") {
		return "PuTTY (.ppk)"
	}
	if strings.Contains(lower, "rfc4716") || strings.Contains(lower, "ssh2") {
		return "RFC4716 (SSH2)"
	}
	if strings.Contains(lower, "pkcs") {
		return "PKCS#8/PKCS#1"
	}
	if strings.Contains(lower, "openssh") {
		return "OpenSSH"
	}
	return ""
}

// extractKeyType attempts to extract the key algorithm from the error.
func extractKeyType(errMsg string) string {
	// Common patterns: "ssh-dss", "ssh-rsa", "ecdsa-sha2-nistp256", "ssh-ed25519"
	lower := strings.ToLower(errMsg)
	types := []string{"ssh-dss", "ssh-rsa", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521", "ssh-ed25519"}
	for _, t := range types {
		if strings.Contains(lower, t) {
			return t
		}
	}
	return ""
}

// ============================================================================
// Legacy compatibility — for existing code using ClassifyError/PublicError
// ============================================================================

// ClassifyError returns the legacy (code, message) pair for backward compatibility.
func ClassifyError(err error) (code, message string) {
	se := Classify(err, "", 0, "")
	if se == nil {
		return "", ""
	}
	return string(se.Code), se.Message
}

// PublicError returns the short API error text for backward compatibility.
func PublicError(err error) string {
	se := Classify(err, "", 0, "")
	if se == nil {
		return ""
	}
	switch se.Code {
	case CodeKeyPassphraseProtected:
		return "passphrase-protected private keys are not supported yet"
	case CodeKeyInvalidFormat, CodeKeyInvalidPEM, CodeKeyUnsupportedType, CodeKeyEmpty:
		return "invalid private key"
	case CodeAuthFailed, CodeAuthNoValidMethods, CodeAuthMethodUnsupported:
		return "authentication failed"
	case CodeConnectionTimeout, CodeConnectionRefused, CodeHostUnreachable, CodeConnectionReset:
		return "unable to connect to server"
	case CodeDNSResolutionFailed:
		return "host not found"
	case CodeNotSSHServer:
		return "not an SSH server"
	case CodeHostKeyChanged, CodeHostKeyVerification:
		return "host key verification failed"
	default:
		return "ssh connection failed"
	}
}

// IsRetryableError checks if an error is retryable (for backward compatibility).
func IsRetryableError(err error) bool {
	se := Classify(err, "", 0, "")
	return se != nil && se.Retryable
}

// AsSSHError attempts to convert any error to *SSHError.
func AsSSHError(err error) *SSHError {
	if err == nil {
		return nil
	}
	if se, ok := err.(*SSHError); ok {
		return se
	}
	return Classify(err, "", 0, "")
}

// IsSSHError checks if an error is an SSHError with the given code.
func IsSSHError(err error, code ErrorCode) bool {
	se := AsSSHError(err)
	return se != nil && se.Code == code
}

// IsNetworkError returns true for network-level errors (retryable).
func IsNetworkError(err error) bool {
	se := AsSSHError(err)
	if se == nil {
		return false
	}
	switch se.Code {
	case CodeDNSResolutionFailed, CodeConnectionTimeout, CodeConnectionRefused,
		CodeHostUnreachable, CodeConnectionReset:
		return true
	}
	return false
}

// IsAuthError returns true for authentication errors.
func IsAuthError(err error) bool {
	se := AsSSHError(err)
	if se == nil {
		return false
	}
	switch se.Code {
	case CodeAuthFailed, CodeAuthNoValidMethods, CodeAuthMethodUnsupported:
		return true
	}
	return false
}

// IsKeyError returns true for key-related errors.
func IsKeyError(err error) bool {
	se := AsSSHError(err)
	if se == nil {
		return false
	}
	switch se.Code {
	case CodeKeyPassphraseProtected, CodeKeyInvalidFormat, CodeKeyInvalidPEM,
		CodeKeyUnsupportedType, CodeKeyEmpty:
		return true
	}
	return false
}