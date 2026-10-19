# Phase AH — exact conversions and yield scenarios

Status: **targeted local acceptance PASS; consolidated release acceptance deferred to AO**. This branch has not been deployed. `FEES_ENABLED=false`, `MAINNET_ENABLED=false`, and ordinary `UNISWAP_EXECUTION_ACCEPTED=false` remain unchanged. Assumption 8 remains OPEN.

## Scope and architecture

Two registered local tools expose twelve modes, one mode at a time:

| Page | Modes |
| --- | --- |
| `/tools/token-fee-converter/` | ETH/gwei/wei; ERC-20 human/base units; percent/bps/ppm; apply a stated fee |
| `/tools/yield-growth/` | APR→APY; APY→APR; periodic→annual; simple future value; compound future value; recurring contributions; required income principal; loss recovery |

The arithmetic is in `src/lib/token-fee-converter.ts` and `src/lib/yield-growth.ts`, using the existing exact decimal parser/formatter. The thin `src/lib/ah-tool-contracts.ts` adapters add runtime input/output checks and typed ports. Only these two IDs were added to the closed pure-local composition allowlist. Neither execution tools nor external-read tools entered it. V1 semantics for Swap Cost and Portfolio Exposure were left untouched. The full toolbox registry has 13 tools; the independently reviewed read-only beta allowlist remains six tools and eight pages. No workflow engine or graph was added.

## Exact model

- Decimal input is parsed to BigInt raw units; exponent notation, signs on nonnegative inputs, excess decimal precision, unsafe integer counts and uint256 overflow are rejected. Token decimals must be a whole number from 0 to 36. Ticker and currency labels are manual metadata, never asset identity or price evidence.
- Native: `wei = ETH × 10^18 = gwei × 10^9`. Token: `base units = human units × 10^decimals`. These conversions do not round; excess precision fails.
- Rate ratio has 10^18 raw units: `percent / 100 = bps / 10000 = ppm / 1000000`. Fee: `feeRaw = roundHalfUp(amountRaw × ratioRaw / 10^18)`, `afterFeeRaw = amountRaw − feeRaw`. Fee rates above 100% fail. No venue fee or exchange rate is inferred.
- Yield internal rate factor uses 10^36 fixed-point units. Nominal APR `r` at `n` periods/year gives `APY = (1 + r/n)^n − 1`. Periodic return `p` gives `(1+p)^n−1`. APY→APR uses a bounded integer binary search over nominal APR from −100% to 1000%, choosing the closest 10^−18 ratio unit; unreachable APYs fail. Rate products round half-up at the 10^36 fixed-point boundary. APR, APY and periodic return ports remain distinct.
- Simple future value: `P × (1 + r × years)`; compound future value: `P × (1+r/n)^(n×years)`. Whole years and at most 1200 total periods are required; no fractional period is silently modeled. Money is represented in 10^18 manual units. Simple and compound monetary products round half-up at the final result; recurring-contribution balances round half-up each period. Negative ending value fails.
- Contributions: for each period, beginning timing computes `roundHalfUp((balance + contribution) × factor)`; end timing computes `roundHalfUp(balance × factor) + contribution`. The result reports starting principal, total contributions, modeled growth and ending value separately. Required principal for annual income is `ceil(income / positive effective APY)` in raw money units. Recovery after loss `L` is `L/(1−L)`; 100% loss has no finite recovery gain.

Independent reference vectors were calculated separately from the production engine: Python `Decimal` at high precision gives monthly 12% nominal APR → 12.682503013196972066…% APY; PIT reports `126825030131969721` raw ratio, or 12.6825030131969721%. One ETH is 1,000,000,000,000,000,000 wei; one gwei is 1,000,000,000 wei; 1.234567 of a six-decimal token is 1,234,567 base units; 50 bps is 0.5% and 5,000 ppm. Simple 1,000 at 5% for two years ends at 1,100. A 20% loss requires 25% recovery gain. For two 1%-per-period contributions of 100 from zero, beginning timing ends at 203.01 and end timing at 201. A 100 annual-income target at assumed 5% effective APY needs 2,000 principal. These are illustrative assumptions, not live yields or investment advice.

The inverse search is bounded and rounded to the nearest 10^−18 ratio unit; it is not a symbolic root. Constant rates, an unchanged manual currency unit, no fees, taxes or inflation, and no price movement are assumed. No continuous compounding is offered. A manually supplied rate is not a forecast or guaranteed income. JSON reports serialize exact raw integers as decimal strings with the mode, contract version, units, assumptions and limitations; no BigInt becomes an untyped JSON number.

## Targeted checks and isolation

- Targeted Vitest: 27/27 tests across four files, covering reference vectors, inverse tolerance, negative/zero cases, precision, contract output checks and incompatible ports.
- A wider targeted regression initially passed 85/86 cases. The one failure was an existing registry test with an exact list of the previous six local tools; it did not reflect the two new reviewed entries. The expectation was updated to include those IDs, with the tool metadata invariants still checked separately. The confirmation result is recorded below.
- Focused Chromium Playwright: 3/3 tests, covering mode switching, error states, local JSON downloads, keyboard/mobile interaction, and instrumentation showing no external HTTP request, wallet call, IndexedDB open or localStorage method call in those journeys.
- `pnpm check`: 188 files, 0 errors, 0 warnings, 1 pre-existing hint in `scripts/audit/verify-live-setup.mjs`.
- Full static build: 17 noindex pages; 145 files passed the static-artifact guard (CSP, SRI, telemetry, secrets, source maps, mainnet endpoint checks). The final build SHA-256 is recorded below.
- `pnpm beta:check`: eight allowlisted pages, one CSS, four CSP hashes; candidate SHA-256 `951fc927bf07dbb06974b96de5c13734b7edb7b66ec30a6676391ca1c59aa32d`; hosted-package SHA-256 `f2907ac694594531e16ab5501e3be7d066edf98f528553f2bf2164dde725a425`, unchanged from the accepted package. The two AH pages are absent from this artifact. Nothing was deployed.

The complete Playwright suite and `CI=1 pnpm release:check` are intentionally deferred to Phase AO. AH targeted acceptance is not a full release or public acceptance.

Final full-build SHA-256: `e4845fa4d483cb6930122dd44c765415d026cdddc08278bae1a2a7e6b8614f65`.

Wider targeted regression confirmation: **86/86 PASS** across Swap Cost, Portfolio Exposure, registry, beta, discoverability, static artifacts and beta-host tests.
