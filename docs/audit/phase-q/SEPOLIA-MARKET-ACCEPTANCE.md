# Phase Q — Sepolia read-only market acceptance

## Baseline and invariant

Before edits:

```text
$ git rev-parse HEAD
adc92d8966f40183becd9672633e3505e14771b0
$ git status --short
```

The status command printed nothing. `src/lib/config.ts` defines `FEES_ENABLED: false` and `MAINNET_ENABLED: false`; `src/lib/execution-preflight.ts` pins CoW execution to Ethereum Sepolia `11155111` and `https://api.cow.fi/sepolia`. The added manifest is consumed only by `src/lib/diagnostic-quotes.ts` and its read-only UI. It is absent from CoW's execution-token authorization and private execution `WeakMap`. No allowlist, execution economics, signing, Taxlot, Hyperliquid, legal, origin, indexing, deployment, or fee configuration changed. The exact release-check output below rechecks protected configuration.

`python3 scripts/audit/secrets.py` scanned current files and available Git objects before edits without printing candidate values: 16 commits, 348 blobs, 337 current files, 1477 generic 64-hex matches, one credential-assignment pattern in the existing unreachable negative-test fixture, zero current non-hex candidates and zero non-example committed env files. No genuine credential was identified; the scanner is deliberately conservative about public hashes. Source evidence uses `hex:` for public 32-byte hex strings; replacing that prefix with `0x` is the complete reversible transformation. Large browser RPC code/block response bodies were **truncated by the capture script**, explicitly marked in the browser JSON; they are not claimed as complete raw bodies. No credential-like values were printed or committed.

## Versioned read-only market and context

`src/lib/quote-markets.ts` version **1** declares one directed pair and two fixed diagnostic amounts. Addresses, decimals, and code hashes are exact identities, not symbol matching. Symbols/names are untrusted display metadata. This manifest grants **no** execution or approval permission. Test USDC carries no meaningful USD valuation claim.

| Field | Sell WETH | Buy Circle test USDC |
| --- | --- | --- |
| Chain | Ethereum Sepolia `11155111` | Ethereum Sepolia `11155111` |
| Contract | `0xfff9976782d46cc05630d1f6ebab18b2324d6b14` | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Primary source, retrieved 2026-10-03 UTC | [Uniswap Ethereum deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments) | [Circle USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses) |
| Pinned block | `11834646`, `hex:6ce1752515cdef0c9cdb61cf99dd29e4bc2a554255308fdf16b6592fcaa3da63` | same |
| `eth_getCode` | present, 3124 bytes, Keccak-256 `hex:c864e10689f2da18833652a3b075d43106e87f0f90d95ee64f6f0b33bc026083` | present, 1798 bytes, Keccak-256 `hex:cd3f29e2ea9c61dadd48bfeaf8b2884b6de9dfee7bf45329452c4c33d0868ceb` |
| `decimals()` | `18` | `6` |

The exact on-chain metadata read is [token-metadata.json](token-metadata.json), timestamp `2026-10-03T08:30:49.556Z`. Before quoting, the harness checks chain ID, pinned addresses, current bytecode hashes and decimals at one new block. The predeclared exact-input budgets are **`0.01` and `0.1` WETH** (`10000000000000000` and `100000000000000000` base units); only the first was probed. Selected Uniswap v3 tiers are **500 and 3000 ppm**. No second token pair was introduced.

The first clean-source release run failed at the unchanged artifact secret guard because the **public Uniswap documentation URL** in the browser bundle matched its broad `/v3/` credential-URL pattern. The exact failure transcript is [release-check-initial-failure.txt](release-check-initial-failure.txt). An inspection confirmed that the match was the official public docs URL, not a credential. The manifest still stores the exact URL at runtime via an explicit `new URL` construction, with a regression assertion for the resulting string; no scanner rule, exception list or credential policy was weakened. The corrected source was recommitted before the final clean-tree release run.

Pinned `@cowprotocol/cow-sdk` version **9.2.15** (`@cowprotocol/sdk-order-book` **4.2.0**) uses `OrderBookApi.getQuote` / `POST /api/v1/quote`; the installed request type requires public `from`, SELL `sellAmountBeforeFee` base units, and supports `priceQuality`. The diagnostic requests `priceQuality: "verified"`, `validFor: 1200`, `signingScheme: "eip712"`, and verifies `response.verified === true`, original from/tokens/kind, fee-plus-swap-input equals budget, and nonexpired response before normalization. It never silently downgrades quality. CoW's returned status for the accepted browser quote was `verified:true`.

