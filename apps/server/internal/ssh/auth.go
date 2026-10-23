package sshx

import (
	"errors"
	"strings"

	"golang.org/x/crypto/ssh"
)

type AuthMethod interface {
	SSHAuthMethod() ssh.AuthMethod
}

type PasswordAuth struct {
	Password string
}

func (p PasswordAuth) SSHAuthMethod() ssh.AuthMethod {
	return ssh.Password(p.Password)
}

type PublicKeyAuth struct {
	signer ssh.Signer
}

func (p PublicKeyAuth) SSHAuthMethod() ssh.AuthMethod {
	return ssh.PublicKeys(p.signer)
}

// ParsePrivateKeyAuth parses a PEM-encoded private key into an AuthMethod.
// Returns structured SSHError for key-related failures.
// passphrase is optional; if the key is encrypted and no passphrase is provided,
// returns ErrKeyPassphraseProtected.
func ParsePrivateKeyAuth(pemBytes, passphrase string) (AuthMethod, error) {
	pemBytes = strings.TrimSpace(pemBytes)
	if pemBytes == "" {
		return nil, ErrKeyEmpty()
	}

	raw := []byte(pemBytes)
	signer, err := ssh.ParsePrivateKey(raw)
	if err == nil {
		return PublicKeyAuth{signer: signer}, nil
	}

	// Check for passphrase-protected key
	var missing *ssh.PassphraseMissingError
	if errors.As(err, &missing) || strings.Contains(strings.ToLower(err.Error()), "passphrase") {
		if strings.TrimSpace(passphrase) == "" {
			return nil, ErrKeyPassphraseProtected(err)
		}
		signer, err = ssh.ParsePrivateKeyWithPassphrase(raw, []byte(passphrase))
		if err != nil {
			// Wrong passphrase or other parse error
			return nil, ErrKeyInvalidPEM(err)
		}
		return PublicKeyAuth{signer: signer}, nil
	}

	// Check for unsupported key types (e.g., DSA)
	errMsg := strings.ToLower(err.Error())
	if strings.Contains(errMsg, "unsupported") || strings.Contains(errMsg, "unknown key type") {
		return nil, ErrKeyUnsupportedType(err, extractKeyType(err.Error()))
	}

	// Check for format issues (PuTTY .ppk, RFC4716, etc.)
	if strings.Contains(errMsg, "invalid") || strings.Contains(errMsg, "malformed") || strings.Contains(errMsg, "no key found") {
		return nil, ErrKeyInvalidFormat(err, detectKeyFormat(err.Error()))
	}

	return nil, ErrKeyInvalidPEM(err)
}
