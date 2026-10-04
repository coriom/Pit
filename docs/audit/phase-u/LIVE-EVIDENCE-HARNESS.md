# Phase U — local live-acceptance evidence harness

**Status: deterministic fixture acceptance only. No wallet action, live swap/order, fill, or deployment occurred in this phase.** Evidence capture does not mean live acceptance has passed.

## Existing operator sequence and new capture boundary

The Phase H requirements remain the acceptance criteria. Phase T's read-only readiness and explicit checkpoints remain the action gate. This phase adds a separate, local IndexedDB database, `pit-acceptance-evidence-v1`, with immutable `sessions` and append-only `entries`. Its API imports no wallet, signing, submission or HTTP client. The `Acceptance evidence` view appears in the swap/perps testnet UI; an operator starts a random-UUID session for the connected public account and selected protocol. No session is created by a dry run. The view can reselect an earlier session after reload and export JSON/Markdown locally. It makes no credential or network request. All writes use the existing `assertStorageEnabled()` origin policy. Existing Taxlot/derivative databases and records are not migrated or deleted.

A session contains version, local ID, `cow` or `hyperliquid`, public account, exact Sepolia/testnet environment, UTC start, and `operator` or `synthetic-fixture` source. Typed entries contain UTC observation time and an idempotency key. Only explicit public fields are accepted: readiness row IDs/statuses, checkpoint kind, quote/fill integer amounts, protocol identifiers and statuses, zero PIT fee fields, Taxlot/raw IDs and reconciliation results. There is no arbitrary raw payload, URL, credential, cookie, auth header, private key, seed or signature field. Unknown properties are rejected. Corrections append a separate `amendment` referring to an earlier entry; no update/delete API exists. IndexedDB's unique key rejects concurrent duplicate callbacks. The recorder's completed-action key is stable by order UID or fill ID/hash. The existing Taxlot and raw derivative writers are independently idempotent.

| Observed phase | Capture point | Scope/meaning |
| --- | --- | --- |
| Readiness/checkpoint | After operator review checkbox, before existing action callback | Snapshot and explicit review; never a signature by itself. Dry run does not record. |
| CoW quote | Original wallet-bound `quoteSwap` result, only when CoW result survives current request revision | Local quote identity and helper-derived expected output/PIT partner fee. Diagnostic comparison quotes do not enter this path. |
| CoW approval/submission | Only after existing `approveSwap`/`submitSwap` resolves | Approval may have been unnecessary if allowance existed; `cow-approval` means the callback completed, not that an approval transaction happened. Submission records the real returned UID, not settlement. |
| CoW status/fill | Existing orderbook poll / after `recordCowFill` returns | Only submitted UIDs in the active session get order statuses; confirmed fill maps to the original Taxlot event and same CSV serializer. A fill predating the session is excluded. |
| Hyperliquid submission/status | After `placePerp` returns / read-only `orderStatus` result | Submitted order ID when exposed; terminal order status plus observed position size/open-order flag. A resting order is not a fill. |
| Hyperliquid fill | After `recordPerpFills` completes | Finds raw evidence by public fill ID/hash; reconciliation stops at raw `unsupported_derivative_v1`. No Taxlot event/CSV is produced. |

Evidence errors are shown as an evidence gap. They never call, retry or duplicate `approveSwap`, `submitSwap`, `placePerp`, wallet prompts, or a position close. The active session must be started before a trade and kept selected or reselected on reload; otherwise no acceptance entries are claimed. A failed accounting write remains a sync error requiring manual investigation, not a fabricated reconciled row. Report export says `UNVERIFIED` until independent protocol/fee/accounting/terminal checks pass.

## Reconciliation

