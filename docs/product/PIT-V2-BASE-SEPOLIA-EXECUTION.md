# PIT V2 Phase 4 — controlled Base Sepolia execution

This record concerns disposable PIT demonstration assets on **Base Sepolia (chain ID 84532)**. It does not approve Base mainnet, commercial fees, hosted deployment, or production use. The reviewed Solidity source was commit `a9dc1c48c0a8bffb202cb3f201a2d5d791e2912d`, built with Solidity 0.8.24, 200 optimizer runs and OpenZeppelin Contracts 5.5.0. The Phase 3 deployment manifest SHA-256 was `85152c55be03be7be03416ead5023d8cbb7706112778b8126d0a4604663f8f0f`.

## Authorization and controls

The operator supplied the exact `GO PIT4 BASE SEPOLIA` approval for the [displayed nineteen-action envelope](PIT-V2-PHASE4-PREFLIGHT.md). The signer was the dedicated encrypted PIT test keystore at public address `0xCb8c794c7B33FeC20C30D970725933bE1fc656C6`, independently funded with 0.001 test ETH before PIT's first write. No key or password is recorded here. The runner fixed the official RPC, sequencer, chain, signer, nonce order, calldata, gas caps, 0.05-gwei maximum fee per gas, L1/operator reserve and 0.0009-test-ETH aggregate spend ceiling. Each receipt and contract state readback gated the next action. Failed RPC calls have no automatic transaction retry.

| Contract | Base Sepolia address | Authority and purpose |
|---|---|---|
| `PitTokenFactory` | `0xE861d10ab302B66f619b15323C96d9F3BbfDc230` | Shared factory; no PIT admin or fee role |
| `PitMultiSender` | `0xf1c076cDF4A3C0bbBc491cF3578CA2F3d99424eA` | Shared all-or-nothing ERC-20 distribution; caller's exact allowance |
| `PitStandardToken` | `0x8ECa4F7e0B62eB0937A360074E5d67c3e6f1858a` | Disposable fixed-supply token, 1,000 units |
| `PitAdvancedToken` | `0x1378294Fc8fCE1dA23A5a69025e9534FED32bee2` | Disposable token; sole initial admin/minter/pauser is test signer; 1-day delayed admin transfer; 150-unit cap |
| `PitTokenLock` | `0x0d3bC5ADA20de6B05967c947E559a4f3C662e1C6` | Immutable beneficiary is test signer; 25 standard tokens; unlock 2026-10-26 02:57:31 UTC |
| `PitTokenVesting` | `0x1b7844B2d4fAC6Eaa36c6A0F837C3d3E0F183970` | Immutable beneficiary is test signer; 100 standard tokens; start 02:59:19, cliff 03:04:19, end 03:19:19 UTC |

All six on-chain runtime Keccak hashes and deployment transaction receipts are pinned in [`deployments/base-sepolia.json`](../../deployments/base-sepolia.json). Their code was compared with the reviewed Foundry artifacts, masking only compiler-declared immutables. This **runtime match is distinct from public source verification**.

Tracked public transaction and code hashes use exactly 64 hexadecimal characters **without** the optional `0x` prefix. RPC clients restore that prefix when querying Base Sepolia. This keeps the repository's existing 0x-prefixed-secret detector intact; it does not change any hash value.

## Execution receipts and gas

The machine-readable receipt list is in [`deployments/base-sepolia-receipts.json`](../../deployments/base-sepolia-receipts.json). It records every transaction hash, block, gas used, effective price, and observed signer balance delta. A complete independent postflight is implemented in `scripts/operations/pit4-readback.mjs`.

**Final postflight PASS:** 19/19 receipts succeeded, signer nonce 19 with no pending nonce, all six runtime hashes matched the pinned manifest, and the independent balance/role/recipient checks passed at block 50,314,760. Total gas used was **7,537,026** units. The observed signer balance reduction, including Base fee components, was **45,223,339,476,609 wei = 0.000045223339476609 test ETH**, below the approved **0.0009 test ETH** ceiling. The remaining signer balance was **0.000954776660523391 test ETH**, with no unrecorded spend or incoming funding.

| Time-dependent action | Successful transaction | Block | Gas used |
|---|---|---:|---:|
| Locker release, after unlock | `294c4c359519aba272848b5f10dabbcb01e0d2bff3bed62680018186d388b615` | 50,308,084 | 62,684 |
| Vesting partial release, after cliff | `9b2aaa0d7f0ac492844d5999320ea50e5e0c2d02184d13f5aa5bf345e79740d7` | 50,310,122 | 68,182 |
| Vesting final release, after completion | `f270c72504e4b220f6c45e6495ff1aac792137855ca12a56e1927150548324b9` | 50,314,640 | 45,937 |

## Testnet behavior and limits

- Standard and advanced token creation, metadata, supplies, cap, admin roles, mint, pause, unpause and burn are checked from actual receipts and state. Unauthorized role calls, cap overflow and paused transfer were rejected through read-only `eth_call` before any paid failure transaction.
- MultiSender approved exactly 30 standard tokens, distributed 10 and 20 to two dedicated test recipients, and left no token custody or residual allowance.
- Locker received 25 standard tokens; pre-maturity release and post-maturity release by an unrelated test address were rejected by `eth_call`. The beneficiary's mature release receipt and final state are recorded in the receipt list.
- Vesting received 100 standard tokens; a pre-cliff release and release by an unrelated test address were rejected by `eth_call`. The cliff release transferred **27.833333333333333333** tokens, and the final release brought `released` to **100** tokens with zero vesting-contract token balance.
- Only the approved disposable test assets were used. No USDC, PIT fee, external wallet, mainnet or production transaction was involved.

## Browser and public verification boundary

`pnpm operations:sepolia:check` builds an isolated six-page, private/noindex **read-only** preview against the fixed `https://sepolia.base.org` endpoint. It contains no wallet client, signature, approval or transaction sender. Chromium and Firefox readbacks of all four pages were exercised against the real Base Sepolia RPC. Both browsers passed mobile-width navigation, keyboard skip link, long-address wrapping and excluded-route 404 checks; an observed `pre` overflow was corrected before the final rerun. The local Anvil operations build remains separate and functional. A real Base Sepolia wallet transaction through a browser has **not** been accepted; the preview cannot execute one. This is a Phase 4 acceptance gap, not a simulated pass.

For a local read-only review, run `pnpm operations:sepolia:check`, then `PIT_OPERATIONS_MODE=base-sepolia pnpm exec astro preview --config astro.operations.config.mjs --host 127.0.0.1 --port 4414`. `node scripts/operations/pit4-readback.mjs` checks the complete receipt set, code hashes, permissions and final balances once all nineteen transactions are confirmed. Neither command deploys a website or broadcasts a transaction.

The BaseScan V1 API reported deprecation; Etherscan V2 requires an API key. A Sourcify V2 source upload was rejected by automatic approval review because it would publish complete source to an external service without specific permission. No workaround was used. Public source-verification status is **UNAVAILABLE**; on-chain runtime bytecode checks passed independently. Before public testnet execution, obtain explicit source-publication approval and complete ordinary wallet-browser acceptance under a separately bounded transaction envelope.

This internal engineering review is not an independent security audit. Nonstandard ERC-20 tokens remain unsupported by the MVP's exact-distribution assumptions. Long-duration schedule behavior relies on Foundry fuzz/invariant evidence in addition to the short disposable testnet examples.
