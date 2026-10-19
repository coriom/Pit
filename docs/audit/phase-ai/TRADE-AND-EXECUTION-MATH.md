# Phase AI — trade risk and execution mathematics

Status: targeted local acceptance on `feat/pit-toolbox-industrialization`. Full release acceptance remains deferred to Phase AO. No deployment or live transaction occurred. Assumption 8 stays OPEN; public beta stays NO-GO.

## Implementation inventory, fixed before UI work

| Page and mode | Distinct question | Grouped outputs |
| --- | --- | --- |
| Trade Entry & Risk Planner — Average Entry | What did up to ten spot purchase fills cost, and what exit price covers stated fees? | Quantity, gross cost/average, acquisition fees, adjusted cost/average, fee-aware break-even. |
| Trade Entry & Risk Planner — Position Risk | What long-only spot quantity fits a modeled stop-loss budget? | Stop distance and bps, fee-inclusive loss, conservatively rounded supported quantity. |
| Trade Entry & Risk Planner — Risk / Reward | What is the modeled net target payoff relative to modeled stop loss? | Net reward and signed reward/risk ratio. |
| Execution Math Lab — Spread & Deviation | How do entered bid/ask and execution/reference prices differ? | Midpoint, absolute and midpoint-bps spread, signed execution deviation and reference-bps deviation. |
| Execution Math Lab — Slippage Bounds | What exact-input minimum or exact-output maximum follows a stated tolerance? | Token-base-unit floor/ceiling bound and delta. |
| Execution Math Lab — Gas Budget | What can manually stated transaction steps cost? | Transaction and optional approval gas, known aggregate, budget-supported maximum gas price, optional same-native-unit notional ratio. |

There are two new registered tools, six modes and roughly 16 grouped mathematical outputs, not 16 pages. `parseExactAmount` and `formatRaw` are reused from Swap Cost. Phase AI adds a small bounded integer helper rather than a generic finance framework. Token & Fee Converter already owns basic unit conversions; Swap Cost owns manual venue-cost comparison; PnL does not model multi-fill entry or prospective stop-budget sizing. No execution path, market quote or tax-cost-basis claim is introduced.

## Formulas, dimensions and rounding

Manual decimal strings are parsed to BigInt base units. Base quantity precision is 0–36 and quote precision is 0–18. Prices are quote units per one base token. Bps are whole integers from 0 to 10,000. Input strings are bounded to 100 characters, raw inputs/outputs to 256-bit magnitude, fills to ten, gas units to one billion. Exponent notation, negative prices/fees, excess precision and zero denominators fail. Labels are display metadata, not verified token or currency identities.

For raw fill quantities `qᵢ`, raw quote-per-base prices `pᵢ`, base scale `B`, quote scale `Q`, and quote-denominated fees `fᵢ`: gross quote cost is `ceil(Σ(qᵢpᵢ)/B)`; gross average is `Σ(qᵢpᵢ)/Σqᵢ`, displayed down at 18 fractional quote/base digits. Adjusted cost adds only stated quote-unit fees, and adjusted average rounds up. Required gross exit proceeds are `ceil((adjustedCost + fixedExitFee) × 10000/(10000 − exitBps))`; the corresponding break-even price rounds up to quote precision. This is conservative because both quote proceeds and price round up. An unknown fee stays INCOMPLETE; a 100% exit fee has no finite break-even.

For long-only risk with entry `E > stop S`, raw base quantity `q`, and base scale `B`, modeled stop loss is `ceil(q × [E(10000 + entryBps) − S(10000 − exitBps)]/(B × 10000)) + fixedEntryFee + fixedExitFee`. The supported quantity is `floor((budget − fixedFees) × B × 10000/[E(10000 + entryBps) − S(10000 − exitBps)])`, zero if fixed fees exhaust the budget. It is rounded down to base units so modeled loss cannot exceed the budget. At target `T > E`, signed net reward is `floor(q × [T(10000 − exitBps) − E(10000 + entryBps)]/(B × 10000)) − fixedFees`; signed reward/risk divides by the positive modeled loss at 18 decimal places. The stop is a hypothetical price, not a maximum real loss; gaps and slippage may worsen execution.

Spread uses midpoint `(bid + ask)/2`, absolute spread `ask − bid`, and `spread × 10000/midpoint` bps. Signed execution deviation is `execution − reference` and its bps denominator is the reference. This is neither AMM price impact nor realized slippage. Exact-input minimum receive is `floor(expectedRaw × (10000 − toleranceBps)/10000)`; exact-output maximum spend is `ceil(expectedRaw × (10000 + toleranceBps)/10000)`.

