package servers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"

	"serverui/server/internal/crypto"
	sshx "serverui/server/internal/ssh"
)

type Dialer func(cfg sshx.Config, auth sshx.AuthMethod) error

type Service struct {
	store Store
	box   crypto.Cipher
	pool  *sshx.Pool
	dial  Dialer
}

type TestResult struct {
	OK      bool   `json:"ok"`
	Latency int64  `json:"latencyMs"`
	Code    string `json:"code,omitempty"`
	Error   string `json:"error,omitempty"`
	HostKey string `json:"hostKeyFingerprint,omitempty"`
	Server  Public `json:"server"`
}

func NewService(store Store, box crypto.Cipher) *Service {
	s := &Service{
		store: store,
		box:   box,
		dial:  liveDial,
	}
	s.pool = sshx.NewPool(s.loadAuth)
	return s
}

func (s *Service) Pool() *sshx.Pool {
	return s.pool
}

func (s *Service) SetDialer(dial Dialer) {
	if dial == nil {
		s.dial = liveDial
		return
	}
	s.dial = dial
}

func liveDial(cfg sshx.Config, auth sshx.AuthMethod) error {
	client, err := sshx.Dial(cfg, auth)
	if err != nil {
		return err
	}
	return client.Close()
}

func (s *Service) List(ctx context.Context) ([]Public, error) {
	recs, err := s.store.List(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Public, 0, len(recs))
	for _, rec := range recs {
		out = append(out, s.public(rec))
	}
	return out, nil
}

func (s *Service) Get(ctx context.Context, id string) (Public, error) {
	rec, err := s.store.Get(ctx, id)
	if err != nil {
		return Public{}, err
	}
	return s.public(rec), nil
}

