package servers

import (
	"context"
	"database/sql"
	"errors"
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
	db *sql.DB
}

func NewSQLStore(db *sql.DB) *SQLStore {
	return &SQLStore{db: db}
}

func (s *SQLStore) Create(ctx context.Context, rec Record, cred Credential) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	_, err = tx.ExecContext(ctx, `
		INSERT INTO servers (id, name, host, port, username, auth_type, status, last_error, last_seen, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
	`, rec.ID, rec.Name, rec.Host, rec.Port, rec.Username, rec.AuthType, rec.Status, rec.LastError, rec.LastSeen, rec.CreatedAt, rec.UpdatedAt)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO server_credentials (id, server_id, auth_type, encrypted_secret, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6)
	`, cred.ID, cred.ServerID, cred.AuthType, cred.EncryptedSecret, cred.CreatedAt, cred.UpdatedAt)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *SQLStore) Get(ctx context.Context, id string) (Record, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, name, host, port, username, auth_type, status, last_error, last_seen, created_at, updated_at
		FROM servers WHERE id = $1
	`, id)
	rec, err := scanRecord(row)
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
		rec, err := scanRecord(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (s *SQLStore) Update(ctx context.Context, rec Record) error {
	res, err := s.db.ExecContext(ctx, `
		UPDATE servers
		SET name=$2, host=$3, port=$4, username=$5, auth_type=$6, status=$7, last_error=$8, last_seen=$9, updated_at=$10
		WHERE id=$1
	`, rec.ID, rec.Name, rec.Host, rec.Port, rec.Username, rec.AuthType, rec.Status, rec.LastError, rec.LastSeen, rec.UpdatedAt)
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
	res, err := s.db.ExecContext(ctx, `DELETE FROM servers WHERE id=$1`, id)
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
	row := s.db.QueryRowContext(ctx, `
		SELECT id, server_id, auth_type, encrypted_secret, created_at, updated_at
		FROM server_credentials WHERE server_id=$1
	`, serverID)
	var cred Credential
	err := row.Scan(&cred.ID, &cred.ServerID, &cred.AuthType, &cred.EncryptedSecret, &cred.CreatedAt, &cred.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Credential{}, ErrNotFound
	}
	return cred, err
}

func (s *SQLStore) UpsertCredential(ctx context.Context, cred Credential) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO server_credentials (id, server_id, auth_type, encrypted_secret, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (server_id) DO UPDATE SET
			auth_type=EXCLUDED.auth_type,
			encrypted_secret=EXCLUDED.encrypted_secret,
			updated_at=EXCLUDED.updated_at
	`, cred.ID, cred.ServerID, cred.AuthType, cred.EncryptedSecret, cred.CreatedAt, cred.UpdatedAt)
	return err
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanRecord(row rowScanner) (Record, error) {
	var rec Record
	var lastSeen sql.NullTime
	err := row.Scan(&rec.ID, &rec.Name, &rec.Host, &rec.Port, &rec.Username, &rec.AuthType, &rec.Status, &rec.LastError, &lastSeen, &rec.CreatedAt, &rec.UpdatedAt)
	if err != nil {
		return Record{}, err
	}
	if lastSeen.Valid {
		t := lastSeen.Time
		rec.LastSeen = &t
	}
	return rec, nil
}
