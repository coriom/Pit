# PIT Crypto backend V1 (private beta candidate)

This is a separate read-only data service. It never signs or broadcasts transactions. The ordinary PIT Free/Toolbox/staging builds do not include its five pages. Build the separate Operations preview only with `PIT_BACKEND_ENABLED=1` and an explicit `PIT_BACKEND_API_ORIGIN`.

## Local run

Requirements: Node 22, PostgreSQL 16, Anvil for integration tests. Run `npm ci --prefix backend`, set a PIT-only `PIT_DATABASE_URL`, then `npm run --prefix backend migrate`. Start `npm run --prefix backend api` and `npm run --prefix backend worker` as separate processes. The API refuses startup without a SHA-256 invite hash and an approved browser origin. No real invite code or database password belongs in Git.

`PIT_BACKEND_INVITE_SHA256` is the lowercase hex SHA-256 of a private beta invite; pass the original invite in `X-PIT-Invite` only when creating a job or monitor. Job and monitor creation returns a random 256-bit bearer capability. Only its SHA-256 is stored. Send `Authorization: Bearer <capability>` to read, export, cancel, pause, resume, or delete. Losing the capability means losing access. Job results expire after 24 hours; monitors and their alerts/deliveries expire after 72 hours. `DELETE` removes either resource immediately. In the browser, the capability is held in session storage for the current tab and can be re-entered after a reload. Treat it like a password.

