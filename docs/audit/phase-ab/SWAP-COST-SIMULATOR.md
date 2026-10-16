# Phase AB — Swap Cost Simulator

**Scope:** `/tools/swap-cost/` is a standalone, local, manual-input calculator. It does not import PIT quote or execution adapters, connect a wallet, request a live quote, read an RPC, write IndexedDB, create a Taxlot event or submit data to a backend. The tool is not an executable Best Swap router. `FEES_ENABLED=false`, `MAINNET_ENABLED=false`, `UNISWAP_EXECUTION_ACCEPTED=false`, noindex, Assumption 8 OPEN and the legal/mainnet restrictions remain unchanged.

## Calculation contract

All amounts are parsed as decimal text to exact `BigInt` base units, with token decimals restricted to 0–36 and monetary inputs to `uint256`. Gas units are integers; gwei is converted to wei with at most nine decimal places. No floating-point money conversion occurs. The calculation version is `pit.swap-cost.simulation.v1`.

Let `Q` be manually entered quoted buy-token raw output, `F` an explicitly supplied buy-token-denominated venue fee only when the quote excludes it, `G_swap` and `G_approval` wallet gas units, `P` gas price in wei per unit, `R` buy-token raw units per one native gas token, and `s` slippage bps. Then:

- `expected before wallet gas = Q − F`. If venue fees are marked included, `F = 0` by construction; the embedded fee is **not** deducted again. If fee coverage is unknown, this outcome is unavailable.
- `wallet gas wei = (G_swap + G_approval) × P`. CoW-like solver settlement contributes **zero wallet swap gas**. Uniswap-like swaps require an independently supplied wallet transaction gas estimate; QuoterV2 internal gas is not treated as that estimate. Approval gas contributes only when approval is explicitly required.
- `wallet gas in buy-token raw units = ceil(wallet gas wei × R / 10^18)`. Rounding upward by at most one buy-token base unit avoids understating a positive estimated cost. A missing gas price, conversion rate, gas estimate or approval condition remains **unknown**, not zero.
- `estimated net = expected before wallet gas − converted wallet gas`. Negative values are displayed unchanged. `minimum receive = floor(expected before wallet gas × (10000 − s) / 10000)`. `net minimum after gas` subtracts converted gas from that minimum as a separate scenario. Slippage is a protection assumption, not a charged fee.
- `gas impact = converted wallet gas / expected before wallet gas`; the numerator and denominator remain exact raw integers in the report, while the displayed percentage is rounded to four decimal places. PIT fee is always zero.

Uniswap-like pool fees must be marked included in quoted output. A CoW-like quote may instead explicitly exclude a known venue fee **only when that fee is entered in buy-token units**; the engine deducts it once. It cannot infer a sell-token-denominated solver fee or turn a manual pre-fee quote into a verified protocol quote.

## Independently checked illustrative examples

These numbers are **illustrative, never live**. An independent Python `Decimal`/integer calculation confirmed the raw outputs below; unit tests and the local built-browser UI confirm the implementation.

| Scenario | Manual assumptions | Exact result |
| --- | --- | --- |
| A — CoW-like embedded cost | Sell 10 USDC (6 decimals), quote 0.005 WETH (18 decimals), fees included, no approval, 50 bps slippage | Expected/net `5000000000000000` WETH wei; wallet gas `0`; minimum `4975000000000000` WETH wei. Embedded solver/network cost is not deducted twice. |
| B — Uniswap-like separate gas | Same sell budget and tokens; quote 0.0051 WETH after pool fee; swap gas 150000, required approval gas 50000, gas price 1 gwei, rate 1 WETH/ETH, 50 bps | Wallet gas `200000000000000` wei = `200000000000000` WETH wei; net `4900000000000000` WETH wei; minimum `5074500000000000`, net minimum `4874500000000000`. A wins the two-scenario estimated-net comparison by `100000000000000` WETH wei. |
| C — unknown swap gas | Scenario B with swap gas estimate blank | Wallet gas and net are unknown; **NOT COMPARABLE — incomplete cost coverage**. No winner is assigned. |

