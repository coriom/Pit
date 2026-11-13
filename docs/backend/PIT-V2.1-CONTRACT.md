# PIT Crypto V2.1 local compatibility contract

Source of truth: `backend/src/api.mjs`, `backend-rust/src/api.rs`, the V1 migrations in `backend/migrations`, and V2 additive migration `backend-rust/migrations/003_retry_schedule.sql`. This document describes the local migration contract; it does not authorize a hosted cutover.

| Method | Route under `/pit/api/v1` | Creation/access | Successful response | Other material responses |
| --- | --- | --- | --- | --- |
| GET | `/health` | Signed edge request; loopback health probe may omit it | 200 `UP` | 403 bad signature |
| GET | `/ready` | Same as health | 200 `READY` | 503 worker unavailable |
| POST | `/jobs` | Edge HMAC + one-time nonce + invitation + idempotency key | 202 job ID, capability, `QUEUED` | 400 validation, 403 invite/edge, 409 duplicate, 429 quota, 503 NFT disabled |
| GET | `/jobs/:id` | Edge HMAC + job capability | 200 status, progress, result, error code, expiry | 404 unknown or wrong capability; 400 invalid cursor |
| POST | `/jobs/:id/cancel` | Edge HMAC + job capability | 200 `CANCELLED` or current terminal status | 404 unknown or wrong capability |
| DELETE | `/jobs/:id` | Edge HMAC + job capability | 200 `DELETED` | 404 unknown or wrong capability |
| GET | `/jobs/:id/export?format=csv|json` | Edge HMAC + job capability | 200 attachment; full result | 404 wrong capability; 409 result pending; 400 invalid format |
| POST | `/monitors` | Edge HMAC + invitation + idempotency key | 202 monitor ID, capability, `ACTIVE`, 72 h lifetime | 400 validation, 403 email/edge, 409 duplicate, 429 quota |
| GET | `/monitors/:id` | Edge HMAC + monitor capability | 200 rule, cursor, state, expiry | 404 unknown or wrong capability |
| POST | `/monitors/:id/pause` | Edge HMAC + monitor capability | 200 `PAUSED` | 404 wrong capability |
| POST | `/monitors/:id/resume` | Edge HMAC + monitor capability | 200 `ACTIVE` if unexpired | 404 wrong capability |
| DELETE | `/monitors/:id` | Edge HMAC + monitor capability | 200 `DELETED` | 404 wrong capability |
| GET | `/monitors/:id/alerts` | Edge HMAC + monitor capability | 200 most recent 100 alerts | 404 wrong capability |

All protected requests sign the exact method, path plus query, timestamp, 32-hex nonce and SHA-256 of the raw body. The edge key stays on the server side of the Next.js gateway. A 256 KiB body limit applies. Job creation is capped at 10/minute and 20/day per invitation; monitor creation at one/minute and three active monitors. Jobs expire after 24 h and monitors after 72 h. The worker removes expired rows. Capabilities are stored as hashes. An ID alone is not an access grant.

Event GET pagination is `offset` 0–5000 and `limit` 1–100; default 0/50. V1 silently clamped malformed page values. V2 rejects malformed, duplicate, unknown or out-of-range page parameters with `PAGINATION_INVALID` 400. This intentional stricter behavior prevents ambiguous signed queries. Export returns the entire result, including when the display is paged. V2 restores V1's attachment filename and all-cell quoted CSV convention.

Event scans have a requested range, verified completed intervals, missing intervals, per-interval canonical end block hashes and an explicit `COMPLETE` or `PARTIAL` result. A lease owner persists a checkpoint after each verified interval. A resumed scan checks canonical hashes before skipping work. Public RPCs can silently truncate results below a provider's reported limit; a conforming `eth_getLogs` response remains an external assumption and is stated in the result.

The V2 migration adds only `pit_jobs.next_attempt_at` and a retry index to the V1 schema. V1 and V2 must not write concurrently to the same live database without a separate compatibility decision. V2's local restore check uses a disposable V1 dump with a job, monitor cursor, alert and nonce.

Hosted NFT fetching is disabled. Only the explicit local test class can enable the one loopback metadata fixture origin. The production candidate has `PIT_NFT_FETCH_ENABLED=0` for API and worker. External email delivery is likewise unqualified; local SMTP sink tests only prove adapter behavior.
