# Phase AO hardening handoff

Phase AN ends the planned AH–AN feature batch. This is a handoff, **not** AO execution or a release approval. Main remains protected; no deployment, public indexing, wallet action or transaction is authorized. Assumption 8 stays OPEN and public beta stays NO-GO.

## Current full-toolbox inventory and capability boundary

**25 registered tools:** 20 local pages, three read-only/wallet/accounting surfaces, two testnet execution pages. The closed v1 pure-local runner contains 16 individually reviewed IDs; appearing in the user-facing registry does not confer composition or execution rights.

| Capability                                                | Registered IDs                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local calculation / inspection                            | `pnl`, `swap-cost`, `token-fee-converter`, `yield-growth`, `trade-risk`, `execution-math`, `bridge-cost`, `portfolio-exposure`, `portfolio-rebalance`, `performance-drawdown`, `staking-rewards`, `vesting-unlocks`, `collateral-health`, `borrowing-cost`, `liquidation`, `amm-pool-math`, `concentrated-liquidity`, `impermanent-loss`, `evm-data-inspector`, `crypto-data-workshop` |
| Read-only or wallet/accounting-dependent full-app surface | `wallet`, `token-approvals`, `taxlot-export`                                                                                                                                                                                                                                                                                                                                           |
| Testnet execution                                         | `swap`, `perps`                                                                                                                                                                                                                                                                                                                                                                        |

The separately reviewed hosted beta remains only six earlier browser-local calculators (`portfolio-exposure`, `swap-cost`, `impermanent-loss`, `pnl`, `bridge-cost`, `liquidation`) and eight static pages. AH–AN tools are **not** in that artifact.

## Delivered batch sizes and untested surfaces

| Phase | Registered tools | Grouped operations reported at targeted acceptance |
| ----- | ---------------: | -------------------------------------------------: |
| AH    |                2 |                                                 12 |
| AI    |                2 |                                           about 16 |
| AJ    |                2 |                                         roughly 15 |
| AK    |                2 |                                         roughly 15 |
| AL    |                2 |                                         roughly 15 |
| AM    |                2 |                                                 14 |
| AN    |                2 |                                                 15 |

These are user questions grouped by context, not independent calculator pages or proof of demand. AO must run `CI=1 pnpm release:check` on the final committed feature source, then the full browser matrix and reference cases. Verify all 25 routes and registry links, numeric/parsing golden vectors, contract input/output stability, incompatible workflow ports, mobile/keyboard, CSV/JSON downloads, CSP/noindex, and static bundle isolation. Previous phase reports document targeted runs only.

## Priority hardening reviews

1. **Beta CSS source isolation.** Tailwind v4 currently scans unrelated source text. AN caused a real hash drift, traced to an extra utility rule and restored with narrow exclusions. Replace the tactical exclusions with a dedicated beta source set; compare the entire 11-file host package and actual Chromium/Firefox rendering against the reviewed hash `f2907ac694594531e16ab5501e3be7d066edf98f528553f2bf2164dde725a425`. Do not rename legitimate domain code to hide utility tokens or silently accept a new package hash.
2. **ABI/CSV adversarial review.** Fuzz bounded ABI JSON, selector collisions, malformed static words, Unicode, malformed CSV quote transitions, row/column limits, mapping changes, spreadsheet formula prefixes and duplicate conflict decisions. Confirm all untrusted text reaches only text nodes and bounded local downloads. Review exact parser/resource limits and runtime output validators independently.
3. **Concentrated-liquidity approximation.** Reassess the AM square-root fixed-point error bound at narrow and extreme ranges; the model is continuous and illustrative, not Uniswap v3 contract-equivalent. Keep LP/HODL and fee coverage distinctions intact.
4. **Browser and performance.** Test 256 KiB CSV and 1,000 rows on low-end mobile; inspect input responsiveness and download size. Run comprehensive Chromium and Firefox suites, then manual Safari/mobile checks. Verify no unexpected network, wallet, storage or accounting calls across new routes.
5. **Hosted and release gates.** Authenticated QA on the existing protected deployment remains NOT VERIFIED; local pages do not establish hosted acceptance. Public beta remains NO-GO pending separate operator authorization, hosting/privacy/legal review and Assumption 8 resolution. Existing full-test and `pit-prod` protection and aliases must remain untouched.

Future workflow composition remains opt-in pure-local only. Do not add a graph runner, account system, automatic import, RPC adapter, Taxlot conversion or transaction capability as a side effect of AO testing.
