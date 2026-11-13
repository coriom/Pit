# PIT Crypto V2.2 local release qualification

Runtime source: `4d5db9cc4661d39d0833a9ca996c5949e67f04ae`.
GHCR image: `ghcr.io/coriom/pit-rust-backend@sha256:59e9e5d27f17e0d2b52b3b98dc680d2390e9e1b07674ba2d7b3a3236213d02f2`.
The image revision label matches the runtime source. It is **not deployed** on Netcup. The Node V1.4.2 canary remains the running reference and rollback candidate.

## Evidence obtained locally

- Rust unit/integration: 21 tests passed. V1 backend: 30 tests passed. Disposable V1 PostgreSQL dump and restore plus V2 additive migration passed with queued, running, failed, completed and expired jobs, checkpoints, alerts, deliveries, nonces and capability hashes. Migration interruption and retry passed.
- Differential tests on the same Anvil fixture passed for events, permissions, distribution, NFT valid/duplicate/invalid JSON cases and monitor rules. Both V1 and V2 independently passed local monitor persistence/notification tests. The full HTTP error, monitor transition and NFT failure/export matrices were not exhaustively compared request by request.
- Rust security tests covered concurrent nonce rejection, altered body, expired signing timestamp, idempotency, scoped/revoked/expired capabilities, cancellation, oversized body, invalid pagination, quotas and retry exhaustion. Worker tests covered concurrent claim, expired lease, persisted checkpoint, canonical mismatch and cancellation during held RPC work.
- The five Next.js to Rust workflows passed earlier local browser acceptance. Focused V2.2 live workflows passed in Chromium, Firefox and mobile Chromium; hosted-disabled dashboard checks passed separately in all three browser targets. The Astro release check passed with 581 Vitest and 102 Playwright tests; Foundry passed.
- Local Compose smoke passed API/worker/PostgreSQL health and migrations. API, worker and PostgreSQL had effective 0.25/0.5/0.5 CPU and 256/512/512 MiB cgroup limits, respectively. The API and worker ran as UID 65532. No host ports were published. These are local observations, not hosted isolation proof.
- The final local Trivy HIGH/CRITICAL scan returned zero findings. The prior `libssl3` HIGH is absent from the pinned distroless runtime. The runtime binary has no `libssl` dynamic dependency. SBOM and scan reports are artifacts of manual GitHub workflow run `43443806510`.

## Bounded performance observations

Identical local Anvil/PostgreSQL event fixture, warm-up followed by seven measured jobs: V1 full job median 12.93 ms (11.95–17.32); V2 full job median 12.59 ms (11.16–20.27). Fifty warmed HTTP health requests: V1 median 0.879 ms, p90 1.266; V2 median 0.536 ms, p90 0.942. Approximate host RSS during bounded runs: V1 109,764 KiB; V2 idle containers were API 2.48 MiB and worker 3.33 MiB, which is not a comparable peak RSS measure. CPU time, PostgreSQL overhead and RPC wait were not isolated. Do not extrapolate production throughput from these figures.

## Release boundary

The separate [V2 canary candidate](../../deployments/netcup-v2-rust-private-canary-candidate.json) is non-authorized. It requires a new Coolify Raw Application, actual generated Compose validation, runtime network checks, a separate database, V2-only secrets and a verified backup destination. Hosted NFT fetching stays disabled until independent egress isolation is proven. Local SMTP tests do not establish external email delivery. No V2 Netcup application, public route or payment path has been activated.
