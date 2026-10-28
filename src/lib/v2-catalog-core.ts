// Presentation metadata only. Execution remains governed by each isolated
// product's existing allowlist and runner; catalogue entries grant no capability.
export const V2_CATEGORIES = [
  { id: "trading-risk", label: "Trading & Risk", description: "Model trades, derivatives and execution costs." },
  { id: "blockchain-explorer", label: "Blockchain Explorer", description: "Inspect selected public-chain facts on demand." },
  { id: "token-creator", label: "Token Creator", description: "Future reviewed token deployment operations." },
  { id: "token-management", label: "Token Management", description: "Understand token units, supply and future administration." },
  { id: "transfers-airdrops", label: "Transfers & Airdrops", description: "Compare transfers and plan future distributions." },
  { id: "vesting-locking", label: "Vesting & Locking", description: "Explore unlock schedules and future locking operations." },
  { id: "defi-liquidity", label: "DeFi & Liquidity", description: "Explore pools, lending, staking and yield." },
  { id: "portfolio-analytics", label: "Portfolio & Analytics", description: "Analyze holdings, performance and imported data." },
  { id: "developer-tools", label: "Developer Tools", description: "Inspect EVM data, encodings and proofs." },
] as const;
export type V2CategoryId = (typeof V2_CATEGORIES)[number]["id"];
export type V2Execution = "local" | "read-only blockchain" | "planned";
export type V2Pricing = "free" | "fixed fee" | "variable fee" | "not yet determined";
export type V2Availability = "available" | "planned";
export type V2CatalogueEntry = Readonly<{
  id: string;
  title: string;
  description: string;
  category: V2CategoryId;
  tags: readonly string[];
  networks: readonly ("ethereum" | "base" | "base-sepolia")[];
  execution: V2Execution;
  pricing: V2Pricing;
  availability: V2Availability;
  path?: string;
  walletRequired: boolean;
  risk: string;
  indicativeFee?: string;
  /** Only in the separate, non-hosted Anvil operations build; never a free-toolbox route. */
  localMvpPath?: string;
  feeModel?: Readonly<{ serviceFee: string; gas: "separate estimate"; total: "not quoted"; paymentAsset: "USDC"; status: "proposal only" }>;
}>;

const proposedOperations = [
  { id: "advanced-financial-report", title: "Advanced financial report", description: "A future one-time analysis of user-supplied financial data.", category: "portfolio-analytics", indicativeFee: "4.90–14.90 USDC", pricing: "variable fee" },
  { id: "standard-erc20-creation", title: "Standard ERC-20 creation", description: "A future reviewed token deployment flow.", category: "token-creator", indicativeFee: "49 USDC", pricing: "fixed fee" },
  { id: "advanced-erc20-creation", title: "Advanced ERC-20 creation", description: "A future reviewed token configuration and deployment flow.", category: "token-creator", indicativeFee: "149 USDC", pricing: "fixed fee" },
  { id: "erc20-bulk-distribution", title: "ERC-20 bulk distribution", description: "A future reviewed transfer workflow for an explicit recipient list.", category: "transfers-airdrops", indicativeFee: "3 USDC + 0.10/address, capped at 49 USDC", pricing: "variable fee" },
  { id: "token-locker", title: "Token locker", description: "A future reviewed token locking operation.", category: "vesting-locking", indicativeFee: "39 USDC", pricing: "fixed fee" },
  { id: "custom-vesting", title: "Custom vesting", description: "A future reviewed token vesting operation.", category: "vesting-locking", indicativeFee: "79 USDC", pricing: "fixed fee" },
  { id: "simple-token-management", title: "Simple token management operation", description: "A future reviewed, operation-specific token administration flow.", category: "token-management", indicativeFee: "2–5 USDC", pricing: "variable fee" },
] as const;
const localMvpPaths: Record<string, string> = {
  "standard-erc20-creation": "/operations/token-creator/",
  "advanced-erc20-creation": "/operations/token-creator/",
  "erc20-bulk-distribution": "/operations/multisender/",
  "token-locker": "/operations/token-locker/",
  "custom-vesting": "/operations/token-vesting/",
};
export const PLANNED_OPERATIONS: readonly V2CatalogueEntry[] = proposedOperations.map((entry) => ({
  ...entry, tags: ["future operation"], networks: [] as ("ethereum" | "base")[],
  localMvpPath: localMvpPaths[entry.id],
  execution: "planned" as const, availability: "planned" as const,
  walletRequired: true, risk: "Unavailable in the hosted free catalog; the separate local Anvil MVP has no remote transaction or checkout.",
  feeModel: { serviceFee: entry.indicativeFee, gas: "separate estimate" as const, total: "not quoted" as const, paymentAsset: "USDC" as const, status: "proposal only" as const },
}));

export function categoryForLocal(engineId: string, legacyCategory: string, taskId = ""): V2CategoryId {
  if (engineId === "evm-data-inspector" || /^(abi-|eip712-|signed-transaction-|merkle-|evm-)/.test(taskId)) return "developer-tools";
  if (engineId === "token-fee-converter" || /^(token-supply|token-dilution)/.test(taskId)) return "token-management";
  if (engineId === "bridge-cost") return "transfers-airdrops";
  if (engineId === "vesting-unlocks") return "vesting-locking";
  if (engineId === "crypto-data-workshop" || engineId === "portfolio-exposure") return "portfolio-analytics";
  if (engineId === "bb-derivatives" || engineId === "trade-risk" || engineId === "execution-math" || engineId === "swap-cost" || engineId === "pnl") return "trading-risk";
  if (engineId === "bc-statistics" || legacyCategory === "Portfolio & performance") return "portfolio-analytics";
  if (legacyCategory === "Trade & execution") return "trading-risk";
  if (legacyCategory === "Data inspection") return "developer-tools";
  return "defi-liquidity";
}

export function categoryLabel(id: V2CategoryId): string {
  return V2_CATEGORIES.find((category) => category.id === id)!.label;
}
