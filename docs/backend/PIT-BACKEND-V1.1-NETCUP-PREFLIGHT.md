# PIT Crypto backend V1.1 — Netcup preflight

Status: **local candidate; production deployment blocked**. No VPS service, route, database, Cloudflare Worker or blockchain state was changed during this preflight. This document records bounded observations from 2026-11-06, not a long-term capacity guarantee.

## VPS read-only observations

- Existing `deopt-vps` SSH alias authenticated as the existing unprivileged operator account. No new key or host configuration was created.
- Memory: 7,947 MiB total, 6,331 MiB available; swap 0. Root filesystem: 157 GiB total, 11 GiB used, 139 GiB available (8% used). Load averages: 0.19 / 0.29 / 0.35. Three one-second CPU samples were 89%, 97% and 92% idle. Memory PSI `some avg60=0.00`, CPU PSI `some avg60=1.69`.
- These are point-in-time host readings. The account cannot read the Docker socket and non-interactive `sudo` is unavailable. Container memory, CPU, restart/OOM history, volume use, real Coolify labels and networks were **not** verified. The proposed 1.25 vCPU / 1.25 GiB steady-state caps are therefore not yet approved as safe for the shared host.
- Only ports 80/443 are public in the observed listener snapshot; Coolify port 8000 listens on loopback. No PIT API route exists. `/hbi/api/health` returned 200 with certificate validation bypassed for diagnosis; `/pit/api/v1/health` returned 503. This does not establish a safe route or HBI health through trusted TLS.

## TLS and routing gate

Both public and VPS-loopback HTTPS served a Let's Encrypt **staging** Ersatz Emmer YR2 certificate for the VPS IP. It was valid from 2026-11-03 14:18:44 UTC to 2026-11-10 06:18:43 UTC, fingerprint `F6:1C:5F:CB:7D:E7:EB:9B:BC:26:45:08:9D:C5:22:1A:F2:DB:1B:F2:7C:8B:BA:C6:AC:F2:42:44:2A:66:64:F4`. `openssl` verification and normal `curl` both rejected the issuer chain. This is **not** evidence of a successful trusted renewal. The existing shared proxy owner must restore a publicly trusted certificate and demonstrate renewal before any PIT API exposure. PIT must not change shared ACME or restart Traefik as part of this candidate.

The Compose file deliberately has no Traefik route or host port. A later deployment review must inspect actual Coolify-generated labels/network attachments and confirm a protected `/pit/api` route, host rule, TLS entrypoint, prefix handling, priority, health route and absence of bypasses. The API, worker and PostgreSQL must remain isolated from other projects.

## Public RPC read-only checks

Bounded calls from the VPS succeeded with validated HTTPS and a named user agent:

| Network | `eth_chainId` | Head at probe | Bounded evidence |
| --- | ---: | ---: | --- |
| Ethereum | 1 | 26,355,628 | One-block Circle USDC `eth_getLogs` at block 26,355,666 returned 8 logs. |
| Base | 8453 | 53,877,570 | One-block Circle USDC `eth_getLogs` at block 53,880,594 returned 5 logs. |
| Base Sepolia | 84532 | 55,220,105 | Known PIT receipt at block 51,706,958 had status 1 and 8 receipt logs; bounded router `eth_getLogs` returned 2 matching logs. |

The one-block log heights are historical relative to the separate head snapshot and must not be interpreted as simultaneous heads. An initial Base Sepolia request received HTTP 403 without the named user agent; the bounded repeat succeeded. These checks establish basic read compatibility, not guaranteed archive history, rate limit, future availability or production throughput. The service retains explicit partial-coverage reporting.

## Access and isolation design

The proposed `backend/edge/worker.mjs` verifies an exact Cloudflare Access JWT issuer, audience, signature and approved email before forwarding requests. It adds a time-bound HMAC over request method, path and body hash. The API rejects direct unsigned requests in production; invite and capability tokens remain scoped to creation and private results. No shared browser API secret is included in the build. This edge Worker is **not deployed**. Its exact Access application, hostname and origin routing require a separate deployment review; Cloudflare Access on the static PIT staging does not protect an independent Netcup origin by itself.

The API allows at most 10 jobs/minute, 20 jobs/day, one monitor/minute and three active monitors per invite, with bounded input/work and expiry. External email is disabled unless exact allowed recipients and SMTP are configured; local sink delivery is not external email qualification. The NFT fetcher validates schemes, DNS addresses, connection IP and redirect behavior. A Docker bridge with egress is not a network firewall. Production metadata fetches on the shared VPS additionally require a reviewed egress policy or isolated proxy that blocks host, Docker, private and metadata-service destinations even if application checks fail.

Compose uses a dedicated PIT database/volume/internal network, immutable image digests, no public database/worker port, read-only Node filesystems, non-root Node user, dropped capabilities, bounded memory/CPU/PIDs, health checks and rotated JSON logs. The required image digests are not yet published or verified. Do not replace them with a mutable tag.

## Backup, rollback and deployment gates

The PIT-only PostgreSQL custom-format dump and disposable restore were tested locally. A live backup schedule and retention policy remain to be created after deployment authorization, with PIT-only credentials and encrypted off-host storage. Before any migration, retain the previous immutable backend image and a PIT-only backup. Verify restore in a disposable PIT database. Never use another project's database or backup schedule.

The following evidence is still required before a Netcup deployment authorization hash can be constructed:

1. Publicly trusted shared TLS and successful renewal evidence from the existing proxy owner.
2. A read-only privileged Docker/Coolify snapshot of actual container limits, usage, restarts, OOMs, networks, labels and volumes; review the PIT resource allocation against it.
3. Published immutable backend and PostgreSQL image digests; image vulnerability/SBOM review against the frozen source commit.
4. Exact protected API hostname/route and Cloudflare Access application, with an independently tested origin bypass denial and static staging change authorization.
5. Reviewed host-level egress restriction for untrusted metadata fetches and a PIT-only backup destination/schedule.

No `GO PIT BACKEND NETCUP` manifest is issued while these material values and conditions are unresolved. A GitHub source push does not grant deployment authorization.
