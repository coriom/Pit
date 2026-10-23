# Phase CA — premium report Free-tier feasibility

Status: **local candidate only; both premium operations remain production-disabled**. No cloud CPU measurement, account, deployment, or payment was used.

## Changes and preserved behavior

- The advanced journal computes its eight-place, truncating profit factor directly from the already validated win/loss totals. It no longer generates and reparses a second 500-row CSV. The free journal remains an independent test oracle; the premium report fields and spreadsheet-safe CSV remain unchanged.
- Portfolio correlation inputs are formatted once per asset instead of once per asset pair. The existing statistical engine still calculates each correlation.
- The report CSV writer uses a bounded iterative construction. The report route no longer parses a just-serialized report before returning it. It still checks the 256 KiB output limit before the atomic debit.
- Optional in-process stage callbacks and a separate nondeployable test entrypoint measure workerd wall intervals. They do not log or persist inputs. The production Worker has no profiling endpoint or fixture identity route.
- `pnpm premium:worker:perf:test` exercises representative and maximum supported inputs, a mocked Google OAuth session, local D1, concurrent requests, and generous engine-regression ceilings. Those ceilings detect a material slowdown; they are **not** a 10 ms CPU acceptance test.

## Measurements

One pre-change local Miniflare/workerd run (30 engine samples) gave portfolio median/p95/max **2/7/12 ms** and 500-trade journal **5/13/31 ms**. After the changes, the final local run on the same machine gave portfolio **1/2/3 ms** and journal **5/9/11 ms** (30 warm engine samples each). Another post-change run measured **2/2/2 ms** and **4/6/8 ms**, respectively. Single-run timing differences and workerd scheduling limit this comparison; repeated hosted CPU measurements are still required.

The post-change maximal structured cases were 8 assets × 60 return observations plus 30 history snapshots (**8,386 request bytes**, engine warm median/p95/max **2/2/3 ms**) and 500 trades with long supported fields (**57,302 request bytes**, **5/7/8 ms**; 20 warm samples each). Four concurrent 500-trade engine requests completed with observed synchronous intervals **4, 4, 3, 3 ms** in the final run. The 500-trade capacity and 64 KiB request/256 KiB output guards remain.

The final fixture-identity report route including D1 and output had warm median wall intervals of approximately **20–40 ms** depending on workload. Actual production Worker entrypoint requests with a locally mocked Google token exchange, real Better Auth sessions, and local D1 had warm end-to-end client-wall medians **47.223 ms** portfolio and **93.615 ms** journal (four samples each); earlier runs varied substantially. Isolated Better Auth setup took a warm median **0 ms**, while session lookup including local D1 waits took **13 ms** (ten samples). These wall figures include asynchronous local D1 work and are **not Worker CPU**. The simple D1 query's client-wall median/p95 was **6.198/8.754 ms** while D1 reported **0–1 ms** query duration. Local workerd process RSS was **138.31 MiB** in a process shared by benchmark isolates; it is **not isolated Worker heap**. No hosted Cloudflare CPU, D1 latency, cold-start distribution, or 128 MiB isolate memory measurement exists.

Measured engine stages: journal parsing 0–2 ms, row validation/calculation 2–5 ms, CSV output 2–4 ms; portfolio pair correlations 1–2 ms. JSON serialization and digest each generally registered 0–1 ms in the local clock. The largest route wall stages were D1 account ensure/read and atomic debit, but waiting on D1 is not itself proof of CPU consumption.

## Decision

Cloudflare Workers Free allows **10 ms CPU/request**, 100,000 requests/day and 128 MiB isolate memory. Portfolio is a **plausible** Free-tier candidate; the journal is **not demonstrated to have reliable margin** at 500 trades once Better Auth, parsing, output, and D1 result processing are included. Both remain disabled. The local wall measurements cannot certify either operation for hosted use. The simplest architecture is to keep the current Worker+D1 ledger and perform a separately authorized, protected hosted CPU/memory acceptance before enabling one report at a time. Do not partition a charged report into unaudited requests or reduce limits solely to force a pass.

Supabase Edge Functions Free documents 2 seconds of CPU/request, 256 MiB memory, 500,000 monthly invocations, two active Free projects, and possible pausing after low activity over seven days. This offers more CPU headroom, but migration would require porting Better Auth/session handling, D1 transaction/ledger guarantees to Postgres, Google OAuth configuration, Worker code to Deno, tests, and operational checks. That is a materially larger security change than profiling the present Worker in a protected environment. No migration or account creation occurred. Other Free backends were not shown to be simpler while preserving this ledger.

## Evidence and next gate

Focused report references and 500-row parity, local HTTP/service billing tests, and workerd+D1 auth/concurrency tests passed: `pnpm premium:test` **11/11**, `pnpm premium:worker:test` **10/10**, `pnpm billing:test` **16/16**, `pnpm premium:worker:perf:test` **PASS**, and `pnpm check` **378 files, zero errors**. The private Toolbox package remained `5c66f7733e08f626f5c65c1753de4c2c3a894253d96d40495d2eb7538d0a52c7`; Explorer remained `642da70ad3f0e7e865a8c3188299b4fefc5479cb15959f8b00bb13212a4a9111`; historical six-tool beta remained `f2907ac694594531e16ab5501e3be7d066edf98f528553f2bf2164dde725a425`. The reports are server-only and no raw imports are persisted or logged by these paths. `PREMIUM_REPORTS_ENABLED=false` remains the deployable default, and the production bundle contains no test identity/profile route.

Next protected sandbox requires an approved Cloudflare account/project and D1 database, Google OAuth client ID/secret and redirect/origin settings, secure secret provisioning, migration review, a protected normal session, and provider CPU/isolate-memory/D1 usage telemetry under representative and maximum inputs. Payment credentials and real-money processing are outside this phase. Do not enable `PREMIUM_REPORTS_ENABLED` from these local measurements.

Provider references: [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Cloudflare pricing and D1 Free quotas](https://developers.cloudflare.com/workers/platform/pricing/), [Supabase Edge Function limits](https://supabase.com/docs/guides/functions/limits), [Supabase Free pricing](https://supabase.com/pricing), [Supabase project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).
