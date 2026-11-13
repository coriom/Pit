BEGIN;
ALTER TABLE pit_jobs ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS pit_jobs_retry_claim ON pit_jobs(status,next_attempt_at,lease_until,created_at);
COMMIT;
