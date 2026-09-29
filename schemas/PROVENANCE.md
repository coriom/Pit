# Taxlot schema provenance

Copied byte-for-byte from `/home/corio/TAXLOT/schemas/events.v1.json` on 2026-09-29.
Taxlot HEAD at copy verification: `a41b5b7f110b180191bf32813f443ea64c5bf81f`.
SHA-256: `d8eb339ed7acd7da3b68ef09fe5c1b01c4cc3258cb401a4f2ba8805e7a3b07d7`.

The repo was being populated during this task. This is a snapshot, not a promise of future schema compatibility. Recopy and regenerate the standalone validator when upgrading.

AJV validates every IndexedDB event write. The validator is precompiled to avoid runtime eval under CSP. Raw responses are stored separately because additional event properties are forbidden.

Spot exports support Taxlot Generic mapping: timestamp, type, asset, quantity, counter_asset, counter_quantity, fee_asset, fee_quantity, txid map to identically named columns. Token identities are chain-qualified contract addresses; map them to your existing portfolio assets before calculating. No EUR valuations are invented.

Stablecoins are crypto, so selling crypto for USDC/USDT is `trade`, never `disposal`. Only actual fiat off-ramps are disposals (not implemented here).

Phase I verifies the same schema bytes against Taxlot HEAD `a4879aec7ecee5f0049ddfd4780000ae9a63b2e9`. The actual Generic importer accepts two PIT-generated CoW fixtures with zero issues; it uppercases asset identifiers and replaces IDs, sequence, source and raw references, and drops valuation notes. This is not a lossless metadata round-trip. It maps one fee leg; PIT blocks multi-fee CSV export rather than dropping fees.

The schema and current engine cannot faithfully represent perpetual lifecycle/PnL/funding. Hyperliquid fills/funding are separate append-only observations in `pit-derivative-evidence-v1/observations`, with `taxlot_status: unsupported_derivative_v1`. They do not validate as Taxlot events and never enter Taxlot CSV. Old raw and legacy event rows remain untouched; legacy derivative events remain excluded from spot export. See [Phase I exact capability matrix and real importer evidence](../docs/audit/phase-i/DERIVATIVE-ACCOUNTING.md). No upstream schema or tax semantics changed.
