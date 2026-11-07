BEGIN;
CREATE TABLE IF NOT EXISTS pit_edge_nonces (
  nonce text PRIMARY KEY CHECK (nonce ~ '^[a-f0-9]{32}$'),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS pit_edge_nonces_expiry ON pit_edge_nonces(expires_at);
COMMIT;
