# PIT premium Worker and D1 boundary

This is a **disabled, undeployed** foundation. The 178 free experiences and the isolated Toolbox and Explorer builds remain account-free. The Worker does not implement checkout, webhook ingestion, payment settlement, or public mock login. It does not import the trading or Taxlot runtimes.

## Authentication

Pinned Better Auth 1.7.12 uses the native Cloudflare D1 binding for its core `user`, `account`, `session`, and `verification` tables. Google Authorization Code + PKCE is the only configured provider. Better Auth owns state verification, session creation, signed secure HttpOnly cookies, logout and expiry. Password login and implicit same-email account linking are disabled. The unique `(providerId, accountId)` index protects the stable provider subject from duplicate association. The Worker enforces its exact HTTPS origin on every request, an exact `Origin` and same-site fetch metadata for mutations, and a 16 KiB streamed auth-body limit. No client-provided user ID, role, payment-success flag, or entitlement is trusted.

`PUBLIC_ORIGIN`, `BETTER_AUTH_SECRET` (at least 32 characters), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a reviewed D1 binding must all be supplied before authentication routes work. The disabled `wrangler.jsonc` has no real database ID, origin, or secret; it is deliberately not deployable. Configure the Google callback for `${PUBLIC_ORIGIN}/api/auth/callback/google` only after approving the eventual origin. The premium frontend must be on this same origin or receive a separately reviewed same-origin proxy; CORS is not opened for the existing static sites.

The production entrypoint is `premium-worker/worker.ts`. Local fixtures and arbitrary SQL/payment controls exist **only** in `premium-worker/test-entry.ts`, a separate ignored test bundle. `premium-worker/build.mjs` rejects fixture markers in the production bundle. The pinned Better Auth package emits one unreachable Node SQLite probe even with D1; the build removes exactly that probe and fails if its signature changes. An SDK upgrade requires a fresh bundle and schema review.

## Billing and reports

`0000_auth.sql` contains the pinned Better Auth core schema; `0001_billing.sql` adds wallets, subscriptions, an immutable ledger, unique payment events, pending reversals, request receipts and rate limits. Migrations must be applied in order to a **new, reviewed** D1 database before enabling an environment. `billing_schema_version` is written last and `/health` reports its presence without user data.

Credit grants and balances are capped at one billion internal credits. Payment-event kinds, UTC timestamps and subscription period ends are validated at runtime before D1 writes. Invalid or out-of-range events fail closed.

| Endpoint | Boundary |
| --- | --- |
| `GET /health` | Schema/feature readiness only; no user data. |
| `/api/auth/*` | Better Auth Google sign-in/callback, session lookup and logout; configured origin required. |
| `GET /v1/account` | Verified session; own plan, credit balance and subscription state. |
| `GET /v1/ledger` | Verified session; own last 100 immutable ledger entries. |
| `POST /v1/reports/portfolio-batch-risk` | Verified session, exact origin, 64 KiB input, 10-credit debit, at most 256 KiB output. |
| `POST /v1/reports/trading-journal-advanced` | Same; input engine accepts up to 500 trades. |

Both report endpoints require `PREMIUM_REPORTS_ENABLED=true`; the checked-in configuration is `false`. The report is validated and computed before debit. A D1 `batch()` then conditionally subtracts credits and atomically inserts a unique `(user_id, request_id)` receipt and immutable ledger entry. The receipt stores the input SHA-256 digest; an exact retry returns the same report without another debit, while a changed operation/input under the same request ID returns 409. Failed validation, insufficient balance, a frozen account, or a failed batch cannot create a receipt. An interrupted response can be retried with the same request ID. The report input is never persisted or logged. A per-account D1 limiter allows at most 10 report attempts per minute.

`applyVerifiedCredit` and `reverseVerifiedCredit` are internal domain methods, **not HTTP routes**. They assume an independently verified provider event; no production provider adapter calls them yet. Event uniqueness, account association and D1 batches prevent duplicate grants. A reversal received before its paid event creates a pending tombstone, so the later payment cannot grant credits. A reversal after spending freezes the account and records the unrecovered deficit. A later verified credit first pays down that deficit, with a separate liability-recovery ledger entry. Pro expiry is derived from the stored period end; it is never asserted by a client. These rules do not constitute a production Stripe/CoinGate/x402 integration.

The internal `applyVerifiedSubscriptionEvent` accepts only provider-verified cancellation requests and renewal failures. A cancellation request retains paid Pro access through its stored period end; a renewal failure moves the account to `past_due` without granting credits. Event timestamps order subscription updates, so delayed older events cannot replace newer state. A cancellation cannot turn a `past_due` account back into Pro. The future provider adapter must supply authenticated event time, not client time.

## Privacy and security

Only account identity, session, subscription, credit, receipt digest and audit metadata are stored. Imported portfolios and journals are neither logged nor stored. Response headers disable caching and indexing; the API sets no permissive CORS headers. Raw errors from the report engines and D1 are replaced by bounded messages. There are no wallet, RPC, signing or transaction capabilities. Existing execution gates remain `FEES_ENABLED=false`, `MAINNET_ENABLED=false`, and `UNISWAP_EXECUTION_ACCEPTED=false`.

Local test commands: `pnpm premium:worker:test`, `pnpm premium:worker:benchmark`, `pnpm check`, `pnpm billing:test`, and `pnpm premium:test`. The first two use Miniflare workerd and an emulated D1 database, with simulated payments and a mocked Google token exchange. They do not verify real Google credentials, hosted D1 latency, payment-provider signatures, or Cloudflare production CPU accounting.

## Workers Free decision

Cloudflare documents a 10 ms CPU/request and 128 MB isolate limit on Workers Free. In the local workerd benchmark, the 500-trade journal's synchronous computation exceeded 10 ms at p95, and portfolio computation also had samples above 10 ms. Auth, D1 and JSON work add CPU. **Both premium report operations remain production-disabled.** The smallest next step is to profile and optimize their bounded engines and then measure the complete authenticated request under actual Worker CPU accounting in a protected sandbox. If they cannot consistently fit, use a separately approved architecture or plan; this code does not silently request a paid upgrade. D1 Free daily read/write limits also require a traffic budget before launch.
