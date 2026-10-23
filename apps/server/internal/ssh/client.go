package sshx

import (
	"fmt"
	"net"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

func Dial(cfg Config, auth AuthMethod) (*ssh.Client, error) {
	if cfg.Host == "" || cfg.Username == "" {
		return nil, ErrInternal(fmt.Errorf("ssh host and username are required"))
	}
	if auth == nil {
		return nil, ErrInternal(fmt.Errorf("ssh auth method is required"))
	}
	if password, ok := auth.(PasswordAuth); ok && password.Password == "" {
		return nil, ErrAuthFailed(cfg.Host, cfg.Port, cfg.Username, fmt.Errorf("empty password"))
	}

	config := &ssh.ClientConfig{
		User: cfg.Username,
		Auth: []ssh.AuthMethod{auth.SSHAuthMethod()},
		HostKeyCallback: func(hostname string, remote net.Addr, key ssh.PublicKey) error {
			// TOFU: accept any host key on first connect
			// In production, consider using knownhosts for verification
			return nil
		},
		Timeout: 12 * time.Second,
	}

	client, err := ssh.Dial("tcp", cfg.Addr(), config)
	if err != nil {
		return nil, classifyDialError(err, cfg.Host, cfg.Port, cfg.Username)
	}
	return client, nil
}

// classifyDialError converts raw ssh.Dial errors into structured SSHError.
func classifyDialError(err error, host string, port int, username string) *SSHError {
	if err == nil {
		return nil
	}

	msg := strings.ToLower(err.Error())

	// Network-level errors
	if strings.Contains(msg, "no such host") ||
		strings.Contains(msg, "lookup ") ||
		strings.Contains(msg, "server misbehaving") {
		return ErrDNSResolutionFailed(host, err)
	}
	if strings.Contains(msg, "connection refused") {
		return ErrConnectionRefused(host, port, err)
	}
	if strings.Contains(msg, "i/o timeout") ||
		strings.Contains(msg, "timeout") ||
		strings.Contains(msg, "deadline exceeded") {
		return ErrConnectionTimeout(host, port, err)
	}
	if strings.Contains(msg, "no route to host") ||
		strings.Contains(msg, "network is unreachable") ||
		strings.Contains(msg, "host is down") {
		return ErrHostUnreachable(host, err)
	}
	if strings.Contains(msg, "connection reset") ||
		strings.Contains(msg, "broken pipe") {
		return ErrConnectionReset(host, port, err)
	}

	// SSH protocol errors
	if strings.Contains(msg, "handshake failed") {
		if strings.Contains(msg, "version string") ||
			strings.Contains(msg, "no common algorithm") ||
			strings.Contains(msg, "kex") ||
			strings.Contains(msg, "protocol") {
			return ErrNotSSHServer(host, port, err)
		}
		// Auth errors often wrapped in handshake failed
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
		// Host key errors
		if strings.Contains(msg, "host key") ||
			strings.Contains(msg, "known hosts") ||
			strings.Contains(msg, "fingerprint") {
			if strings.Contains(msg, "changed") || strings.Contains(msg, "mismatch") {
				return ErrHostKeyChanged(host, port, err)
			}
			return ErrHostKeyVerificationFailed(host, port, err)
		}
	}

	// Fallback to generic classification
	return Classify(err, host, port, username)
}
