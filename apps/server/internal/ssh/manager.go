package sshx

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

// streamStderrLimit caps how much stderr Stream keeps for error reporting.
const streamStderrLimit = 8 << 10

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

	mu            sync.Mutex
	client        *ssh.Client
	status        Status
	err           string    // legacy short error message
	structuredErr *SSHError // structured error for API
	dialing       bool
	dialWait      chan struct{}
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

// StructuredError returns the last structured error, if any.
func (m *Manager) StructuredError() *SSHError {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.structuredErr
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
			m.err = PublicError(err) // legacy short message for status
			// Store structured error for API responses
			m.structuredErr = Classify(err, cfg.Host, cfg.Port, cfg.Username)
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
	session, err := m.newSession()
	if err != nil {
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
	case <-time.After(12 * time.Second):
		_ = session.Close()
		return nil, fmt.Errorf("timeout")
	}
}

// Stream runs a long-lived command, calling onLine for each stdout line.
// Unlike Run it has no fixed timeout; cancelling ctx closes the session.
// It returns the tail of stderr so callers can classify failures.
func (m *Manager) Stream(ctx context.Context, command string, onLine func(string)) ([]byte, error) {
	session, err := m.newSession()
	if err != nil {
		return nil, err
	}
	defer session.Close()

	stdout, err := session.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr := &tailBuffer{limit: streamStderrLimit}
	session.Stderr = stderr
	if err := session.Start(command); err != nil {
		return nil, err
	}

	stop := context.AfterFunc(ctx, func() {
		_ = session.Signal(ssh.SIGTERM)
		_ = session.Close()
	})
	defer stop()

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 64<<10), 1<<20)
	for scanner.Scan() {
		onLine(scanner.Text())
	}
	// Keep draining so an oversized line cannot block the remote command.
	_, _ = io.Copy(io.Discard, stdout)

	err = session.Wait()
	if ctxErr := ctx.Err(); ctxErr != nil {
		return stderr.Bytes(), ctxErr
	}
	return stderr.Bytes(), err
}

// newSession opens a session on the pooled client, dropping the client if it
// can no longer open sessions so the next call redials.
func (m *Manager) newSession() (*ssh.Session, error) {
	client, err := m.Ensure()
	if err != nil {
		return nil, err
	}
	session, err := client.NewSession()
	if err != nil {
		m.invalidate(client)
		return nil, err
	}
	return session, nil
}

// tailBuffer keeps only the last limit bytes written to it.
type tailBuffer struct {
	limit int
	buf   []byte
}

func (b *tailBuffer) Write(p []byte) (int, error) {
	b.buf = append(b.buf, p...)
	if over := len(b.buf) - b.limit; over > 0 {
		b.buf = b.buf[over:]
	}
	return len(p), nil
}

func (b *tailBuffer) Bytes() []byte {
	return b.buf
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
