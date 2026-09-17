package servers

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"serverui/server/internal/crypto"
	sshx "serverui/server/internal/ssh"
)

func testService(t *testing.T) *Service {
	t.Helper()
	key, err := crypto.RandomKey()
	if err != nil {
		t.Fatal(err)
	}
	box, err := crypto.New(key)
	if err != nil {
		t.Fatal(err)
	}
	svc := NewService(NewMemoryStore(), box)
	svc.SetDialer(func(cfg sshx.Config, auth sshx.AuthMethod) error {
		if cfg.Host == "offline.example" {
			return fmt.Errorf("connection refused")
		}
		if cfg.Username == "denied" {
			return fmtAuthFailed()
		}
		return nil
	})
	return svc
}

type authFailedError struct{}

func (authFailedError) Error() string { return "unable to authenticate" }

func fmtAuthFailed() error { return authFailedError{} }

func TestCreateGetDeleteDoesNotReturnSecrets(t *testing.T) {
	svc := testService(t)
	ctx := context.Background()
	created, err := svc.Create(ctx, Input{
		Name:     "Production",
		Host:     "203.0.113.10",
		Port:     22,
		Username: "deploy",
		AuthType: AuthPassword,
		Password: "super-secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.Status != StatusOnline {
		t.Fatalf("status %s", created.Status)
	}
	raw, _ := json.Marshal(created)
	if strings.Contains(string(raw), "super-secret") {
		t.Fatal("credential leaked in create response")
	}

	got, err := svc.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ = json.Marshal(got)
	if strings.Contains(string(raw), "super-secret") || strings.Contains(string(raw), `"password":`) || strings.Contains(string(raw), `"privateKey":`) {
		t.Fatalf("credential leaked in get: %s", raw)
	}

	list, err := svc.List(ctx)
	if err != nil || len(list) != 1 {
		t.Fatalf("list %v %d", err, len(list))
	}

	updated, err := svc.Update(ctx, created.ID, Input{
		Name:     "Prod",
		Host:     "203.0.113.10",
		Port:     22,
		Username: "deploy",
		AuthType: AuthPassword,
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Name != "Prod" {
		t.Fatalf("name %s", updated.Name)
	}

	if err := svc.Delete(ctx, created.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Get(ctx, created.ID); err != ErrNotFound {
		t.Fatalf("expected not found, got %v", err)
	}
}

func TestCredentialIsolation(t *testing.T) {
	svc := testService(t)
	ctx := context.Background()
	a, err := svc.Create(ctx, Input{
		Name: "server-A", Host: "10.0.0.1", Port: 22, Username: "alice",
		AuthType: AuthPassword, Password: "alice-secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	b, err := svc.Create(ctx, Input{
		Name: "server-B", Host: "10.0.0.2", Port: 22, Username: "bob",
		AuthType: AuthPassword, Password: "bob-secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	credA, err := svc.store.GetCredential(ctx, a.ID)
	if err != nil {
		t.Fatal(err)
	}
	credB, err := svc.store.GetCredential(ctx, b.ID)
	if err != nil {
		t.Fatal(err)
	}
	if credA.EncryptedSecret == credB.EncryptedSecret {
		t.Fatal("credentials should not share ciphertext")
	}
	secretA, err := svc.box.Decrypt(credA.EncryptedSecret)
	if err != nil || secretA != "alice-secret" {
		t.Fatalf("server A secret mismatch")
	}
	secretB, err := svc.box.Decrypt(credB.EncryptedSecret)
	if err != nil || secretB != "bob-secret" {
		t.Fatalf("server B secret mismatch")
	}

	cfgA, authA, err := svc.loadAuth(a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if cfgA.Username != "alice" {
		t.Fatalf("loaded A username %s", cfgA.Username)
	}
	passA, ok := authA.(sshx.PasswordAuth)
	if !ok || passA.Password != "alice-secret" {
		t.Fatal("loaded A used the wrong credential")
	}
	cfgB, authB, err := svc.loadAuth(b.ID)
	if err != nil {
		t.Fatal(err)
	}
	if cfgB.Username != "bob" {
		t.Fatalf("loaded B username %s", cfgB.Username)
	}
	passB, ok := authB.(sshx.PasswordAuth)
	if !ok || passB.Password != "bob-secret" {
		t.Fatal("loaded B used the wrong credential")
	}
}

func TestCreateRejectsMissingPassword(t *testing.T) {
	svc := testService(t)
	_, err := svc.Create(context.Background(), Input{
		Name: "X", Host: "10.0.0.1", Port: 22, Username: "u", AuthType: AuthPassword,
	})
	if err == nil || err.Error() != "password is required" {
		t.Fatalf("got %v", err)
	}
}
