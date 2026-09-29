# Phase I — derivative accounting compatibility

**Result: Hyperliquid perpetual accounting is unsupported by Taxlot v1 and fails closed.** Separate raw evidence is retained; it is never a Taxlot event or included in Taxlot CSV. CoW spot fixtures pass the actual workspace Taxlot importer, with the metadata changes listed below. No live wallet, signature, swap, order or deployment occurred. Assumption 8 remains OPEN.

Baseline: `a5830a1eb3f0b030994d77b9bf82aa8a25da4daf`. Taxlot audited HEAD: `a4879aec7ecee5f0049ddfd4780000ae9a63b2e9`. PIT and upstream schema bytes match, SHA-256 `d8eb339ed7acd7da3b68ef09fe5c1b01c4cc3258cb401a4f2ba8805e7a3b07d7`. [Exact schema constraints and numbered upstream implementation](schema-source.txt) are the source evidence, including hashes of the importer, domain model, tax engine and scope checks. The upstream schema was not modified.

## Exact schema capability matrix

All pointers below are relative to `#/definitions/EventV1`; root `$ref` selects this definition. It is an object with `additionalProperties: false`. `quantity` below means `#/definitions/EventV1/properties/quantity`: a string matching `^(0|[1-9]\d*)(\.\d+)?$`. Thus negatives and exponential notation are forbidden, with arbitrary decimal precision supported as strings. Required fields are marked R. No meaning is inferred merely from an enum tag.

| Field (`properties/…`) | Exact constraint | Derivative capability / limit |
| --- | --- | --- |
| version R | number, const 1 | Cannot opt into another derivative contract. |
| id R | string, minLength 1 | Event identity only; no execution/position identity contract. |
| type R | string enum: deposit, withdrawal, trade, disposal, purchase_with_crypto, staking_reward, airdrop, fee, transfer_internal | No derivative lifecycle discriminator or documented derivative treatment. |
| timestamp R | string, date-time | Can hold a time, not both execution and observation/valuation time. |
| sequence R | integer, minimum 0 | Local ordering, not venue ordering or correction rules. |
| asset R | string, minLength 1 | Can carry an arbitrary name; no instrument type, contract multiplier, collateral or settlement currency. |
| quantity R | string with the exact pattern above | Unsigned magnitude; no long/short position or signed cash-flow unit. |
| counter_asset R | string or null | Arbitrary counter name; no derivative leg or margin semantics. |
| counter_quantity R | quantity reference or null | Unsigned counter magnitude, no notional/position distinction. |
| fee R | array of objects; each requires asset (nonempty string) and quantity (quantity reference); additionalProperties false | Positive fee amounts fit syntactically; signed rebates and derivative attribution do not. |
| source R | string, minLength 1 | Provenance label, not a typed derivative protocol contract. |
| account R | string, minLength 1 | Account label, no position lifecycle. |
| raw_row_ref R | string, minLength 1 | External evidence reference; embedding semantics in a referenced payload does not make the normalized consumer understand them. |
| txid | string | One optional reference, not typed order/fill/funding/correction IDs. |
| destination | string | Free text, no position/collateral transfer contract. |
| linked_refs | array of strings | Generic links without defined lifecycle or allocation rules. |
| acquisition_eur | quantity reference | Unsigned valuation, not a realized-PnL field. |
| proceeds_eur | quantity reference | Unsigned valuation, not signed PnL or funding. |
| portfolio_eur | quantity reference | Unsigned portfolio valuation, not per-position unrealized PnL. |
| basis_confirmed | boolean | Confirmation flag, no derivative cost-basis model. |
| valuation_note | string | Notes cannot add executable accounting semantics. |
| soulte_received_eur | quantity reference | Existing unsigned field; not permission to reinterpret it as funding or margin. |
| soulte_paid_eur | quantity reference | Same limitation; no derivative meaning is declared. |

| Requested case | Fields that can carry fragments | Missing contract / conclusion |
| --- | --- | --- |
| Position opening | id, timestamp, asset, quantity | No instrument/position ID, side, multiplier, open discriminator or margin model. **Unsupported.** |
| Partial close | linked_refs, quantity | No signed position delta, reduction flag, remaining quantity or allocation rules. **Unsupported.** |
| Full close | linked_refs, quantity | No lifecycle state or flat-position reconciliation. **Unsupported.** |
| Realized PnL | optional unsigned EUR fields, valuation_note | No signed realized cash flow, settlement asset or gross/net definition. Losses cannot be placed in unsigned quantities. **Unsupported.** |
| Unrealized PnL | portfolio_eur, timestamp | No mark price/time, position snapshot or non-taxable observation discriminator. **Unsupported.** |
| Funding payment/receipt | asset, quantity, source | No funding discriminator, sign/direction, rate, interval or position attribution. Choosing deposit/withdrawal/reward tags would invent semantics. **Unsupported.** |
| Trading fee | fee[].asset and fee[].quantity | Positive amount fits, but no derivative parent execution contract; negative rebate fails the regex. Standalone fee processing is not neutral derivative evidence. **Unsupported for derivative normalization.** |
| Liquidation | id, txid, linked_refs, valuation_note | No liquidation discriminator, forced-close attribution, penalties or residual-position rules. **Unsupported.** |

