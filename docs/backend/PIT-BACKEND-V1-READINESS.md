# PIT Crypto Backend V1 — acceptance and Netcup gate

Source branch: `feat/pit-backend-v1`; exact commit is recorded after final validation. The existing 151 Toolbox experiences, 28 Explorer inspections, 18 Operations routes and static hosted preview remain separate. Five new routes are produced only by the explicit backend-enabled Operations build.

## Local functional evidence

The local test harness deploys disposable ERC-20, permission and NFT fixtures on Anvil chain ID 84532. PostgreSQL 16 stores jobs, monitors, alerts and deliveries. Tests compare real receipts/logs and actual token balances; a local HTTP fixture supplies NFT metadata through an injected test fetcher, while production HTTP fetches use the pinned public-IP policy. A local SMTP sink receives an alert for a transfer emitted after monitor creation. Restart recovery uses a new PostgreSQL pool and a leased job. Chromium/Firefox browser tests submit a real local event job through the API and worker.

Read-only Base Sepolia probe against `base-sepolia-rpc.publicnode.com` was attempted but could not connect from this execution environment (`ENETUNREACH`/timeout). No external write was attempted. Public-chain compatibility and free-provider retention must be checked from an authorized network before deployment.

## Security and privacy controls

No signing or arbitrary RPC proxy. Chains are restricted to Ethereum (1), Base (8453), Base Sepolia (84532) with fixed allowlisted public RPC hosts. Invitation hash required to create work; random capability hash required to read, export or manage private work. SQL queries are parameterized; job IDs alone do not grant access. Inputs, concurrency, RPC calls, downloads and retention are bounded. CSV exports escape spreadsheet formulas. Untrusted NFT URLs use HTTPS/IPFS only, public DNS validation, connection-time address pinning, no redirects, timeout and byte cap. No user-supplied webhook. Worker reads confirmed chain history and records canonical block identity; partial work is never marked complete. The browser preview exposes no blockchain signing path.

Known limitations: public RPCs may silently truncate logs or lack archive balances; event-derived permissions cannot prove absent privileges; nonstandard token balances can be ambiguous; accessible NFT media is not proof of permanent pinning; delivered emails cannot be recalled after a reorg. These are shown in report outputs. No independent security audit was performed.

## VPS and routing observations

- Netcup public IP TLS certificate observed read-only on 2026-11-06: Let's Encrypt YR1, valid 2026-11-03 14:20:05 UTC to **2026-11-10 06:20:04 UTC**, SAN IP `94.16.113.122`. First actual renewal remains unverified.
- Read-only SSH as root with strict known-host checking returned `Permission denied (publickey,password)`. Actual VPS free memory, CPU load, container usage, disk, PostgreSQL usage and backup headroom are **not measured**. Local host metrics are not VPS metrics.
- Proposed API path `/pit/api/v1` is distinct from the reported HBI `/hbi/api`; actual Traefik labels, network attachments and path-prefix behavior are not verified. The Compose file exposes no route or host port.
- Docker build and Compose syntax were checked locally. The proposed containers total at most 1.25 CPU and 1.25 GiB RAM, excluding Docker/proxy overhead. Spare capacity and incremental cost are **unknown**, not assumed to be zero.

## Deployment gate

`NETCUP_DEPLOYMENT = BLOCKED`. Required read-only prerequisites: actual VPS capacity/container metrics; valid renewed TLS; reviewed Coolify project/network/route and no overlap with HBI; PIT-only database credentials and backup target; immutable GHCR image digest; exact source commit and Compose hash; approved frontend origin and private beta invite policy; outbound SMTP choice if email is required. After those are measured, prepare a canonical deployment manifest and request a new hash-bound GO. No GO hash is generated from incomplete inputs.