Gas price entered in gwei is parsed exactly to wei per gas. Transaction units and explicitly required approval units multiply that price; known aggregate units are added once. A native budget in wei supports `floor(budgetWei/knownGasUnits)` wei per gas. The optional gas/notional ratio requires a separately stated notional in the same manually named native unit. Unknown approval, price, budget or extra gas coverage is INCOMPLETE; no L2 data fee, live gas estimate or token exchange rate is inferred. Display-only midpoint and bps rounding is deterministic half-up. JSON reports retain raw decimal strings, units, precision and assumptions; no monetary floating-point intermediary is used.

## Independent golden vectors

- Fills of 0.1 ETH at 2,000 and 0.2 ETH at 2,500 give quantity 0.3 and gross cost 700. Fees of 1 and 2 give adjusted cost 703. Gross average displays 2,333.333333333333333333; adjusted average rounded up displays 2,343.333333333333333334. With 50 bps plus one fixed quote unit on exit, the independently computed continuous break-even is about 2,358.458961474 and the conservative quote-micro-unit output is **2,358.458964**.
- Entry 2,000, stop 1,900, no fees, budget 100 permits exactly 1 base unit. Entry 100, stop 95, target 110, no fees yields 5 loss, 10 reward and **2 R**.
- Entry 100, stop 95, 50 entry bps, 25 exit bps, one fixed quote unit on each side, budget 100 and six base decimals gives **17.080610** maximum base units. The next base unit exceeds the modeled budget; a deterministic grid tests this boundary.
- Bid 99/ask 101 gives midpoint 100, spread 2 and 200 midpoint bps. Execution 101 versus reference 100 gives +100 reference bps.
- 100 USDC at 50 bps gives minimum receive 99.5 and maximum spend 100.5. With zero token decimals, one token at one bps gives floor 0 minimum or ceiling 2 maximum.
- 21,000 gas at 20 gwei is 420,000,000,000,000 wei = **0.00042 ETH**. Adding 45,000 approval gas gives 66,000 units and 0.00132 ETH. A 0.001 ETH budget over 21,000 units supports 47,619,047,619 wei per gas.

The continuous break-even and fee-inclusive risk-size values were checked with Python `Decimal` separately from the TypeScript implementation; the integer floor/ceiling boundaries follow directly from the documented rational equations. All values are illustrative, not live quotes.

## Contract, UI and isolation

Only `trade-risk` and `execution-math` were added to the closed pure-local contract allowlist. Thin adapters validate mode-specific input shape, nested fills, structured errors and output raw-string shape. Additive v1 unit kinds distinguish manual quote amounts, per-base prices, native gas wei and signed reward/risk; the compatibility check refuses automatic connections of these manual units even when labels match. AG/AH contract meanings remain unchanged. No workflow executor was added.

Each new page presents one mode at a time with labelled inputs, an illustrative sample, a prominent result, feedback, limitations and optional local JSON download. The full application has 15 registered tools. The separate hosted beta remains six calculators: eight HTML pages, one CSS asset, no JS chunks, package SHA-256 `f2907ac694594531e16ab5501e3be7d066edf98f528553f2bf2164dde725a425`. Neither new route enters `READ_ONLY_TOOL_IDS`; no beta package was deployed.

The engines and contracts contain no fetch/RPC, wallet, storage, clock or random access. Focused browser tests intercept external and same-origin API requests and spy on wallet, IndexedDB and Web Storage; all remained zero. Reports use local Blob downloads and text-only DOM insertion. `FEES_ENABLED`, `MAINNET_ENABLED` and `UNISWAP_EXECUTION_ACCEPTED` remain false. CoW, Uniswap, Hyperliquid and Taxlot implementations were not edited.

## Verification and outstanding gates

An expanded first Vitest run passed 29/30 tests; its sole failure was the old exact four-ID allowlist expectation. A later run also passed 29/30 because the new large-input test expected the helper's wording rather than the reused parser's earlier precision rejection; the expected error was corrected. Final targeted and neighboring Vitest passed **114/114 across 13 files**, including 32 contract/AI tests and 82 existing calculator/beta/artifact tests. The two final added tests check risk-fee and slippage-bound monotonicity. Focused Chromium Playwright passed **3/3**, including both workflows, incomplete coverage, local downloads, mobile width and keyboard submission. `pnpm check` reported **203 files, zero errors, zero warnings, one pre-existing hint**. The final full static build generated **19 noindex pages** and SHA-256 `68da5ede300130c0a9582e0fde2dd7c603cf6aca2f1641e71058544f4276608d`. Artifact guards passed **147 files** with project-root CSP/header, SRI, secret, source-map, telemetry and mainnet endpoint checks; discoverability passed 19 routes and 15 tool pages. `pnpm beta:check` preserved the hosted package hash above.

Full Playwright and `CI=1 pnpm release:check` remain intentionally deferred to AO. No hosted or public acceptance is claimed. Existing protected QA and full-test staging were untouched. The installed trusted `property-based-testing` skill guided bounded invariant tests; no skill or dependency was installed.
