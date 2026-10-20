# Phase AO acceptance matrix

Baseline: feature `ebf09c74dd35da61606cb023775558d680620c03` on `feat/pit-toolbox-industrialization`; local protected `main` `878b334dd34f50180733908b76942733054bd8df`. Initial worktree clean and upstream divergence 0/0. Independent remote read initially failed DNS resolution; remote identity remains to be verified.

This matrix records the required gates before any integration decision. `PENDING` is not a pass.

| Gate | Acceptance evidence | Initial state |
| --- | --- | --- |
| A: financial engines | Independent vectors, rounding boundaries, contract parity, all unit tests | Targeted PASS; final full gate PENDING |
| B: concentrated liquidity | Independent high-precision comparison across supported extremes; propagated errors quantified | PASS after narrowed precision domain; see security audit |
| C: EVM and CSV | Hostile-input regressions and exact export semantics | Targeted PASS after ABI-padding and CSV-prefix fixes |
| D: frozen beta | Source-scan isolation fixture, eleven-file hash, Chromium and Firefox | PASS locally; hosted package unchanged |
| E: pure contracts | Sixteen explicit IDs, forbidden dispatch and incompatible-port rejection | PASS locally |
| F: full regression | Clean committed `CI=1 pnpm release:check`, catalogue browser matrix | PENDING |
| G: performance and UX | Bounded CSV latency, bundle sizes, accessibility and privacy | Local PASS; see performance audit |
| H: static security | CSP, noindex, source maps, secrets and hosted evidence provenance | Local PASS with six reviewed surplus hashes; hosted NOT VERIFIED |
| I: release decision | Separate local merge-review and hosted-public-beta decisions | PENDING |

The reviewed six-tool beta package is `f2907ac694594531e16ab5501e3be7d066edf98f528553f2bf2164dde725a425`. No deployment, public release, wallet action, live RPC or main-branch change is in scope.

## Inventory and capability boundary

| Class | Registered IDs |
| --- | --- |
| Twenty local calculation/inspection routes | `pnl`, `swap-cost`, `token-fee-converter`, `yield-growth`, `trade-risk`, `execution-math`, `bridge-cost`, `portfolio-exposure`, `portfolio-rebalance`, `performance-drawdown`, `staking-rewards`, `vesting-unlocks`, `collateral-health`, `borrowing-cost`, `liquidation`, `amm-pool-math`, `concentrated-liquidity`, `impermanent-loss`, `evm-data-inspector`, `crypto-data-workshop` |
| Three read-only or wallet/accounting surfaces | `wallet`, `token-approvals`, `taxlot-export` |
| Two testnet execution pages | `swap`, `perps` |

The sixteen closed pure-local contract IDs are `swap-cost`, `portfolio-exposure`, `token-fee-converter`, `yield-growth`, `trade-risk`, `execution-math`, `portfolio-rebalance`, `performance-drawdown`, `staking-rewards`, `vesting-unlocks`, `collateral-health`, `borrowing-cost`, `amm-pool-math`, `concentrated-liquidity`, `evm-data-inspector`, and `crypto-data-workshop`. The user-facing registry alone grants no dispatch capability. `swap`, `perps`, `wallet`, `token-approvals`, `taxlot-export` and unknown IDs fail the pure runner. Manual token labels never establish an asset identity, and different rate, precision, currency or time units are not silently connected.

The AG–AN audit reports and contract documents were reviewed as the baseline for these tests. Previously verified reference cases retained by the full unit suite include 1 ETH = 10^18 wei; 50 bps = 0.5%; 12% APR monthly ≈12.682503% APY; 600/400 at 50/50 means sell/buy 100; a +10% then −10% cash-flow-adjusted return is −1% TWR; 1000 tokens at 12% APR less 10% commission yields 108; collateral C=2000, D=1000, LT=80% yields HF=1.6; 10 token0 into 100/10000 reserves at zero fee yields 909.090909 token1 at six decimals; and the continuous range example Pa=.25, Pb=4, L=100 yields a −40% LP/HODL divergence at either boundary. These are mathematical fixtures, not live quotes or financial advice.
