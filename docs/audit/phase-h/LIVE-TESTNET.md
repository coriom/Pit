# Phase H — live testnet acceptance BLOCKED

Baseline: `3651f775bdb6ee6c0df601bf1a9dbf3e488b77fc`. **Neither CoW nor Hyperliquid was executed.** There was no external wallet connection, wallet signature, ERC20 approval, submitted order, settlement or new exposure. No live acceptance is claimed. The requested phase commit records the blocked attempt, operator preparation and the required derivative-accounting correction, not successful execution.

## Exact blocking condition and preflight

Initial interactive `git status --short` was empty and HEAD matched the accepted baseline. [preflight.txt](preflight.txt) captures the subsequent exact command outputs; the only addition at that moment was the preflight script itself. It verifies literal frozen `FEES_ENABLED=false`, `MAINNET_ENABLED=false`, empty fee recipients, CoW's permitted Sepolia chain 11155111 and explicit Hyperliquid testnet transport. Actual selected wallet chain/account could not be checked because no external provider was supplied.

[secret-preflight.txt](secret-preflight.txt) records the current-tree/available-history credential-pattern review with zero unresolved candidates. Only `.env.example` existed; no `.env.local` was created, requested or read. Secret-named PIT/PUBLIC process-environment variables were absent. Process environment values were not printed. Pattern-scanning limits from Phase F remain, including image pixels and unavailable history; no mathematical absence guarantee is claimed.

Exact live-attempt output ([live-attempt.txt](live-attempt.txt)):

```text
$ node scripts/live-e2e.mjs
LIVE EXECUTION BLOCKED: missing public configuration: PIT_LIVE_CDP_URL, PIT_TEST_ACCOUNT, PIT_SEPOLIA_SELL_TOKEN, PIT_SEPOLIA_BUY_TOKEN, PIT_SEPOLIA_SELL_AMOUNT, PIT_HL_PRICE, PIT_HL_SIZE. No test order was sent.

[exit_code=2]
```

The operator was asked for public wallet/setup information and requested a recommendation. We recommended a dedicated browser profile with an external injected wallet, existing Sepolia ERC20 test balances and an already-funded Hyperliquid testnet account, with the smallest viable quoted order and a preference for reducing existing exposure. The operator then explicitly replied: “No — keep live execution blocked and finish the evidence/preparation.” No public account, browser endpoint, confirmed funding, approved amount or signature was supplied in this run. Further live execution is outside this run.

Hyperliquid's [official faucet documentation](https://hyperliquid.gitbook.io/hyperliquid-docs/onboarding/testnet-faucet), checked during this phase, states that faucet eligibility requires an earlier mainnet deposit by the same address. This phase must not make such a deposit. Lack of an already eligible/funded account remains a blocker; no mainnet workaround is authorized.

## Operator procedure prepared, not live-verified

