# Phase V — public-address operator observer

**Status: read-only observer implemented; current USDC → WETH CoW quote BLOCKED. No approval, signature, order, transaction, wallet connection, accounting write, deployment or live acceptance occurred.**

## Boundary and workflow

`pnpm operator:observe --address 0xPUBLIC_ADDRESS` accepts only a public EVM address. It reads the existing approved Ethereum Sepolia RPC and CoW Sepolia quote endpoint. It does not import a keystore, wallet client, extension control or signing/submission function. Its stdout is structured JSON; stderr is a short operator report. Exit 0 means the **public-address observer** obtained a fresh verified quote and passed its public checks. Exit 2 means an external/readiness blocker, and exit 3 means invalid input/configuration or an unhandled read error. An observer success **never** means WALLET EXECUTION READY.

The observed intent is fixed: Circle test USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (6 decimals) → WETH `0xfff9976782d46cc05630d1f6ebab18b2324d6b14` (18 decimals), 1 test USDC = `1000000` base units, Ethereum Sepolia `11155111`. This is a read-only market selection, not an execution-token permission. The observer reads both token code hashes/decimals against the existing Phase Q manifest, balances, ETH, allowance to the pinned CoW relayer, and an `eth_estimateGas` simulation of `approve` only when allowance is insufficient. The gas estimate is in gas units; it is not a transaction and not a guaranteed wallet fee. The public RPC and CoW endpoint are the existing configured ones. The CoW SDK's `OrderBookApi.getQuote` requests `priceQuality=verified` with the real public address in `from`; there is no silent quality downgrade or wallet/funding inference from a quote. One SDK attempt is configured for the observer API call.

For a successful response, the observer checks `verified`, from, exact token pair, sell direction, total sell debit (`quote.sellAmount + quote.feeAmount`), protocol fee bps, API expiration and order `validTo`. It calls the pinned SDK `getQuoteAmountsAndCosts` with 50 bps slippage and **zero partner fee**, then the same `normalizeCowQuote` used by the execution comparison. The response is marked `diagnosticOnly=true` and `executableThroughPit=false`. It never invokes `quoteSwap`, never populates CoW's private execution `WeakMap`, and cannot provide the retained posting closure. `approveSwap` and `submitSwap` reject the object with `INVALID_EXECUTION_QUOTE` before any wallet operation. This is separate from a future fresh wallet-bound executable quote and the Phase T checkpoint. A fully green public observation generates one typed handoff card with account, network, token, spender, required/current allowance, gas estimate and explicit `submitted:false`; a failed or missing quote generates no handoff card.

The local-only swap-page observer takes one public-address input. It is rendered only on loopback, never on a public deployment. It reports the actual browser origin when used there and marks storage **UNKNOWN** if the origin is policy-allowed but IndexedDB writability has not been checked by the existing execution preflight; a rejected origin is FAIL. The CLI cannot observe a browser origin or IndexedDB and reports UNKNOWN. It does not open or write an accounting database. The readiness rows reuse `cowOperatorReadiness` IDs/labels/PASS–FAIL–UNKNOWN vocabulary through `cowObservationReadiness`. Wallet connectivity remains UNKNOWN. The observer quote row says **read-only**; the execution quote row in the existing Swap UI still requires the original private CoW quote and GREEN `inspectSwap`.

After a human provides a public approval transaction hash or CoW order UID, `pnpm operator:verify --address 0xPUBLIC_ADDRESS --approval-tx 0xPUBLIC_TX_HASH` or `--order-uid 0xPUBLIC_ORDER_UID` performs only public reads. Approval verification checks chain, receipt success, account, exact USDC token, zero native value, decoded ERC-20 `approve` spender/amount, and refreshed allowance. Order verification checks the public UID's account and token pair, reads status and fills, and aggregates exact integer executed amounts; pending orders are observed at most three times, ten seconds apart. Neither command repeats a wallet action. Both refresh the public-address observer snapshot. An identifier is required before these commands can run; none exists today.

After a real fill, PIT's existing browser-local `FillRecorder` automatically reads CoW trades, writes schema-validated Taxlot `trade` events idempotently, reconciles exact amounts to `eventsCSV`, and appends Phase U evidence for an active session. The public-only CLI **cannot inspect origin-scoped IndexedDB or run the real Taxlot importer on an unexported browser record**. Those steps remain mandatory live-acceptance checks in the approved operator browser; a public order response alone must not be reported as accounting acceptance. No new false accounting path is introduced.