Endpoints under `/pit/api/v1`:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health`, `/ready` | Process and DB/worker readiness |
| POST | `/jobs` | Create `events`, `permissions`, `distribution`, `nft` job |
| GET | `/jobs/:id` | Status, progress and result (event pages of at most 100) |
| GET | `/jobs/:id/export?format=csv\|json` | Private evidence export |
| POST | `/jobs/:id/cancel` | Cancel queued/running work |
| DELETE | `/jobs/:id` | Erase input and result |
| POST | `/monitors` | Create bounded confirmed-event monitor |
| GET | `/monitors/:id`, `/monitors/:id/alerts` | Monitor and inbox |
| POST | `/monitors/:id/pause`, `/monitors/:id/resume` | Control polling |
| DELETE | `/monitors/:id` | Erase monitor, alerts and deliveries |

Creation requires an `Idempotency-Key` (16–100 URL-safe characters) for both jobs and monitors. On replay, the API returns `409 ALREADY_SUBMITTED` with the existing ID and never returns the private capability a second time. Request bodies are capped at 256 KiB. One invite can create at most 10 jobs/minute, 20 jobs/day, one monitor/minute and three active monitors. Ranges are capped at 20,000 blocks, 5,000 events, 120 log requests, 20 transaction hashes, 500 CSV recipients, and 25 NFT token IDs. A monitor polls at most 500 confirmed blocks at a time and pauses on more than 20 matching alerts in one poll. Email deliveries are capped at 50 per monitor/day. These limits are safety ceilings, not throughput commitments.

Production API startup requires `PIT_EDGE_HMAC_KEY` (at least 32 bytes). The proposed edge Worker in `edge/worker.mjs` validates the Cloudflare Access JWT and exact approved email, then signs the method, path, timestamp, random nonce and body hash for the origin API. The API rejects unsigned requests and timestamps outside a 60-second window. It atomically claims each nonce in PostgreSQL and rejects replay; expired nonce rows are cleaned by the worker. Only loopback health/readiness bypass the signature. An invite remains necessary to create jobs or monitors, and private results require their own bearer capability. The edge Worker is a **proposal only**: it has not been deployed or attached to Access, and a public origin route must not be opened before its actual route, identity, replay and bypass behavior is verified. The shared HMAC key must be injected separately at the edge and API, never built into browser assets.

Email notifications are restricted to exact beta recipients listed in `PIT_EMAIL_ALLOWED_RECIPIENTS`; without this list, email monitor creation is denied. This prevents the private beta API from becoming an arbitrary mail relay. SMTP credentials and real delivery must be configured and verified separately.

## Evidence semantics

- Event scans report requested, completed and missing intervals. `COMPLETE` requires a conforming RPC response and canonical checked block hashes; public RPC retention or silent truncation can still limit confidence. A failed interval produces `PARTIAL`.
- Permissions reports recognized getters, EIP-1967 slots, role/ownership events and Sourcify v2 status. An inferred capability is never a universal audit. Role enumeration is incomplete when history does not start at deployment or misses a range.
- Distributions verify confirmed canonical receipts, exact token Transfer sums and historical balance deltas when the RPC supports them. `EVENT_MATCH_ONLY` is not certified delivery. Nonstandard, rebasing and fee-on-transfer tokens need separate review.
- NFT metadata supports HTTPS and IPFS gateway URIs only. DNS answers must all be public, and the chosen address is pinned for the connection. Redirects, private IPs, oversized bodies and unrecognized schemes are rejected. `OK` means accessible at scan time, not permanently pinned.
- Monitors persist cursors, alerts and notification deliveries in PostgreSQL. A reorg marks affected old alerts `REORGANIZED`; an email already delivered cannot be retracted. Real outbound email remains unverified until a delivery provider is configured and tested. Without SMTP configuration, the inbox still works and deliveries remain queued.

Workers claim rows using PostgreSQL `FOR UPDATE SKIP LOCKED` and a rotating lease token. A stale worker cannot persist a result after another worker reclaims its lease. Event progress and canonical interval hashes are checkpointed; recovery skips only intervals whose endpoint hashes still match the chain. This is an at-least-once read model with idempotent persisted results, not an exactly-once RPC call promise. The worker refreshes its database heartbeat during long jobs; its container healthcheck reads that heartbeat. Migrations `001_init.sql` and `002_edge_nonces.sql` run before the API/worker start.

## Isolated deployment candidate

`compose.backend.yml` defines a dedicated PIT database, private PIT network, separate egress network, API, worker and one-shot migration. No service joins an existing network, publishes a host port or advertises a Traefik route. All Traefik labels are explicitly disabled. It requires immutable, published GHCR and PostgreSQL image digests; it does not build an image during deployment. The backend Dockerfile builds only from the `backend/` context; `.dockerignore` excludes local dependencies and `.env` files. API and worker run as the non-root Node user with read-only filesystems and dropped Linux capabilities. PostgreSQL alone has a persistent PIT volume. Resource caps: API 0.25 CPU/256 MiB, worker 0.5 CPU/512 MiB, PostgreSQL 0.5 CPU/512 MiB. Migration is bounded separately. These are proposed caps, not proof of spare VPS capacity.

Before a future deployment, an operator must verify Docker/Coolify container metrics, PostgreSQL backup capacity, a publicly trusted TLS certificate, Coolify labels/networks and the exact `/pit/api` path. Only then can the API be attached to a reviewed proxy route; the database and worker remain private. A future image must be published by immutable GHCR digest from a frozen commit. A local image tag or GitHub push is not a deployment authorization. The `pit-egress` bridge alone does not restrict outgoing destinations; a separately reviewed network egress control is needed before user-selected NFT metadata fetches can run on the shared VPS.

Backup: stop API/worker or take a consistent PostgreSQL custom-format dump of `pit_crypto` via the PIT database resource; encrypt it outside Git; restore into a disposable PIT database; verify table counts and sample private results; then resume. Before a migration, keep both the previous immutable image digest and a PIT-only dump. Rollback restores the prior image and, if schema changed incompatibly, the PIT-only backup. `migrations/001_down.sql` is manual and destructive; use it only on a disposable/restored PIT database. Never restore into DeOpt or HBI Hub.

No public Netcup deployment, GHCR publication, SMTP credential, host route, live database or commercial payment is included in this source tree.
