package servers

import (
	"context"
	"sync"
)

type MemoryStore struct {
	mu    sync.Mutex
	items map[string]Record
	creds map[string]Credential
	keys  map[string]string
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		items: map[string]Record{},
		creds: map[string]Credential{},
		keys:  map[string]string{},
	}
}

func (s *MemoryStore) Create(_ context.Context, rec Record, cred Credential) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.items[rec.ID] = rec
	s.creds[rec.ID] = cred
	return nil
}

func (s *MemoryStore) Get(_ context.Context, id string) (Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	rec, ok := s.items[id]
	if !ok {
		return Record{}, ErrNotFound
	}
	return rec, nil
}

func (s *MemoryStore) List(_ context.Context) ([]Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Record, 0, len(s.items))
	for _, rec := range s.items {
		out = append(out, rec)
	}
	return out, nil
}

func (s *MemoryStore) Update(_ context.Context, rec Record) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.items[rec.ID]; !ok {
		return ErrNotFound
	}
	s.items[rec.ID] = rec
	return nil
}

func (s *MemoryStore) Delete(_ context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.items[id]; !ok {
		return ErrNotFound
	}
	delete(s.items, id)
	delete(s.creds, id)
	delete(s.keys, id)
	return nil
}

func (s *MemoryStore) GetCredential(_ context.Context, serverID string) (Credential, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cred, ok := s.creds[serverID]
	if !ok {
		return Credential{}, ErrNotFound
	}
	return cred, nil
}

func (s *MemoryStore) UpsertCredential(_ context.Context, cred Credential) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.creds[cred.ServerID] = cred
	return nil
}

func (s *MemoryStore) GetHostKey(_ context.Context, serverID string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.keys[serverID], nil
}

func (s *MemoryStore) SetHostKey(_ context.Context, serverID, fingerprint string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.keys[serverID] = fingerprint
	return nil
}