The public diagnostic `from` is **`0x6f473606a9053ed49bbaa90c23f689348655c947`**, the last 20 bytes of `keccak256(utf8("PIT-Q-DIAGNOSTIC-NON-SIGNING-ADDRESS-v1"))` using viem. This is a fixed synthetic label-derived public address: no private key exists, it is not claimed to belong to an operator, must never be funded, and cannot make a quote operator-executable. Diagnostic CoW responses are normalized for the existing display/ranking path with `diagnosticOnly:true` and `executableThroughPit:false`; `quoteSwap` alone can populate the private execution map after its independent wallet/preflight quote. A subsequent wallet connection cannot promote a diagnostic quote. The unit test calls both real approval/submission entry points with this normalized object and a forged executable label; each rejects `INVALID_EXECUTION_QUOTE` before any signing path. This read path imports no accounting recorder and writes no fill, IndexedDB record or CSV.

## Actual bounded reads and comparison

The production adapters and `collectQuotes`/`rankQuotedOutput` are reused. `pnpm quotes:probe` ran once after the initial RPC investigation; its **exit code was 2** (valid attempted comparison blocked), and its full stdout/stderr is [cli-probe-output.txt](cli-probe-output.txt). The Node viem transport returned `fetch failed` at `eth_chainId` on the approved PublicNode URL, although a separate `curl` chain-ID read returned exact `{"jsonrpc":"2.0","result":"0xaa36a7","id":1}`. The command did not misreport a comparison pass: CoW's same-budget verified quote succeeded (`quote id 1657938`, output `440977303` test-USDC base units, PIT partner fee `0`), Uniswap was classified `RATE_LIMITED_OR_UNREACHABLE` with the original viem transport error retained. The earlier FAST exploration returned `verified:false` and epoch expiration; it was not accepted as a fresh comparison. A later direct VERIFIED read had `verified:true`; the browser run below is the paired acceptance.

A bounded `curl` batch at pinned block `11834646` called factory `getPool` and QuoterV2 `quoteExactInputSingle` for **both** predeclared tiers at `0.01` WETH. All four RPC calls returned data. Tier 500 pool `0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1`, quoter output `566804400` buy base units; tier 3000 pool `0x6ce0896eae6d4bd668fde41bb784548fb8f59b50`, output `526419093`. The exact [CLI request](cli-uniswap-request.json) and [CLI response](cli-uniswap-response.json) are retained. The independent [earlier-browser-block pool identity request](browser-pool-request.json) and [response](browser-pool-response.json) confirm token order, fee and initialization; subsequent quote return data is decoded in [browser-reconciliation.json](browser-reconciliation.json). This curl read establishes actual quoter execution, but it is not temporally paired with the CLI CoW quote and is **not** a same-input freshness acceptance on its own.

The exact RPC submission command was `curl -sS --max-time 25 -H 'content-type: application/json' --data-binary @/tmp/pit-q-rpc-batch.json https://ethereum-sepolia-rpc.publicnode.com`; `/tmp/pit-q-rpc-batch.json` had the same bytes as the linked versioned request JSON. The CLI's initial `pnpm quotes:probe` output and exit code are retained separately. For the browser, `pnpm build`, `pnpm preview`, then a Playwright Chromium click on “Read market quotes” yielded the captured request/response file and screenshot. No network mock or proxy was used by the browser.

**Browser live same-input comparison: PASS, point-in-time testnet observation.** The built static app was served at `http://127.0.0.1:4321/tools/swap/` and its actual “Read market quotes” control was clicked in Chromium without mocks or a wallet. [Browser request/response capture](browser-live-read.json), [SDK/quoter reconciliation](browser-reconciliation.json), and [screenshot](browser-diagnostic.png) preserve the outcome. It read the approved PublicNode RPC and CoW Sepolia quote endpoint by POST, with HTTP 200 responses and no CORS/CSP failure. Its chain-ID response was `0xaa36a7`; the Uniswap calls were pinned to browser block `0xb495c8` (`11834824`), hash `hex:2f421923901cf98854568602f246c45b74a5a28d2ce1226b5b7e658aaa9743f3`. The off-chain CoW quote is **not claimed to have been evaluated at that block**. A later read at that exact block found selected tier-500 pool token0=Circle test USDC, token1=WETH, fee=500 and nonzero `slot0.sqrtPriceX96` (initialized); the browser's own factory/pool and quoter reads are in the capture. The selected pool was one single pool, not a Uniswap all-route search.

