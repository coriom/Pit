#!/usr/bin/env bash
set -euo pipefail

# Disposable local-only V1 backup -> restored V2 additive migration check.
: "${PIT_LOCAL_PG_PORT:?set PIT_LOCAL_PG_PORT to 55439}"
if [[ "$PIT_LOCAL_PG_PORT" != 55439 ]]; then echo 'LOCAL_POSTGRES_ONLY' >&2; exit 2; fi
export PGHOST=127.0.0.1 PGPORT="$PIT_LOCAL_PG_PORT" PGUSER=corio
source_db="pit_v21_v1_fixture"
restored_db="pit_v21_v1_restored"
dump="$(mktemp /tmp/pit-v21-v1-restore.XXXXXX.dump)"
cleanup() { dropdb --if-exists "$source_db" >/dev/null 2>&1 || true; dropdb --if-exists "$restored_db" >/dev/null 2>&1 || true; rm -f "$dump"; }
trap cleanup EXIT
dropdb --if-exists "$source_db" >/dev/null 2>&1 || true
dropdb --if-exists "$restored_db" >/dev/null 2>&1 || true
createdb "$source_db"
psql -X -q -v ON_ERROR_STOP=1 -d "$source_db" -f ../backend/migrations/001_init.sql
psql -X -q -v ON_ERROR_STOP=1 -d "$source_db" -f ../backend/migrations/002_edge_nonces.sql
psql -X -q -v ON_ERROR_STOP=1 -d "$source_db" <<'SQL'
INSERT INTO pit_jobs(id,kind,access_hash,invite_hash,input_json,status,progress_json,result_json,idempotency_key)
VALUES('11111111-1111-4111-8111-111111111111','events',repeat('a',64),repeat('b',64),'{"chain":"base-sepolia"}','PARTIAL',
'{"coverage":[{"from":1,"to":2,"toHash":"0xabc"}],"completed":[[1,2]],"events":[]}',
'{"status":"PARTIAL","missing":[{"from":3,"to":4}]}','restore_job_key_1234');
INSERT INTO pit_monitors(id,access_hash,invite_hash,chain,contract,rule_json,cursor_block,cursor_hash,expires_at)
VALUES('22222222-2222-4222-8222-222222222222',repeat('c',64),repeat('b',64),'base-sepolia',
'0x1111111111111111111111111111111111111111','{"type":"mint"}',42,'0xabc',now()+interval '1 day');
INSERT INTO pit_alerts(id,monitor_id,chain_id,block_hash,block_number,transaction_hash,log_index,event_json)
VALUES('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222',84532,'0xabc',42,'0xdef',0,'{"event":"Transfer"}');
INSERT INTO pit_edge_nonces(nonce,expires_at) VALUES('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',now()+interval '1 minute');
INSERT INTO pit_jobs(id,kind,access_hash,invite_hash,input_json,status,progress_json,result_json,attempts,lease_until,claim_token)
VALUES
('44444444-4444-4444-8444-444444444444','events',repeat('d',64),repeat('b',64),'{"chain":"base-sepolia"}','QUEUED','{}',NULL,0,NULL,NULL),
('55555555-5555-4555-8555-555555555555','events',repeat('e',64),repeat('b',64),'{"chain":"base-sepolia"}','RUNNING','{"coverage":[{"from":1,"to":2,"toHash":"0xabc"}],"events":[]}',NULL,1,now()-interval '1 minute','77777777-7777-4777-8777-777777777777'),
('66666666-6666-4666-8666-666666666666','permissions',repeat('f',64),repeat('b',64),'{"chain":"base-sepolia"}','FAILED','{}',NULL,2,NULL,NULL),
('77777777-7777-4777-8777-777777777778','distribution',repeat('1',64),repeat('b',64),'{"chain":"base-sepolia"}','COMPLETED','{}','{"status":"VERIFIED","expectedTotal":"3"}',1,NULL,NULL),
('88888888-8888-4888-8888-888888888888','nft',repeat('2',64),repeat('b',64),'{"chain":"base-sepolia"}','EXPIRED','{}',NULL,1,NULL,NULL);
UPDATE pit_jobs SET error_code='RPC_UNAVAILABLE' WHERE id='66666666-6666-4666-8666-666666666666';
INSERT INTO pit_deliveries(id,alert_id,email,status,attempts)
VALUES('99999999-9999-4999-8999-999999999999','33333333-3333-4333-8333-333333333333','fixture@example.invalid','QUEUED',1);
SQL
pg_dump -Fc -f "$dump" "$source_db"
createdb "$restored_db"
pg_restore -e -d "$restored_db" "$dump"
psql -X -q -v ON_ERROR_STOP=1 -d "$restored_db" -f migrations/003_retry_schedule.sql
export PIT_TEST_RESTORE_DATABASE_URL="postgres://corio@127.0.0.1:55439/$restored_db"
CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/tmp/pit-v2-nextjs-rust/backend-rust/target}" cargo test --offline restored_v1_schema_and_records -- --nocapture
if psql -X -q -v ON_ERROR_STOP=1 -d "$restored_db" -c 'BEGIN; ALTER TABLE pit_jobs ADD COLUMN migration_probe text; SELECT 1/0; COMMIT;' >/dev/null 2>&1; then
  echo 'MIGRATION_FAILURE_TEST_FAILED' >&2; exit 1
fi
probe="$(psql -X -q -v ON_ERROR_STOP=1 -d "$restored_db" -Atc "SELECT count(*) FROM information_schema.columns WHERE table_name='pit_jobs' AND column_name='migration_probe'")"
test "$probe" = 0
psql -X -q -v ON_ERROR_STOP=1 -d "$restored_db" -f migrations/003_retry_schedule.sql
test "$(psql -X -q -v ON_ERROR_STOP=1 -d "$restored_db" -Atc 'SELECT count(*) FROM pit_jobs')" = 6
echo 'MIGRATION_FAILURE_RECOVERY_PASS'
echo 'PIT_V1_BACKUP_RESTORE_V2_ADDITIVE_PASS'
