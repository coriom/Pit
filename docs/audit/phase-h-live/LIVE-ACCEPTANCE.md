# Phase H-live — real testnet acceptance

**Overall status: BLOCKED. No wallet prompt, approval, signature, order, fill, transaction, or acceptance session occurred.** The operator has not supplied or connected an externally controlled funded Ethereum Sepolia / Hyperliquid-testnet account in this session. PIT must stop both protocols at the mandatory readiness gate. No public identifiers or executed quantities are available; none are synthesized from fixture tests or Phase Q/S diagnostic quotes.

## Initial preflight — 2026-10-04 UTC

Exact command results before any action:

```text
$ git rev-parse HEAD
0abf69600702f0ce9c6dde08b8b238d393e67938
$ git status --short
```

`pnpm release:check` exited **0** on the clean commit above. Its [complete 365-line exact output](preflight-release.txt) records **157/157 unit tests**, **27/27 Playwright tests**, **99 files with zero typecheck diagnostics**, **11 static pages**, and production artifact SHA-256 `5d8513c0ab4e6819401968fb384b8b75363bff3755b4f0dad0d909f4bd1de8ba`. The check reports `FEES_ENABLED=false`, `MAINNET_ENABLED=false`, the protected Taxlot schema identity, default-deny origin policy, and tracked-file/production-artifact credential-pattern checks. The only tracked environment template found was `.env.example`; no actual `.env.local` was created or read. Pattern scans are not a claim of finding all possible encoded secrets.

Source configuration at this preflight: `src/lib/config.ts` sets both fee and mainnet flags to `false`; `src/lib/execution-preflight.ts` pins CoW chain ID `11155111`, API `https://api.cow.fi/sepolia`, settlement `0x9008D19f58AAbD9eD0D60971565AA8510560ab41`, relayer `0xC92E8bdf79f0507f65a392b0ab4667716BFE0110`; Hyperliquid requires `isTestnet=true`, API `https://api.hyperliquid-testnet.xyz`, RPC `https://rpc.hyperliquid-testnet.xyz`. `src/lib/storage-origins.ts` has an empty public-origin allowlist; loopback is permitted by `storage-policy.ts`, while the actual future operator-browser origin has not been observed. These are **configured gates**, not proof of a connected wallet or a live exchange environment in this session.

| Mandatory predicate | CoW | Hyperliquid | Evidence / blocker |
| --- | --- | --- | --- |
| Fee/mainnet flags | PASS | PASS | Exact static flags and clean release check. |
| Configured network/endpoints | PASS | PASS | Exact constants and release tests; selected wallet chain/account still UNKNOWN. |
| Externally controlled public account | UNKNOWN | UNKNOWN | No connected external wallet or public address was supplied in this session. |
| Selected chain/environment in operator wallet | UNKNOWN | UNKNOWN | No live wallet/provider state could be read. CoW must be **Ethereum Sepolia**, not Base Sepolia. |
| Required sell-token balance / testnet collateral and gas | UNKNOWN | UNKNOWN | No public account exists here for balance/collateral reads. |
| Actual accounting origin and writable PIT storage | UNKNOWN | UNKNOWN | Policy passes offline; no operator browser origin/IndexedDB session exists. |
| Fresh original executable quote / reviewed order inputs | UNKNOWN | UNKNOWN | No wallet-bound quote or Hyperliquid order review occurred. Diagnostic quotes cannot satisfy this. |
| Operator approval of every wallet prompt | NOT STARTED | NOT STARTED | No prompt was initiated. |

**Stop condition:** H.1 requires every mandatory item GREEN before a signing/submission control is actionable. The missing external wallet makes account, chain, balances/collateral, actual storage origin, and action review UNKNOWN. Execution cannot proceed without violating that requirement. This is the external prerequisite for a future supervised operator session; PIT did not request a key, seed, password, API credential, faucet action, or wallet automation.

## Protocol and accounting outcomes

| Acceptance item | CoW Sepolia | Hyperliquid testnet |
| --- | --- | --- |
| Live execution | **BLOCKED — no funded external account/operator wallet session** | **BLOCKED — no funded external account/operator wallet session** |
| Public account, assets/market, side, exact amount | NOT COLLECTED | NOT COLLECTED |
| Approval transaction hash / wallet signature | NONE | NONE |
| Order UID / order ID / fill identifier | NONE | NONE |
| Settlement transaction hash / terminal order or position state | NONE | NONE |
| Executed amounts, protocol/exchange/network fees | NOT VERIFIED | NOT VERIFIED |
| Actual PIT partner/builder fee charged | NOT VERIFIED; configured fee is zero | NOT VERIFIED; configured builder is omitted |
| Protocol API/explorer verification | NOT POSSIBLE without public identifiers | NOT POSSIBLE without public identifiers |
| PIT persisted event/evidence | No real fill, so no live Taxlot event | No real fill, so no live raw derivative record |
| CSV and real Taxlot importer | NOT RUN against a real fill | Taxlot-v1 derivative export remains forbidden |
| Phase U acceptance JSON / Markdown | NONE — no live session started | NONE — no live session started |

No live network → IndexedDB → CSV → Taxlot-import economic or metadata comparison can be computed. A future confirmed crypto-to-crypto CoW fill must be checked as `trade` against the unchanged `schemas/events.v1.json`, then reconciled in exact integer units; any economic mismatch blocks acceptance. A future Hyperliquid fill must reconcile only to raw evidence with `unsupported_derivative_v1`; no spot Taxlot row or CSV may be manufactured. The Phase U synthetic tests prove the local code paths, not this missing live result.

## Next operator session

Follow [Phase T readiness](../phase-t/LIVE-READINESS.md) and the [Phase U evidence sequence](../phase-u/LIVE-EVIDENCE-HARNESS.md): readiness → start local evidence session → separately reviewed wallet action → independently confirmed protocol result → local accounting reconciliation → JSON/Markdown export → final human acceptance review. Capture the real public account and wallet chain/testnet environment before action. For any prompt, the operator must inspect and explicitly approve it. The exact original CoW quote and Hyperliquid order review must be generated in that session. Do not submit another trade merely to repair missing evidence.

Phase K dedicated public HTTPS origin/Assumption 8 remains OPEN. Mainnet/fee activation and the legal opinion gate remain closed. Hyperliquid derivative normalization remains unsupported by Taxlot v1. No public deployment or source change was made in this blocked attempt.

## Post-documentation release check

After the evidence-only commit `f533a9bf7e8434d0b4d5c108c857d3b8a3b6f937`, `pnpm release:check` exited **0** from a clean tree. The [complete exact 365-line output](post-release.txt) has SHA-256 `75492c4f046b635cabd16032372c87dc55043d28be5139f3cfc71b8e5e2d4e3c`: 157/157 unit tests, 27/27 Playwright tests, 99 typechecked files with zero diagnostics, 11 built pages and unchanged build hash `5d8513c0ab4e6819401968fb384b8b75363bff3755b4f0dad0d909f4bd1de8ba`. This is post-documentation verification, **not** a post-live result. Only this audit document and this exact transcript were amended afterward; no application source, test, configuration, lockfile, script or public asset changed.
