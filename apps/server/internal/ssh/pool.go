package sshx

import (
	"fmt"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

type Loader func(id string) (Config, AuthMethod, error)

type Pool struct {
	load Loader

	mu       sync.Mutex
	sessions map[string]*Manager
}

func NewPool(load Loader) *Pool {
	return &Pool{
		load:     load,
		sessions: map[string]*Manager{},
	}
}

func (p *Pool) Ensure(id string) (*ssh.Client, error) {
	mgr, err := p.Manager(id)
	if err != nil {
		return nil, err
	}
	return mgr.Ensure()
}

func (p *Pool) Run(id, command string) ([]byte, error) {
	mgr, err := p.Manager(id)
	if err != nil {
		return nil, err
	}
	return mgr.Run(command)
}

func (p *Pool) Manager(id string) (*Manager, error) {
	if id == "" {
		return nil, fmt.Errorf("server id is required")
	}
	p.mu.Lock()
	if mgr, ok := p.sessions[id]; ok {
		p.mu.Unlock()
		return mgr, nil
	}
	p.mu.Unlock()

	cfg, auth, err := p.load(id)
	if err != nil {
		return nil, err
	}
	mgr := NewManager(cfg, auth)
	mgr.id = id

	p.mu.Lock()
	defer p.mu.Unlock()
	if existing, ok := p.sessions[id]; ok {
		return existing, nil
	}
	p.sessions[id] = mgr
	return mgr, nil
}

func (p *Pool) IsConnected(id string) bool {
	p.mu.Lock()
	mgr, ok := p.sessions[id]
	p.mu.Unlock()
	if !ok {
		return false
	}
	status, _ := mgr.Status()
	return status == StatusOnline
}

func (p *Pool) Status(id string) (Status, string) {
	p.mu.Lock()
	mgr, ok := p.sessions[id]
	p.mu.Unlock()
	if !ok {
		return StatusOffline, ""
	}
	return mgr.Status()
}

func (p *Pool) Disconnect(id string) error {
	p.mu.Lock()
	mgr, ok := p.sessions[id]
	if ok {
		delete(p.sessions, id)
	}
	p.mu.Unlock()
	if !ok {
		return nil
	}
	return mgr.Close()
}

func (p *Pool) DisconnectAll() {
	p.mu.Lock()
	sessions := p.sessions
	p.sessions = map[string]*Manager{}
	p.mu.Unlock()
	for _, mgr := range sessions {
		_ = mgr.Close()
	}
}

func (p *Pool) Test(id string) (time.Duration, error) {
	cfg, auth, err := p.load(id)
	if err != nil {
		return 0, err
	}
	start := time.Now()
	client, err := Dial(cfg, auth)
	latency := time.Since(start)
	if err != nil {
		return latency, err
	}
	_ = client.Close()
	return latency, nil
}

func (p *Pool) Forget(id string) {
	p.mu.Lock()
	mgr, ok := p.sessions[id]
	if ok {
		delete(p.sessions, id)
	}
	p.mu.Unlock()
	if ok {
		_ = mgr.Close()
	}
}
