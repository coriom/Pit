# Phase AK — staking rewards and token vesting

Status: implemented and locally verified on the feature branch. Consolidated release acceptance remains Phase AO.

| Tool and mode | User question | Distinct outputs |
| --- | --- | --- |
| Staking / Reward projection | What does a manual APR imply over whole days? | Gross simple ACT/365 rewards, commission, net rewards, period rate and separate known fee treatment. |
| Staking / Claim economics | Would a manually modeled reward cover a stated claim cost? | Commission coverage, converted cost, modeled net, minimum gross break-even and optional whole-day accrual wait. |
| Staking / Restaking and penalty | How do same-asset periodic restaking, costs and an illustrative principal slash interact? | Post-slash principal, simple baseline, restaked outcome, net rewards and separately paid costs. |
| Vesting / Linear cliff | How much of a stated allocation is modeled unlocked at a supplied UTC date? | Vested, locked and optional vested-but-not-received balance. |
| Vesting / Initial plus linear | How does an immediate share affect later linear unlocks? | Initial and later unlocked amounts, total vested/locked and optional unreceived. |
| Vesting / Tranches | What have dated manual tranches unlocked, and what is next? | Cumulative unlocked, remaining locked, next event and schedule shares. |

Reuse: `parseExactAmount`/`formatRaw` for exact token units, Phase AI bounded BigInt arithmetic, AG–AJ closed pure-local contracts, existing local JSON/download and CSP-inline-script patterns, ToolLayout and compact calculator styling. Yield & Growth retains generic APR/APY and compounding mathematics; this batch does not duplicate those conversions. The restaking recurrence is narrower because it includes same-asset commission, per-period claim/restake cost and principal slashing. No staking, claiming or token-distributor capability is introduced.

Two routes—`/tools/staking-rewards/` and `/tools/vesting-unlocks/`—add two registry entries, six modes and roughly fifteen grouped calculations. An output breakdown is not counted as a separate web tool. Full PIT now has 19 registered tools; the isolated hosted beta remains six.

## Exact reward, commission and cost policy

Manual token amounts use declared decimals 0–36 and BigInt raw units, bounded to 256-bit magnitude. Bps are whole integers 0–10,000; elapsed days are 0–36,500 under **ACT/365 fixed**, so a leap year does not silently change the annual denominator. APR is a nominal input and is never renamed APY. No floating-point monetary intermediate exists.

For stake `P`, nominal APR bps `r`, whole elapsed days `d` and commission bps `c`, simple gross reward is `floor(P × r × d / (10000 × 365))`. Operator commission is `ceil(gross × c / 10000)`; net before other costs is `gross − commission`. Net modeled period return, when `P > 0`, is `net/P` shown as percent to 18 decimals. A zero stake has zero raw rewards but undefined percentage return. An additional fee is deducted only when explicitly marked separate in the **same** reward token. Explicitly absent means zero; unknown coverage or missing amount makes final net INCOMPLETE. This rate is over the entered observation period, not annualized or guaranteed.

Claim economics distinguish a stated balance **before** commission from one whose commission was **already deducted**. The latter is not charged again. A separately paid fee in a confirmed same reward asset uses equal decimals and raw units directly. A different fee asset needs a positive manual `reward tokens per fee token` rate; conversion to reward-token raw units is `ceil(feeRaw × rateRaw × 10^rewardDecimals / (10^feeDecimals × 10^18))`. This is an explicit assumption, never inferred from tickers. A fee already deducted from the stated balance is not deducted again. A missing relation, rate or coverage yields INCOMPLETE without a fabricated net.

The minimum **gross-before-commission** amount to cover known separate cost `C` is `ceil(C × 10000 / (10000 − c))`, with token-base-unit rounding. At 100% commission and positive cost there is no finite break-even. If the user supplies a constant gross accrual `A` per whole day, the modeled wait is `ceil(minimumGross/A)`; zero `A` with positive threshold is unreachable. Net after costs below zero is UNPROFITABLE, exactly zero is BREAK-EVEN, and above zero is profitable **only under these assumptions**. None of these results asserts current on-chain claimability or recommends a claim.

The independently checked reference `P=1000`, `r=1200 bps`, `d=365`, `c=1000 bps` yields gross 120, commission 12 and net 108 tokens. A stated gross claim balance of 10 tokens with 10% commission not yet deducted and a separate 0.5-token same-asset cost yields `10 − 1 − 0.5 = 8.5` tokens. The smallest six-decimal gross balance that covers 0.5 after a 10% commission is 0.555556; one raw unit less leaves the net one raw unit short. With 0.25 gross token/day, whole-day break-even is 3 days. These are fictional manual examples.

## Same-asset restaking and principal penalty

Restaking requires explicit user confirmation that stake and rewards are the same asset; a matching label alone is insufficient. The model supports whole years 1–10, 1–365 periods per year, at most 3650 iterations. A hypothetical slash first reduces principal by `ceil(P × slashBps / 10000)`. The simple baseline on remaining principal `Q` is `grossSimple = floor(Q × aprBps × years / 10000)` and `netSimple = grossSimple − ceil(grossSimple × commissionBps / 10000)`. It is shown before periodic restaking costs.