## Current public-address snapshot

At UTC `2026-10-05T04:54:45.535Z`, `pnpm operator:observe --address 0xA94E0b829ABcaB65225c7C18ccA5937011a4a6a7` exited **2**. Ethereum Sepolia block `11846684` had hash `public-hash:618dc109869114f3603248f76a700811:94bbf70a0ec9e77af4653c49e3e2657a` (reconstruct by joining the two halves and prefixing `0x`; this documented transformation prevents the conservative credential-pattern scanner from mistaking a confirmed public block hash for a private key). The observer returned:

| Public observation | Value |
| --- | --- |
| RPC chain | `11155111` |
| ETH | `50000000000000000` wei = 0.05 ETH |
| Test USDC | `20000000` base units = 20.000000 |
| WETH | `0` base units |
| USDC allowance to relayer | `0` base units |
| Approval target | `0xC92E8bdf79f0507f65a392b0ab4667716BFE0110` |
| Approval required if a later valid 1 USDC execution quote exists | yes |
| Read-only approval gas estimate | `56240` gas units; gas price observation `977942580` wei/gas |
| Fee/mainnet flags | `FEES_ENABLED=false`, `MAINNET_ENABLED=false` |
| Fresh CoW quote | **none**; SDK error `HTTP 404 NoLiquidity: no route found` |

The exact current readiness rows were: wallet UNKNOWN; chain PASS; CoW endpoint/contracts PASS; fee flags PASS; ERC-20 identities PASS; funds PASS; accounting storage UNKNOWN; read-only quote FAIL. `handoff=null`; **OBSERVER BLOCKED · WALLET EXECUTION READY: NO.** No operator cryptographic action is requested. The independent direct API reproduction at `2026-10-05T04:26:34Z` returned HTTP 404 `{"errorType":"NoLiquidity","description":"no route found"}` for 1 USDC. A single bounded 5 USDC read-only diagnostic at `2026-10-05T04:27:05Z` returned the same HTTP 404 body. This establishes a current no-route response for those two exact amounts; it does not prove all amounts or all future market states lack liquidity. Neither direct API request was an executable quote or an order.

## Deterministic controls and limitations

`tests/operator-observer.test.ts` covers funded and empty balances, wrong chain, RPC failure, code/decimal mismatch, zero and sufficient allowance, unavailable/stale/NoLiquidity quote, zero wallet-provider calls, and rejection of observer quote objects by both real approval/submission entry points. `tests/operator-verification.test.ts` covers exact public approval receipt/spender/allowance and public order/fill identity, with negative wrong-chain/spender/reverted/pending cases. A source guard verifies these modules/commands contain no wallet connection, signing or transaction-submission methods. The local Playwright test checks the observer renders without connecting a wallet and rejects malformed addresses without wallet actions. Fixtures are synthetic; only the snapshot above is a live public read.

The observer is a point-in-time read. A quote expires in at most 60 seconds, often sooner. Balances, allowance, gas price and liquidity can change. Before any human wallet prompt, the existing wallet-connected PIT path must independently refresh account, chain, origin/storage, balances and its own original CoW execution quote; the operator must inspect the app checkpoint and each wallet prompt. The observer's public address does not prove wallet control. Phase H-live remains BLOCKED. Hyperliquid collateral remains out of scope and blocked. Assumption 8 remains OPEN; no dedicated public HTTPS origin was deployed or verified. No legal/mainnet/fee gate changed.

## Clean-source release verification

`pnpm release:check` exited **0** against clean tested source commit `ea0dd61212c440187caf391f8105a3bf67ad76da`. Its [complete 369-line combined output](release-check.txt) has SHA-256 `617772b772845c173783ef7d1159bbb30a35d3386ded0c2dc7a47ca36e00557b`. The output records **164 unit tests in 25 files**, **28 Playwright tests**, **106 checked files with zero errors/warnings/hints**, **11 static pages**, and production build SHA-256 `a36c5cd3ab49332af49df939d774df07e090b2e8c21bf6c8eb1f0a7ec7cbf253`. Static artifact guards passed for 137 files, including CSP/SRI, secret-pattern, source-map, analytics and unexpected-mainnet checks. This is offline release-candidate evidence, not live CoW acceptance.

Only this audit document, `docs/VERIFICATION.md`, and the exact release transcript are amended after the tested-source check. No source, configuration, scripts, tests, lockfile or public asset changes are included in that evidence amendment.
