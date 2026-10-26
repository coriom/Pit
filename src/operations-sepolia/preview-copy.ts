import type { OperationId } from "../operations/lib/catalog";

export const previewDescriptions: Record<OperationId, string> = {
  "token-creator": "Inspect the standard and advanced ERC-20 demonstration tokens created on Base Sepolia.",
  multisender: "Inspect the verified ERC-20 MultiSender contract and its supported batch size.",
  "token-locker": "Inspect the funded demonstration lock, beneficiary, maturity and released amount.",
  "token-vesting": "Inspect the funded demonstration vesting schedule, allocation and released amount.",
};
