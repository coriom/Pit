# PIT Premium V1: local test prototype

**Status: local test only.** The 178 existing tasks (151 offline Toolbox, 27 read-only Explorer) remain free and outside billing. No premium API, checkout, identity fixture or payment bypass is included in either static package. The two reports below are real calculations behind a loopback-only Node service; neither is a public offer or deployable service.

## Value and boundaries

| Operation | Distinct user question | Inputs and outputs | Provisional debit |
| --- | --- | --- | --- |
| Portfolio Batch Risk Report | How do my manually valued holdings, synchronized returns, optional cash-flow-adjusted history and chosen shocks fit together? | 2–8 holdings, 3–60 aligned return dates, optional 2–30 snapshots. Reports allocation, concentration/HHI, sample volatility, pairwise correlation, fixed-weight return series, stress change, and historical TWR/drawdown only when provided. JSON and spreadsheet-safe CSV. | 10 credits |
| Trading Journal Advanced Report | What did my ordered closed trades earn after fees, and how did risk and strategy groups differ? | 2–500 closed trades with UTC date, strategy, gross PnL, fee and optional initial risk; starting capital. Reports gross/net PnL, fees, win/loss distribution, modeled equity drawdown, strategy groups, R-multiple coverage, JSON and spreadsheet-safe CSV. | 10 credits |

These reports combine existing `bc-statistics`, `performance-drawdown`, `bj-derivatives` and bounded CSV parsing. They do not fetch prices, infer missing data, explain causes, predict returns or recommend trades. Manual currency labels are not verified market prices or asset identities. Portfolio return observations and historical snapshots are separate manually supplied series; the tool does not assert they reconcile. CSV exports escape spreadsheet-formula-leading cells; JSON retains exact decimal strings. Reports are bounded and generated in memory. The billing database stores only an input digest, receipt and ledger entries, not imported holdings or trades. A future hosted server would receive user financial data and needs an explicit privacy disclosure before use.

## Commercial contract proposed for review

| Offer | Provisional terms |
| --- | --- |
| Free | All existing 178 tasks; no account required by either existing static product. |
| Pro | €9.90 per paid month, 100 credits on verified renewal; not unlimited reports. Cancellation leaves the current paid period to expire; refund/chargeback freezes disputed credit access in the local ledger model. |
| Packs | €5 / 50, €10 / 110, €25 / 300 internal non-transferable service credits. Expiration and statutory refund policy require jurisdiction-specific review. |
| Pay per use | Future operation-scoped USDC settlement; no account credits minted by a one-time payment. Not implemented in this prototype. |

No real payment path is enabled. Card (Stripe), merchant crypto checkout (CoinGate candidate) and direct Base USDC (future x402) appear as **disabled test-only choices**. The local fixture is provisioned by simulated signed Stripe events; there is no client-side credit issuance route. A report is validated and serialized before one atomic credit debit. `(user_id, request_id)` plus input digest makes exact retries idempotent, while a changed payload is rejected. Invalid reports, exhausted/frozen balances and database errors fail closed. A response lost after commit can be retrieved by an exact retry without a second debit. The local UI starts only on `127.0.0.1`, uses an HttpOnly SameSite fixture cookie, checks Host and Origin and is `noindex`; it must never be deployed with fixture authentication.

## Measured cost and pricing screen

Measured on local Node v22.22.3, one process, 30 sequential iterations per workload (2026-10-23). RSS is **whole-process memory**, not marginal per-request memory; there is no production Worker CPU, D1 or bandwidth measurement.

| Bounded workload | Median / p95 / max wall time | Process RSS before → after | Heap delta |
| --- | --- | --- | --- |
| 8 assets × 60 synchronized observations | 2.855 / 4.558 / 12.327 ms | 47.27 → 58.23 MiB | +0.18 MiB |
| 500 closed trades | 10.282 / 15.678 / 31.519 ms | 58.23 → 77.05 MiB | +2.53 MiB |

The server-only report bundle is 57,462 bytes. The [current Cloudflare Workers Free pricing and limits](https://developers.cloudflare.com/workers/platform/pricing/) state a 10 ms CPU limit per request; these Node wall times do **not** establish Worker eligibility. D1, authentication, storage, observability, VAT, refunds, chargebacks, processor geography and customer support remain unmeasured. [Stripe France's standard EEA card rate](https://stripe.com/fr/pricing) is listed as 1.5% + €0.25 per successful payment; actual merchant pricing and Stripe Billing fees must be checked for the eventual account. At that illustrative rate, the existing `billing/economics.mjs` screen yields about €0.8125–€0.935 net per 10 credits across packs before VAT, infrastructure and overhead. This is **not** a measured report margin or proof users will pay. CoinGate and x402 settlement fees are not established here. The 10-credit setting therefore stays local-test-only and both production operations remain disabled pending measured hosted costs and product validation.

## Test and integration boundary

- Local commands: `pnpm billing:test`, `pnpm billing:demo`, `pnpm premium:test`, `pnpm premium:benchmark`, `pnpm premium:dev` and `pnpm exec playwright test -c playwright.premium.config.ts`.
- The existing Toolbox and Explorer checks remain the isolation gates. Neither static build imports `premium/`, `billing/`, payment adapters or the local identity fixture.
- Production prerequisites: real authentication and account recovery; a deployed transactional database/atomic debit with rate limits and audit retention policy; reviewed Stripe test-mode checkout and signed webhook integration; a verified crypto merchant agreement, chain/token/recipient and settlement reconciliation; a separately reviewed official x402 v2 integration; truthful server-processing privacy notice; operator identity/contact, legal/consumer-rights, VAT/tax and refund/expiration decisions; provider-specific cost and load testing. The candidate receiving address in earlier billing notes remains unverified and unused.
- AI analysis remains disabled until quality, privacy and provider costs are measured. Free tools remain unaffected by any future billing decision.

**Decision:** useful local integrated prototype; **NO-GO for a protected integrated deployment with fixture authentication** and **NO-GO for real-money launch**. A separately reviewed production-safe identity and sandbox payment environment is required before hosted QA.
