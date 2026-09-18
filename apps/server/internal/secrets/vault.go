package secrets

import (
	"errors"
	"os"
	"strings"
)

var ErrMissingKey = errors.New("SERVERUI_CREDENTIAL_ENCRYPTION_KEY is missing")

// Vault is the desktop/server boundary for long-lived secret material that
// protects SSH credentials at rest (today: SERVERUI_CREDENTIAL_ENCRYPTION_KEY).
//
// SSH passwords and private keys remain AES-256-GCM ciphertext in PostgreSQL
// (crypto.Cipher / crypto.Box). They are never stored in the OS keychain and
// never returned to the frontend.
//
// Desktop (Phase 3): Tauri may load/store the encryption key via the OS
// keychain and inject it into the Go process environment. Go continues to
// consume the key only through env — it does not talk to the keychain itself.
//
// Web/self-hosted: the key remains an operator-managed env var (.env / Compose).
//
// Implementations must never log key material.
type Vault interface {
	// EncryptionKey returns the 32-byte AES key material (hex or base64).
	EncryptionKey() (string, error)
}

// EnvVault reads SERVERUI_CREDENTIAL_ENCRYPTION_KEY from the process environment.
type EnvVault struct {
	Lookup func(string) string
}

func (v EnvVault) EncryptionKey() (string, error) {
	lookup := v.Lookup
	if lookup == nil {
		lookup = os.Getenv
	}
	key := strings.TrimSpace(lookup("SERVERUI_CREDENTIAL_ENCRYPTION_KEY"))
	if key == "" {
		return "", ErrMissingKey
	}
	return key, nil
}
