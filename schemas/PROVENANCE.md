# Taxlot schema provenance

Copied byte-for-byte from `/home/corio/TAXLOT/schemas/events.v1.json` on 2026-09-29.
Taxlot HEAD at copy verification: `a41b5b7f110b180191bf32813f443ea64c5bf81f`.
SHA-256: `d8eb339ed7acd7da3b68ef09fe5c1b01c4cc3258cb401a4f2ba8805e7a3b07d7`.

The repo was being populated during this task. This is a snapshot, not a promise of future schema compatibility. Recopy and regenerate the standalone validator when upgrading.

AJV validates every IndexedDB event write. The validator is precompiled to avoid runtime eval under CSP. Raw responses are stored separately because additional event properties are forbidden.

Spot exports support Taxlot Generic mapping: timestamp, type, asset, quantity, counter_asset, counter_quantity, fee_asset, fee_quantity, txid map to identically named columns. Token identities are chain-qualified contract addresses; map them to your existing portfolio assets before calculating. No EUR valuations are invented.

Stablecoins are crypto, so selling crypto for USDC/USDT is `trade`, never `disposal`. Only actual fiat off-ramps are disposals (not implemented here).

The schema has no derivative type. Since Phase H, Hyperliquid fills are retained only in the origin-guarded `raw` evidence store, with original fields unchanged and accounting marked `BLOCKED_PHASE_I`. No derivative Taxlot event or derivative CSV is produced. Earlier review-only `trade` records, if present, are preserved but excluded from spot export; new writes/CSV serialization reject those derivative markers. Phase I must define correct accounting before any derivative normalization. The schema definition itself is unchanged.
