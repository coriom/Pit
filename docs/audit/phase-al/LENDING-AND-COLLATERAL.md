# Phase AL — lending and collateral mathematics

Status: implementation inventory fixed before UI work. This is a manual, browser-local model; Phase AO retains consolidated release acceptance.

| Page and mode | Distinct user question | Planned calculations |
| --- | --- | --- |
| Collateral health / Health & capacity | How much modeled headroom remains? | Current LTV, health factor, LTV distance, two-constraint debt ceiling and headroom, equity and gross exposure leverage. |
| Collateral health / Repay, add or withdraw | What minimum change would satisfy both constraints? | Conservative minimum repayment, minimum collateral addition, maximum withdrawal and post-change ratios. |
| Collateral health / Shock & buffer | How would fixed-debt collateral loss affect the buffer? | Shocked collateral, LTV and HF; critical/target collateral threshold and drop distance. |
| Borrowing cost / Debt growth | How do simple and scheduled nominal APR costs differ? | ACT/365 interest and debt, discrete compound debt, incremental compound cost. |
| Borrowing cost / Repayment | What happens to a fixed end-of-period payment? | Period interest, payment allocation, remaining debt, cumulative totals, payoff or non-amortizing classification. |
| Borrowing cost / Carry | Does a stated manual yield exceed stated financing cost? | Simple earnings, debt cost, known-fee net carry, break-even yield and funding summary. |

Two full-toolbox pages and six modes group approximately fifteen calculations. No liquidation-price engine, APR/APY converter, protocol adapter, optimizer or trading route is duplicated. Reuse is limited to bounded BigInt parsing, exact decimal formatting, integer rounding, local JSON export, the closed pure-tool v1 boundary and the existing compact tool styling. Both sides of each scenario use one explicitly labelled manual currency and precision; ticker matches prove no identity. The isolated six-tool beta remains frozen.

## Collateral algebra

The declared currency has 0–18 decimals. Values are nonnegative bounded BigInt base units. LTV and liquidation threshold are whole bps satisfying `0 ≤ LTV ≤ LT ≤ 10000`. Target HF is an explicit 18-decimal factor from 1 through 10. With collateral `C`, debt `D`, maximum LTV fraction `L`, threshold fraction `T` and target HF `H`:

- Current LTV is `D/C` if `C > 0`; HF is `C×T/D` if `D > 0`. No debt means **HF not applicable**, not infinity. With zero collateral and positive debt, HF is zero.
- The LTV debt ceiling is `floor(C×L)` and the target-HF debt ceiling is `floor(C×T/H)`; allowable additional debt is `max(0, min(ceilings)−D)`. Existing breaches remain visible, even when headroom is zero. Equity is `C−D`; gross exposure leverage `C/(C−D)` appears only for positive equity.
- Minimum repayment is `max(0,D−min(ceilings))`. For positive debt, required collateral is `max(ceil(D/L),ceil(D×H/T))`; minimum addition is `max(0,required−C)` and maximum withdrawal is `max(0,C−required)` only while the current position satisfies both constraints. A zero max LTV with positive debt cannot be repaired by adding collateral alone. Rounded candidates are checked against both inequalities.
- For a user-supplied collateral shock `s` in [-100%,+100%], shocked collateral is `floor(C×(1+s))` while debt and thresholds stay fixed. The critical collateral for HF=1 is `ceil(D/T)`. The current collateral-value distance to that threshold is `(C−critical)/C` when `C>0`. This is not a liquidation price, oracle result or guaranteed liquidation rule.

Independent examples: at `C=2000`, `D=1000`, max LTV 75%, LT 80%, current LTV is 50%, HF is 1.6, LTV-only debt ceiling is 1500. A target HF 1.3 limits total modeled debt to 1230.76 at two decimals, leaving **230.76** headroom. With `C=1500`, `D=1000`, target HF 1.5, repayment **200** or collateral addition **375** reaches the target. With `C=2000`, target HF 1.2, maximum value-only withdrawal is **500**. A -40% shock changes C to 1200 and HF to **0.96**; critical C is 1250 and the original 2000 value is **37.5%** above that critical drop distance. Tests check one smallest currency unit beyond the safe withdrawal fails the inequality.

The single collateral/debt assumption excludes weighted multi-collateral thresholds, eMode, isolation mode, oracle freshness, interest-index movement, liquidation bonus and protocol caps. Value changes are not executable token quantities; fees and execution costs are outside the displayed constraint math.

## Borrowing, repayment and carry

