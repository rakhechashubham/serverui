package servers

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"

	"golang.org/x/crypto/ssh"

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

type keyServer struct {
	ln          net.Listener
	fingerprint string
	password    atomic.Value
	attempts    atomic.Int32
}

func startKeyServer(t *testing.T, addr string) *keyServer {
	t.Helper()
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	signer, err := ssh.NewSignerFromKey(priv)
	if err != nil {
		t.Fatal(err)
	}
	srv := &keyServer{fingerprint: ssh.FingerprintSHA256(signer.PublicKey())}
	srv.password.Store("secret")
	config := &ssh.ServerConfig{PasswordCallback: func(_ ssh.ConnMetadata, pass []byte) (*ssh.Permissions, error) {
		srv.attempts.Add(1)
		if string(pass) == srv.password.Load().(string) {
			return nil, nil
		}
		return nil, errors.New("denied")
	}}
	config.AddHostKey(signer)
	if srv.ln, err = net.Listen("tcp", addr); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = srv.ln.Close() })
	go func() {
		for {
			c, err := srv.ln.Accept()
			if err != nil {
				return
			}
			go func() {
				if conn, _, reqs, err := ssh.NewServerConn(c, config); err == nil {
					go ssh.DiscardRequests(reqs)
					_ = conn.Wait()
				}
			}()
		}
	}()
	return srv
}

func (k *keyServer) input() Input {
	host, port, _ := net.SplitHostPort(k.ln.Addr().String())
	n, _ := strconv.Atoi(port)
	return Input{Name: "arch", Host: host, Port: n, Username: "deploy", AuthType: AuthPassword, Password: "secret"}
}

func (k *keyServer) replace(t *testing.T) *keyServer {
	addr := k.ln.Addr().String()
	_ = k.ln.Close()
	return startKeyServer(t, addr)
}

func liveService(t *testing.T) *Service {
	svc := testService(t)
	svc.SetDialer(nil)
	t.Cleanup(svc.Pool().DisconnectAll)
	return svc
}

func TestFailedTestIsNotMaskedByPooledSession(t *testing.T) {
	svc := liveService(t)
	ctx := context.Background()
	srv := startKeyServer(t, "127.0.0.1:0")
	created, err := svc.Create(ctx, srv.input())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Connect(ctx, created.ID); err != nil {
		t.Fatalf("connect: %v", err)
	}
	if got, _ := svc.Get(ctx, created.ID); got.Status != StatusOnline {
		t.Fatalf("status with a live session = %q, want %q", got.Status, StatusOnline)
	}

	srv.password.Store("rotated")
	result, err := svc.Test(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if result.OK || result.Server.Status != StatusAuthenticationFailed || !strings.Contains(result.Error, "rejected the username or password") {
		t.Fatalf("test after password change = %+v", result)
	}
	if got, _ := svc.Get(ctx, created.ID); got.Status != StatusAuthenticationFailed {
		t.Fatalf("listed status = %q, want %q", got.Status, StatusAuthenticationFailed)
	}
}

func TestHostKeyTrustOnFirstUse(t *testing.T) {
	svc := liveService(t)
	ctx := context.Background()
	srv := startKeyServer(t, "127.0.0.1:0")

	created, err := svc.Create(ctx, srv.input())
	if err != nil || created.Status != StatusOnline {
		t.Fatalf("create: %v %+v", err, created)
	}
	if pinned, _ := svc.store.GetHostKey(ctx, created.ID); pinned != srv.fingerprint {
		t.Fatalf("pinned %q, want %q", pinned, srv.fingerprint)
	}
	if result, _ := svc.Test(ctx, created.ID); !result.OK {
		t.Fatalf("same key refused: %s", result.Error)
	}

	impostor := srv.replace(t)
	result, err := svc.Test(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if result.OK || result.Code != sshx.CodeHostKeyChanged || result.Server.Status != StatusHostKeyChanged || result.HostKey != impostor.fingerprint {
		t.Fatalf("changed key not refused: %+v", result)
	}
	if _, err := svc.Connect(ctx, created.ID); err == nil {
		t.Fatal("connect to a changed host key succeeded")
	}
	if n := impostor.attempts.Load(); n != 0 {
		t.Fatalf("impostor received %d password attempts", n)
	}

	if _, err := svc.TrustHostKey(ctx, created.ID, ""); err == nil {
		t.Fatal("empty fingerprint accepted")
	}
	if result, _ := svc.TrustHostKey(ctx, created.ID, srv.fingerprint); result.OK || impostor.attempts.Load() != 0 {
		t.Fatalf("trusting a key the server does not present: %+v", result)
	}
	trusted, err := svc.TrustHostKey(ctx, created.ID, impostor.fingerprint)
	if err != nil || !trusted.OK || trusted.Server.Status != StatusOnline {
		t.Fatalf("trust: %v %+v", err, trusted)
	}
}

func TestEditingAddressTrustsNewHost(t *testing.T) {
	svc := liveService(t)
	ctx := context.Background()
	created, err := svc.Create(ctx, startKeyServer(t, "127.0.0.1:0").input())
	if err != nil {
		t.Fatal(err)
	}
	moved := startKeyServer(t, "127.0.0.1:0")
	input := moved.input()
	input.Password = ""

	updated, err := svc.Update(ctx, created.ID, input)
	if err != nil || updated.Status != StatusOnline {
		t.Fatalf("update: %v %+v", err, updated)
	}
	if pinned, _ := svc.store.GetHostKey(ctx, created.ID); pinned != moved.fingerprint {
		t.Fatalf("pinned %q, want %q", pinned, moved.fingerprint)
	}
}
