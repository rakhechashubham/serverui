package sshx

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

type Status string

const (
	StatusConnecting Status = "connecting"
	StatusOnline     Status = "online"
	StatusOffline    Status = "offline"
	StatusError      Status = "error"
)

type Manager struct {
	id   string
	cfg  Config
	auth AuthMethod

	mu       sync.Mutex
	client   *ssh.Client
	status   Status
	err      string
	dialing  bool
	dialWait chan struct{}
}

func NewManager(cfg Config, auth AuthMethod) *Manager {
	return &Manager{
		cfg:    cfg,
		auth:   auth,
		status: StatusOffline,
	}
}

func (m *Manager) ID() string {
	return m.id
}

func (m *Manager) Host() string {
	return m.cfg.Host
}

func (m *Manager) Port() int {
	return m.cfg.Port
}

func (m *Manager) Username() string {
	return m.cfg.Username
}

func (m *Manager) Status() (Status, string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.status, m.err
}

func (m *Manager) ConnectAsync() {
	go func() {
		_, _ = m.Ensure()
	}()
}

func (m *Manager) Ensure() (*ssh.Client, error) {
	for {
		m.mu.Lock()
		if m.client != nil {
			client := m.client
			m.mu.Unlock()
			return client, nil
		}
		if m.dialing {
			wait := m.dialWait
			m.mu.Unlock()
			<-wait
			continue
		}

		m.dialing = true
		m.status = StatusConnecting
		m.err = ""
		wait := make(chan struct{})
		m.dialWait = wait
		cfg, auth := m.cfg, m.auth
		m.mu.Unlock()

		client, err := Dial(cfg, auth)

		m.mu.Lock()
		m.dialing = false
		close(wait)
		m.dialWait = nil
		if err != nil {
			m.status = StatusError
			m.err = PublicError(err)
			m.mu.Unlock()
			return nil, err
		}
		m.client = client
		m.status = StatusOnline
		m.err = ""
		m.mu.Unlock()
		go m.watch(client)
		return client, nil
	}
}

func (m *Manager) watch(client *ssh.Client) {
	_ = client.Wait()
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.client == client {
		m.client = nil
		if m.status == StatusOnline {
			m.status = StatusOffline
		}
	}
}

func (m *Manager) Run(command string) ([]byte, error) {
	client, err := m.Ensure()
	if err != nil {
		return nil, err
	}

	session, err := client.NewSession()
	if err != nil {
		m.invalidate(client)
		return nil, err
	}

	type result struct {
		out []byte
		err error
	}
	done := make(chan result, 1)
	go func() {
		out, runErr := session.CombinedOutput(command)
		done <- result{out, runErr}
	}()

	select {
	case res := <-done:
		_ = session.Close()
		return res.out, res.err
	case <-time.After(8 * time.Second):
		_ = session.Close()
		return nil, fmt.Errorf("timeout")
	}
}

func (m *Manager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.client == nil {
		m.status = StatusOffline
		return nil
	}
	err := m.client.Close()
	m.client = nil
	m.status = StatusOffline
	return err
}

func (m *Manager) invalidate(client *ssh.Client) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.client != client {
		return
	}
	_ = m.client.Close()
	m.client = nil
	if m.status == StatusOnline {
		m.status = StatusOffline
	}
}

func PublicError(err error) string {
	if err == nil {
		return ""
	}
	msg := strings.ToLower(err.Error())
	switch {
	case strings.Contains(msg, "passphrase"):
		return "passphrase-protected private keys are not supported yet"
	case strings.Contains(msg, "invalid private key"):
		return "invalid private key"
	case strings.Contains(msg, "unable to authenticate"),
		strings.Contains(msg, "authenticate"),
		strings.Contains(msg, "no supported methods remain"),
		strings.Contains(msg, "permission denied"):
		return "authentication failed"
	case strings.Contains(msg, "i/o timeout"),
		strings.Contains(msg, "timeout"),
		strings.Contains(msg, "connection refused"),
		strings.Contains(msg, "no route"),
		strings.Contains(msg, "network is unreachable"):
		return "unable to connect to server"
	default:
		return "ssh connection failed"
	}
}
