#!/usr/bin/env bash
set -euo pipefail

if [[ "${PIT_LOCAL_PG_PORT:-}" != 55439 || "${PIT_TEST_RPC_URL:-}" != http://127.0.0.1:58545 ]]; then
  echo 'DISPOSABLE_LOCAL_POSTGRES_AND_ANVIL_REQUIRED' >&2; exit 2
fi
binary="${PIT_LOCAL_RUST_BIN:?set the local Rust debug binary path}"
[[ "$binary" = /* && -x "$binary" ]] || { echo 'LOCAL_BINARY_REQUIRED' >&2; exit 2; }
export PGHOST=127.0.0.1 PGPORT=55439 PGUSER=corio
database=pit_v21_process_race
first_pid='' second_pid=''
cleanup(){
  for pid in "$first_pid" "$second_pid"; do if [[ -n "$pid" ]]; then kill "$pid" >/dev/null 2>&1 || true; wait "$pid" >/dev/null 2>&1 || true; fi; done
  dropdb --if-exists "$database" >/dev/null 2>&1 || true
}
trap cleanup EXIT
dropdb --if-exists "$database" >/dev/null 2>&1 || true
createdb "$database"
export PIT_DATABASE_URL="postgres://corio@127.0.0.1:55439/$database"
export PIT_DEPLOYMENT_CLASS=local PIT_LOCAL_RPC_URL="$PIT_TEST_RPC_URL" PIT_NFT_FETCH_ENABLED=0
export PIT_BACKEND_INVITE_SHA256=81587fa0195b818684585ffdc8a79352b09fe1dcfb7e13a5c62cf1807e64097f
export PIT_EDGE_HMAC_KEY=local_test_key_32_bytes_long_aaaaaaaa PIT_ALLOWED_ORIGIN=http://127.0.0.1:4300
"$binary" migrate
psql -X -q -v ON_ERROR_STOP=1 -d "$database" <<'SQL'
INSERT INTO pit_jobs(id,kind,access_hash,invite_hash,input_json,status)
VALUES('44444444-4444-4444-8444-444444444444','events',repeat('a',64),repeat('b',64),
'{"chain":"base-sepolia","contract":"0x1111111111111111111111111111111111111111","fromBlock":1,"toBlock":1}','QUEUED');
SQL
"$binary" worker >/tmp/pit-v21-worker-a.log 2>&1 & first_pid=$!
"$binary" worker >/tmp/pit-v21-worker-b.log 2>&1 & second_pid=$!
state=''
for _ in $(seq 1 30); do
  state="$(psql -X -At -d "$database" -c "SELECT status || ':' || attempts FROM pit_jobs WHERE id='44444444-4444-4444-8444-444444444444'")"
  [[ "$state" == 'COMPLETED:1' ]] && break
  [[ "$state" == FAILED:* ]] && break
  sleep 1
done
[[ "$state" == 'COMPLETED:1' ]] || { echo "TWO_WORKER_CLAIM_FAIL state=$state" >&2; exit 1; }
echo 'PIT_TWO_WORKER_PROCESS_CLAIM_PASS status=COMPLETED attempts=1'
