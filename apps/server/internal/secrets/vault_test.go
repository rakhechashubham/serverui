package secrets

import "testing"

func TestEnvVaultRequiresKey(t *testing.T) {
	v := EnvVault{Lookup: func(string) string { return "" }}
	if _, err := v.EncryptionKey(); err != ErrMissingKey {
		t.Fatalf("got %v", err)
	}
}

func TestEnvVaultReturnsKey(t *testing.T) {
	v := EnvVault{Lookup: func(string) string { return "  abc  " }}
	got, err := v.EncryptionKey()
	if err != nil {
		t.Fatal(err)
	}
	if got != "abc" {
		t.Fatalf("got %q", got)
	}
}
