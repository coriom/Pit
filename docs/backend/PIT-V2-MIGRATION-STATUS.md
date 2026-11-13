# PIT Crypto V2: local migration status

This branch adds a separate Next.js dashboard and a Rust API/worker. It does not replace the deployed Node.js canary or modify its database. The Astro Toolbox and Explorer remain in place.

## Implemented and locally exercised

- The Rust binary runs in API, worker, migration and healthcheck modes. Axum serves `/pit/api/v1`; Tokio and PostgreSQL run the durable queue. Alloy transports bounded, read-only EVM RPC calls.
- The Rust database starts from the unchanged V1 schema migrations and adds only `next_attempt_at` for retry scheduling. Tests use a disposable database and local Anvil.
- The dashboard has five tool routes. The four hosted-eligible workflows submit to the Rust API through a server-side Next gateway; the hosted NFT button is disabled. The gateway HMAC key stays server-side.
- A local integration test deployed ERC-20, permissions and NFT fixtures to Anvil. It checked actual log coverage, exact distribution accounting, ownership, NFT metadata parsing, HMAC/replay rejection, PostgreSQL persistence, monitoring and delivery to a local SMTP sink.
- The Node V1 and Rust V2 material comparison passed on the same Anvil fixture for event history, permissions and distribution. Chromium, Firefox and mobile Chromium exercised browser → Next → Rust API → worker → PostgreSQL on local fixtures for event, permissions, distribution and monitor workflows.

## Gaps before V1 replacement

- Full API contract parity is not established. Event scans do not yet persist range checkpoints or decode a user-supplied ABI. Result pagination, every V1 error semantic, comprehensive proxy/role analysis and all monitor rules require equivalent fixture comparison.
- NFT metadata processing was tested with a local injected fetcher, but a real browser → API → worker → HTTP metadata journey was not completed. Hosted NFT fetching remains disabled. Independent outbound isolation is still required before it can be enabled on Netcup.
- Worker lease recovery, retries and cancellation have code paths but do not yet have the full crash/concurrency matrix requested for a replacement decision. V1-compatible database restoration and a mixed V1/V2 concurrency test are outstanding.
- Email delivery was verified only against a local SMTP sink. No external delivery provider is configured.
- The V2 Docker image has not been published. The Compose file is source-only and has not been materialized by Coolify; its image reference must be an actual immutable digest before deployment. No VPS capacity or network observations were made for V2.
- Comparable Node/Rust latency, RSS and CPU benchmarks were not completed. No performance improvement is claimed.

## Cutover boundary

Keep Node V1 as the known-good internal canary. Finish the contract and security gaps, then build and scan an immutable V2 image, run a separate private V2 canary with a new database and validated Coolify-generated Compose, perform hosted smoke and resource measurements, and obtain separate deployment approval. Never attach V2 to the writable V1 database by default.

No public API, payments, signing, externally broadcast transactions or production data migration are enabled by this branch.