The calculator compares net output only when manually entered sell/buy identifiers and decimals, total sell-token raw budgets, explicit venue-fee coverage, required gas and approval assumptions are compatible. If both scenarios pay wallet gas, they must use the same native-gas-token identifier and conversion rate. Identical manual identifiers are **not** contract verification. The label “Best estimated net output under supplied assumptions” ranks only the entered pair; it never claims a live price, cheapest available route, executable quote or future gas cost.

## Product, privacy and regression evidence

The registry now contains nine tools and the static build thirteen noindex pages. The page has labeled Scenario A/B inputs, three illustrated conditions above, detailed venue/approval/swap-gas and slippage output, a comparison status and a browser-local JSON download. The JSON includes manual assumptions, raw integers, units/decimals, cost coverage, net/minimum amounts, comparability, calculation version and simulation disclaimer. Nothing enters the Taxlot schema or accounting stores. It links to the existing Swap tool and the Token Approval Inspector while disclosing that the latter covers only four reviewed Sepolia pairs.

Deterministic tests cover exact decimal/uint256 arithmetic, embedded-fee non-duplication, explicit unembedded-fee deduction, gas conversion and rounding, approval yes/no/unknown, missing gas/rate, differing decimals, large and zero boundary values, negative net, slippage boundaries, mismatched comparison inputs, invalid/impossible combinations and JSON fidelity. Built-browser tests exercise both scenarios, incomplete coverage, a real local JSON download, keyboard/mobile use and offline calculation. A route guard observed no external HTTP request; a spy observed no wallet-provider request or IndexedDB open. No mainnet RPC or analytics call is needed by the simulator.

The first targeted browser run passed 3/4; its mobile/offline test timed out because the test switched offline before the initial form appeared. After a local 4/4 confirmation, the existing discoverability guard rejected the prototype's React island. The implementation was changed to a deterministic inline bundle of the same exact-integer engine and DOM adapter. Its first built-browser run failed 4/4 because Astro's CSP did not yet contain this explicitly inlined script's hash; the [exact failed output](targeted-browser-csp-failure.txt) is preserved. The corrected build includes the generated SHA-256 hash in the Astro and repository-root Vercel CSP, and the release artifact gate now verifies each executable inline script against the page CSP. The [final targeted browser output](targeted-browser.txt) passes 4/4. None of these local runs is live deployment evidence.

## Limits and release

The engine uses one manually assumed gas price and native-to-buy conversion rate per scenario. It does not model EIP-1559 fee-range uncertainty, refunds, failed approvals/swaps, price impact, MEV, changing quotes, bridging or tax consequences. Display percentage rounding never changes raw integer outputs. A local build or Playwright run is not evidence of a Vercel deployment; no deployment or live network action occurred in this phase.

The first complete clean-commit release run passed 277/277 unit tests, typecheck, build, CSP/artifact checks and 44/45 Playwright tests, then failed the registry-wide toolbox test because the simulator repeated two links already provided by `ToolLayout`. The [exact failed release transcript](release-check-initial-failure.txt) is preserved. The duplicate links were removed from the new component without changing the related-tool registry entries. The subsequent [complete clean-source release transcript](release-check.txt) tested `5502b0e8590c78b9408564b1efd2836d0f2d95af` and passed 277 unit tests, 45 Playwright tests, 147-file Astro diagnostics with 0 errors, 0 warnings and 1 existing hint, 13 noindex pages, 143 guarded artifacts, and build SHA-256 `a51a0fae5e148df088950960f1b28db5a82be082de02ac3a21f3ce91542e1604`. Only documentation and the exact transcript are added after this passing run; the implementation, security configuration and tests remain identical. No deployment occurred.
