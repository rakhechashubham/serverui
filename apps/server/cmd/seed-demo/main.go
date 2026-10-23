// Package main provides a CLI tool to seed the demo server into the database.
// Usage: go run ./cmd/seed-demo [--postgres|--sqlite] [--encryption-key=KEY]
package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	_ "modernc.org/sqlite"

	"serverui/server/internal/crypto"
	"serverui/server/internal/db"
	"serverui/server/internal/servers"
)

const (
	demoServerName     = "Demo Server (localhost)"
	demoServerHost     = "host.docker.internal" // Works from Docker containers to host (Docker Desktop Mac/Windows)
	demoServerPort     = 2222
	demoServerUser     = "demo"
	demoServerPassword = "demo"
	demoServerAuthType = servers.AuthPassword
)

func main() {
	var (
		usePostgres   = false
		useSQLite     = false
		encryptionKey = ""
		sqlitePath    = ""
		demoHost      = ""
	)

	// Parse flags
	for i := 1; i < len(os.Args); i++ {
		arg := os.Args[i]
		switch {
		case arg == "--postgres":
			usePostgres = true
		case arg == "--sqlite":
			useSQLite = true
		case strings.HasPrefix(arg, "--encryption-key="):
			encryptionKey = strings.TrimPrefix(arg, "--encryption-key=")
		case strings.HasPrefix(arg, "--sqlite-path="):
			sqlitePath = strings.TrimPrefix(arg, "--sqlite-path=")
		case strings.HasPrefix(arg, "--host="):
			demoHost = strings.TrimPrefix(arg, "--host=")
		case arg == "-h" || arg == "--help":
			printUsage()
			return
		}
	}

	// Use custom host if provided, otherwise default
	host := demoServerHost
	if demoHost != "" {
		host = demoHost
	}

	// Auto-detect backend from environment if not specified
	if !usePostgres && !useSQLite {
		mode := strings.ToLower(strings.TrimSpace(os.Getenv("SERVERUI_STORAGE")))
		switch mode {
		case "", "postgres", "postgresql":
			usePostgres = true
		case "sqlite":
			useSQLite = true
		}
	}

	// Get encryption key
	if encryptionKey == "" {
		encryptionKey = strings.TrimSpace(os.Getenv("SERVERUI_CREDENTIAL_ENCRYPTION_KEY"))
	}
	if encryptionKey == "" {
		// Generate a deterministic key for demo (so it's reproducible)
		// In production this would come from .env
		encryptionKey = "0000000000000000000000000000000000000000000000000000000000000000"
		log.Println("WARNING: Using default demo encryption key. Set SERVERUI_CREDENTIAL_ENCRYPTION_KEY for production.")
	}

	box, err := crypto.New(encryptionKey)
	if err != nil {
		log.Fatalf("Invalid encryption key: %v", err)
	}

	var sqlDB *sql.DB
	if usePostgres {
		dsn := strings.TrimSpace(os.Getenv("DATABASE_URL"))
		if dsn == "" {
			dsn = buildPostgresDSN()
		}
		log.Printf("Connecting to PostgreSQL...")
		sqlDB, err = sql.Open("pgx", dsn)
	} else {
		if sqlitePath == "" {
			sqlitePath = strings.TrimSpace(os.Getenv("SERVERUI_DATABASE_PATH"))
		}
		if sqlitePath == "" {
			// Default to local file for development
			sqlitePath = "./demo-serverui.db"
		}
		log.Printf("Opening SQLite at %s...", sqlitePath)
		sqlDB, err = sql.Open("sqlite", "file:"+filepath.ToSlash(sqlitePath)+"?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)")
	}
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer sqlDB.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := sqlDB.PingContext(ctx); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	store := servers.NewSQLStoreBackend(sqlDB, db.StoragePostgres)
	if useSQLite {
		store = servers.NewSQLStoreBackend(sqlDB, db.StorageSQLite)
	}

	svc := servers.NewService(store, box)

	// Check if demo server already exists
	existing, err := svc.List(ctx)
	if err != nil {
		log.Fatalf("Failed to list servers: %v", err)
	}

	demoExists := false
	for _, s := range existing {
		if s.Name == demoServerName {
			demoExists = true
			log.Printf("Demo server already exists (id=%s). Skipping creation.", s.ID)
			break
		}
	}

	if !demoExists {
		input := servers.Input{
			Name:       demoServerName,
			Host:       host,
			Port:       demoServerPort,
			Username:   demoServerUser,
			AuthType:   demoServerAuthType,
			Password:   demoServerPassword,
			PrivateKey: "",
		}

		log.Printf("Creating demo server: %s@%s:%d", demoServerUser, host, demoServerPort)
		created, err := svc.Create(ctx, input)
		if err != nil {
			// If connection test fails, that's OK for demo - the server record is created
			if strings.Contains(err.Error(), "unable to authenticate") || strings.Contains(err.Error(), "connection") {
				log.Printf("Demo server created but connection test failed (expected if SSH not running): %v", err)
			} else {
				log.Fatalf("Failed to create demo server: %v", err)
			}
		} else {
			log.Printf("Demo server created successfully (id=%s, status=%s)", created.ID, created.Status)
		}
	}

	log.Println("Demo seed complete.")
}

func printUsage() {
	fmt.Print(`Usage: go run ./cmd/seed-demo [options]

Options:
  --postgres           Use PostgreSQL backend (default: auto-detect from SERVERUI_STORAGE)
  --sqlite             Use SQLite backend
  --encryption-key=KEY 32-byte hex encryption key (default: from SERVERUI_CREDENTIAL_ENCRYPTION_KEY env)
  --sqlite-path=PATH   Path to SQLite database file (default: from SERVERUI_DATABASE_PATH or ./demo-serverui.db)
  --host=HOST          Demo server hostname/IP (default: host.docker.internal for Docker, 127.0.0.1 otherwise)
  -h, --help           Show this help

Environment variables:
  SERVERUI_STORAGE           postgres|sqlite (default: postgres)
  SERVERUI_DATABASE_PATH     SQLite database file path
  DATABASE_URL               PostgreSQL connection string
  POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB
  SERVERUI_CREDENTIAL_ENCRYPTION_KEY  64-char hex key

Examples:
  # Web dev (PostgreSQL via Docker Compose)
  make demo-db && go run ./cmd/seed-demo --postgres

  # Desktop dev (SQLite)
  go run ./cmd/seed-demo --sqlite --sqlite-path=./demo-serverui.db

  # With custom encryption key
  go run ./cmd/seed-demo --postgres --encryption-key=abc123...

  # Linux Docker (use host gateway IP)
  go run ./cmd/seed-demo --postgres --host=172.17.0.1
`)
}

func buildPostgresDSN() string {
	user := envOr("POSTGRES_USER", "serverui")
	pass := os.Getenv("POSTGRES_PASSWORD")
	host := envOr("POSTGRES_HOST", "127.0.0.1")
	port := envOr("POSTGRES_PORT", "5432")
	name := envOr("POSTGRES_DB", "serverui")
	return fmt.Sprintf("postgresql://%s:%s@%s:%s/%s?sslmode=disable", user, pass, host, port, name)
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func generateID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b[:])
}