1. Start `pnpm dev --port 4397` on the dedicated loopback origin. Use a dedicated external wallet browser profile; keep all keys/seeds inside that wallet. CDP access must remain loopback-only and must not expose the debug browser publicly. Supply only the public shell parameters listed by the blocker above, plus optional `PIT_DEV_URL`/`PIT_HL_MARKET`; the observer no longer automatically loads environment files.
2. Re-run `python3 scripts/audit/live-preflight.py` and the secret audit before any transaction. Attach the observer with `node scripts/live-e2e.mjs`. It accepts only credential-free loopback CDP/dev URLs. No wallet/trade button is clicked by the script. It creates a new exclusive local evidence file and refuses to overwrite an existing acceptance session; reconcile an existing session rather than blindly retrying.
3. Connect the externally controlled wallet manually. Inspect the **actual** account and chain 11155111, exact ERC20 contracts/decimals, sell amount, SDK quote costs, minimum receive, and absent partner fee. Do not assume test token symbols imply matching contracts or liquidity. Choose the smallest viable quote only after balances/liquidity are known. PIT v1 does not wrap native ETH.
4. Manually approve the exact ERC20 allowance if required; inspect every wallet prompt. Approval is a separate transaction from the one swap. If the quote expires while approving, request a fresh quote and inspect it again. Manually sign and submit **one** CoW swap. The observer blocks an additional order submission on its tab. A timeout does not justify resubmitting: query the existing UID first.
5. Save the CoW UID; query `https://api.cow.fi/sepolia/api/v1/orders/<UID>` and the matching trade/settlement data. Verify chain 11155111 and successful receipt through the wallet RPC and `https://sepolia.etherscan.io/tx/<HASH>`. Record exact executed sell/buy quantities, token decimals, fee quantities, owner, status, block/time and complete signed appData. Submission and fulfillment/settlement are distinct.
6. For Hyperliquid, inspect public testnet `clearinghouseState`, `openOrders`, market metadata and the order book at `https://api.hyperliquid-testnet.xyz/info` before setting an amount. Prefer a minimal **reduce-only** order against existing exposure. If opening a position is necessary, preplan a separately approved reduce-only close; do not change leverage unnecessarily. The observer permits one single-leg order and rejects builder fields or duplicate submissions. It does not execute cancellation or cleanup: any required cancellation/close must be explicitly inspected and manually approved in a separate controlled operator action, with its own evidence. Do not claim a clean final state until positions/open orders are reconciled.
7. Record the Hyperliquid order ID and `orderStatus`/`userFills` results, exact coin/side/size/price/fee/feeToken/time and final position/open-order state. A resting order is not a fill. A canceled terminal order must be labeled canceled, never fabricated as filled.
8. The observer stores sanitized actual submission actions/responses and a connected-account-only IndexedDB snapshot under ignored `docs/audit/phase-h/live/`. It does not save wallet private material or request signatures. Press Enter only after manual verification, or to stop without execution, to save the page/snapshot. These files are evidence for review, not automatically published acceptance. The observer always leaves acceptance unverified.
9. Validate each actual CoW event with the unchanged schema; download the real spot CSV through PIT and reconcile exact raw integers/decimals/fees to its stored row. Preserve token identifiers, transaction/order IDs and timestamps. Hyperliquid gets raw evidence only, never a Taxlot `trade`. Record all cleanup orders separately from the primary acceptance order.
10. After actual live acceptance, rerun `pnpm test`, `pnpm test:e2e` against a fresh build, `pnpm check`, and `pnpm build`, and replace the blocked evidence with independently verified results. The suites below ran after the blocked attempt/remediation, **not after a real fill**.

The observer's syntax and missing-parameter fail-closed path are verified. Its connected real-wallet execution path remains unverified. It is not an exactly-once guarantee across browser tabs/restarts, an exchange risk engine, a proof of server-side fills or an automatic reconciliation engine. The operator controls all signatures; review evidence before any retry. Public protocol source: [CoW API network endpoints](https://docs.cow.fi/cow-protocol/integrate/api), [Hyperliquid API testnet endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api).

## Requested live evidence: none available

| Evidence | CoW | Hyperliquid |
| --- | --- | --- |
| Connected public account | NOT COLLECTED — provider missing | NOT COLLECTED — provider missing |
| Network | Source permits Sepolia 11155111; actual wallet selection NOT VERIFIED | SDK transport testnet; no actual request submitted |
| Assets / market / side / exact size | NOT COLLECTED — public inputs missing | NOT COLLECTED — public inputs missing |
| Order UID / ID / hash | NONE — no order submitted | NONE — no order submitted |
| Settlement hash / fill | NONE | NONE |
| Executed quantities / final status / timestamp | NOT VERIFIED | NOT VERIFIED |
| Explorer / API verification of execution | NOT RUN — no UID/hash | NOT RUN — no order/fill ID |
| PIT fee actually charged | NOT VERIFIED — no real transaction | NOT VERIFIED — no real fill |
| Final position/exposure | No exposure opened by this run; external account state unknown | No exposure opened by this run; external account state unknown |

## Fee proof: source verified, live charge unverified

`src/lib/config.ts`, `src/lib/cow.ts` and `src/lib/hyperliquid.ts` remain byte-identical to the fee-disabled baseline, verified in [invariants.txt](invariants.txt). Existing SDK reference/math tests remain green. Default CoW quotes omit `partnerFee`; Hyperliquid orders omit `builder`, and builder approval fails when fees are disabled. The prepared observer rejects any submitted partnerFee/builder field before forwarding it and stores sanitized actual action fields if a future operator submits an order.

**No live zero-fee result can be inferred from those code checks.** To prove it after execution, reconcile the observed CoW request and signed appData with the orderbook order/settlement; reconcile the observed Hyperliquid action with the exact order/fill and fee fields. Protocol, solver/approval gas and exchange fees are separate from PIT integrator fees. Do not label total protocol costs zero.

## Network → IndexedDB → CSV reconciliation

