package db

import (
	"strings"
	"testing"
)

func TestBuildDSNDefaultsToLoopback(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("POSTGRES_USER", "serverui")
	t.Setenv("POSTGRES_PASSWORD", "example_password")
	t.Setenv("POSTGRES_HOST", "")
	t.Setenv("POSTGRES_PORT", "")
	t.Setenv("POSTGRES_DB", "serverui")

	dsn := buildDSN()
	if !strings.Contains(dsn, "@127.0.0.1:5432/") {
		t.Fatalf("expected loopback default host, got %q", dsn)
	}
}

func TestBuildDSNUsesExplicitHost(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("POSTGRES_USER", "serverui")
	t.Setenv("POSTGRES_PASSWORD", "example_password")
	t.Setenv("POSTGRES_HOST", "postgres")
	t.Setenv("POSTGRES_PORT", "5432")
	t.Setenv("POSTGRES_DB", "serverui")

	dsn := buildDSN()
	if !strings.Contains(dsn, "@postgres:5432/") {
		t.Fatalf("expected compose host, got %q", dsn)
	}
}
