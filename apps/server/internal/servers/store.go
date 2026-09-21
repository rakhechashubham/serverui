package servers

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"serverui/server/internal/db"
)

var ErrNotFound = errors.New("server not found")

type Store interface {
	Create(ctx context.Context, rec Record, cred Credential) error
	Get(ctx context.Context, id string) (Record, error)
	List(ctx context.Context) ([]Record, error)
	Update(ctx context.Context, rec Record) error
	Delete(ctx context.Context, id string) error
	GetCredential(ctx context.Context, serverID string) (Credential, error)
	UpsertCredential(ctx context.Context, cred Credential) error
}

type SQLStore struct {
	db      *sql.DB
	backend db.StorageBackend
}

func NewSQLStore(sqlDB *sql.DB) *SQLStore {
	return NewSQLStoreBackend(sqlDB, db.ActiveBackend())
}

func NewSQLStoreBackend(sqlDB *sql.DB, backend db.StorageBackend) *SQLStore {
	if backend == "" {
		backend = db.StoragePostgres
	}
	return &SQLStore{db: sqlDB, backend: backend}
}

func (s *SQLStore) q(query string) string {
	if s.backend == db.StorageSQLite {
		return rebindSQLite(query)
	}
	return query
}

var placeholderRE = regexp.MustCompile(`\$(\d+)`)

// rebindSQLite converts Postgres-style $1 placeholders to SQLite ?.
func rebindSQLite(query string) string {
	return placeholderRE.ReplaceAllStringFunc(query, func(m string) string {
		n, err := strconv.Atoi(strings.TrimPrefix(m, "$"))
		if err != nil || n < 1 {
			return m
		}
		return "?"
	})
}

func (s *SQLStore) Create(ctx context.Context, rec Record, cred Credential) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	_, err = tx.ExecContext(ctx, s.q(`
		INSERT INTO servers (id, name, host, port, username, auth_type, status, last_error, last_seen, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
	`), rec.ID, rec.Name, rec.Host, rec.Port, rec.Username, rec.AuthType, rec.Status, rec.LastError,
		s.timeArg(rec.LastSeen), s.timeArg(rec.CreatedAt), s.timeArg(rec.UpdatedAt))
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, s.q(`
		INSERT INTO server_credentials (id, server_id, auth_type, encrypted_secret, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6)
	`), cred.ID, cred.ServerID, cred.AuthType, cred.EncryptedSecret,
		s.timeArg(cred.CreatedAt), s.timeArg(cred.UpdatedAt))
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *SQLStore) Get(ctx context.Context, id string) (Record, error) {
	row := s.db.QueryRowContext(ctx, s.q(`
		SELECT id, name, host, port, username, auth_type, status, last_error, last_seen, created_at, updated_at
		FROM servers WHERE id = $1
	`), id)
	rec, err := s.scanRecord(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Record{}, ErrNotFound
	}
	return rec, err
}

func (s *SQLStore) List(ctx context.Context) ([]Record, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, host, port, username, auth_type, status, last_error, last_seen, created_at, updated_at
		FROM servers ORDER BY created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Record
	for rows.Next() {
		rec, err := s.scanRecord(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (s *SQLStore) Update(ctx context.Context, rec Record) error {
	res, err := s.db.ExecContext(ctx, s.q(`
		UPDATE servers
		SET name=$2, host=$3, port=$4, username=$5, auth_type=$6, status=$7, last_error=$8, last_seen=$9, updated_at=$10
		WHERE id=$1
	`), rec.ID, rec.Name, rec.Host, rec.Port, rec.Username, rec.AuthType, rec.Status, rec.LastError,
		s.timeArg(rec.LastSeen), s.timeArg(rec.UpdatedAt))
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *SQLStore) Delete(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, s.q(`DELETE FROM servers WHERE id=$1`), id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *SQLStore) GetCredential(ctx context.Context, serverID string) (Credential, error) {
	row := s.db.QueryRowContext(ctx, s.q(`
		SELECT id, server_id, auth_type, encrypted_secret, created_at, updated_at
		FROM server_credentials WHERE server_id=$1
	`), serverID)
	var cred Credential
	var created, updated any
	err := row.Scan(&cred.ID, &cred.ServerID, &cred.AuthType, &cred.EncryptedSecret, &created, &updated)
	if errors.Is(err, sql.ErrNoRows) {
		return Credential{}, ErrNotFound
	}
	if err != nil {
		return Credential{}, err
	}
	cred.CreatedAt, err = parseDBTime(created)
	if err != nil {
		return Credential{}, err
	}
	cred.UpdatedAt, err = parseDBTime(updated)
	if err != nil {
		return Credential{}, err
	}
	return cred, nil
}

func (s *SQLStore) UpsertCredential(ctx context.Context, cred Credential) error {
	_, err := s.db.ExecContext(ctx, s.q(`
		INSERT INTO server_credentials (id, server_id, auth_type, encrypted_secret, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (server_id) DO UPDATE SET
			auth_type=EXCLUDED.auth_type,
			encrypted_secret=EXCLUDED.encrypted_secret,
			updated_at=EXCLUDED.updated_at
	`), cred.ID, cred.ServerID, cred.AuthType, cred.EncryptedSecret,
		s.timeArg(cred.CreatedAt), s.timeArg(cred.UpdatedAt))
	return err
}

type rowScanner interface {
	Scan(dest ...any) error
}

func (s *SQLStore) timeArg(v any) any {
	if s.backend != db.StorageSQLite {
		return v
	}
	switch t := v.(type) {
	case nil:
		return nil
	case *time.Time:
		if t == nil {
			return nil
		}
		return t.UTC().Format(time.RFC3339Nano)
	case time.Time:
		return t.UTC().Format(time.RFC3339Nano)
	default:
		return v
	}
}

func (s *SQLStore) scanRecord(row rowScanner) (Record, error) {
	var rec Record
	var lastSeen, created, updated any
	err := row.Scan(&rec.ID, &rec.Name, &rec.Host, &rec.Port, &rec.Username, &rec.AuthType, &rec.Status, &rec.LastError, &lastSeen, &created, &updated)
	if err != nil {
		return Record{}, err
	}
	if lastSeen != nil {
		t, err := parseDBTime(lastSeen)
		if err != nil {
			return Record{}, err
		}
		if !t.IsZero() {
			rec.LastSeen = &t
		}
	}
	rec.CreatedAt, err = parseDBTime(created)
	if err != nil {
		return Record{}, err
	}
	rec.UpdatedAt, err = parseDBTime(updated)
	if err != nil {
		return Record{}, err
	}
	return rec, nil
}

func parseDBTime(v any) (time.Time, error) {
	switch t := v.(type) {
	case nil:
		return time.Time{}, nil
	case time.Time:
		return t, nil
	case string:
		if t == "" {
			return time.Time{}, nil
		}
		for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05.999999999-07:00", "2006-01-02 15:04:05"} {
			if parsed, err := time.Parse(layout, t); err == nil {
				return parsed, nil
			}
		}
		return time.Time{}, fmt.Errorf("parse time %q", t)
	case []byte:
		return parseDBTime(string(t))
	default:
		return time.Time{}, fmt.Errorf("unsupported time type %T", v)
	}
}