This is more than an absence of enum names. The actual Taxlot `src/tax/engine.ts` trade branch subtracts `quantity` from the spot `asset` balance and adds `counter_quantity` to the spot counter balance, then subtracts fee assets. Its disposal/purchase/fee branch calls `sell`, with portfolio/consideration requirements. A perpetual fill does not establish spot acquisition of the underlying or spot disposal of its notional. Fabricating `HL-PERP:*` assets would therefore either fail other scope/balance checks or falsify those balance movements. Scope/eligibility gates do not supply a derivative model. The audit did not run a tax calculation or assert fiscal eligibility.

`schema-capabilities.test.ts` proves additional derivative properties are rejected, signed quantities are rejected, and a manufactured spot-shaped derivative can nevertheless pass schema syntax. PIT's semantic boundary rejects that last case. Schema validity alone is not semantic validity.

## Implemented boundary and evidence model

- `src/lib/accounting-compatibility.ts` defines the typed `unsupported_derivative_v1` status and shared refusal logic. Hyperliquid fill/funding discriminators, protocol markers and payload wrappers are refused by the CoW recorder **before any provider access**, and by the generic Taxlot append path. Legacy derivative markers are refused by CSV serialization and excluded from ordinary spot listings.
- `src/lib/record-fills.ts` contains only the CoW recorder. `src/lib/derivative-evidence.ts` has no runtime dependency on the Taxlot writer. Its records never call the upstream event validator or CSV writer: they are evidence, not events. Negative tests pass direct fills, wrappers, arrays, mixed CoW/Hyperliquid shapes and the new evidence envelope through the spot boundary.
- Hyperliquid synchronization uses the separate IndexedDB database `pit-derivative-evidence-v1`, version 1, object store `observations`. Both read and write access use the existing default-deny origin policy. Approved dedicated HTTPS origins and loopback retain storage; unsafe/unapproved origins cannot open it. Production origin approval remains empty and unchanged.
- Each observation has `evidence_version`, `record_kind` (fill/funding), `taxlot_status`, protocol, network, account, market, side, size, price, fee amount/asset, funding amount/rate/position size if known, order/fill IDs, transaction reference, source timestamp, observation timestamp, source endpoint/method, complete raw payload, source ID and SHA-256 digest. `stable_instrument_id` is explicitly null: a market label is not falsely promoted to a stable contract identity. Unknown normalized envelope fields are null. Signed fee rebates, source `closedPnl`, `startPosition` and liquidation fields remain unchanged in the raw payload.
- JSON is copied and canonicalized before asynchronous hashing. Decimal source strings remain strings. Unsafe integer IDs, missing fields and unsupported JSON representations are rejected before opening the batch transaction. The digest covers protocol, network, account, kind and payload; observation time is excluded for deterministic deduplication.
- The application exposes append/read only. Exact duplicates add nothing, including concurrent writes. A changed payload with the same source fill ID has a different digest and is retained as a second observation; neither is silently overwritten or chosen as authoritative. Batches are atomic. No existing Taxlot or legacy raw record is removed or rewritten; there is no storage upgrade/migration. Existing cursor history and legacy evidence are not automatically backfilled into the new database.
- The background recorder captures funding returned for the preceding 30 days as raw observations, plus fills through the existing overlapping cursor. API retention, pagination limits, offline gaps and legacy cursors can limit completeness. This is not a complete derivative ledger, position snapshot archive, or unrealized-PnL calculator. Sync failures are surfaced.
- `scripts/live-e2e.mjs` can separately snapshot `derivativeEvidence` as well as existing Taxlot/legacy raw stores. It does not turn evidence into CSV or execute a trade. The UI explicitly reports raw evidence only and the unsupported status.

“Immutable” here means append-only through PIT's API, not tamper-proof storage. A same-origin script, browser owner or extension can modify IndexedDB; a content hash is not authentication of a venue response. The refusal checks prevent accidental routing of recognizable Hyperliquid data, not malicious forgery of an arbitrary spot-shaped object. The deployment-origin boundary remains necessary for both databases.

## CoW → IndexedDB → CSV → actual Taxlot importer

Executed `node scripts/audit/taxlot-roundtrip.mjs` against the **real, unmodified** `/home/corio/TAXLOT/src/importers/index.ts`, using its installed dependencies. No substitute parser was implemented. Importer SHA-256: `6f5d5c9cea24b88e868b7bc8bb022a341aed3c23c6c41d761f133b4d1a0e4e55`. [Exact output](real-importer.txt), [generated CSV](cow-fixture.csv), [full raw/stored/imported records, options and differences](roundtrip.json). The script refuses schema divergence and reports `BLOCKED — real Taxlot importer not available to PIT` if upstream is absent elsewhere.

Two **synthetic** CoW fills use PIT's real recorder, IndexedDB API (fake-indexeddb for deterministic offline execution), schema validation, CSV serializer and the upstream Generic importer. Browser tests separately exercise real Chromium IndexedDB. Token decimals and block metadata are offline fixtures; this is not network settlement evidence.

