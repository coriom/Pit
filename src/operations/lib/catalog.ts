import { PLANNED_OPERATIONS } from "../../lib/v2-catalog-core";
const fee = (id: string) => PLANNED_OPERATIONS.find((entry) => entry.id === id)!.indicativeFee!;
export const operationCatalog = [
  { id: "token-creator", title: "ERC-20 Token Creator", category: "Token Creator", description: "Create a fixed-supply or limited advanced ERC-20 on local Anvil.", fee: `${fee("standard-erc20-creation")} or ${fee("advanced-erc20-creation")}` },
  { id: "multisender", title: "ERC-20 MultiSender", category: "Transfers & Airdrops", description: "Send one standard ERC-20 to a bounded recipient list atomically.", fee: fee("erc20-bulk-distribution") },
  { id: "token-locker", title: "Token Locker", category: "Vesting & Locking", description: "Fund an immutable ERC-20 lock and release after its UTC unlock time.", fee: fee("token-locker") },
  { id: "token-vesting", title: "Token Vesting", category: "Vesting & Locking", description: "Fund one linear ERC-20 schedule with an optional cliff.", fee: fee("custom-vesting") },
] as const;
export type OperationId = (typeof operationCatalog)[number]["id"];
