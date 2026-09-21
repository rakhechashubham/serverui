package db

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	_ "modernc.org/sqlite"
)

// StorageBackend selects the persistence engine.
type StorageBackend string

const (
	StoragePostgres StorageBackend = "postgres"
	StorageSQLite   StorageBackend = "sqlite"
)

// Config describes how to open the application database.
type Config struct {
	Backend     StorageBackend
	SQLitePath  string // required when Backend == sqlite
	PostgresURL string // optional full DATABASE_URL when Backend == postgres
}

// ResolveConfig reads SERVERUI_STORAGE / SERVERUI_DATABASE_PATH / DATABASE_URL / POSTGRES_*.
// Default is postgres (web/self-hosted). Desktop Tauri sets sqlite + path explicitly.
func ResolveConfig() (Config, error) {
	var cfg Config
	mode := strings.ToLower(strings.TrimSpace(os.Getenv("SERVERUI_STORAGE")))
	switch mode {
	case "", "postgres", "postgresql":
		cfg.Backend = StoragePostgres
	case "sqlite":
		cfg.Backend = StorageSQLite
	default:
		return Config{}, fmt.Errorf("unsupported SERVERUI_STORAGE %q (want postgres or sqlite)", mode)
	}

	if cfg.Backend == StorageSQLite {
		path := strings.TrimSpace(os.Getenv("SERVERUI_DATABASE_PATH"))
		if path == "" {
			return Config{}, fmt.Errorf("SERVERUI_DATABASE_PATH is required when SERVERUI_STORAGE=sqlite")
		}
		cfg.SQLitePath = path
		return cfg, nil
	}

	cfg.PostgresURL = strings.TrimSpace(os.Getenv("DATABASE_URL"))
	return cfg, nil
}

// Open opens the configured database and pings it.
func Open() (*sql.DB, error) {
	cfg, err := ResolveConfig()
	if err != nil {
		return nil, err
	}
	return OpenConfig(cfg)
}

// OpenConfig opens a database from an explicit config (tests / callers).
func OpenConfig(cfg Config) (*sql.DB, error) {
	switch cfg.Backend {
	case StorageSQLite:
		return openSQLite(cfg.SQLitePath)
	case StoragePostgres, "":
		return openPostgres(cfg.PostgresURL)
	default:
		return nil, fmt.Errorf("unsupported storage backend %q", cfg.Backend)
	}
}

func openPostgres(dsn string) (*sql.DB, error) {
	if strings.TrimSpace(dsn) == "" {
		dsn = buildDSN()
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, enhanceDBError(StoragePostgres, err)
	}
	return db, nil
}

func openSQLite(path string) (*sql.DB, error) {
	if strings.TrimSpace(path) == "" {
		return nil, fmt.Errorf("sqlite database path is empty")
	}
	dir := filepath.Dir(path)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("create database directory: %w", err)
		}
	}

	// modernc.org/sqlite DSN. busy_timeout helps desktop single-writer UX.
	dsn := "file:" + filepath.ToSlash(path) + "?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// SQLite + desktop: one writer; keep pool small.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(0)

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, enhanceDBError(StorageSQLite, err)
	}
	return db, nil
}

func enhanceDBError(backend StorageBackend, err error) error {
	if err == nil {
		return nil
	}
	msg := err.Error()
	switch backend {
	case StoragePostgres:
		if strings.Contains(msg, "connection refused") || strings.Contains(msg, "dial error") {
			return fmt.Errorf("%w\n\nPostgreSQL is required for ServerUI web/self-hosted mode and is not bundled. Start PostgreSQL (for development: make desktop-db or Docker Compose) and configure DATABASE_URL or POSTGRES_* environment variables. See docs/desktop.md and docs/releases.md.", err)
		}
	case StorageSQLite:
		return fmt.Errorf("unable to open local ServerUI storage: %w", err)
	}
	return err
}

func buildDSN() string {
	user := envOr("POSTGRES_USER", "serverui")
	pass := os.Getenv("POSTGRES_PASSWORD")
	// Default to loopback for native/source runs. Docker Compose sets
	// POSTGRES_HOST=postgres explicitly; deployment must not rely on the
	// Compose service name as an implicit default.
	host := envOr("POSTGRES_HOST", "127.0.0.1")
	port := envOr("POSTGRES_PORT", "5432")
	name := envOr("POSTGRES_DB", "serverui")
	u := &url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(user, pass),
		Host:     host + ":" + port,
		Path:     "/" + name,
		RawQuery: "sslmode=disable",
	}
	return u.String()
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

// ActiveBackend returns the resolved storage backend (for logging / tests).
func ActiveBackend() StorageBackend {
	cfg, err := ResolveConfig()
	if err != nil {
		return StoragePostgres
	}
	return cfg.Backend
}