func (s *Service) Create(ctx context.Context, input Input) (Public, error) {
	input = Normalize(input)
	if err := Validate(input, true); err != nil {
		return Public{}, err
	}
	secret, err := s.secret(input, true)
	if err != nil {
		return Public{}, err
	}
	encrypted, err := s.box.Encrypt(secret)
	if err != nil {
		return Public{}, fmt.Errorf("unable to store credentials")
	}

	now := time.Now().UTC()
	rec := Record{
		ID:        newID(),
		Name:      input.Name,
		Host:      input.Host,
		Port:      input.Port,
		Username:  input.Username,
		AuthType:  input.AuthType,
		Status:    StatusUnknown,
		CreatedAt: now,
		UpdatedAt: now,
	}
	cred := Credential{
		ID:              newID(),
		ServerID:        rec.ID,
		AuthType:        rec.AuthType,
		EncryptedSecret: encrypted,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := s.store.Create(ctx, rec, cred); err != nil {
		return Public{}, err
	}
	log.Printf("server.created id=%s name=%s host=%s", rec.ID, rec.Name, rec.Host)

	rec, _ = s.testAndUpdate(ctx, rec, secret)
	return s.public(rec), nil
}

func (s *Service) Update(ctx context.Context, id string, input Input) (Public, error) {
	input = Normalize(input)
	existing, err := s.store.Get(ctx, id)
	if err != nil {
		return Public{}, err
	}
	requireSecret := input.Password != "" || input.PrivateKey != "" || input.AuthType != existing.AuthType
	if err := Validate(input, requireSecret); err != nil {
		return Public{}, err
	}

	if input.Host != existing.Host || input.Port != existing.Port {
		if err := s.store.SetHostKey(ctx, existing.ID, ""); err != nil {
			return Public{}, err
		}
	}
	existing.Name = input.Name
	existing.Host = input.Host
	existing.Port = input.Port
	existing.Username = input.Username
	existing.AuthType = input.AuthType
	existing.UpdatedAt = time.Now().UTC()
	existing.LastError = ""
	existing.Status = StatusUnknown

	if requireSecret {
		secret, err := s.secret(input, true)
		if err != nil {
			return Public{}, err
		}
		encrypted, err := s.box.Encrypt(secret)
		if err != nil {
			return Public{}, fmt.Errorf("unable to store credentials")
		}
		now := time.Now().UTC()
		if err := s.store.UpsertCredential(ctx, Credential{
			ID:              newID(),
			ServerID:        existing.ID,
			AuthType:        existing.AuthType,
			EncryptedSecret: encrypted,
			CreatedAt:       now,
			UpdatedAt:       now,
		}); err != nil {
			return Public{}, err
		}
	}

	s.pool.Forget(existing.ID)
	if err := s.store.Update(ctx, existing); err != nil {
		return Public{}, err
	}
	log.Printf("server.updated id=%s name=%s", existing.ID, existing.Name)
	existing, _ = s.testAndUpdate(ctx, existing, "")
	return s.public(existing), nil
}

func (s *Service) Delete(ctx context.Context, id string) error {
	rec, err := s.store.Get(ctx, id)
	if err != nil {
		return err
	}
	s.pool.Forget(id)
	if err := s.store.Delete(ctx, id); err != nil {
		return err
	}
	log.Printf("server.deleted id=%s name=%s", rec.ID, rec.Name)
	return nil
}

func (s *Service) Connect(ctx context.Context, id string) (Public, error) {
	rec, err := s.store.Get(ctx, id)
	if err != nil {
		return Public{}, err
	}
	log.Printf("SSH connection requested server=%s", rec.Name)
	rec.Status = StatusConnecting
	rec.LastError = ""
	rec.UpdatedAt = time.Now().UTC()
	_ = s.store.Update(ctx, rec)

	_, err = s.pool.Ensure(id)
	if err != nil {
		rec.Status = statusFromErr(err)
		rec.LastError = sshx.PublicError(err)
		rec.UpdatedAt = time.Now().UTC()
		_ = s.store.Update(ctx, rec)
		log.Printf("SSH connection failed server=%s", rec.Name)
		return s.public(rec), err
	}

	now := time.Now().UTC()
	rec.Status = StatusOnline
	rec.LastError = ""
	rec.LastSeen = &now
	rec.UpdatedAt = now
	_ = s.store.Update(ctx, rec)
	log.Printf("SSH connection established server=%s", rec.Name)
	return s.public(rec), nil
}

func (s *Service) Disconnect(ctx context.Context, id string) (Public, error) {
	rec, err := s.store.Get(ctx, id)
	if err != nil {
		return Public{}, err
	}
	if err := s.pool.Disconnect(id); err != nil {
		log.Printf("SSH connection close error server=%s", rec.Name)
	} else {
		log.Printf("SSH connection closed server=%s", rec.Name)
	}
	rec.Status = StatusOffline
	rec.UpdatedAt = time.Now().UTC()
	_ = s.store.Update(ctx, rec)
	log.Printf("server.disconnected id=%s name=%s", rec.ID, rec.Name)
	return s.public(rec), nil
}

func (s *Service) Test(ctx context.Context, id string) (TestResult, error) {
	rec, err := s.store.Get(ctx, id)
	if err != nil {
		return TestResult{}, err
	}
	log.Printf("SSH connection test requested server=%s", rec.Name)
	start := time.Now()
	cfg, auth, err := s.loadAuth(id)
	if err != nil {
		return TestResult{Server: s.public(rec), Error: sshx.PublicError(err)}, err
	}
	err = s.dial(cfg, auth)
	latency := time.Since(start)
	if err != nil {
		rec.Status = statusFromErr(err)
		rec.LastError = sshx.PublicError(err)
		rec.UpdatedAt = time.Now().UTC()
		_ = s.store.Update(ctx, rec)
		log.Printf("Server connection test failed server=%s", rec.Name)
		code, message := sshx.ClassifyError(err)
		result := TestResult{
			OK:      false,
			Latency: latency.Milliseconds(),
			Code:    code,
			Error:   message,
			Server:  s.public(rec),
		}
		var mismatch *sshx.HostKeyMismatchError
		if errors.As(err, &mismatch) {
			result.HostKey = mismatch.Presented
		}
		return result, nil
	}
	now := time.Now().UTC()
	rec.Status = StatusOnline
	rec.LastError = ""
	rec.LastSeen = &now
	rec.UpdatedAt = now
	_ = s.store.Update(ctx, rec)
	log.Printf("SSH connection test succeeded server=%s", rec.Name)
	return TestResult{
		OK:      true,
		Latency: latency.Milliseconds(),
		Server:  s.public(rec),
	}, nil
}

func (s *Service) TrustHostKey(ctx context.Context, id, fingerprint string) (TestResult, error) {
	if !strings.HasPrefix(fingerprint, "SHA256:") {
		return TestResult{}, fmt.Errorf("invalid host key fingerprint")
	}
	if err := s.store.SetHostKey(ctx, id, fingerprint); err != nil {
		return TestResult{}, err
	}
	log.Printf("server.host_key_trusted id=%s fingerprint=%s", id, fingerprint)
	s.pool.Forget(id)
	return s.Test(ctx, id)
}

func (s *Service) hostKeyCallback(id string, pin bool) ssh.HostKeyCallback {
	return func(_ string, _ net.Addr, key ssh.PublicKey) error {
		ctx := context.Background()
		presented := ssh.FingerprintSHA256(key)
		trusted, err := s.store.GetHostKey(ctx, id)
		switch {
		case err != nil:
			return err
		case trusted == "" && pin:
			log.Printf("server.host_key_pinned id=%s fingerprint=%s", id, presented)
			return s.store.SetHostKey(ctx, id, presented)
		case trusted == "" || trusted == presented:
			return nil
		}
		log.Printf("server.host_key_mismatch id=%s trusted=%s presented=%s", id, trusted, presented)
		return &sshx.HostKeyMismatchError{Presented: presented}
	}
}

func (s *Service) loadAuth(id string) (sshx.Config, sshx.AuthMethod, error) {
	ctx := context.Background()
	rec, err := s.store.Get(ctx, id)
	if err != nil {
		return sshx.Config{}, nil, err
	}
	auth, err := s.savedAuth(ctx, rec)
	if err != nil {
		return sshx.Config{}, nil, err
	}
	cfg := sshx.Config{
		Host:            rec.Host,
		Port:            rec.Port,
		Username:        rec.Username,
		HostKeyCallback: s.hostKeyCallback(rec.ID, true),
	}
	return cfg, auth, nil
}

// savedAuth loads and decrypts the stored credential for rec.
func (s *Service) savedAuth(ctx context.Context, rec Record) (sshx.AuthMethod, error) {
	cred, err := s.store.GetCredential(ctx, rec.ID)
	if err != nil {
		return nil, fmt.Errorf("unable to authenticate")
	}
	secret, err := s.box.Decrypt(cred.EncryptedSecret)
	if err != nil {
		return nil, fmt.Errorf("unable to authenticate")
	}
	return authMethod(rec.AuthType, secret)
}

func (s *Service) secret(input Input, required bool) (string, error) {
	switch input.AuthType {
	case AuthPassword:
		if required && input.Password == "" {
			return "", fmt.Errorf("password is required")
		}
		return input.Password, nil
	case AuthPrivateKey:
		if required && input.PrivateKey == "" {
			return "", fmt.Errorf("private key is required")
		}
		if _, err := sshx.ParsePrivateKeyAuth(input.PrivateKey, ""); err != nil {
			return "", err
		}
		return input.PrivateKey, nil
	default:
		return "", fmt.Errorf("invalid authentication type")
	}
}

func (s *Service) testAndUpdate(ctx context.Context, rec Record, secret string) (Record, error) {
	cfg := sshx.Config{Host: rec.Host, Port: rec.Port, Username: rec.Username, HostKeyCallback: s.hostKeyCallback(rec.ID, true)}
	var auth sshx.AuthMethod
	var err error
	if secret != "" {
		auth, err = authMethod(rec.AuthType, secret)
	} else {
		cfg, auth, err = s.loadAuth(rec.ID)
	}
	if err != nil {
		rec.Status = statusFromErr(err)
		rec.LastError = sshx.PublicError(err)
		rec.UpdatedAt = time.Now().UTC()
		_ = s.store.Update(ctx, rec)
		return rec, err
	}
	if err := s.dial(cfg, auth); err != nil {
		rec.Status = statusFromErr(err)
		rec.LastError = sshx.PublicError(err)
		rec.UpdatedAt = time.Now().UTC()
		_ = s.store.Update(ctx, rec)
		return rec, err
	}
	now := time.Now().UTC()
	rec.Status = StatusOnline
	rec.LastError = ""
	rec.LastSeen = &now
	rec.UpdatedAt = now
	_ = s.store.Update(ctx, rec)
	return rec, nil
}

func (s *Service) public(rec Record) Public {
	if rec.LastError == "" && s.pool != nil && s.pool.IsConnected(rec.ID) {
		rec.Status = StatusOnline
	}
	return rec.Public()
}

func authMethod(authType, secret string) (sshx.AuthMethod, error) {
	switch authType {
	case AuthPassword:
		return sshx.PasswordAuth{Password: secret}, nil
	case AuthPrivateKey:
		return sshx.ParsePrivateKeyAuth(secret, "")
	default:
		return nil, fmt.Errorf("invalid authentication type")
	}
}

func statusFromErr(err error) string {
	if err == nil {
		return StatusOnline
	}
	switch code, _ := sshx.ClassifyError(err); code {
	case sshx.CodeAuthFailed, sshx.CodeInvalidPrivateKey, sshx.CodePassphraseRequired:
		return StatusAuthenticationFailed
	case sshx.CodeHostKeyChanged:
		return StatusHostKeyChanged
	default:
		return StatusOffline
	}
}

func newID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b[:])
}
