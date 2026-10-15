# Phase Z.5 — final controlled Uniswap Sepolia acceptance

**Status: BLOCKED after one confirmed exact approval; no swap.** The operator authorized at most one exact approval and one conditional exact-input Sepolia swap, with no automatic retry. The consumed Z.3 authorization was not reused. Ordinary source remains `FEES_ENABLED=false`, `MAINNET_ENABLED=false`, and `UNISWAP_EXECUTION_ACCEPTED=false`. Assumption 8 and legal/mainnet gates remain OPEN.

## Read-only baseline and provenance

Initial clean checkout: `eaa37410c1848868d1524ab678577da59a19bfd9`, branch `main`, tracking `origin/main` with divergence `0/0`, remote `git@github.com:coriom/Pit.git`. No other worktree was present.

The exact detached acceptance-worktree transformation changed only `src/lib/uniswap-execution.ts` from `UNISWAP_EXECUTION_ACCEPTED=false` to `true`. Original SHA-256: `545d0e2934fe49f9b7db90785966090e5715f8a2548c3c4153281b720851e9c8`. Transformed and loopback-served SHA-256: `b30d51732e4a3af997b91819e1f35f04d01fa910839cce5c5a4817d72b1113d6`. The normal release guard rejected transformed source. The runner refused a pre-existing port-4397 listener, served only on `127.0.0.1`, and removed the worktree and server afterward. This is local test-only execution provenance, not a public deployment.

Uniswap's official [Ethereum deployment table](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments) lists the Sepolia factory `0x0227628f3F023bb0B980b67D528571c95c6DaC1c`, QuoterV2 `0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3`, SwapRouter02 `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E`, and WETH `0xfff9976782d46cc05630d1f6ebab18b2324d6b14`. The configured Circle test-USDC is `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`.

## On-chain eligibility snapshot

At `2026-10-15T07:03:20.317Z`, PIT's approved PublicNode Sepolia RPC returned chain `11155111`, block `11918815` (`public-hash:40ad75a24d31bed3ba2c341c2d1818c9:d6301aaede85b6925dc7539c490448ca`, block time `07:03:12Z`). Disposable operator `0x29d0B5939dcC4D0492D72ABd1210dEbd6c90cC96` held `44999738966345580` wei ETH and `270299154` Circle test-USDC base units. Router allowance was `0`. Latest and pending nonces were both `2`; no currently pending nonce was observed. Historical Z.3 has no transaction hash, so a dropped historical broadcast cannot be reconstructed solely from current state; its bridge and subsequent chain checks found no signing request, receipt or allowance change.

Router, factory, quoter, WETH, USDC and pool each had deployed bytecode. Router `factory()` and pool `factory()` matched the official factory; router `WETH9()` matched the configured WETH. Factory `getPool(USDC,WETH,500)` returned `0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1`. The pool reported USDC token0, WETH token1, fee `500`, liquidity `17546888889318986`, nonzero `sqrtPriceX96=371247112865176988664208414782573`, and `unlocked=true`.

The current exact `approve(router,10000000)` estimate was `140018` gas. Observed gas price was `1000018` wei; fee estimator returned maximum fee `1000021` wei/gas and priority fee `1000000` wei/gas. A 2× approval gas-limit budget (`280036` gas) at that observed maximum fee would cost at most `280041880756` wei, leaving `44999458924464824` wei ETH at the snapshot. This is a point-in-time estimate, not a future transaction cap. A **real swap gas estimate and total two-transaction maximum are NOT VERIFIED before allowance exists**; both must be refreshed after any confirmed approval, and a swap must stop if conservative ETH headroom fails.

## Actual adapter preflight

The isolated wallet-facing adapter used a read-only/mock-signing EIP-1193 identity and obtained a new privately retained 10-test-USDC→WETH quote through the reviewed 500-tier pool. The application reported GREEN, quoted `219456597527126` WETH wei, minimum `218359314539490` wei at 50 bps slippage, PIT fee `0`, and approval required. Quote acquisition took `12973` ms; identity/readiness took `7325` ms; the dry-run checkpoint took `69` ms. At `2026-10-15T07:04:04.457Z`, `19040` ms remained before expiry `07:04:23.497Z`. **This quote has expired and must never be used for a transaction.** The adapter issued zero transaction calls. The Phase Z.4 isolated mock and deterministic tests separately proved that exact approval can reach its own GREEN checkpoint without relying on the swap quote's remaining lifetime, and that approval invalidates the old quote. A later swap needs a new original wallet-bound quote and separate confirmation.

## Authorization manifest — operator approved for one bounded campaign

