# Phase F security and evidence audit

Target: `c65a14e76a09f4507e7669aed605996e71650d30`, 2026-09-29. No application source, fee rate/recipient, network configuration, schema, deployment script or legal gate changed. Audit additions are documentation, offline tests and evidence-capture scripts. No trade/order/approval or live acceptance is claimed.

## Result and scope

**One medium, conditional hosting finding remains OPEN.** The fee-disabled local testnet implementation passes the recorded checks. This is not an unconditional security clearance or permission for public/mainnet launch.

Reviewed first-party source, wallet/quote/signing boundaries, fee/config guards, persistence/export, build/CSP/publication code and relevant installed SDK internals. Independent architecture and baseline reviews supported the parent review. Targeted tests validate fee math and persistence; browser tests exercise production hydration/CSP and reproduce the hosting issue without network trades. Dependency internals were reviewed selectively, not exhaustively; this is not a dependency vulnerability census, penetration test of live APIs, economic audit or legal opinion. The optional Codex Security Daybreak capability was unavailable; the standard local review completed. Managed scan `0222227c-f5c4-430c-9615-48930964af0d` was finalized with one finding; the completion tool returned `Validated and indexed the completed Codex Security scan.`

### PIT-F-01 — Shared IPFS path origins expose accounting storage (medium)

Root control: `src/lib/events.ts:26` uses browser-origin IndexedDB `pit-taxlot-v1`. `docs/DEPLOY.md:6` describes path and subdomain gateways; only the latter supplies CID-origin isolation. A gateway serving arbitrary CIDs as executable same-origin pages allows an attacker controlling another CID to read, forge or delete PIT's `events`, `raw` and `meta` stores. Wallet-address filtering is not access control; schema validation cannot authenticate a structurally valid forged record, and duplicate IDs/cursors can suppress legitimate imports.

Attack prerequisites: PIT and attacker content must execute on the same gateway origin and the user must visit attacker content. There is no claim that a deployed gateway has these properties. CID subdomains or a dedicated PIT origin isolate storage; path redirects to such origins also prevent this particular path. The exploit does not extract wallet keys or sign a trade.

Validation: `tests/e2e/storage-origin.spec.ts` creates a synthetic record under `/ipfs/pit-audit-cid/`, navigates to `/ipfs/untrusted-audit-cid/` on the same local origin and reads/deletes it. `playwright.txt` records the passing reproduction. It demonstrates browser origin semantics, not a remote deployment compromise. CWE-668 / incorrect resource isolation.

Disposition: **OPEN; blocks shared-origin gateway use for trading/accounting.** Require and verify a dedicated origin/CID subdomain before such publication. Deployment/config changes are expressly outside Phase F; none were made. Merely changing the database name is insufficient. Localhost acceptance does not require deploying through a path gateway.

## Fee and network proof

`source.txt` contains numbered source/SDK excerpts plus every first-party `FEES_ENABLED` reference found by the recorded `rg` command. `config.ts:2-12` freezes literal `false` flags; there is no environment override. `assertTradingChain` requires both flags for every non-Sepolia configured chain. `cowClient` and `orderbook` invoke this before SDK construction. Tests reject IDs 1, 8453 and 42161 and an unsupported chain. With `FEES_ENABLED=false`, the conjunction is false even if a future edit sets only MAINNET_ENABLED true. This proves current application routing, not an inability for a source maintainer or unrelated SDK consumer to rewrite the program.

`partnerFee()` and `builderConfig()` return undefined before considering unset addresses. Quote execution calls the default helper; perps omit `builder`; approval throws while fees are disabled. Tests that mock an enabled branch use an isolated module and public synthetic addresses, with SDK exchange methods mocked. They do not alter config or produce signatures.

