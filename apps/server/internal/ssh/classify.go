package sshx

import (
	"fmt"
	"strings"
)

// Legacy error codes — kept for API compatibility.
// New code should use ErrorCode constants from errors.go.
const (
	CodeInvalidHost        = "invalid_host"
	CodeConnectionRefused  = "connection_refused"
	CodeTimeout            = "timeout"
	CodeUnreachable        = "host_unreachable"
	CodeConnectionReset    = "connection_reset"
	CodeNotSSH             = "not_ssh"
	CodeAuthFailed         = "auth_failed"
	CodeInvalidPrivateKey  = "invalid_private_key"
	CodePassphraseRequired = "passphrase_required"
	CodeSSHFailed          = "ssh_failed"
)

// ClassifyError maps an SSH error to a stable code and a user-facing message.
// DEPRECATED: Use Classify() from errors.go for structured errors.
// This is kept for backward compatibility with existing API responses.
func ClassifyError(err error) (code, message string) {
	if err == nil {
		return "", ""
	}
	se := Classify(err, "", 0, "")
	if se == nil {
		return "", ""
	}
	// Map new codes to legacy codes for API compatibility
	return legacyCode(se.Code), se.Message
}

// PublicError returns the short API error text for backward compatibility.
// DEPRECATED: Use SSHError directly for rich error responses.
func PublicError(err error) string {
	if err == nil {
		return ""
	}
	se := Classify(err, "", 0, "")
	if se == nil {
		return ""
	}
	switch se.Code {
	case CodeKeyPassphraseProtected:
		return "passphrase-protected private keys are not supported yet"
	case CodeKeyInvalidFormat, CodeKeyInvalidPEM, CodeKeyUnsupportedType, CodeKeyEmpty:
		return "invalid private key"
	case CodeSSHAuthFailed, CodeAuthNoValidMethods, CodeAuthMethodUnsupported:
		return "authentication failed"
	case CodeConnectionTimeout, CodeSSHConnectionRefused, CodeHostUnreachable, CodeSSHConnectionReset:
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

// legacyCode maps new ErrorCode to legacy code for API compatibility.
func legacyCode(code ErrorCode) string {
	switch code {
	case CodeKeyPassphraseProtected:
		return CodePassphraseRequired
	case CodeKeyInvalidFormat, CodeKeyInvalidPEM, CodeKeyUnsupportedType, CodeKeyEmpty:
		return CodeInvalidPrivateKey
	case CodeSSHAuthFailed, CodeAuthNoValidMethods, CodeAuthMethodUnsupported:
		return CodeAuthFailed
	case CodeConnectionTimeout:
		return CodeTimeout
	case CodeSSHConnectionRefused:
		return CodeConnectionRefused
	case CodeDNSResolutionFailed:
		return CodeInvalidHost
	case CodeHostUnreachable:
		return CodeUnreachable
	case CodeSSHConnectionReset:
		return CodeConnectionReset
	case CodeNotSSHServer:
		return CodeNotSSH
	case CodeHostKeyChanged, CodeHostKeyVerification:
		return CodeSSHFailed // No legacy equivalent, map to generic
	default:
		return CodeSSHFailed
	}
}

// RichErrorResponse is the new API error format with full details.
// Use this in new API endpoints instead of plain strings.
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

// ToRichResponse converts an error to a RichErrorResponse.
func ToRichResponse(err error) *RichErrorResponse {
	se := Classify(err, "", 0, "")
	if se == nil {
		return nil
	}
	return &RichErrorResponse{
		Code:      string(se.Code),
		Message:   se.Message,
		Hint:      se.Hint,
		DocsURL:   se.DocsURL,
		Retryable: se.Retryable,
		Host:      se.Host,
		Port:      se.Port,
		Username:  se.Username,
	}
}

// FormatErrorForLog returns a structured log line for the error.
func FormatErrorForLog(err error) string {
	se := Classify(err, "", 0, "")
	if se == nil {
		return "nil error"
	}
	parts := []string{
		"code=" + string(se.Code),
		"message=" + se.Message,
	}
	if se.Host != "" {
		parts = append(parts, "host="+se.Host)
	}
	if se.Port > 0 {
		parts = append(parts, fmt.Sprintf("port=%d", se.Port))
	}
	if se.Username != "" {
		parts = append(parts, "user="+se.Username)
	}
	parts = append(parts, fmt.Sprintf("retryable=%t", se.Retryable))
	return strings.Join(parts, " ")
}