| Fixture | PIT type | Sell quantity → CSV → import | Buy quantity → CSV → import | Sell-token fee → CSV → import |
| --- | --- | --- | --- | --- |
| 18-decimal crypto → 6-decimal stablecoin | trade | 1.000000000000000001 | 3000 | 0.000000000000000001 |
| 6-decimal stablecoin → 18-decimal crypto | trade | 1.234567 | 0.0006172835 | 0.000001 |

Both emitted `trade`, never `disposal`; both stored records and both imported records validate against the exact upstream schema. Import issues: **0**. Repeated imports with the same inputs/options deep-equal. Quantities, fee quantities, timestamps, account, type and transaction IDs are unchanged. No fiat off-ramp exists in PIT; stablecoins remain crypto.

Every metadata difference for these two fixtures is explicitly recorded in `roundtrip.json` and stdout:

| Field | PIT | Upstream Generic importer |
| --- | --- | --- |
| id | cow:11155111:synthetic-cow-one:1:0 / cow:11155111:synthetic-cow-two:2:0 | pit-phase-i-fixture:2 / pit-phase-i-fixture:3 |
| sequence | 42 / 43 | 0 / 1 |
| asset, counter_asset, fee[].asset | lowercase chain-qualified ERC20 identifiers | Entire identifier uppercased by upstream assetName; no quantity change |
| source | pit:cow:11155111 | Generic |
| raw_row_ref | same original CoW event IDs | same new file:row IDs |
| valuation_note | Crypto-to-crypto trade, including stablecoins. Amounts from executed fill; no EUR valuation supplied. | absent |

No other field differences occurred. This is economic-field reconciliation, **not lossless provenance round-trip**. Preserve the original stored/raw evidence and sidecar; reconcile chain-qualified IDs to the intended Taxlot portfolio asset identities before calculation. The Generic mapping accepts one fee leg and drops zero fee legs. PIT now blocks CSV with multiple fee legs rather than losing them. Current CoW records have one fee leg; these fixtures use nonzero fees. No EUR values or tax eligibility are invented.

The first sandbox invocation hit `EPERM` obtaining the provenance Git hash after the import assertions; [failure output](importer-sandbox-failure.txt) is retained. An authorized read-only retry completed successfully. This was not a failed importer assertion or a live execution attempt.

## Minimum future Taxlot derivative contract

A versioned, explicitly reviewed upstream contract and importer/engine support must precede normalization. At minimum it needs:

1. Stable protocol/network/instrument identity, venue market identity/version, base/quote/settlement/collateral assets, linear/inverse contract kind and multiplier.
2. Position/account identity and open/increase/reduce/close/flip lifecycle; signed quantity deltas, pre/post position and deterministic partial-close allocations.
3. Exact decimal quantity, price and notional with explicit units and rounding; distinguish collateral movement from notional exposure and underlying ownership.
4. Realized PnL as a signed amount in a specified settlement asset, with gross/net convention and links to executions; unrealized observations require mark/time and must not become realized events implicitly.
5. Separate fees/rebates with signed convention, asset, execution link and rules preventing double-counting against PnL.
6. Funding payment/receipt direction, signed asset amount, interval/rate/position basis and stable source identifier.
7. Liquidation/forced-close discriminator, execution and position links, penalties, residual exposure and bankruptcy/insurance treatment where applicable.
8. Venue order/fill/funding IDs, timestamps/ordering, immutable raw references and hashes; correction/reversal/version rules, rather than overwriting evidence.
9. Deterministic deduplication, ordering and replay; explicit netting/hedge mode, allocation/rounding rules, gap detection and reconciliation of fills → positions → settlement/collateral cash flows → exports → importer. Conflicting observations must block automatic normalization until resolved.

These are data-contract requirements, not a proposed tax interpretation. Legal/fiscal treatment requires its own review; this phase does not change that gate.

## Verification and remaining blockers

[VERIFICATION.md](../../VERIFICATION.md) quotes complete command outputs: **33 unit tests, 9 offline Playwright tests, 0 typecheck errors/warnings/hints, successful production build**, plus actual importer and source audit. The dedicated-origin browser test preserves derivative observations but produces no Taxlot events; the unsafe-origin negative test creates no derivative database. Unit tests cover signed raw values, funding, malformed batches, concurrent dedup, conflicts, legacy preservation and spot-writer refusal.

Protected-file comparison against Phase H is empty for configuration, CoW/Hyperliquid execution, origin policy, schema, legal page and deployment script. `FEES_ENABLED=false` and testnet-only behavior are unchanged. No public deployment or live test occurred.

Remaining blockers: an external funded testnet wallet and separately authorized live acceptance; real CoW fill/schema/CSV reconciliation; real Hyperliquid raw evidence capture; the future derivative contract/importer/engine and conflict/gap reconciliation; and actual dedicated public-origin verification. Assumption 8 stays **OPEN**. Mainnet/fee activation remains forbidden under the existing legal gate.
