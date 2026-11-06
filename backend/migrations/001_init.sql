BEGIN;
CREATE TABLE IF NOT EXISTS pit_jobs (
 id uuid PRIMARY KEY, kind text NOT NULL CHECK (kind IN ('events','permissions','distribution','nft')),
 access_hash text NOT NULL, invite_hash text NOT NULL, input_json jsonb NOT NULL,
 status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','COMPLETED','PARTIAL','FAILED','CANCELLED','EXPIRED')),
 progress_json jsonb NOT NULL DEFAULT '{}'::jsonb, result_json jsonb, error_code text,
 attempts integer NOT NULL DEFAULT 0, lease_until timestamptz, claim_token uuid, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 idempotency_key text,
 UNIQUE(invite_hash,idempotency_key)
);
CREATE INDEX IF NOT EXISTS pit_jobs_claim ON pit_jobs(status,lease_until,created_at);
CREATE INDEX IF NOT EXISTS pit_jobs_expiry ON pit_jobs(expires_at);
CREATE TABLE IF NOT EXISTS pit_monitors (
 id uuid PRIMARY KEY, access_hash text NOT NULL, invite_hash text NOT NULL,
 chain text NOT NULL, contract text NOT NULL, rule_json jsonb NOT NULL,
 cursor_block bigint NOT NULL, cursor_hash text, status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PAUSED','EXPIRED')),
 email text, next_poll_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token uuid,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), idempotency_key text,
 UNIQUE(invite_hash,idempotency_key)
);
CREATE INDEX IF NOT EXISTS pit_monitors_poll ON pit_monitors(status,next_poll_at,lease_until);
CREATE TABLE IF NOT EXISTS pit_alerts (
 id uuid PRIMARY KEY, monitor_id uuid NOT NULL REFERENCES pit_monitors(id) ON DELETE CASCADE,
 chain_id integer NOT NULL, block_hash text NOT NULL, block_number bigint NOT NULL,
 transaction_hash text NOT NULL, log_index integer NOT NULL,
 event_json jsonb NOT NULL, status text NOT NULL DEFAULT 'CONFIRMED', created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(monitor_id,chain_id,block_hash,transaction_hash,log_index)
);
CREATE INDEX IF NOT EXISTS pit_alerts_mon ON pit_alerts(monitor_id,created_at DESC);
CREATE TABLE IF NOT EXISTS pit_deliveries (
 id uuid PRIMARY KEY, alert_id uuid NOT NULL REFERENCES pit_alerts(id) ON DELETE CASCADE,
 email text NOT NULL, status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','SENT','FAILED')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
 UNIQUE(alert_id,email)
);
CREATE INDEX IF NOT EXISTS pit_deliveries_claim ON pit_deliveries(status,next_attempt_at);
CREATE TABLE IF NOT EXISTS pit_worker_heartbeat (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), last_seen timestamptz NOT NULL
);
COMMIT;