| Configured EVM network | Public fallback RPCs | CoW API mapping / effective gate |
| --- | --- | --- |
| Sepolia 11155111 | `https://ethereum-sepolia-rpc.publicnode.com`, `https://11155111.rpc.thirdweb.com` | `https://api.cow.fi/sepolia/api/v1/` — permitted |
| Ethereum 1 | `https://ethereum-rpc.publicnode.com`, `https://ethereum.reth.rs/rpc` | `https://api.cow.fi/mainnet/api/v1/` — blocked |
| Base 8453 | `https://base-rpc.publicnode.com`, `https://mainnet.base.org` | `https://api.cow.fi/base/api/v1/` — blocked |
| Arbitrum 42161 | `https://arbitrum-one-rpc.publicnode.com`, `https://arb1.arbitrum.io/rpc` | `https://api.cow.fi/arbitrum_one/api/v1/` — blocked |

The SDK's `prod` API environment means the production API host, including its Sepolia path; it does not select mainnet. No PIT custom base URL, partner API key or bearer token is passed. SDK capabilities for other networks/staging/partner hosts are not PIT-configured routes. Wallet balance/metadata/receipt reads call `wallet.request`; the actual RPC destination is controlled by the wallet and cannot be enumerated from PIT source.

Hyperliquid `hlTransport = new HttpTransport({isTestnet:true})` fixes `https://api.hyperliquid-testnet.xyz/info` and `/exchange`, independent of wallet chain and both fee flags. The SDK also defines `https://api.hyperliquid.xyz`; CSP permits it but PIT never selects it. The testnet explorer link is `https://app.hyperliquid-testnet.xyz/explorer/address/…`, shown only for a configured builder. Public network URLs contain no RPC credentials.

## CoW disclosure and execution

`cowAppCode="PIT"`; recipient is empty; configured `volumeBps=20`. Enabled partner metadata is `{volumeBps:20,recipient}`; default disabled metadata omits it. `cowAppData` delegates to SDK `buildAppData` with appCode, slippageBps 50 and market order class. Production quotes go through `TradingSdk.getQuote`, supplying the same configuration through its SDK appData path; the standalone wrapper itself is not the production quote call.

`Swap.tsx:128-164` renders `costsDisplay(quote.quoteResults.amountsAndCosts, ...)` before the approval/sign buttons, then calls that quote's `postSwapOrderFromQuote()` with no overrides. The SDK derives both quote costs and the execution order via `getQuoteAmountsAndCosts`; `getOrderToSign` recomputes with the same stored quote amounts, network cost, partner bps, protocol bps and slippage. SDK excerpts in `source.txt` trace both paths. The display uses integer-based `formatUnits`, including exact rational spot price, protocol fee, network fee, partner fee and after-slippage minimum. Approval gas is disclosed separately, not invented as part of solver cost.

`tests/cow.test.ts` checks SDK-generated appData equality and reference inputs sell=100, buy=200, network=1, partner=20bps, slippage=50bps: spot `202 / 101`, protocol `0`, network `1`, partner `0.404`, minimum `198.59802`. Added cases at partner 0 and 20 with nonzero protocol fee compare the displayed minimum and sell amount with the SDK execution-order helper and appData hash. No trade/signature occurs. These are offline deterministic reference tests against the pinned SDK, not observed settlement amounts. Live quote-to-wallet-to-fill acceptance remains blocked.

## Hyperliquid builder fees

`approveBuilder` passes the connected wallet into ExchangeClient and invokes `approveBuilderFee({builder,maxFeeRate})`. Installed SDK `approveBuilderFee.js` defines `HyperliquidTransaction:ApproveBuilderFee` fields and calls `executeUserSignedAction`; `_userSigned.js` calls `signTypedData` under the `HyperliquidSignTransaction` domain. No agent-key session is implemented or used. A wallet claiming a main account is still a wallet trust assumption; source cannot prove who controls an injected signer.

Orders use `builder:{b,f}` only when enabled and only after `maxBuilderFee >= f`. `b` is normalized lowercase; `f` is integer tenths of a basis point. `1 bps -> 10 -> 0.01%`; perps cap `100 -> 10bps -> 0.1%`; spot helper cap `1000 -> 100bps -> 1%`. Spot execution is out of scope. Tests cover zero, nominal, cap and cap+1 for both kinds, invalid precision, fee-disabled approval rejection, enabled approval/order argument consistency and insufficient approved allowance. All exchange methods in enabled-branch tests are mocks.