For each restaking period, `grossᵢ = floor(currentᵢ × aprBps / (10000 × periodsPerYear))`, `netᵢ = grossᵢ − ceil(grossᵢ × commissionBps / 10000)`, and `currentᵢ₊₁ = currentᵢ + netᵢ − separateFeeᵢ`. A declared fee already reflected in the manually entered APR is not deducted a second time. Unknown cost coverage withholds the restaked final result. If a separate fee exceeds that period's earned net reward, the scenario is INCOMPLETE: funding it from principal is not assumed. Principal after slash, earned rewards, separate costs and final value remain distinct; no blended APY or slash probability is invented. A 2% slash on 1000 principal leaves **980** before modeled earnings and expenses.

## UTC vesting and conservation

All dates are strict `YYYY-MM-DD` UTC calendar days, years 1900–2100; start must precede end by at most 36,500 days. The observation date is always explicit. The engine accepts 0–36 token decimals and 1–30 unique strictly increasing tranches. Token labels are manual display metadata, not contract identities. No system clock, RPC, wallet or token-distributor state is read.

For linear vesting, accrued allocation at observation day `t` within `[start,end)` is `floor(total × (t−start)/(end−start))`. Before start it is zero; at or after end it is exactly total. An optional cliff between start and end holds all accrued allocation at zero before the cliff, then unlocks accrual through the cliff date immediately. For initial-plus-linear, `initial = floor(total × initialBps/10000)` unlocks at start and only the exact remainder follows the same linear/cliff rule. Thus the initial share is never counted twice, and the final vested amount is exactly total despite intermediate floors. A 10,000-token allocation with 10% initial unlock gives 1,000 initial plus 9,000 linear remainder.

Scheduled tranches must sum **exactly** to the stated total; the engine does not invent a date for an unscheduled balance. Cumulative unlocked is the sum of tranches dated on or before observation; locked is total minus unlocked. The first later tranche is the next listed event. The 100/300/600 schedule on 2026-01-01, 2026-04-01 and 2026-07-01 yields 400 unlocked and 600 locked at 2026-05-01, with 600 next listed for 2026-07-01. Each tranche's share is shown when total is positive. Optional previously received tokens must not exceed modeled vested tokens; their difference is labelled *vested but not yet received under manual inputs*, never verified claimable. A zero allocation has defined zero raw balances but an undefined percentage.

The leap-day golden case uses three indivisible tokens from 2024-02-28 to 2024-03-01: floor(3×1/2)=1 token on 2024-02-29 and exactly three at end. Integer floors preserve `vested + locked = total` at every tested observation date.

## Contracts, UI and boundaries

Only `staking-rewards` and `vesting-unlocks` join the explicit v1 pure-local allowlist. Mode-specific runtime shape and numeric validation, structured input errors, raw-string output checks, commission and allocation conservation checks, and manual-token/nominal-rate ports are provided. Vesting ports carry the explicit observation date. Existing `compatiblePorts` already rejects manual-label token identity, APR/APY substitution, mismatched decimals and differing dates. No workflow runner or execution capability was added. AG–AJ contract meanings remain unchanged.

Each page presents one mode at a time with illustrative defaults/load-example action, a prominent modeled result, secondary detail, error/incomplete state, limitations and local JSON export. The report contains version, mode, exact raw strings, unit/decimal metadata, dates, assumptions and an explicit simulation disclaimer. Form input never enters a URL, remote request, telemetry or accounting store. Browser tests intercept external and same-origin API requests and spy on wallet, IndexedDB and Web Storage.

## Focused verification and remaining gates

Focused Vitest on staking, vesting, AK contracts, AG–AJ contract neighbors and registry: **39/39 tests PASS across eight files**. Focused Chromium Playwright: **3/3 PASS**, covering every mode, illustrative numbers, incomplete/invalid states, local JSON, keyboard/mobile, and intercepted network/wallet/storage calls. `pnpm check`: **232 files, zero errors, zero warnings, one pre-existing hint** in `scripts/audit/verify-live-setup.mjs`. `pnpm build`: **23 noindex static pages**, build SHA-256 `7297f0f6d5b639228270f39b1c61cb031cbcd33f657a01ff5c87bd98177f8ca5`. Static artifact guard: **151 files, 23 HTML pages, zero external scripts/styles**, with CSP, SRI, telemetry, secret, source-map and mainnet-endpoint guards PASS.

`pnpm beta:check`: **eight pages, six allowlisted calculators, one CSS asset, ten served files, eleven package files, four exact inline CSP hashes**, package SHA-256 `f2907ac694594531e16ab5501e3be7d066edf98f528553f2bf2164dde725a425` unchanged. The beta package was **not deployed**. AK pages remain outside `READ_ONLY_TOOL_IDS`. No wallet signing, RPC, transaction, accounting storage, deployment or external publication occurred. Tests use illustrative local inputs only.

The complete Playwright suite and `CI=1 pnpm release:check` remain reserved for Phase AO. No public or hosted acceptance is claimed. Assumption 8 stays OPEN; public beta stays NO-GO. The installed `property-based-testing` skill informed bounded token conservation, claim break-even and vesting date invariants. No skill or dependency was installed for AK.
