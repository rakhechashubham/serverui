package db

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"strings"
	"time"
)

//go:embed schema.sql schema_sqlite.sql
var schemaFS embed.FS

// CurrentSchemaVersion is the latest migration version applied by Migrate.
// Version 1: servers + server_credentials (+ schema_migrations bookkeeping).
const CurrentSchemaVersion = 1

// Migrate applies pending schema migrations for the active storage backend.
// It never drops user tables or recreates the database.
func Migrate(ctx context.Context, sqlDB *sql.DB) error {
	return MigrateBackend(ctx, sqlDB, ActiveBackend())
}

// MigrateBackend applies migrations for an explicit backend (tests).
func MigrateBackend(ctx context.Context, sqlDB *sql.DB, backend StorageBackend) error {
	if err := ensureMigrationsTable(ctx, sqlDB, backend); err != nil {
		return err
	}
	applied, err := currentVersion(ctx, sqlDB)
	if err != nil {
		return err
	}
	if applied >= CurrentSchemaVersion {
		return nil
	}

	schemaFile := "schema.sql"
	if backend == StorageSQLite {
		schemaFile = "schema_sqlite.sql"
	}
	sqlBytes, err := schemaFS.ReadFile(schemaFile)
	if err != nil {
		return fmt.Errorf("read schema: %w", err)
	}

	// Apply idempotent CREATE IF NOT EXISTS statements.
	if _, err := sqlDB.ExecContext(ctx, string(sqlBytes)); err != nil {
		return fmt.Errorf("apply schema: %w", err)
	}

	if err := recordVersion(ctx, sqlDB, backend, CurrentSchemaVersion); err != nil {
		return err
	}
	return nil
}

func ensureMigrationsTable(ctx context.Context, sqlDB *sql.DB, backend StorageBackend) error {
	var ddl string
	if backend == StorageSQLite {
		ddl = `CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY NOT NULL,
			applied_at TEXT NOT NULL
		)`
	} else {
		ddl = `CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY NOT NULL,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`
	}
	_, err := sqlDB.ExecContext(ctx, ddl)
	if err != nil {
		return fmt.Errorf("ensure schema_migrations: %w", err)
	}
	return nil
}

func currentVersion(ctx context.Context, sqlDB *sql.DB) (int, error) {
	var version sql.NullInt64
	err := sqlDB.QueryRowContext(ctx, `SELECT MAX(version) FROM schema_migrations`).Scan(&version)
	if err != nil {
		// Table might be empty / fresh.
		if strings.Contains(err.Error(), "no such table") {
			return 0, nil
		}
		return 0, fmt.Errorf("read schema version: %w", err)
	}
	if !version.Valid {
		return 0, nil
	}
	return int(version.Int64), nil
}

func recordVersion(ctx context.Context, sqlDB *sql.DB, backend StorageBackend, version int) error {
	var q string
	var args []any
	if backend == StorageSQLite {
		q = `INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)`
		args = []any{version, time.Now().UTC().Format(time.RFC3339Nano)}
	} else {
		q = `INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW()) ON CONFLICT (version) DO NOTHING`
		args = []any{version}
	}
	if _, err := sqlDB.ExecContext(ctx, q, args...); err != nil {
		return fmt.Errorf("record schema version: %w", err)
	}
	return nil
}
