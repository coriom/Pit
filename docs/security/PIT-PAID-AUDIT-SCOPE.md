# PIT paid path — independent audit brief

Candidate source: the final Phase 10 release commit; deployed Base Sepolia router source is the earlier immutable commit `b1d8478d14a6033675ea8c0967557a69f12d7765`. No Solidity changes are proposed in Phase 10. Foundry: Solidity 0.8.24, optimizer 200, EVM Cancun; OpenZeppelin Contracts 5.5.0. Verify the actual lockfile and compiler metadata when commissioning a review.

## Scope and dependency path

```text
user wallet -> exact USDC approval -> PitPaidTokenCreator -> PitStandardToken / PitAdvancedToken
user wallet -> exact USDC + asset approvals -> PitPaidOperations -> PitMultiSender / PitTokenLock / PitTokenVesting
                                                    |-> PitPaidBase (shared fee, price, intent, deadline guard)
```

Review `contracts/src/PitPaidBase.sol`, `PitPaidTokenCreator.sol`, `PitPaidOperations.sol`, `PitTokens.sol`, `PitMultiSender.sol`, `PitSchedules.sol`, `PitMockUSDC.sol` (fixture only), plus `src/operations/paid-browser.ts`, `src/operations/lib/paid-local.ts`, `payment-reconciliation.ts`, and build gates. ERC-721/1155 contracts (`PitNfts.sol`, `Pit1155.sol`) are secondary transaction-surface scope; they have no active paid router. Separate historical trading and Premium subscription code from this paid path.

## Assets, authority and custody

The payer signs wallet transactions and grants exact token allowances. The testnet routers bind Circle test USDC, immutable test recipient and price owner; deployed addresses and 15 receipts are recorded in `deployments/base-sepolia-paid-execution.json`. The price owner can change prices/version, not the immutable token or recipient. Token creator roles and initial supply belong to the user-selected creator/recipient; PIT receives no token admin role. `PitPaidOperations` takes approved assets for atomic distribution/funding. The new Locker and Vesting contracts **hold allocated user tokens** under immutable beneficiary and schedule rules; claiming is not PIT-fee-gated. The routers should retain no paid USDC or user asset balance after success. Direct transfers to a Locker/Vesting outside supported funding flows may strand assets.

## Threats and invariants to test independently

| Area | Required invariant or attack case |
| --- | --- |
| Fee and price | Exact six-decimal transfer to correct merchant; wrong asset/recipient/chain rejected; cap, price version, deadline and user max fee enforced; fee-on-transfer or callback token behavior handled explicitly. |
| Atomicity | No service fee after reverted deployment, distribution or funding; no operation if fee fails; no unexpected residual token custody; gas remains spent on revert. |
| Authorization | Payer identity bound to call; one-use intent per payer/router; no replay/double charge; creator/default admin and mint/pause roles assigned as intended; no arbitrary external call or delegatecall. |
| Assets | Multisender totals and duplicate recipients; exact allowance; callback/reentrancy; malicious recipient; locker/vesting time arithmetic and free release; nonstandard/rebasing assets excluded or clearly bounded. |
| Browser and accounting | Selected provider, current account/chain and calldata match review; pending receipt is uncertain; block hash and canonical confirmations; duplicate fee event/transfer rejection; reorg recovery; no automatic retry after timeout. |

Existing Foundry unit/fuzz/stateful invariant tests and Anvil integration must be rerun on the frozen candidate. The Phase 9A.1 read-only audit independently reconciled five Base Sepolia test payments totaling 0.42 test USDC and zero residual approvals; inspect current canonicality again before relying on those records. Eight testnet contracts have Sourcify exact-match records, which establish source identity but are **not a security audit**.

Known limits: immutable fee recipient requires replacement deployment; price governance is a single controlled owner; Circle USDC code and RPC/finality are external dependencies; some nonstandard ERC-20 implementations are unsupported; permissionless underlying contracts can be used without PIT's fee route. Require an external auditor's explicit scope, methodology, findings, remediation review and final report before a paid mainnet GO decision. If any contract changes, generate new bytecode and do not describe the old testnet deployment as validation of that new version.
