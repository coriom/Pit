# PIT Premium V1: wallet-only local prototype

**Status: local test only; premium production reports and payments disabled.** The 178 existing tasks (151 offline Toolbox, 27 read-only Explorer) remain free without a wallet. Neither static package contains billing, wallet sign-in, premium reports or a payment bypass.

## Valuable reports

| Report | Distinct question | Bounded inputs and output | Provisional debit |
| --- | --- | --- | --- |
| Portfolio Batch Risk | How do manual holdings, synchronized returns, optional cash-flow-adjusted history and a chosen shock fit together? | 2–8 holdings, 3–60 aligned dates, optional 2–30 snapshots; allocation, concentration, volatility, correlation, stress, supported TWR/drawdown, exact JSON and spreadsheet-safe CSV. | 10 credits |
| Trading Journal Advanced | What did ordered closed trades earn after fees, and how did strategies and risk groups differ? | 2–500 trades with UTC date, strategy, gross PnL, fees and optional initial risk; net PnL, distribution, modeled drawdown, strategy groups, R coverage and exports. | 10 credits |

Reports reuse the existing statistical, historical-performance and bounded CSV engines. They do not fetch prices, fill missing data, predict returns or recommend trades. The server receives user-provided financial data for in-memory processing; the D1 design stores only digests, receipts and ledger entries. A hosted service requires a truthful privacy notice before use.

## Wallet identity

- The production-oriented Worker uses pinned Better Auth 1.7.12's SIWE plugin, D1-backed single-use nonce and secure HttpOnly session cookie. PIT additionally requires the exact origin URI, Base chain ID 8453, EIP-4361 version 1, current five-minute issue/expiry window and offline EOA signature recovery. Nonce and verification requests share a D1-backed per-IP rate limit; raw IPs are not stored.
- No Google or password provider is configured. The SIWE plugin's internally required email is an unverified `.invalid` placeholder. Email cannot authenticate, recover, receive messages or establish ownership. Automatic account linking is disabled. Premium routes additionally require a verified Base wallet association, so old non-wallet sessions cannot reach a report or balance.
- ERC-1271 smart-contract wallets are **unsupported** until their chain-scoped signature validation and RPC boundary are separately reviewed. Losing the controlling wallet may mean losing access to the account and credits. Balances do not transfer to a merely claimed replacement address.
- The loopback-only UI demonstrates connect, off-chain sign-in, account and ledger read, fictional credits, both reports, downloads and sign-out. Its in-process credit fixture is not part of the deployable Worker. Cloudflare Access on the existing sandbox remains a separate operator-only infrastructure gate, not PIT customer login.

The additive `premium-worker/migrations/0002_wallet_siwe.sql` adds the SIWE wallet association and authentication rate-limit tables. It does not delete or reinterpret existing Better Auth users, sessions or billing ledger entries. The existing protected Cloudflare D1 still has only migrations 0000 and 0001; **0002 has not been applied remotely**.

## Crypto-only commercial proposal

| Offer | Provisional terms |
| --- | --- |
| Free | All 178 existing tasks; no wallet required. |
| Pro | Indicative €9.90 per **30-day paid period**, 100 credits after verified settlement. Each renewal requires a separate payment; no recurring allowance or automatic debit. |
| Packs | Indicative €5 / 50, €10 / 110, €25 / 300 internal, non-transferable service credits. |
| Pay per use | Future operation-scoped USDC settlement without minting account credits. |

Only Base mainnet `eip155:8453` and [Circle's native USDC contract](https://www.circle.com/blog/usdc-now-available-natively-on-base) `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` are candidates for live settlement. Bridged USDbC `0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA` is rejected in mocks. A future server-issued order must bind wallet account, SKU, expiry, chain, token contract, exact six-decimal atomic USDC amount and independently verified merchant recipient; a client-provided transaction hash is insufficient. EUR display prices require an explicit quoted conversion to USDC. No conversion or payout is configured now.

The local crypto settlement fixture checks server order, exact chain/asset/recipient/amount, expiry, confirmed provider readback, event uniqueness and refund reconciliation. A manual Pro renewal extends from the later of settlement time or an active period end. Existing ledger constraints prevent negative credit balances and duplicate report debits. Historical Stripe test fixtures remain in `billing/payments.mjs` for regression only; no card checkout appears in the active UI, demo or production Worker.

The candidate merchant address `0x8B87aECC9413C2c5b853e81AA94b60990e7aBdbE` is **unverified and unused**. Ownership challenge and independently reviewed payout configuration are required before activation. No private key is requested or stored.

The existing x402-shaped fixture tests a challenge, facilitator verification, settlement and operation-specific delivery. It is **not an official x402 production integration** and uses no custom payment cryptography. The future server boundary should use the [x402 Foundation's maintained v2 core and EVM server packages](https://github.com/x402-foundation/x402) with a reviewed facilitator: bind one exact report operation to a Base/native-USDC payment requirement, verify and settle through that integration before returning the bounded result, and retain replay evidence without storing raw report input. Real accountless pay-per-use remains disabled until the SDK, facilitator, replay behavior and verified payout address are reviewed together. It must never credit a wallet account merely because an anonymous operation was paid.

## Acceptance and release gates

Run `pnpm billing:test`, `pnpm billing:demo`, `pnpm premium:test`, `pnpm premium:worker:test` and focused premium Playwright for the local prototype. The actual hosted Worker CPU and D1 costs remain unmeasured. Cloudflare Workers Free has a [10 ms CPU/request limit](https://developers.cloudflare.com/workers/platform/limits/); local workerd wall timing cannot certify this. Both production premium operations stay disabled.

Phase CC local acceptance: billing 17/17, premium report 5/5 plus loopback/service 6/6, Miniflare Worker/D1 11/11, focused Chromium 2/2, and Astro typecheck 380 files with zero errors. The dedicated Firefox browser binary was unavailable, so Firefox was not verified. `pnpm premium:worker:perf:test` passed with a worst-supported 500-trade journal warm engine p95 of 10 ms; this is a local workerd interval, **not hosted CPU**. Private Toolbox, Explorer and historical six-tool beta packages retained their prior SHA-256 hashes. No protected Cloudflare or Vercel resource was modified.

Before protected wallet-authenticated sandbox deployment: apply migration 0002 to the reviewed D1, provision a strong session secret and exact HTTPS origin securely, replace the inert Worker only after Access is reconfirmed for all URLs, run real signed-wallet/browser checks, and prove hosted CPU, D1 atomicity and privacy. Before real money: independently verify merchant ownership, integrate trustworthy payment settlement and official x402 v2 where applicable, decide credit expiration/refunds/consumer rights/tax and disclose server processing. No live payment endpoint is implemented.

**Decision: usable local wallet and crypto-only prototype; NO-GO for real-money or public launch.**
