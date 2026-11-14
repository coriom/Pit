# PIT Crypto V2.3 local qualification

Runtime source: `0427bbb39445f45a8f058e72be8c53d5173cc890`. Verified GHCR image: `ghcr.io/coriom/pit-rust-backend@sha256:af396343aabd7e4988d1fd9bdb4308848c79702a0a47baaab73ab043325b9e3d`. The previous image at `sha256:59e9e5d27f17e0d2b52b3b98dc680d2390e9e1b07674ba2d7b3a3236213d02f2` predates V2.3 runtime changes and must not be used for this candidate. The new image identity is bound in the [V2.3 internal canary manifest](../../deployments/netcup-v2-rust-internal-canary-v23.json). GHCR run `43543401239` passed its build, Trivy and SBOM gates; independent registry inspection returned the same digest, and a local pull confirmed the source label and UID.

## Implemented corrections

- NFT reports retain the first token ID for duplicate metadata and reject an unsafe media URI before invoking an injected fetcher. Local metadata timeouts have the stable `TIMEOUT` code.
- CSV exports preserve explicit JSON `null` as `null`, matching V1; absent fields remain empty.
- The worker survives transient heartbeat and cleanup database failures and retries on the next cycle. Expired jobs, monitors and nonces are cleaned in one transaction.
- The differential fixtures now cover NFT success, duplicates, invalid JSON, missing media, timeout, body limit and unsafe URI; HTTP comparison covers authentication, validation, pagination, capabilities, lifecycle, exports and monitor state changes. Recovery tests cover pre-checkpoint and post-checkpoint lease loss, retryable and terminal RPC failures, cancellation, cleanup, database interruption and concurrent quotas.

## Local acceptance

- Rust: 22 unit/integration tests passed with disposable PostgreSQL and Anvil; the separate V1 dump → restore → additive V2 migration test passed, including queued, running, completed, partial, failed, expired and cancelled jobs, checkpoints, monitors, alerts, deliveries, nonces and hashed capabilities. A restored V1 running job was recovered by the Rust worker. Migration failure rolled back and a retry succeeded.
- V1/V2 differential: events, permissions, distribution, NFT reports and monitor rules passed on the same local contracts and metadata fixtures. The direct HTTP comparison passed authentication/validation, job/result/export access, CSV/JSON, idempotency, pagination, cancellation, deletion and monitor transitions. Intentional differences: V2 rejects malformed pagination rather than V1's clamp; V2 rejects expired monitor capabilities where V1 serves them; V2 returns a stable `INVALID_JSON` code without echoing parser detail. Next.js uses valid bounded pagination and stable error codes.
- Security: actual Axum handlers and PostgreSQL rejected invalid/altered/expired HMAC requests, concurrent nonce replay, wrong/revoked/expired capabilities, unauthorized exports and cancellation, oversized input, arbitrary RPC selection, injection strings and concurrent quota bypass. Local NFT fixtures cover redirects, private IPv4/IPv6, rebinding answers, internal hostnames, timeout and size limits. Hosted NFT fetching remains disabled; local SSRF tests do not establish VPS egress isolation.
- Browser: nine live Next.js → Rust → worker → PostgreSQL tests passed across Chromium, Firefox and mobile Chromium, covering all five tools with local Anvil and NFT HTTP fixtures. Nine hosted-disabled dashboard tests passed across the same browsers. No external chain writes or external email were used.
- Existing PIT: `CI=1 pnpm release:check` passed with 581 Vitest, 102 Playwright, Astro build and 151 offline Toolbox tasks. Foundry passed. Payment and mainnet execution restrictions remain disabled.
- Local Docker Compose: API, worker and PostgreSQL were healthy, with no host port bindings or Traefik routers. Actual cgroups enforced 0.25 CPU/256 MiB, 0.5 CPU/512 MiB and 0.5 CPU/512 MiB. The internal data network contained only the three PIT containers; the RPC network contained API and worker. The runtime image ran as UID 65532. The disposable stack and volume were removed after testing. These checks do not prove future Coolify network behavior.
- Local image scan: pinned Trivy reported zero HIGH/CRITICAL findings for the Debian 12.15 distroless image. The binary has no dynamic `libssl` dependency. The CycloneDX report listed seven image components; static Rust crate dependencies are not fully represented by this image-only SBOM.

## Bounded performance

All runs used the same local Anvil event fixture and disposable PostgreSQL. Each workload had one warm-up and seven measured repetitions; HTTP health had 30 measured requests. These are local observations, not production throughput predictions.

| Workload | Node V1 | Rust V2 optimized |
| --- | ---: | ---: |
| Event scan median (range) | 9.51 ms (7.82–12.18) | 1.77 ms (1.47–2.07) |
| Full job median (range) | 14.21 ms (11.75–16.88) | 11.72 ms (9.41–20.56) |
| Decode 1,000 events median (range) | 31.82 ms (29.52–41.91) | 4.88 ms (3.89–5.19) |
| RPC head round trip median | 1.00 ms | 0.22 ms |
| PostgreSQL `SELECT 1` median | 0.29 ms | 0.55 ms |
| HTTP health median (p10–p90) | 0.92 ms (0.68–1.15) | 0.48 ms (0.37–0.92) |
| Process peak RSS in bounded job run | 128,236 KiB | 10,004 KiB |

The separate process runs include different startup and test harness work. CPU totals are therefore not a normalized per-job comparison. The 0.26 ms higher Rust PostgreSQL round-trip median is within local scheduling noise. A prior Node run under more contention measured a 21.44 ms full-job median, demonstrating variability.

## Netcup boundary

On 2026-11-14 at 01:34 UTC, read-only VPS checks observed 6,108 MiB available RAM, 142 GiB free storage and load averages 0.52/0.80/0.69. DeOpt `/health` and HBI `/hbi/api/health` returned 200 with normal HTTPS trust. The currently served Let's Encrypt IP certificate covers `94.16.113.122` and expires 2026-11-19 14:57:18 UTC. This is a point observation, not sustained capacity proof. No Netcup PIT V2 resource was created or deployed.

The V1 Node.js canary and its PostgreSQL volume remain independent. The V2 candidate is for synthetic internal traffic only, with hosted NFT fetching, external email, payments, signing and public routing disabled. A future Coolify Raw start must verify generated Compose and actual network attachments, particularly that `coolify-proxy` cannot reach the V2 data or RPC networks. Any failure stops only V2 and preserves both databases.
