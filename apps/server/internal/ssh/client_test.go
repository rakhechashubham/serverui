package sshx

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"fmt"
	"net"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
)

func TestDialPasswordAndKey(t *testing.T) {
	password := "correct-horse"
	signer := testClientSigner(t)
	addr := startTestSSHServer(t, "deploy", password, signer.PublicKey())
	host, port := splitAddr(t, addr)

	client, err := Dial(Config{Host: host, Port: port, Username: "deploy"}, PasswordAuth{Password: password})
	if err != nil {
		t.Fatalf("password auth: %v", err)
	}
	_ = client.Close()

	client, err = Dial(Config{Host: host, Port: port, Username: "deploy"}, PublicKeyAuth{signer: signer})
	if err != nil {
		t.Fatalf("key auth: %v", err)
	}
	_ = client.Close()
}

func TestDialInvalidPassword(t *testing.T) {
	addr := startTestSSHServer(t, "deploy", "correct", nil)
	host, port := splitAddr(t, addr)
	_, err := Dial(Config{Host: host, Port: port, Username: "deploy"}, PasswordAuth{Password: "wrong"})
	if err == nil {
		t.Fatal("expected auth failure")
	}
	if PublicError(err) != "authentication failed" {
		t.Fatalf("public error %q", PublicError(err))
	}
}

func TestDialUnreachable(t *testing.T) {
	_, err := Dial(Config{Host: "127.0.0.1", Port: 1, Username: "deploy"}, PasswordAuth{Password: "x"})
	if err == nil {
		t.Fatal("expected connection failure")
	}
	if PublicError(err) != "unable to connect to server" && PublicError(err) != "ssh connection failed" {
		t.Fatalf("public error %q", PublicError(err))
	}
}

func TestPoolIsolatesServers(t *testing.T) {
	calls := map[string]int{}
	pool := NewPool(func(id string) (Config, AuthMethod, error) {
		calls[id]++
		if id == "server-B" {
			return Config{}, nil, fmt.Errorf("should not load server-B")
		}
		return Config{Host: "127.0.0.1", Port: 1, Username: "alice"}, PasswordAuth{Password: "a"}, nil
	})
	if _, err := pool.Manager("server-A"); err != nil {
		t.Fatal(err)
	}
	if calls["server-A"] != 1 || calls["server-B"] != 0 {
		t.Fatalf("calls %#v", calls)
	}
}

func startTestSSHServer(t *testing.T, user, password string, pub ssh.PublicKey) string {
	t.Helper()
	config := &ssh.ServerConfig{
		PasswordCallback: func(conn ssh.ConnMetadata, pass []byte) (*ssh.Permissions, error) {
			if conn.User() == user && string(pass) == password {
				return nil, nil
			}
			return nil, fmt.Errorf("permission denied")
		},
	}
	if pub != nil {
		config.PublicKeyCallback = func(conn ssh.ConnMetadata, key ssh.PublicKey) (*ssh.Permissions, error) {
			if conn.User() == user && string(key.Marshal()) == string(pub.Marshal()) {
				return nil, nil
			}
			return nil, fmt.Errorf("permission denied")
		}
	}
	hostKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromKey(hostKey)
	if err != nil {
		t.Fatal(err)
	}
	config.AddHostKey(signer)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })

	go func() {
		for {
			nConn, err := ln.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				_ = c.SetDeadline(time.Now().Add(5 * time.Second))
				conn, chans, reqs, err := ssh.NewServerConn(c, config)
				if err != nil {
					_ = c.Close()
					return
				}
				go ssh.DiscardRequests(reqs)
				go func() {
					for newCh := range chans {
						newCh.Reject(ssh.Prohibited, "no channels")
					}
				}()
				_ = conn.Wait()
			}(nConn)
		}
	}()
	return ln.Addr().String()
}

func testClientSigner(t *testing.T) ssh.Signer {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromKey(key)
	if err != nil {
		t.Fatal(err)
	}
	return signer
}

func splitAddr(t *testing.T, addr string) (string, int) {
	t.Helper()
	host, portS, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatal(err)
	}
	var port int
	_, err = fmt.Sscanf(portS, "%d", &port)
	if err != nil {
		t.Fatal(err)
	}
	return host, port
}

func rsaPKCS1(key *rsa.PrivateKey) []byte {
	return x509.MarshalPKCS1PrivateKey(key)
}
