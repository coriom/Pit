# Phase P — quote integrity and bounded read-only acceptance

## Baseline and security preflight

Before edits, the exact output was:

```text
$ git rev-parse HEAD
487f698c6db2e05c76ff814c8787ac046b37e52c
$ git status --short
$ git log --oneline -6
487f698 feat: add secretless multi-venue swap quote comparison
085687f feat: add registry-driven PIT discoverability foundation
ce52d56 feat: establish PIT DeFi toolbox architecture
acf9c6a security: harden PIT static supply chain and SRI invariants
5f74dc9 ops: verify PIT dedicated testnet deployment origin
229cad0 chore: harden PIT testnet release and execution preflight
```

`src/lib/config.ts` still defines `FEES_ENABLED: false` and `MAINNET_ENABLED: false`; `COW_RELEASE` requires chain `11155111`, `https://api.cow.fi/sepolia`, and the pinned settlement/relayer. The Uniswap adapter uses only the existing `publicRpc[11155111][0]` endpoint and canonical Sepolia QuoterV2. `git diff` contains no fee, recipient, network allowlist, Hyperliquid, Taxlot, indexing, legal or deployment configuration change. `pnpm release:check` checks the protected configuration again.

The credential-pattern scan was run against all available Git object-store blobs (reachable and unreachable), authored current files, ignored env files and Git metadata; it prints paths/rules/fingerprints, never values. Its baseline result was 15 commits, 325 blobs, 329 current files, only `.env.example` in current files/history, zero private-key PEM/provider-token/RPC-credential-URL/seed-word-string hits, 1111 generic 64-hex hits (including build and public hashes) and one credential-assignment hit in an **unreachable negative test fixture** at blob `f7470b0e3ac37476b915ccfe292aa056e23d1e45`, line 39. That line creates a synthetic `API_KEY` artifact expressly for a release-guard rejection test; no credential value is reproduced here. After source/evidence edits, the same scan reported 335 current files, 1225 generic hex hits, zero current non-hex credential candidates, the same one historical negative fixture and zero non-example environment files in history. The raw scanner intentionally exits nonzero on unclassified hex patterns; it is not a clean-pass claim. No actual secret was identified in triage. This pattern scan does not prove absence of encoded, split or image-hidden secrets. The final release guard also scans all tracked files and production artifacts.

## Runtime execution provenance

Before this phase, `inspectSwap` used `executions.get(q)` and mapped every missing object to `QUOTE_EXPIRED`. The Phase O rejection of a normalized Uniswap quote was thus caused by missing private `WeakMap` membership; it did **not** establish how a fresh relabeled object would be classified. It also misused expiry language for unsupported input.

Now `quoteSwap` alone retains the original SDK posting closure in a private `WeakMap`, binds it to the wallet's latest request sequence, and snapshots account, chain, token addresses, integer amount, timestamp, quote-result identity and serialized SDK disclosure values. `inspectSwap`, called at both `approveSwap` and `submitSwap`, first rejects missing/changed provenance as `INVALID_EXECUTION_QUOTE`. Only a structurally valid retained original quote can reach `QUOTE_EXPIRED`. It then repeats the existing wallet, chain, contract, balance, approval-gas and writable-accounting preflight. A second current-quote check after asynchronous preflight prevents a refresh during a read from authorizing the old quote. The UI revokes the old closure on refresh or account/chain/token/amount changes and checks the current form's exact integer amount before enabling or calling either entry point. Out-of-order quote responses cannot replace the latest wallet request or UI request. No order construction, approval recipient, signed economic amount, SDK posting closure or signing semantics changed.

`tests/execution-paths.test.ts` feeds fresh Uniswap-labeled objects, copied CoW displays, executable-label impersonation, fake calldata/posting fields and expired unsupported objects directly to **both** entry points. All return `INVALID_EXECUTION_QUOTE` with zero SDK allowance, approval and posting calls. The positive control keeps a valid Sepolia wallet, balance and storage: it reaches the SDK approval spy (`APPROVAL_BOUNDARY_REACHED`) and posting spy (`{ orderId: "offline" }`). Separate tests revoke a prior quote on refresh, reject changed chain/balance/storage, reject mutated original fields and disclosure, and resolve two asynchronous quotes in reverse order. The browser fixture keeps CoW signing controls absent when only Uniswap survives and records zero signing calls. All of these are deterministic fixtures, not live signatures.

