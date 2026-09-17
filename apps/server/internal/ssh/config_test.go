package sshx

import "testing"

func TestLoadConfigDefaults(t *testing.T) {
	t.Setenv("SERVER_HOST", "")
	t.Setenv("SERVER_PORT", "")
	t.Setenv("SERVER_USER", "")
	t.Setenv("SERVER_PASSWORD", "")

	cfg := LoadConfig()
	if cfg.Host != "203.0.113.10" {
		t.Fatalf("host = %q", cfg.Host)
	}
	if cfg.Port != 22 {
		t.Fatalf("port = %d", cfg.Port)
	}
	if cfg.Username != "deploy" {
		t.Fatalf("user = %q", cfg.Username)
	}
	if cfg.Password != "" {
		t.Fatal("password should not have a default")
	}
}

func TestLoadConfigFromEnv(t *testing.T) {
	t.Setenv("SERVER_HOST", "10.0.0.9")
	t.Setenv("SERVER_PORT", "2222")
	t.Setenv("SERVER_USER", "ops")
	t.Setenv("SERVER_PASSWORD", "secret")

	cfg := LoadConfig()
	if cfg.Host != "10.0.0.9" || cfg.Port != 2222 || cfg.Username != "ops" {
		t.Fatalf("unexpected config: %+v", cfg)
	}
	if cfg.Addr() != "10.0.0.9:2222" {
		t.Fatalf("addr = %q", cfg.Addr())
	}
}

func TestPublicErrorHidesDetails(t *testing.T) {
	err := PublicError(&authError{})
	if err != "authentication failed" {
		t.Fatalf("got %q", err)
	}
}

type authError struct{}

func (authError) Error() string {
	return "ssh: unable to authenticate, attempted methods [none password]"
}
