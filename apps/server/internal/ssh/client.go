package sshx

import (
	"errors"
	"fmt"
	"net"
	"time"

	"golang.org/x/crypto/ssh"
)

func Dial(cfg Config, auth AuthMethod) (*ssh.Client, error) {
	if cfg.Host == "" || cfg.Username == "" {
		return nil, fmt.Errorf("ssh host and username are required")
	}
	if auth == nil {
		return nil, fmt.Errorf("ssh auth method is required")
	}
	if password, ok := auth.(PasswordAuth); ok && password.Password == "" {
		return nil, fmt.Errorf("unable to authenticate")
	}

	config := &ssh.ClientConfig{
		User: cfg.Username,
		Auth: []ssh.AuthMethod{auth.SSHAuthMethod()},
		HostKeyCallback: func(hostname string, remote net.Addr, key ssh.PublicKey) error {
			fingerprint := ssh.FingerprintSHA256(key)
			if cfg.HostKeyFingerprint == "" {
				return &HostKeyError{Presented: fingerprint}
			}
			if cfg.HostKeyFingerprint != fingerprint {
				return &HostKeyError{Expected: cfg.HostKeyFingerprint, Presented: fingerprint}
			}
			return nil
		},
		Timeout: 12 * time.Second,
	}

	return ssh.Dial("tcp", cfg.Addr(), config)
}

// HostKeyError indicates that the presented SSH key is not pinned to this server.
type HostKeyError struct {
	Expected  string
	Presented string
}

func (e *HostKeyError) Error() string {
	if e.Expected == "" {
		return "ssh host key is not trusted"
	}
	return "ssh host key changed"
}

func HostKeyDetails(err error) (expected, presented string, ok bool) {
	var hostKeyErr *HostKeyError
	if !errors.As(err, &hostKeyErr) {
		return "", "", false
	}
	return hostKeyErr.Expected, hostKeyErr.Presented, true
}
