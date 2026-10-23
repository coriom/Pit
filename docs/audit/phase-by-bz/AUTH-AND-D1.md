# Phase BY–BZ local acceptance

Baseline: `main` at `35cdb518f6247b75fd9d87d23798b521c09392f6`, clean and synchronized. No Cloudflare project, D1 database, Worker deployment, payment, or OAuth credential was created.

Implemented: Better Auth Google OAuth with D1-backed sessions; exact-origin and mutation CSRF checks; disabled account linking; one Worker with authenticated account, ledger and two premium report routes; D1 migration pair; conditional atomic debit/receipt/ledger batch; verified-event replay and out-of-order reversal handling; bounded bodies, reports and rate limits; isolated nondeployable Miniflare fixture bundle. Production config leaves reports disabled and lacks deployable credentials/database identifiers.

Targeted evidence:

- `pnpm premium:worker:test`: ten workerd/D1 integration tests passed, including mocked Google callback, secure cookie, logout, expiry, same-email different-subject rejection, user isolation, both disabled report routes, same-request retry, eight concurrent spends for five available report debits, refund deficit conservation, immutable ledger, out-of-order reversal, ordered cancellation/renewal-failure transitions, per-user rate limiting, malformed/oversized requests and database failure. OAuth token exchange was mocked; no external Google call occurred.
- `pnpm billing:test`: 16/16 existing SQLite-domain tests passed.
- `pnpm premium:test`: four report vectors and six service/HTTP tests passed.
- `pnpm check`: 378 files, zero errors (one pre-existing hint).
- `pnpm toolbox:check`: 151 offline tasks, 169 pages, package SHA-256 `5c66f7733e08f626f5c65c1753de4c2c3a894253d96d40495d2eb7538d0a52c7`.
- `pnpm explorer:check`: 27 read-only tasks, 29 pages, package SHA-256 `642da70ad3f0e7e865a8c3188299b4fefc5479cb15959f8b00bb13212a4a9111`.
- `pnpm beta:check`: eight pages, historical package SHA-256 `f2907ac694594531e16ab5501e3be7d066edf98f528553f2bf2164dde725a425`.

Local Miniflare workerd benchmark, 30 synchronous engine samples and four end-to-end report samples per workload (run after the new backend, before deployment):

| Workload | Engine median / p95 / max | Full request wall median / p95 | Output bytes |
| --- | ---: | ---: | ---: |
| 8 assets × 60 returns | 3 / 6 / 12 ms | 47 / 51 ms | 5,713 |
| 500 trades | 9 / 19 / 44 ms | 55 / 58 ms | 73,846 |

Emulated D1 `SELECT 1` client wall median/p95: 9.227/12.741 ms; D1-reported execution duration median/p95: 0/1 ms. A fresh successful report executes 12 D1 statements excluding auth. Concurrent report, balance and ledger requests returned 200/200/200 within the limiter. The Node harness RSS was 217.49 MiB and the local `workerd` process RSS was 112.22 MiB; neither is the isolated Worker heap or a per-request peak. `performance.now()` synchronous timing is a local CPU proxy, **not** Cloudflare's official billed CPU metric. An earlier run observed a 2,224 ms full-request wall-time outlier; it is retained as variability evidence. No reliable Workers Free fit is established; both reports stay disabled. An actual authenticated hosted Worker measurement is required before enabling them.

Remaining gates: reviewed D1 provisioning/migration and backup plan; Google OAuth client/origin and secret; production auth callback and session testing; independently verified payment-event adapters; user privacy/retention and consumer-rights review; authenticated Worker CPU/isolate measurements; a front-end integration review. The older local-only premium demo remains strictly separate. Protected Vercel and Cloudflare static deployments were untouched. This phase is **local foundation PASS, protected integrated sandbox NO-GO until credentials and Free-plan fit are resolved**.