## Same-debit-budget and cost coverage

Pinned packages: `@cowprotocol/cow-sdk` **9.2.15** and its `@cowprotocol/sdk-order-book` **4.2.0** helper. In the pinned `sdk-trading/dist/index.mjs`, `getQuoteRaw` sends `sellAmountBeforeFee: amount` and `getQuote` passes `quote.quote` to `getQuoteAmountsAndCosts`. In the pinned `sdk-order-book/dist/index.mjs` `getQuoteAmountsAndCosts`, for SELL orders, `beforeAllFees.sellAmount = quote.sellAmount + quote.feeAmount`; `afterNetworkCosts.sellAmount = quote.sellAmount`; `afterPartnerFees.buyAmount` is the output after the helper's fee stages; `afterSlippage.buyAmount` is the signed minimum. This is consistent with [CoW's quote API documentation](https://docs.cow.fi/cow-protocol/integrate/api). PIT now requires `beforeAllFees.sellAmount === q.units` and `afterNetworkCosts.sellAmount + networkFee.amountInSellCurrency === q.units`; a mismatch rejects the CoW comparison result. The SDK's own numbers still drive the pre-signature CoW cost disclosure and original posting closure.

| Component | CoW Sepolia SELL | Uniswap v3 Sepolia QuoterV2 |
| --- | --- | --- |
| Requested total sell-token debit | `q.units = beforeAllFees.sellAmount` | Quoter `amountIn` |
| Amount passed into swap stage | `afterNetworkCosts.sellAmount` (solver network fee removed from budget) | Full `amountIn` passed to single pool; LP fee applies inside pool calculation |
| Compared buy output | `afterPartnerFees.buyAmount` | Quoter `amountOut` for selected single-pool tier |
| Protocol / pool fee | SDK `costs.protocolFee.amount` in buy units, already embedded; never subtracted again | Selected fee tier in ppm, embedded in `amountOut`; exact token-denominated fee unavailable (`null`, not zero) |
| Solver/network cost | SDK `costs.networkFee.amountInSellCurrency`, already embedded in CoW output; shown in sell units | No CoW-style solver fee quoted; not represented as zero wallet gas |
| PIT fee | SDK `costs.partnerFee.amount === 0n` required | `0n`; quote-only venue never earns a PIT execution fee |
| Separately paid cost | ERC20 approval wallet gas if needed; amount not known from quote | Wallet swap/approval gas; amount not known from quote |
| Gas estimate | `null`: no wallet gas-unit estimate | QuoterV2 `gasEstimate` in gas **units**, scope `quoter-internal-only`; not a complete wallet transaction estimate |
| Path | CoW solver route, not a specified pool | One exact token-in/token-out pool, selected fee tier and factory-resolved pool address displayed; four canonical tiers are tried independently, but no multi-hop or cross-venue route optimization is claimed |

Both venues must match exact chain, ERC20 addresses (native ETH is distinct from WETH), decimals, direction, BigInt total sell debit and freshness. The selected Uniswap pool is resolved from the official Sepolia factory `0x0227628f3F023bb0B980b67D528571c95c6DaC1c`; the official [Uniswap deployment table](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments) identifies this factory and QuoterV2. Output-only ranking requires two fresh quotes within the ten-second skew limit, preserves exact ties, and uses no JS floating-point money. The UI label is **“Best quoted output (separately paid gas excluded; cost coverage differs)”**; it never claims lowest total cost or guaranteed execution. With one survivor, no winner label appears. The Uniswap card says it is quote-only and cannot be executed through PIT.

The SDK reference fixture uses a total `1,000,000,000,000,000,000` sell-base-unit budget and after-network-cost swap input `999,000,000,000,000,000`. Exact pinned-helper output is: `beforeAllFees.buyAmount=2,005,006`; protocol fee `3,004` buy units; network fee `1,000,000,000,000,000` sell units (or `2,002` buy units by the helper's conversion); `afterNetworkCosts.buyAmount=afterPartnerFees.buyAmount=2,000,000`; PIT fee `0`; `afterSlippage.buyAmount=1,990,000`. A same-budget fixture Uniswap quote of `2,000,001` buy units ranks higher by exactly one buy base unit before separately paid gas; **this is a fixture, not live pricing**. Tests assert CoW output is the SDK's `afterPartnerFees.buyAmount`, not a second fee deduction; a mismatched total debit is rejected. Further tests cover 6/18 decimals, amounts above `Number.MAX_SAFE_INTEGER`, unknown wallet gas, a future timestamp, stale/expired responses, amount/asset/chain/decimal mismatches, ties and timeout/no-liquidity isolation.

## Bounded public reads (no quote acceptance)

**LIVE RPC/API infrastructure read: PASS. LIVE SAME-INPUT COMPARISON: BLOCKED.** PIT has no configured real Sepolia sell/buy token pair. The addresses `0x111…111` and `0x222…222` in existing tests are synthetic contracts, not approved live tokens. No pair or amount could be selected under this phase's “already approved token pairs” rule, and no owned/funded public quote `from` address was supplied. Accordingly, zero pair probes (within the maximum three pairs/two amounts/one retry), no CoW `POST /quote`, no Uniswap `quoteExactInputSingle`, and no pool `getPool` or initialization read were claimed as live. The independently verified factory and quoter cannot establish any pool's liquidity or a valid price. **No mocks or state overrides appear in the following live-read evidence.**

The actual commands used the already configured Sepolia public RPC and CoW endpoint. The first unprivileged `eth_getBlockByNumber` attempt and its one retry returned exactly `curl: (6) Could not resolve host: ethereum-sepolia-rpc.publicnode.com`; the same read-only command succeeded with network permission. The public responses are preserved in [block-response.json](block-response.json), [contracts-response.json](contracts-response.json) and [cow-version.txt](cow-version.txt). For the two JSON-RPC evidence files only, every `0x` prefix on a **32-byte hex field** was reversibly changed to `hex:`. Replacing `hex:` with `0x` reconstructs those exact public hash/return-data strings; no bytes of the long contract code were omitted. This sanitization keeps the protected release scanner from mistaking public block/code hashes for private-key literals. The [first release-check attempt](release-check-initial-failure.txt) failed on that conservative pattern before tests; no source or guard was changed to resolve it. Commands (request IDs and block tag are exact):

```sh
curl -sS --fail --max-time 15 -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":2,"method":"eth_getBlockByNumber","params":["latest",false]}' https://ethereum-sepolia-rpc.publicnode.com
curl -sS --fail --max-time 20 -H 'content-type: application/json' --data '[{"jsonrpc":"2.0","id":3,"method":"eth_getCode","params":["0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3","0xb49454"]},{"jsonrpc":"2.0","id":4,"method":"eth_getCode","params":["0x0227628f3F023bb0B980b67D528571c95c6DaC1c","0xb49454"]},{"jsonrpc":"2.0","id":5,"method":"eth_call","params":[{"to":"0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3","data":"0xc45a0155"},"0xb49454"]}]' https://ethereum-sepolia-rpc.publicnode.com
curl -sS --fail --max-time 15 https://api.cow.fi/sepolia/api/v1/version
```

At approximately 2026-10-03 **07:48:56–07:49:39 UTC**, `eth_chainId` returned `0xaa36a7` (`11155111`); block `0xb49454` (`11,834,452`) had hash `hex:f05d175009baf3749280b1bf6485277480cda13c25c5a959d842adb8a0427391`. QuoterV2 bytecode was 8,273 bytes, Keccak-256 `hex:e4068c0e5f3f2d9980793dd4314d2222dca27d03fd999cb5dca580fd90ceea0e` (SHA-256 `41807167ee6769e9848dc88cc44931db2c9d9f3fe320f8c10e5a588722f4496b`). Factory bytecode was 24,535 bytes, Keccak-256 `hex:acb5afea1f8877239fadd30358add13f2f9d4fb80175402c686d392295224fef`. Quoter `factory()` returned `0x0227628f3f023bb0b980b67d528571c95c6dac1c`. CoW Sepolia `GET /api/v1/version` returned HTTP 200 and `v2.381.3@1911906c068fca7ea890735bb8ca15187bc51b12`. These are infrastructure reads, not provider quotes.

**Browser live read: PARTIAL PASS.** A headless Chromium page at local `http://127.0.0.1:4321` performed actual `fetch` requests to both approved origins at 2026-10-03 07:51:13 UTC: CoW version HTTP 200 and Sepolia `eth_chainId` HTTP 200 / `0xaa36a7`. [Exact development-browser capture](browser-read.json) records both URLs/methods and results. The same read succeeded at 2026-10-03 07:59:22 UTC from the locally **built** static page at `http://127.0.0.1:4398`, with its generated meta CSP present; [that capture](browser-production-read.json) records the exact methods, responses and `responseCsp: null`. Astro preview does not apply Cloudflare `_headers`, so this is not evidence of deployed HTTP CSP headers. The browser did not request a token quote or connect a wallet. These checks prove CORS/network reachability for the two read methods from local PIT pages, not live browser quote acceptance or public-origin acceptance.

## Acceptance disposition

| Criterion | Status | Evidence or blocker |
| --- | --- | --- |
| Deterministic fixture quote and execution-boundary acceptance | **PASS** | Unit and Playwright tests; positive approval/post spies and negative forged-object spies |
| Live RPC/API infrastructure read | **PASS** | Pinned block, bytecode/factory identity, CoW version raw responses |
| Live CoW same-input quote | **BLOCKED** | No approved real Sepolia token pair and no public quote `from` context; no POST sent |
| Live Uniswap single-pool quote/pool initialization | **BLOCKED** | No approved real Sepolia token pair; no quote eth_call sent |
| Live same-input comparison | **BLOCKED** | Neither live provider quote exists; no pricing claim |
| Browser live-read acceptance | **PARTIAL PASS** | Version and chain-ID CORS from dev and built pages with meta CSP; no token quote or deployed HTTP-CSP test |
| Live execution | **NOT PERFORMED** | No approval, signature, order, transaction, deployment or liquidity action |
| Public dedicated-origin acceptance | **BLOCKED** | Assumption 8 remains OPEN, unchanged |

The complete **357-line** clean-tree `pnpm release:check` transcript is in [release-check.txt](release-check.txt). Its tested source was commit `e1925f106b4d7eda390487820cde2ca543005069`; the built artifact manifest SHA-256 was `56ee7fbec4c7618494bb6aca91c872f3be92b73f4bc97f95df97ae283b195f50`. The deterministic release suite does not perform network-dependent probes. Exact decisive output:

```text
Clean release source: e1925f106b4d7eda390487820cde2ca543005069
PASS protected fee/network configuration: FEES_ENABLED=false; MAINNET_ENABLED=false; recipients/rates unchanged
PASS exact Taxlot v1 schema SHA256 d8eb339ed7acd7da3b68ef09fe5c1b01c4cc3258cb401a4f2ba8805e7a3b07d7
PASS origin policy: default-deny; production allowlist empty; legal page unchanged
PASS tracked-file credential patterns and environment-file policy (not a proof against encoded secrets)
PASS no direct analytics dependency or app-source analytics import
 Test Files  19 passed (19)
      Tests  134 passed (134)
Result (83 files):
- 0 errors
- 0 warnings
- 0 hints
16:05:13 [build] 11 page(s) built in 29.91s
Build SHA-256: 56ee7fbec4c7618494bb6aca91c872f3be92b73f4bc97f95df97ae283b195f50
PASS static artifacts: 137 files; 11 HTML pages; 0 external scripts/styles; CSP, SRI, telemetry, secret, source-map and mainnet endpoint guards
PASS discoverability: 11 routes; 7 registry tool pages; 4 local/discovery pages without wallet or protocol JS; indexing policy and sitemap guards
  24 passed (16.2s)
RELEASE CHECK PASS — offline testnet candidate only; no live acceptance or deployment
```

After this run, only this audit document, `docs/VERIFICATION.md` and the exact transcript were amended into the same phase commit; the final file-diff check is recorded in the commit/report. No tested source, test or release-guard file changed.