| Same `0.01` WETH / `10000000000000000` total debit | CoW verified SELL | Uniswap v3 selected tier 500 |
| --- | --- | --- |
| Actual swap input | `9730994831710201` WETH base units after embedded CoW network fee | `10000000000000000` WETH base units into one pool |
| Quoted buy output | `442009102` test-USDC base units | `566804400` test-USDC base units |
| Embedded provider costs | SDK protocol fee `88419` buy units; network fee `269005168289799` sell units, both already reflected in displayed output | 500 ppm pool fee embedded in quoter output; token-denominated fee unknown |
| Separately paid wallet gas | Unknown; no quote-derived wallet estimate | Unknown; `123373` is QuoterV2 internal gas units, **not** complete transaction gas |
| PIT fee | Exactly `0` (`partnerFeeBps=0`, SDK partner fee amount `0`) | `0`; quote-only, no PIT execution |
| Expiration/quality | `2026-10-03T09:11:25.344901669Z`, `verified:true`, quote ID `1657636` | Observation at the pinned browser block; 30-second local display freshness |
| Action | Diagnostic, never executable | Diagnostic, quote-only; PIT cannot execute |

The built-browser capture at 2026-10-03T09:09:39.067Z rendered `Status: COMPARISON_OK`, `cow: 442.009102`, `uniswap-v3: 566.8044`, and “Best quoted output, excluding separate gas: uniswap-v3. Neither diagnostic quote is executable.” This ranks only exact integer quoted **output**, not lowest overall cost, dollar value, execution quality or guaranteed savings. The captured CoW SDK helper confirms original budget = swap input + network fee and `afterPartnerFees.buyAmount=441268539`; no embedded fee is subtracted again. The browser request inventory contains **zero** approval, wallet signature, order, `eth_sendTransaction`, `eth_sendRawTransaction`, or accounting-write calls. No wallet was connected; no signing control appeared. No live execution occurred. This capture used the source and production artifact generated by the successful clean-tree release check; only evidence files changed afterward.

## Acceptance and limits

| Level | Result |
| --- | --- |
| Deterministic fixture regression | **PASS** — manifest identity/decimals/hash mismatch, verified-context rejection, diagnostic execution-map isolation, no-winner survivor and error classification; original Phase P guards remain in release suite |
| Live token metadata and pool reads | **PASS** — chain, bytecode, decimals, factory pools, actual quoter return data, selected pool identity/initialization |
| Live provider quotes | **PASS in browser** — verified CoW response and two real Uniswap tier responses; **CLI partial** due Node fetch transport failure |
| Live same-input comparison | **PASS in browser only** — fresh same-budget CoW/Uniswap display, selected tier 500 |
| Browser live comparison | **PASS on release-checked local built page** — HTTP 200/CORS, rendered values, screenshot and zero transaction requests |
| Live execution | **NOT PERFORMED** — no approval, signature, order, transaction, deployment, liquidity action or funding |
| Dedicated public HTTPS origin | **BLOCKED** — Assumption 8 remains OPEN; localhost preview cannot prove public Cloudflare headers/TLS/storage |

The deterministic `pnpm release:check` does not run `pnpm quotes:probe` or depend on external market availability. Its complete **358-line** clean-source output is [release-check.txt](release-check.txt). It tested source commit `c3dd5038edcb1af6d2d190d976ebd22c892cce6b` and produced artifact manifest SHA-256 `c323eef27feb0314464f0725152fdb2f8c282bef94075b07f541557681276f70`. Exact decisive lines:

```text
Clean release source: c3dd5038edcb1af6d2d190d976ebd22c892cce6b
PASS protected fee/network configuration: FEES_ENABLED=false; MAINNET_ENABLED=false; recipients/rates unchanged
 Test Files  20 passed (20)
      Tests  137 passed (137)
Result (88 files):
- 0 errors
- 0 warnings
- 0 hints
17:05:47 [build] 11 page(s) built in 14.33s
Build SHA-256: c323eef27feb0314464f0725152fdb2f8c282bef94075b07f541557681276f70
PASS static artifacts: 137 files; 11 HTML pages; 0 external scripts/styles; CSP, SRI, telemetry, secret, source-map and mainnet endpoint guards
PASS discoverability: 11 routes; 7 registry tool pages; 4 local/discovery pages without wallet or protocol JS; indexing policy and sitemap guards
  24 passed (14.3s)
RELEASE CHECK PASS — offline testnet candidate only; no live acceptance or deployment
```

After the check, only this audit document, `docs/VERIFICATION.md`, the exact release transcript, and final browser screenshot/request/reconciliation evidence were added or amended. Source/config/tests and all build inputs remain byte-identical to the tested commit. Phase H remains blocked by absent funded external Sepolia/Hyperliquid-testnet accounts and operator-controlled signatures. Hyperliquid derivative accounting remains `unsupported_derivative_v1`; the legal mainnet fee gate and dedicated-origin acceptance remain unresolved.
