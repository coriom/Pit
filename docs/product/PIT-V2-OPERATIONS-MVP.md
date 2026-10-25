# PIT V2 local operations MVP

## Status and architecture

**Locally implemented:** four independently routed operations in the separate static `astro.operations.config.mjs` entry tree. The offline Toolbox and read-only Explorer retain their own build trees and execution policies. This operations tree includes wallet and transaction code; the free Toolbox does not import it. Public catalogue metadata keeps the proposed commercial operations non-routable there. Five proposals map to four local MVP routes because standard and advanced creation share a creator interface.

**Locally tested:** Solidity 0.8.24, OpenZeppelin Contracts 5.5.0 (pinned in `pnpm-lock.yaml`), Foundry 1.5.0, and ephemeral Anvil chain 31337. `pnpm operations:test`, `pnpm operations:anvil:test`, `pnpm operations:check`, and `pnpm operations:e2e` are the focused commands. No private key is required: local tests use Anvil's unlocked disposable accounts. The browser test provider forwards requests to Anvil; it does not fabricate receipts. To use the pages manually, start `anvil --host 127.0.0.1 --port 8545 --chain-id 31337`, run `pnpm operations:check`, then `pnpm exec astro preview --config astro.operations.config.mjs --host 127.0.0.1 --port 4414` and connect an injected wallet configured for the same local chain. Never use a funded production wallet.

**Prepared but not deployed:** Base Sepolia chain 84532 may be evaluated only after a separately approved deployment and security review. Base mainnet 8453 is not an execution target in this phase. There are no published contract addresses or automatic deployment scripts. The separate operations artifact is private/noindex and has `connect-src http://127.0.0.1:8545` only. It has no route to payment, billing, the Premium Worker or the Explorer RPC endpoints.

**Not implemented:** external-chain broadcasting, service-fee collection, commercial payment verification, hosted SIWE dependence, support for unusual ERC-20 accounting, contract verification automation, production contract audit, historical transaction indexing and user accounts for operations.

## Contracts and permissions

| Contract | User action and ownership | Bounds and limitations |
|---|---|---|
| `PitTokenFactory` / `PitStandardToken` | Factory emits `TokenCreated`; initial supply goes to the supplied recipient. Standard token has no mint or admin function. | 18 decimals; positive supply; no tax, blacklist or upgradeability. |
| `PitAdvancedToken` | The **factory caller** receives `DEFAULT_ADMIN_ROLE` and only enabled `MINTER_ROLE` / `PAUSER_ROLE`; recipient gets initial supply. Burn is holder initiated. | Explicit cap at least initial supply. Disabled mint/burn/pause remains disabled even if a role is later granted. An administrator may grant enabled roles to others; review that risk before use. |
| `PitMultiSender` | Transfers directly from caller to 1–100 distinct recipients after an exact or already sufficient allowance. All transfers revert together. | No custody, no unlimited allowance request. Exact recipient and sender deltas reject ordinary fee-on-transfer behavior. Rebasing, callbacks and adversarial tokens remain unsupported. 100 recipients used 5,646,797 gas on local Anvil with a 30,000,000 block limit; this is not a Base quote. |
| `PitTokenLock` | Single immutable token and beneficiary, multiple `fund(amount)` calls **before** unlock, beneficiary-only release at or after unlock. | No owner, early release, beneficiary transfer or emergency recovery. Directly sent wrong tokens or excess tokens are not supported and could become trapped. Fee-on-transfer funding is rejected. |
| `PitTokenVesting` | Single immutable token, beneficiary, allocation, future start, duration and cliff. Fund exactly once before start. Beneficiary-only releases. | Accrual begins at start, zero unlock before cliff, accumulated amount unlocks at cliff; floor to raw units, full allocation at end. No late funding, revocation or ownership transfer. Direct token transfers are unsupported. |

Token labels and decimals do not prove asset identity. Before every browser action, the connected provider and local RPC must both report chain 31337. The UI simulates and estimates a helper deployment, then confirms every subsequent transaction with a local receipt and state readback. MultiSender gas is estimated after helper deployment and before its distribution transaction; the UI rejects estimates at or above half the local block gas limit. A partially completed local sequence may leave a helper or allowance on Anvil if a later step fails; inspect receipts before retrying.

## Proposed fees and privacy

Standard creation 49 USDC; advanced creation 149 USDC; MultiSender 3 USDC plus 0.10 per recipient capped at 49 USDC; locker 39 USDC; vesting 79 USDC. These are **indicative, inactive service-fee proposals**. PIT collects zero fees here. Local gas estimates and actual local gas use are shown separately; no remote gas or total quote is provided. Future fee integration would require separate on-chain or server-side payment verification, payout ownership proof, refund rules and independent review. The contracts have no fee recipient or payment hook.

The browser imports CSV locally through the existing bounded CSV parser. It does not upload recipient lists or record inputs in PIT storage. The local Anvil sees transactions, as any chain would; future public-chain transactions would be public. The test harness never requests a seed phrase, real private key, wallet approval beyond the exact needed token allowance, or a remote-chain signature.

## Base Sepolia readiness checklist

The future deployment configuration must explicitly specify `chainId: 84532`, a reviewed HTTPS RPC origin, reviewed explorer URL, expected deployer address, token address where relevant, beneficiary address, raw integer amount/supply, and UTC Unix timestamps. It must refuse any absent or mismatched chain ID. No addresses or RPC endpoints are preapproved by this document.

Deployment order and constructor parameters:

1. Deploy `PitTokenFactory()` and `PitMultiSender()` once per reviewed chain. Neither has an owner or fee recipient.
2. Call `createStandard(name,symbol,supplyRaw,recipient)` or `createAdvanced(name,symbol,supplyRaw,capRaw,recipient,minting,burning,pausing)`. In the advanced case, the actual caller receives the admin and enabled roles. Review the caller address before any transaction.
3. Deploy `PitTokenLock(token,beneficiary,unlockUnixSeconds)` or `PitTokenVesting(token,beneficiary,startUnixSeconds,durationSeconds,cliffUnixSeconds,allocationRaw)` per schedule. Then approve only the exact amount and call `fund`. Funding must happen before the relevant deadline.

Measured **Anvil gas used**, not Base estimates: factory deployment 2,305,847; standard factory creation 509,116; advanced creation 1,059,716; MultiSender deployment 588,609; a two-recipient send 100,671; a 100-recipient send 5,646,797; lock deployment 576,962; lock release 62,684; vesting deployment 787,771. Gas varies with bytecode, token and chain state. Re-estimate on Base Sepolia before approval.

Before a separately authorized deployment: (1) review every contract and bytecode artifact against OpenZeppelin 5.5.0 and Solidity 0.8.24; (2) independently audit role assignment, MultiSender recipient/gas bounds and unsupported tokens; (3) verify chain ID 84532 and approved RPC/Explorer origins; (4) agree all constructor inputs and intended beneficiary/admin addresses, never a PIT hidden owner; (5) estimate gas on Base Sepolia; (6) verify source and compiler metadata on a block explorer; (7) run receipt, event, allowance, lock and vesting postflights; (8) agree a separate fee design and legal/publication gate. No broadcast command is included in this MVP.

References: [OpenZeppelin ERC-20 guide](https://docs.openzeppelin.com/contracts/5.x/erc20), [OpenZeppelin ERC-20 API](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20), [OpenZeppelin finance API](https://docs.openzeppelin.com/contracts/5.x/api/finance), [Base documentation](https://docs.base.org/).
