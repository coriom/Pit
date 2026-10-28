# PIT V2 Phase 7 — local pay-per-operation prototype

## Scope and accounting

The existing 196 distinct tasks remain free. The four existing operation pages offer an **optional local Anvil test mode** at `?paid-local=1`: standard or advanced ERC-20 creation, ERC-20 MultiSender, lock creation/funding, and vesting creation/funding. No subscription, account, credits, real USDC, live merchant address, public checkout or external-chain payment is enabled. NFT and other distribution prices remain indicative metadata only. Reading and claiming existing locks/vesting, allowance revocation, balances, inspections and free calculations remain free.

The public, permissionless contracts can still be called directly or independently reimplemented. Fees are enforceable only when a user deliberately chooses PIT's guided paid entry points; this is not universal control over open-source contracts.

| Capability | Phase 7 payment path | Status |
|---|---|---|
| Standard/advanced ERC-20 creation | Atomic local mock-USDC fee and deployment | Locally implemented |
| ERC-20 MultiSender | Atomic variable fee and exact distribution | Locally implemented |
| Locker and vesting creation/funding | Atomic fixed fee and funding | Locally implemented |
| Free reads, allowance revocation, lock/vesting claims | No PIT service fee | Existing free behavior preserved |
| NFT creation/distribution and other advanced operations | Indicative metadata only | No paid execution path |
| Portfolio batch risk report | One-time, simulated x402-shaped exact flow | Local proof of concept, no real settlement |

Two specialized contracts are necessary because a combined creator/distribution/schedule runtime exceeded EIP-170's 24,576-byte limit. `PitPaidTokenCreator` is 16,687 runtime bytes and `PitPaidOperations` is 14,666 runtime bytes under the pinned Solidity 0.8.24 / OpenZeppelin 5.5.0 build. `PitPaidBase` shares price/version, quote, fee and replay rules. The test fixture `PitMockUSDC` has six decimals and mints only on local deployment. It is unrelated to Circle USDC and is never configured for an external chain.

Both routers receive an immutable payment-token address and immutable fee recipient. The mock token constructor rejects chains other than 31337. The local recipient is `0x0000000000000000000000000000000000000FEE`, an Anvil fixture with no real merchant significance. The deployer owns price updates only; a new price increments `priceVersion`. The payer sends a unique intent ID, current version, explicit maximum fee and deadline no more than one day away. Each router records an intent once per payer and router. The fee is transferred from `msg.sender` directly to the recipient using SafeERC20, and exact payer/recipient balance deltas are checked. There is no arbitrary call forwarding, delegatecall or PIT token-admin role. New advanced token roles go to `msg.sender`; lock/vesting beneficiary comes from the reviewed operation parameters. Asset transfer, fee transfer and intent mark all revert together if any operation step fails.

The proposed local prices are 49 / 149 / 39 / 79 mock-USDC for standard creation / advanced creation / locker / vesting, and 3 + 0.10 per MultiSender recipient capped at 49. All arithmetic is integer micro-units. Before a write, the browser checks chain ID 31337 and matches the injected wallet's latest block hash to the loopback RPC state. It compares router runtime code and immutable addresses, and compares on-chain prices to centralized product configuration. The quote displays the exact fee, intended asset movement, spender, recipient, chain, gas units and native-ETH gas estimate separately. The user grants only the exact fee and asset amount when an approval is needed. Existing larger approvals are refused by the prototype. Approval is a separate transaction and can incur gas. A reverted atomic operation does not retain its service fee, but its network gas cannot be refunded. A submitted hash with an uncertain receipt blocks repeat execution until reconciliation.

The local browser stores only the fixture router addresses and a pending transaction reference in session storage. A verified receipt may be exported as JSON; imported CSV and report data are not sent to PIT infrastructure. A page refresh during an unresolved transaction may require manual state inspection because transient pre-transaction balance snapshots are intentionally not stored.

## Digital-report proof of concept

`premium/x402-local.mjs` runs a **simulated** [x402 v2 exact-payment](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md) state machine around the existing portfolio batch risk report. The local in-process facilitator issues an opaque fixture proof, verifies request ID and input digest, generates the report, confirms simulated settlement, then releases the result. It returns a v2-shaped HTTP 402 payment requirement and payment response. Invalid reports, forged/replayed proofs, changed inputs and uncertain settlement fail closed. Financial input and generated reports are not persisted; only a digest and minimal settlement evidence remain in process memory. No official SDK, EIP-3009 signature, live facilitator, actual token transfer or certified x402 interoperability is claimed. A production adapter must use a supported [official x402 scheme and SDK](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact.md) with independent payment verification and settlement reconciliation.

## Local commands

```sh
pnpm install --offline --frozen-lockfile
forge test --offline --match-path 'contracts/test/PitPaid*.t.sol'
pnpm operations:paid:anvil:test
pnpm premium:x402:local:test
pnpm premium:x402:local:demo
pnpm operations:check
pnpm exec playwright test --config playwright.operations.config.ts -g 'four local paid browser workflows' --browser chromium
```

The browser mode uses an injected EIP-1193-compatible local Anvil provider. Automated Anvil accounts demonstrate signing and receipts; they are **not** MetaMask extension acceptance. `pnpm operations:check` builds the local package. The Toolbox, Explorer and Base Sepolia builds do not import `paid-browser.ts` or the mock payment artifacts.

## Before any controlled Base Sepolia payment test

Verify canonical Circle USDC address, chain and runtime bytecode independently; establish a dedicated merchant recipient through an ownership challenge; review and verify both deployed routers and price governance; use an explicit testnet spending envelope and transaction approval; complete external smart-contract review; reconcile receipts and events; define support, refund, accounting, tax and consumer-rights policies with the operator and qualified advisers. No historical candidate payout address is configured. A price quote in a browser is not an authorization; the contracts enforce maximum fee, version and deadline. Any real digital-report payment needs a reviewed official x402 integration or equivalent verified settlement, operation-bound access and an explicit refund process. On-chain receipt data may reduce the need for a customer-account database, but legal/accounting retention needs remain an operator decision; no period is assumed.

Status: **LOCAL PAYMENT PROTOTYPE ONLY**. Testnet payment not deployed. Live USDC disabled. Real MetaMask not verified. No independent security audit.
