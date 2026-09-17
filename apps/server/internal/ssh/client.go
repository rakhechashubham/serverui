package sshx

import (
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
			return nil
		},
		Timeout: 12 * time.Second,
	}

	return ssh.Dial("tcp", cfg.Addr(), config)
}
