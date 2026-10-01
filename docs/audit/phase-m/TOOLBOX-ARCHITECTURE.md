# Phase M — DeFi toolbox foundation

PIT now has a registry-driven toolbox at `/tools/`, with a direct URL for each tool. The existing `/` trading interface, its React island, CoW and Hyperliquid execution helpers, and the typed testnet preflight remain in place. Before this phase, routing comprised three Astro pages (`/`, `/fees/`, `/legal/`), with Swap and Perps selected as tabs inside `TradingApp.tsx`. The toolbox adds static Astro pages around the existing components; registry metadata never signs or submits anything.

## Registry contract

`src/lib/tool-registry.ts` is the authoritative typed list. Each entry has `id`, `slug`, canonical `path`, `title`, short `description`, `category`, `executionMode`, `walletRequirement`, `networkRequirement`, and `status`. The closed categories are **Trade, Wallet, Analyze, Calculate, Accounting**. Analyze is intentionally empty in this release. Modes are `local` (browser calculation only), `read-only` (no on-chain transaction; Taxlot sync may write validated local evidence), and `execution` (wallet signature/transaction path). Status is `available` or `testnet-only`; `available` does not imply a production launch. Network requirements are `none`, `ethereum-sepolia`, `hyperliquid-testnet`, or `testnet-apis`.

| Tool | Category | Mode | Wallet | Network | Status | Direct URL |
| --- | --- | --- | --- | --- | --- | --- |
| Swap / CoW order history | Trade | execution | connected | Ethereum Sepolia | testnet-only | `/tools/swap/` |
| Perps / positions, orders and fills | Trade | execution | connected | Hyperliquid testnet | testnet-only | `/tools/perps/` |
| Wallet connection | Wallet | read-only | none to open; injected wallet to connect | none in PIT | available | `/tools/wallet/` |
| PnL Calculator | Calculate | local | none | none | available | `/tools/pnl/` |
| Liquidation Price Calculator | Calculate | local | none | none | available | `/tools/liquidation/` |
| Impermanent Loss Calculator | Calculate | local | none | none | available | `/tools/impermanent-loss/` |
| Taxlot export / testnet fill sync | Accounting | read-only | connected | testnet APIs | testnet-only | `/tools/taxlot-export/` |

The landing page renders its cards, category filter and search data from this list. Direct pages call `toolById` for title and disclosure. A future tool normally adds one registry entry and one Astro page under `src/pages/tools/<slug>/`; the shared layout and landing page then update automatically. The registry test rejects duplicate IDs/slugs/paths, missing source routes, or values outside the closed taxonomy. The production Playwright test opens every registered URL.

`TradeTool.tsx` mounts the **existing** `Swap` or `Perps` component with the existing wallet and fill recorder. The original `useExecutionPreflight` and protocol helpers continue to gate quote, signing and submission. `AccountingTool.tsx` reuses the existing `FillRecorder` and `Export`: CoW spot fills retain Taxlot-v1 validation, while Hyperliquid derivative fills remain `unsupported_derivative_v1` raw evidence and cannot enter Taxlot CSV. Registry status and navigation have no authority to bypass those gates. Playwright confirms signing controls on both direct execution URLs stay disabled without a wallet; the earlier chain/endpoint preflight tests remain in the release suite.

## Local calculator contracts

All three calculators use `src/lib/calculators.ts`, a dependency-free pure module. The Astro form has no wallet provider, storage, fetch, XHR or WebSocket code. Every field is parsed as a finite decimal; blanks, `NaN`, `Infinity`, hex, comma-formatted text and overflow fail with a visible error. Non-positive sizes/prices and invalid rates fail before a result is displayed. Results are deterministic and use quote units explicitly. They are arithmetic tools, not trading recommendations.

| Calculator | Formula and units | Exclusions/boundaries |
| --- | --- | --- |
| PnL | `gross = direction × (exit − entry) × asset quantity`; `net = gross − total fees`; `return % = 100 × net / (entry × quantity)`. Prices are quote units per asset unit; fees and PnL are quote units. | Long/short price PnL only. No leverage return, funding, gas, slippage or tax treatment. Fees ≥ 0, prices/quantity > 0. |
| Liquidation threshold | Linear isolated equity `C + direction × Q × (mark − entry)`, maintenance `r × Q × mark`. Solve equality: long `mark = (entry − C/Q)/(1−r)`; short `mark = (entry + C/Q)/(1+r)`. `C` is collateral in quote units, `Q` is asset units, `r` is entered percent / 100. | Generic algebra, **not** a Hyperliquid or other protocol engine. `0 ≤ r < 1`; collateral must exceed maintenance at entry. If a long has no positive-price threshold, report that instead of a fabricated price. No funding, fees, cross margin, price impact or tiers. |
| Impermanent loss | For price ratio `R = final/initial` and initial pool value `V` in quote units: hold `V(1+R)/2`, pool `V√R`, difference `pool−hold`, IL `% = 100 × (pool/hold−1)`. | Fee-free 50/50 constant-product pool versus holding. One asset moves against a stable quote unit. No rewards, fees, depeg, deposits or withdrawals. All inputs > 0. |

The unit fixtures cover PnL long/short and fee-only loss, both liquidation sides and zero-positive-threshold boundary, 4×/0.25×/unchanged impermanent loss, already-breached maintenance, malformed text, non-finite inputs and arithmetic overflow. The browser test calculates with its context offline **after** loading assets, then rejects malformed input. [Exact calculator request capture](calculator-inventory.json) shows only the same-origin HTML document and stylesheet on initial load for each calculator; each `afterLoadRequests` and `websockets` array is empty. The landing-search flow navigates to a calculator, computes, reloads its direct URL and computes again. No heavy math or UI package was added.

## Build and supply-chain impact

[Before/after metrics](build-impact.json) use the Phase L production artifact as baseline and the Phase M static build as the candidate. [The candidate artifact manifest](artifact-inventory.json) identifies every generated file. Page count moves from 3 to 11; JS files from 117 to 122; CSS stays at one file; total output grows from 3,178,667 to 3,231,363 bytes (**+52,696 bytes**). The calculator script is inlined by Astro and CSP-hashed; calculator pages do not request a JS chunk. The largest newly named JS chunk is Vite's shared `Wallet.CN6rL4sq.js` bundle (1,182,166 bytes), which replaces part of the prior 1,441,171-byte monolithic trading bundle, not a calculator dependency.

`scripts/add-static-csp.mjs` now enumerates **all** generated HTML before producing the common Cloudflare Pages response CSP. `scripts/release/artifacts.mjs` audits all generated pages and requires the original three plus `/tools/`. The Phase L bans on external scripts/styles without SRI, broad CSP sources, analytics endpoints/packages, secrets, source maps and mainnet execution paths remain active. `pnpm release:check` remains the authoritative clean-tree gate.

The [exact clean-tree release-check output](release-check.txt) records 116 passing unit tests, 22 passing Playwright tests, 76 typechecked files with zero diagnostics, an 11-page build, and a passing 136-file supply-chain guard. The candidate build hash is `82b197be5ddb9db674e64e878e5c7787c4f8ef34c68d65fee01ee931bda23e24`.

## Outstanding acceptance

Assumption 8 remains **OPEN**: no dedicated public HTTPS origin, actual response headers or public storage recovery have been verified. Phase H-live remains **BLOCKED** pending separately provided funded external Ethereum Sepolia and Hyperliquid-testnet accounts, operator-approved signatures, and real execution/accounting reconciliation. This phase did not deploy, sign, trade, activate fees, change protocol endpoints, or alter legal/accounting gates.
