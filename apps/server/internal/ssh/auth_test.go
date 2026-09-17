package sshx

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/pem"
	"strings"
	"testing"

	"golang.org/x/crypto/ssh"
)

func TestParsePrivateKeyAuth(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	block := &pem.Block{Type: "RSA PRIVATE KEY", Bytes: marshalPKCS1(key)}
	pemBytes := pem.EncodeToMemory(block)
	auth, err := ParsePrivateKeyAuth(string(pemBytes), "")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := auth.(PublicKeyAuth); !ok {
		t.Fatal("expected public key auth")
	}
}

func TestParsePrivateKeyAuthRejectsEmpty(t *testing.T) {
	if _, err := ParsePrivateKeyAuth("", ""); err == nil {
		t.Fatal("expected error")
	}
}

func TestParsePrivateKeyAuthRejectsPassphraseProtected(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	block, err := ssh.MarshalPrivateKeyWithPassphrase(key, "", []byte("phrase"))
	if err != nil {
		t.Skip("passphrase marshal not available")
	}
	pemBytes := pem.EncodeToMemory(block)
	_, err = ParsePrivateKeyAuth(string(pemBytes), "")
	if err == nil || !strings.Contains(err.Error(), "not supported") {
		t.Fatalf("got %v", err)
	}
}

func marshalPKCS1(key *rsa.PrivateKey) []byte {
	return rsaPKCS1(key)
}
