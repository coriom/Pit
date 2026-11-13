# PIT Crypto V2.1: local migration status

V2 is a separate Next.js dashboard and a Rust API/worker. It does not replace the deployed Node.js canary or modify its PostgreSQL database. The Astro Toolbox and Explorer remain unchanged.

## Verified locally

- Axum API and Tokio worker use the V1 PostgreSQL schema plus an additive retry scheduling migration. The API preserves signed gateway requests, one-time nonces, private invitations, scoped capabilities, idempotency and quotas.
- Event scans persist verified range checkpoints and canonical hashes, resume after interruption, expose missing intervals, decode standard user ABI event fragments, and page results. A missing `anonymous` ABI field is interpreted as `false`, as in a standard non-anonymous fragment.
- Chromium and Firefox completed real browser to Next.js to Rust API to worker to PostgreSQL journeys for events, permissions, distribution, monitoring and local NFT metadata. Mobile Chromium exercised event, permission, distribution and local NFT forms.
- Rust integration tests use Anvil transactions, a local metadata server and SMTP sink. Two separate worker processes claimed one job once. A disposable V1 PostgreSQL backup was restored and read after the V2 additive migration.
- The V2 Compose candidate has dedicated data and RPC networks, no published ports or Traefik routers, and 0.25/0.5/0.5 CPU and 256/512/512 MiB limits for API/worker/database. Its source render is checked before any future hosted materialization.

## Release boundaries

- Hosted NFT fetching remains disabled. Local fixture protection does not establish independent hosted egress isolation.
- Local SMTP delivery does not establish external email delivery. No public dashboard or API is deployed.
- Node V1 and Rust V2 must not write the same live database without a separate compatibility decision. The local restore test covers representative V1 jobs, monitor cursor, alert and nonce, not every historic production record.
- The V2 image is a local artifact until an immutable registry digest is published and independently verified. A local Compose render is not a Coolify-generated deployment configuration.
- Performance measurements are bounded, local and mostly I/O-sensitive. No production throughput or sustained resource guarantee is inferred from them.

Keep the Node V1 canary as the known-good rollback candidate. A later V2 private canary needs a separate database, Coolify-generated Compose validation, network checks, hosted smoke and explicit deployment approval.