The current [official builder-code documentation](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes) corroborates main-wallet approval, tenths-of-bps encoding and the perps/spot limits. Installed source and tests are the release-specific evidence; no approval was executed.

## Taxlot persistence and CSV

`repository.txt` compares both schema byte strings and SHA-256, including the current TAXLOT HEAD. `reproducible.txt` confirms regenerated standalone AJV validator bytes match Phase E. `appendEvent` validates before every application event insertion and after sequence allocation, then atomically writes event/raw/sequence; schema-invalid duplicates are rejected. Raw payloads and sync metadata are deliberately not Taxlot events and do not conform to the event schema. Same-origin scripts can bypass application APIs, as PIT-F-01 demonstrates.

Both fill producers use `type:"trade"`. `audit-taxlot.test.ts` executes the actual CoW fill recorder with mocked wallet metadata for a crypto/stablecoin pair, validates the stored record using a fresh AJV compile of the copied schema, preserves exact decimals/raw fill, tests duplicate/invalid writes, and exports those same stored records. Existing browser tests exercise the actual download from IndexedDB. `eventsCSV` validates each row, quotes values and neutralizes spreadsheet formula prefixes; export selects connected account and separates perps review records.

There is no fiat off-ramp and no disposal-emitting producer. Therefore no crypto/stable trade can be misclassified as a disposal by the current producers; implementation of a positive fiat-disposal flow is **not verified and not claimed**. The policy remains “only actual fiat off-ramps are disposals.” Derivative records are explicitly review-only, with PnL/rebates/raw evidence preserved; schema validity is not proof of correct derivative taxation or acceptance by an actual Taxlot importer.

## Secret-history audit

`secrets-initial.txt` retains redacted candidate findings; `secrets-reviewed.txt` and `secrets-final.txt` record reviewed results. The scanner examines all available Git object-store blobs, including unreachable objects, current authored files including ignored environment files and production dist, plus Git config/HEAD reflog. Third-party installation/cache directories are excluded; shipped dependency code in dist is scanned. The only tracked historical/current env file is `.env.example`, containing public placeholders. No private key, seed phrase, API/RPC token or wallet credential was identified; no rotation/history rewrite was necessary.

Patterns include PEM keys, common service tokens, credential assignments, RPC credentials/basic auth/query strings, 256-bit hex strings and seed-length word strings. Public matches were reviewed in code context: elliptic-curve parameters, signature/storage constants, wallet catalog IDs, appData schema examples, artifact hashes, React event names and a test title. `scripts/audit/public-patterns.json` records fingerprint/reason classifications; no candidate value is printed. Build hashes are independently recomputed before allowlisting. Initial candidate detection exited 1; reviewed audits exit 0 with `candidates: []`.

Limits: this is a pattern and contextual source audit, not proof of absence of encrypted/split/arbitrary passwords or image-hidden credentials. PNG pixels are not text-scanned. Deleted objects absent from the local object database, remote-only refs, external wallets and deployment credentials are outside the available history. No `.env.local` was created or requested.

## Remaining acceptance blockers

- Separately supplied external funded Sepolia/Hyperliquid testnet wallet and public test parameters; actual swap/order/fill evidence, screenshots from `pnpm dev`, and CSV reconciliation. No live execution occurred here.
- Real Taxlot import/mapping and derivative accounting review; byte-level schema divergence would block progress immediately.
- Dedicated-origin verification before IPFS trading/accounting publication; shared path origins remain blocked by PIT-F-01. No deployment was attempted.
- Mainnet/fee activation remains prohibited until the user supplies the MiCA/PSAN opinion summary and a separate release decision. No setting changed.

NOT VERIFIED — Quote the exact output of `node scripts/live-e2e.mjs` after the separate funded testnet session.

NOT VERIFIED — Quote the exact output of the Taxlot importer command against the reconciled live CSV.

NOT VERIFIED — Quote the exact output of a browser origin-isolation and artifact-readback check against any proposed public deployment.
