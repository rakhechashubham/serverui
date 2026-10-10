package sshx

import (
	"errors"
	"fmt"
	"strings"
)

// Error codes sent to API clients with connection test results.
const (
	CodeInvalidHost        = "invalid_host"
	CodeConnectionRefused  = "connection_refused"
	CodeTimeout            = "timeout"
	CodeUnreachable        = "host_unreachable"
	CodeConnectionReset    = "connection_reset"
	CodeNotSSH             = "not_ssh"
	CodeAuthFailed         = "auth_failed"
	CodeHostKeyChanged     = "host_key_changed"
	CodeInvalidPrivateKey  = "invalid_private_key"
	CodePassphraseRequired = "passphrase_required"
	CodeSSHFailed          = "ssh_failed"
)

// ClassifyError maps an SSH error to a stable code and a user-facing message.
func ClassifyError(err error) (code, message string) {
	if err == nil {
		return "", ""
	}
	var mismatch *HostKeyMismatchError
	if errors.As(err, &mismatch) {
		return CodeHostKeyChanged, "Host key changed since it was trusted, so nothing was sent. Review the key before connecting."
	}
	msg := strings.ToLower(err.Error())
	switch {
	// Auth failures also contain "handshake failed", so match them first.
	case strings.Contains(msg, "passphrase"):
		return CodePassphraseRequired, "This private key is protected by a passphrase. Passphrase-protected keys are not supported yet."
	case strings.Contains(msg, "invalid private key"),
		strings.Contains(msg, "no key found"),
		strings.Contains(msg, "private key is required"):
		return CodeInvalidPrivateKey, "The private key is not valid. Paste the full key, including the BEGIN and END lines."
	case strings.Contains(msg, "unable to authenticate"),
		strings.Contains(msg, "no supported methods remain"),
		strings.Contains(msg, "permission denied"):
		return classifyAuthFailure(msg)
	case strings.Contains(msg, "no such host"),
		strings.Contains(msg, "server misbehaving"),
		strings.Contains(msg, "lookup "):
		return CodeInvalidHost, "The host name could not be found. Check the Host / IP field."
	case strings.Contains(msg, "connection refused"):
		return CodeConnectionRefused, "Connection refused. The host is reachable but nothing is accepting SSH on this port."
	case strings.Contains(msg, "i/o timeout"),
		strings.Contains(msg, "timeout"),
		strings.Contains(msg, "deadline exceeded"):
		return CodeTimeout, "Connection timed out. Check the host, the SSH port, and any firewall in between."
	case strings.Contains(msg, "no route to host"),
		strings.Contains(msg, "network is unreachable"),
		strings.Contains(msg, "host is down"):
		return CodeUnreachable, "The host is unreachable from this machine. Check the address and your network."
	case strings.Contains(msg, "connection reset"):
		return CodeConnectionReset, "The server closed the connection. SSH may be blocked by a firewall or connection limit."
	case strings.Contains(msg, "handshake failed"),
		strings.Contains(msg, "version string"),
		strings.Contains(msg, "no common algorithm"):
		return CodeNotSSH, "Something answered on this port, but it is not a compatible SSH server. Check the SSH port."
	default:
		return CodeSSHFailed, "The SSH connection failed. Check the connection details and try again."
	}
}

func classifyAuthFailure(msg string) (code, message string) {
	_, rest, found := strings.Cut(msg, "attempted methods [")
	methods, _, _ := strings.Cut(rest, "]")
	switch {
	case !found:
		return CodeAuthFailed, "Authentication failed. Check the username and password or private key."
	case strings.Contains(methods, "password"):
		return CodeAuthFailed, "Authentication failed: the server rejected the username or password."
	case strings.Contains(methods, "publickey"):
		return CodeAuthFailed, "Authentication failed: the server did not accept this private key for this user. Check the username and that the public key is in authorized_keys."
	default:
		return CodeAuthFailed, "Authentication failed: the server does not allow this sign-in method for this user. Try the other authentication type or check the server's sshd_config."
	}
}

// PublicError is the short API error text, derived from ClassifyError.
func PublicError(err error) string {
	if err == nil {
		return ""
	}
	switch code, _ := ClassifyError(err); code {
	case CodePassphraseRequired:
		return "passphrase-protected private keys are not supported yet"
	case CodeInvalidPrivateKey:
		return "invalid private key"
	case CodeAuthFailed:
		return "authentication failed"
	case CodeHostKeyChanged:
		return "host key changed"
	case CodeTimeout, CodeConnectionRefused, CodeUnreachable:
		return "unable to connect to server"
	default:
		return "ssh connection failed"
	}
}

type HostKeyMismatchError struct {
	Presented string
}

func (e *HostKeyMismatchError) Error() string {
	return fmt.Sprintf("host key mismatch: presented %s", e.Presented)
}