`reconcileCow` compares the orderbook's *executed* base-unit `sellAmountBeforeFees`, `buyAmount`, and `sellAmount - sellAmountBeforeFees` to the stored Taxlot `quantity`, `counter_quantity`, and sell-asset fee using exact `parseUnits` arithmetic. It also checks the exact asset identities and fee asset. It classifies account, UID-derived event ID, source, `raw_row_ref`, trade type and settlement hash separately as metadata differences. The CSV comparison uses `eventsCSV([stored])`, the same serializer used by PIT export; a different row is `CSV_MISMATCH`. A missing event, economic mismatch or CSV mismatch cannot be a `MATCH`. The locally observed fill is not an independent on-chain audit: a future operator must verify UID/settlement/amounts and PIT fee against the protocol/explorer.

`reconcileHyperliquid` checks account, fill/order IDs, market, side, size, price and exchange fee against the raw derivative store, explicitly refuses a Hyperliquid Taxlot spot event, and returns `RAW_ONLY`, `MISSING_RECORD`, `EVIDENCE_MISMATCH` or `FALSE_TAXLOT_EVENT`. It does not invent realized PnL, funding normalization, disposal, or a derivative CSV. The order-status read records terminal order state and a point-in-time position snapshot; a final exposure check still needs the operator's independent read.

## Synthetic fixture results

`tests/acceptance-evidence.test.ts` uses **synthetic-fixture** sessions and inert identifiers. It covers one CoW settlement with exact 6/18-decimal quantities and actual `recordCowFill` → IndexedDB → `eventsCSV` round-trip; missing event, changed CSV, economic difference; rejected and expired order statuses without fill; partial/resting and failed Hyperliquid submissions; a real raw-store fixture fill, missing/mismatched raw evidence and false Taxlot-event rejection; duplicate callbacks; append-only amendment; unsafe-origin write failure; zero `fetch` calls from the recorder. Existing `tests/e2e/operator-readiness.spec.ts` proves disconnected dry-run UI does not call wallet signing/order APIs or create an evidence session. These are not live order identifiers or transactions.

## Future operator run

1. Run `pnpm release:check` and follow Phase T readiness. Connect a funded **external** wallet, select the protocol, and start a local acceptance session before requesting an executable quote/order. Verify the account, chain/environment, origin, fee disclosure and all readiness rows. Never provide PIT a key or credential.
2. Review and explicitly confirm each PIT checkpoint and each separate wallet prompt. After an action, inspect the protocol response. Never resubmit solely because evidence writing failed.
3. Wait for the actual CoW UID/orderbook status/settlement hash and executed amounts, or Hyperliquid order/fill ID and terminal order/position state. Reconcile actual PIT records and exported Taxlot CSV for CoW; inspect raw derivative evidence only for Hyperliquid. Verify actual zero PIT partner/builder fee separately from protocol fees/gas.
4. Export the session JSON and Markdown report. Treat missing/mismatched entries, unresolved position, absent public origin verification or missing protocol confirmation as acceptance blockers. Record independent explorer/API evidence alongside the local report; neither local entries nor synthetic fixtures prove live acceptance.

Phase H is still blocked by externally funded testnet accounts and operator-approved wallet actions. Phase K dedicated public HTTPS origin/Assumption 8 remains OPEN. Legal/mainnet/fee activation remains outside this phase. No live protocol execution or public deployment occurred.

## Committed-source release verification

`pnpm release:check` ran against clean tested source commit `be2d4d032f7260f02872dfd509585dd87d5f28e5`; complete unchanged output is [release-check.txt](release-check.txt) (366 lines, SHA-256 `0b40ebd61985e888c4f236f5f43bc1f3a81dd7e6d0fd6637f61870e282571344`). Result: 157 unit tests in 23 files; 27 Playwright tests; 99 typechecked files with zero errors, warnings or hints; 11-page production build; 137 static artifacts passing CSP/SRI, origin, secret, source-map, mainnet and indexing guards. Production artifact SHA-256: `5d8513c0ab4e6819401968fb384b8b75363bff3755b4f0dad0d909f4bd1de8ba`. Release status is **offline testnet candidate only**.

Only this audit document, `docs/VERIFICATION.md`, and the exact release transcript were added/updated after the tested commit. The final amended commit must retain every tested source, test, configuration, lockfile, script and public asset byte-for-byte.
