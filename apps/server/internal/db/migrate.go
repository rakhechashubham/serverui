package db

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
)

//go:embed schema.sql
var schemaFS embed.FS

func Migrate(ctx context.Context, db *sql.DB) error {
	sqlBytes, err := schemaFS.ReadFile("schema.sql")
	if err != nil {
		return fmt.Errorf("read schema: %w", err)
	}
	if _, err := db.ExecContext(ctx, string(sqlBytes)); err != nil {
		return fmt.Errorf("apply schema: %w", err)
	}
	return nil
}