| Field | Exact bounded intent |
| --- | --- |
| Chain and account | Ethereum Sepolia `11155111`; `0x29d0B5939dcC4D0492D72ABd1210dEbd6c90cC96` |
| Conditional transaction 1 | One ERC-20 `approve` on `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, spender `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E`, amount exactly `10000000` base units, ETH value `0`; skip if refreshed allowance suffices |
| Conditional transaction 2 | One `exactInputSingle` through the same router; USDC→WETH, 500-ppm pool, exact input no more than `10000000` USDC base units, recipient the same account, ETH value `0`; only after receipt/allowance verification and a wholly new quote |
| Slippage | 50 bps maximum; quote-derived `amountOutMinimum` rechecked at wallet boundary |
| Current nonce and allowance | Latest/pending `2/2`; allowance `0` at the snapshot |
| Current approval gas | `140018` estimated gas; 2× gas-limit illustration `280036`; at observed max fee `1000021` wei/gas, illustrative cost `280041880756` wei |
| Swap gas and combined maximum | NOT VERIFIED until approval changes allowance; must be freshly estimated and disclosed before the swap wallet call |
| Source identity | Ordinary commit `eaa37410c1848868d1524ab678577da59a19bfd9`; original source SHA-256 `545d0e2934fe49f9b7db90785966090e5715f8a2548c3c4153281b720851e9c8`; transformed/served test-only SHA-256 `b30d51732e4a3af997b91819e1f35f04d01fa910839cce5c5a4817d72b1113d6` |
| Retry policy | At most one approval and one swap; no automatic retry of signing, submission, ambiguous broadcast, revert or timeout |

The operator explicitly authorized this exact Z.5 intent for one bounded testnet campaign. Before any state-changing action, refresh chain, nonce, balances, allowance, contract/pool identity, quote, gas and fee headroom. The real sender path must use the separately gated exact approval checkpoint. A verified approval invalidates the old quote. The swap then requires at least 10 seconds of actual quote validity at the wallet call boundary and a separate operator checkpoint.

The test-only runner retires `--z3-live`, requires an explicit Z.5 authorization marker for `--z5-live`, writes new `Z5-*` evidence files without overwriting Z.3, and inspects all status elements for approval confirmation. Targeted syntax and 17 unit tests passed, including rejection of the consumed live mode and missing authorization marker. The full release check result is recorded below.

## One authorized live campaign — stopped after approval

The exact clean-source candidate was local commit `217de5e194d370fcf2c5605816b873c53609d8ec`. Its detached acceptance source had the same original and transformed SHA-256 values above, and the live browser confirmed the transformed source was served from its owned loopback server. The real initial quote was wallet-bound and GREEN: sell `10000000` test-USDC base units, expected `219456597527126` WETH wei, minimum `218359314539490` wei at 50 bps, pool fee tier 500, PIT fee `0`. It expired at `2026-10-15T07:19:35.878Z` and was never used for the swap. Quote acquisition took `15969` ms and readiness took `7067` ms. The separate approval checkpoint was GREEN at `07:19:23.431Z`, 12447 ms before that swap-quote expiry; this expiry does not govern the independent approval intent.

At `07:19:48.477Z`, the approval wallet boundary rechecked latest/pending nonce `2/2`, ETH `44999738966345580` wei, test-USDC `270299154` base units, allowance `0`, gas estimate `140018`, and gas price `1000017` wei. It accepted only `approve(SwapRouter02,10000000)` on Circle test-USDC, ETH value zero, through the isolated disposable signer. The single transaction returned at `07:19:52.841Z`: `public-hash:5ce91888706102f31ad20c87df5f5603:c75fb5550a561f032be84b022b0670df`. This reversible `public-hash:first32:last32` spelling preserves the exact verified public identifier while avoiding the repository's conservative private-key-pattern scanner. No second approval was sent.

Independent PIT-approved RPC verification found Sepolia chain `11155111`, exact sender/operator, exact test-USDC destination, zero ETH value, byte-for-byte exact approval calldata, and successful receipt in block `11918899`, `public-hash:8b83efa6489173ed9f637a62e44929:6a0794134e6f0e34fc14489d46cb82c6fe` at `2026-10-15T07:20:00Z`. Gas used was `137757`, effective price `1000017` wei/gas, cost `137759341869` wei. Afterward the router allowance was exactly `10000000`; ETH was `44999601207003711` wei, test-USDC remained `270299154`, WETH remained zero, and latest/pending nonce was `3/3`. This proves the approval, not a swap.

At `07:20:15.730Z`, the UI recorded approval confirmation and invalidated the old swap quote. The runner requested a new wallet-bound quote, but stopped at `fresh_quote_after_approval` at `07:20:54.930Z` with safe code `QUOTE_EXPIRED`. The safe transcript does not retain the new quote's identity, expiry or exact failing subcheck, so **the precise post-approval quote failure substep is NOT VERIFIED**. No `Z5-preswap`, swap hash, swap receipt or fill evidence exists. The bridge recorded one transaction hash in total. The resulting exact router allowance remains `10000000` base units; per the operator's instruction it was not automatically revoked. A later campaign would require separate authorization, but this milestone stops here.

**Live Uniswap settlement and Taxlot/IndexedDB/CSV/Generic importer reconciliation: NOT PERFORMED.** No successful Uniswap trade event is claimed. The prior real CoW Sepolia acceptance is unaffected. Normal and staging Uniswap execution remain disabled, and this campaign must not be retried automatically.

## Release and delivery

The complete clean-source `CI=1 pnpm release:check` [transcript](Z5-release-check.txt) passed: 250 unit tests across 31 files, Astro diagnostics on 135 files with 0 errors, 0 warnings and 1 existing hint, 11 noindex static pages, 138 guarded artifacts, and 37 Playwright tests. Build SHA-256 was `cafa88ceb301709563fe058e8fdbf07cb1b235bbac6e7a3425355b8bea934a40`. The transcript SHA-256 was `27bbecad0fd9e7c820806ec673aa7f0513b8482d0e4fe71b652adfa2d898827e`. The release label is an **offline testnet candidate**; it does not promote the blocked live Uniswap swap to acceptance. The tracked JSON evidence stores independently verified public transaction and block hashes in the same reversible representation; the original `/tmp` runner transcript is outside Git. Final remote delivery is verified separately.