No real fills or exports exist, so no numerical equality or zero-difference claim is possible. Every requested live field remains unavailable:

| Field | Network / API | IndexedDB normalized event | Exported CSV | Difference disposition |
| --- | --- | --- | --- | --- |
| Account / chain / source | Missing live evidence | No real acceptance event | No real acceptance export | Cannot compare |
| Sell token / amount / decimals | Missing | Missing | Missing | Cannot compare |
| Buy token / amount / decimals | Missing | Missing | Missing | Cannot compare |
| Protocol / network / PIT fees | Missing | Missing | Missing | Cannot compare |
| UID / settlement tx / timestamp | Missing | Missing | Missing | Cannot compare |
| CoW event type | Crypto→crypto expected | Producer emits `trade`; no real row | No real row | Offline test only; real event NOT VERIFIED |
| Hyperliquid market/side/size/price/PnL/fee | Missing | No normalized tax event is permitted | Derivative CSV blocked | Deliberately not representable; Phase I BLOCKED |

Offline CoW recorder tests still prove decimal precision, `trade` classification (including stablecoins), copied-schema validation, atomic persistence and CSV serialization for synthetic fills. Those fixtures are not substituted for real execution evidence. The schema is byte-identical to current `/home/corio/TAXLOT/schemas/events.v1.json`; **schema validation of a real CoW fill was not run because no real fill exists**.

## Derivative accounting: BLOCKED for Phase I

Phase G's producer encoded perpetual fills as review-only `trade` rows with fabricated notional asset identifiers. Even with review warnings, that is not an acceptable derivative representation for Phase H. This phase removes the converter rather than approximating semantics or changing the Taxlot schema.

`recordPerpFills` now writes only original protocol payloads to the existing, origin-guarded `raw` store, identified by account/fill ID, with `kind: hyperliquid-fill-evidence` and `accounting: BLOCKED_PHASE_I`. It creates no event, no invented counter-asset/notional, no tax quantity and no event sequence increment. Existing historical events are not deleted or silently migrated.

The event writer and CSV serializer reject the legacy derivative markers (`hyperliquid` source, `HL-PERP:` asset or `USDC-NOTIONAL` counter-asset). Spot download excludes legacy derivative rows, and the derivative download API/button is disabled. These are semantic refusal checks, not alterations to `schemas/events.v1.json`. No new raw-fill write bypasses the Phase G origin guard.

The revised test calls the actual raw recorder twice, verifies preserved payload/idempotency, zero normalized events, unchanged sequence, rejection of derivative-event insertion, and rejection of derivative CSV. It uses a synthetic fixture and proves code behavior only. Phase I must establish a correct derivative accounting model before any derivative normalization resumes. Real funding, rebates, PnL and liquidation treatment must not be invented.

## Regression results and invariant boundaries

Complete raw outputs: [unit.txt](unit.txt), [playwright.txt](playwright.txt), [typecheck.txt](typecheck.txt), [build.txt](build.txt), [harness-syntax.txt](harness-syntax.txt), [invariants.txt](invariants.txt). All suites passed after the blocked attempt and required remediation. Browser tests use offline fixtures and block external requests; they are not live acceptance.

No fee flag/rate/recipient, mainnet route, storage-origin allowlist, legal/compliance gate, schema definition, publication script or production deployment was changed. No private-key environment file or API credential was created. The static legal page's older statement about separate perps exports is superseded by the explicit Phase H disabled-export behavior documented here; no legal gate was edited.

## Assumptions and remaining blockers

Assumptions 2 and 3 now record missing live parameters and the operator-driven, public-shell-only observer. **Assumption 8 remains OPEN**, including dedicated public-origin verification; derivative accounting is BLOCKED for Phase I. No public origin was deployed or verified. The other assumptions retain their prior dispositions.

Live Phase H remains blocked on: external wallet/browser connection and public account; funded Sepolia ERC20 balances/approval gas and viable quote; funded Hyperliquid testnet account/market/minimal order plan; explicit operator wallet approvals; actual IDs, settlement/fill confirmation, final position reconciliation; actual CoW schema validation and network→storage→CSV reconciliation. Phase I remains blocked on derivative semantics and actual importer acceptance. Mainnet and fee activation remain forbidden; no legal-opinion gate was satisfied.

NOT VERIFIED — Quote the exact output of `node scripts/live-e2e.mjs` after the operator supplies a funded external testnet setup and manually approves the intended actions.