Nominal APR is a whole bps input (0–100%). ACT/365 simple interest for whole days is `ceil(P×APR_bps×days/(10000×365))`, rounded conservatively to the smallest declared currency unit. Discrete growth uses the exact rational `ceil(P×(1+APR_bps/(10000×periodsPerYear))^elapsedPeriods)` with **one** final currency-unit round-up. Period frequency is 1–365 and elapsed periods at most 600; up to 36,500 whole days are supported for simple scenarios. These are distinct entered horizons; the UI cautions against comparing different time spans.

For repayment, each period's interest is `ceil(openingDebt×APR_bps/(10000×periodsPerYear))`; the payment is `min(fixedPayment, openingDebt+interest)` at the period end. Closing debt is `opening+interest−actualPayment`, never negative. `payment−interest` can be negative, correctly showing unpaid interest capitalized into debt. The schedule records 1–600 bounded periods, cumulative interest/payments and the first payoff period, if reached; it never invents a payoff beyond the entered horizon.

For carry, simple investment return is the signed floor of `P×yield_bps×days/(10000×365)`, financing cost is the conservative simple interest above, and gross carry is return minus financing. Known separate same-currency costs are deducted once; a declared embedded cost is not deducted again. Unknown cost coverage or missing separate cost withholds **net carry** and a positive-carry conclusion. When principal and horizon are positive, break-even whole annual yield bps is `ceil((financing+separateCost)×10000×365/(P×days))`. Matching labels never establish a conversion between a token yield and a currency debt.

Independent examples: 1000 at nominal 12% for 365 days has simple interest **120** and debt **1120**. Exact monthly compounding yields `1000×1.01^12 = 1126.825030131969720661201` before currency rounding, or **1126.83** at two decimals. With a fixed 100 end-month payment, first-period interest is **10**, principal reduction **90**, debt **910**; second interest is **9.10**, principal reduction **90.90**, debt **819.10**. Borrowed capital 500 at 8% cost and 12% hypothetical simple return for 365 days yields **40** cost, **60** modeled return and **+20** gross carry before other costs. These examples are fictional and do not imply future rates or advice.

## Contract and release boundaries

Only `collateral-health` and `borrowing-cost` join the explicit v1 `local-pure` allowlist. Mode-specific input shapes, bounded arithmetic, structured invalid/incomplete results and output identities are validated. The additive `manual-ltv-bps` and `health-factor` units cannot connect to each other, APR/APY or manual currency values; even a matching `manual-quote` label does not auto-connect. Both pages export local JSON with raw decimal strings, units, inputs, calculation version, rounding, assumptions and limitations. Neither page contacts a protocol, wallet, API, storage database or analytics service.

The first beta check detected a **different package hash**, although its eight-page inventory and safety checks passed. The cause was verified by rebuilding the accepted HEAD in `/tmp`: Tailwind scanned two ordinary words in new AL source and emitted unused layout-width and text-overflow CSS utilities into the beta asset. Those source words were renamed without changing calculations. A later audit draft also included the utility names and reproduced the same hash change; that prose was adjusted. A repeated beta check restored the exact reviewed host package SHA-256 `f2907ac694594531e16ab5501e3be7d066edf98f528553f2bf2164dde725a425`; no beta page or allowlist changed. This sensitivity is a build-architecture limitation for Phase AO to harden, not permission to deploy a different package.

Focused Vitest on AL engines/contracts plus AG–AK contracts, registry, Yield, Staking, Trade Risk and Portfolio Rebalance: **71/71 PASS across 13 files**. Focused Chromium Playwright: **3/3 PASS** for all six modes, examples, invalid/incomplete states, local JSON downloads, mobile keyboard interaction and intercepted external/API/wallet/storage access. `pnpm check`: **248 files, zero errors, zero warnings, one pre-existing hint** in `scripts/audit/verify-live-setup.mjs`. Full static build: **25 noindex pages**, with generated HTTP CSP hashes and no sitemap; build SHA-256 `f20798fd048907a1e7b7ec1d6a83be76710057886a81a4a2c78054805a643e91`. Artifact guard: **153 files, 25 HTML pages, zero external scripts/styles**, with CSP, SRI, telemetry, secret, source-map and mainnet-endpoint guards PASS.

Final `pnpm beta:check`: **eight pages, six local calculators, one CSS asset, ten served files, eleven package files and four exact inline CSP hashes**; reviewed host-package SHA-256 `f2907ac694594531e16ab5501e3be7d066edf98f528553f2bf2164dde725a425` is unchanged and the package is **not deployed**. Neither AL ID appears in `READ_ONLY_TOOL_IDS`.

The complete Playwright suite and `CI=1 pnpm release:check` are deferred to Phase AO. Assumption 8 remains OPEN; public beta remains NO-GO. The previously installed `property-based-testing` skill informed bounded monotonicity and repayment-conservation tests; no new skill or dependency was installed. No deployment, RPC call, wallet action or transaction occurred.
