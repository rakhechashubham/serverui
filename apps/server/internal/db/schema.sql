-- servers and credentials

CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 22,
    username TEXT NOT NULL,
    auth_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unknown',
    last_error TEXT NOT NULL DEFAULT '',
    last_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS server_credentials (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL UNIQUE REFERENCES servers(id) ON DELETE CASCADE,
    auth_type TEXT NOT NULL,
    encrypted_secret TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS server_credentials_server_id_idx ON server_credentials (server_id);
