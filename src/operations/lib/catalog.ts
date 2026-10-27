import { PLANNED_OPERATIONS } from "../../lib/v2-catalog-core";
const fee = (id: string) => PLANNED_OPERATIONS.find((entry) => entry.id === id)!.indicativeFee!;
export const legacyOperationCatalog = [
  { id: "token-creator", title: "ERC-20 Token Creator", category: "Token Creator", description: "Create a fixed-supply or limited advanced ERC-20 on local Anvil.", fee: `${fee("standard-erc20-creation")} or ${fee("advanced-erc20-creation")}`, pricing: "FIXED_FEE" },
  { id: "multisender", title: "ERC-20 MultiSender", category: "Transfers & Airdrops", description: "Send one standard ERC-20 to a bounded recipient list atomically.", fee: fee("erc20-bulk-distribution"), pricing: "VARIABLE_FEE" },
  { id: "token-locker", title: "Token Locker", category: "Vesting & Locking", description: "Fund an immutable ERC-20 lock and release after its UTC unlock time.", fee: fee("token-locker"), pricing: "FIXED_FEE" },
  { id: "token-vesting", title: "Token Vesting", category: "Vesting & Locking", description: "Fund one linear ERC-20 schedule with an optional cliff.", fee: fee("custom-vesting"), pricing: "FIXED_FEE" },
] as const;
export type LegacyOperationId = (typeof legacyOperationCatalog)[number]["id"];

// Local Anvil modules only. The Base Sepolia read-only and private wallet
// previews intentionally keep their original four-route allowlist.
export const phase5OperationCatalog = [
  { id: "token-management", title: "Token Management", category: "Token Management", description: "Inspect PIT token permissions and perform authorized local administration.", fee: "2–5 USDC proposed · inactive", pricing: "VARIABLE_FEE" },
  { id: "allowance-manager", title: "Allowance Manager", category: "Token Management", description: "Inspect a stated ERC-20 allowance and revoke or reduce it locally.", fee: "Free", pricing: "FREE" },
  { id: "batch-balance-checker", title: "Batch Balance Checker", category: "Blockchain Explorer", description: "Read bounded address and token balances with honest per-query coverage.", fee: "Free", pricing: "FREE" },
  { id: "native-multisender", title: "Native ETH MultiSender", category: "Transfers & Airdrops", description: "Atomically distribute exact local ETH amounts to a bounded list.", fee: "3 USDC + 0.10/address proposed · inactive", pricing: "VARIABLE_FEE" },
  { id: "nft-creator", title: "ERC-721 NFT Creator", category: "Token Creator", description: "Deploy a finite owner-minted collection with explicit metadata URIs.", fee: "49 USDC proposed · inactive", pricing: "FIXED_FEE" },
  { id: "nft-batch-sender", title: "NFT Batch Sender", category: "Transfers & Airdrops", description: "Atomically send approved ERC-721 token IDs to named recipients.", fee: "3 USDC + 0.10/token proposed · inactive", pricing: "VARIABLE_FEE" },
  { id: "locker-manager", title: "Locker Manager", category: "Vesting & Locking", description: "Import a PIT lock, inspect claimability, and release locally as beneficiary.", fee: "Free", pricing: "FREE" },
  { id: "vesting-manager", title: "Vesting Manager", category: "Vesting & Locking", description: "Import a PIT vesting schedule, inspect vested and released amounts, and claim locally.", fee: "Free", pricing: "FREE" },
] as const;
export const operationCatalog = [...legacyOperationCatalog, ...phase5OperationCatalog] as const;
export type Phase5OperationId = (typeof phase5OperationCatalog)[number]["id"];
export type OperationId = LegacyOperationId | Phase5OperationId;
