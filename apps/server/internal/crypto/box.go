package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"
)

var (
	ErrInvalidKey    = errors.New("invalid encryption key")
	ErrInvalidSecret = errors.New("invalid ciphertext")
	ErrDecryptFailed = errors.New("unable to decrypt secret")
)

// Cipher is the credential encryption boundary used by the server-management
// layer. AES-GCM via Box is the current web/self-hosted implementation.
// A future desktop build may wrap OS secure storage behind the same interface
// without changing SSH dialing or HTTP handlers.
type Cipher interface {
	Encrypt(secret string) (string, error)
	Decrypt(ciphertext string) (string, error)
}

type Box struct {
	key [32]byte
}

var _ Cipher = (*Box)(nil)

func New(raw string) (*Box, error) {
	key, err := ParseKey(raw)
	if err != nil {
		return nil, err
	}
	return &Box{key: key}, nil
}

func ParseKey(raw string) ([32]byte, error) {
	var key [32]byte
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return key, ErrInvalidKey
	}
	var decoded []byte
	var err error
	switch {
	case len(raw) == 64 && isHex(raw):
		decoded, err = hex.DecodeString(raw)
	default:
		decoded, err = base64.StdEncoding.DecodeString(raw)
		if err != nil || len(decoded) != 32 {
			decoded, err = base64.RawStdEncoding.DecodeString(raw)
		}
	}
	if err != nil || len(decoded) != 32 {
		return key, ErrInvalidKey
	}
	copy(key[:], decoded)
	return key, nil
}

func (b *Box) Encrypt(secret string) (string, error) {
	if b == nil {
		return "", ErrInvalidKey
	}
	block, err := aes.NewCipher(b.key[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(secret), nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}

func (b *Box) Decrypt(ciphertext string) (string, error) {
	if b == nil {
		return "", ErrInvalidKey
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(ciphertext))
	if err != nil || len(raw) < 12 {
		return "", ErrInvalidSecret
	}
	block, err := aes.NewCipher(b.key[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonceSize := gcm.NonceSize()
	if len(raw) < nonceSize {
		return "", ErrInvalidSecret
	}
	plain, err := gcm.Open(nil, raw[:nonceSize], raw[nonceSize:], nil)
	if err != nil {
		return "", ErrDecryptFailed
	}
	return string(plain), nil
}

func isHex(value string) bool {
	for _, c := range value {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') && (c < 'A' || c > 'F') {
			return false
		}
	}
	return true
}

func RandomKey() (string, error) {
	var key [32]byte
	if _, err := io.ReadFull(rand.Reader, key[:]); err != nil {
		return "", fmt.Errorf("generate key: %w", err)
	}
	return hex.EncodeToString(key[:]), nil
}
