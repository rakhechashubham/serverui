package db_test

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"serverui/server/internal/crypto"
	"serverui/server/internal/db"
	"serverui/server/internal/servers"
)

func TestSQLiteStoreRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "serverui.db")

	sqlDB, err := db.OpenConfig(db.Config{
		Backend:    db.StorageSQLite,
		SQLitePath: path,
	})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer sqlDB.Close()

	ctx := context.Background()
	if err := db.MigrateBackend(ctx, sqlDB, db.StorageSQLite); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	store := servers.NewSQLStoreBackend(sqlDB, db.StorageSQLite)
	now := time.Now().UTC().Truncate(time.Second)
	rec := servers.Record{
		ID:        "srv_test_1",
		Name:      "Example",
		Host:      "203.0.113.10",
		Port:      22,
		Username:  "deploy",
		AuthType:  servers.AuthPassword,
		Status:    servers.StatusUnknown,
		CreatedAt: now,
		UpdatedAt: now,
	}
	keyHex := strings.Repeat("ab", 32) // 64 hex chars = 32 bytes
	box, err := crypto.New(keyHex)
	if err != nil {
		t.Fatalf("crypto: %v", err)
	}
	ct, err := box.Encrypt("example-password")
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	cred := servers.Credential{
		ID:              "cred_test_1",
		ServerID:        rec.ID,
		AuthType:        servers.AuthPassword,
		EncryptedSecret: ct,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := store.Create(ctx, rec, cred); err != nil {
		t.Fatalf("create: %v", err)
	}

	got, err := store.Get(ctx, rec.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Host != rec.Host || got.Name != rec.Name {
		t.Fatalf("unexpected record: %+v", got)
	}

	gotCred, err := store.GetCredential(ctx, rec.ID)
	if err != nil {
		t.Fatalf("get cred: %v", err)
	}
	if gotCred.EncryptedSecret == "example-password" {
		t.Fatal("credential stored in plaintext")
	}
	if gotCred.EncryptedSecret != ct {
		t.Fatalf("ciphertext mismatch")
	}
	pt, err := box.Decrypt(gotCred.EncryptedSecret)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if pt != "example-password" {
		t.Fatalf("round-trip password mismatch: %q", pt)
	}

	// Re-open to prove persistence.
	sqlDB.Close()
	sqlDB2, err := db.OpenConfig(db.Config{Backend: db.StorageSQLite, SQLitePath: path})
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer sqlDB2.Close()
	if err := db.MigrateBackend(ctx, sqlDB2, db.StorageSQLite); err != nil {
		t.Fatalf("remigrate: %v", err)
	}
	store2 := servers.NewSQLStoreBackend(sqlDB2, db.StorageSQLite)
	list, err := store2.List(ctx)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 server after reopen, got %d", len(list))
	}
}

func TestResolveConfigDefaultsPostgres(t *testing.T) {
	t.Setenv("SERVERUI_STORAGE", "")
	t.Setenv("SERVERUI_DATABASE_PATH", "")
	cfg, err := db.ResolveConfig()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Backend != db.StoragePostgres {
		t.Fatalf("got %q", cfg.Backend)
	}
}

func TestResolveConfigSQLiteRequiresPath(t *testing.T) {
	t.Setenv("SERVERUI_STORAGE", "sqlite")
	t.Setenv("SERVERUI_DATABASE_PATH", "")
	_, err := db.ResolveConfig()
	if err == nil {
		t.Fatal("expected error")
	}
}
