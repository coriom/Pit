export const TOOL_CATEGORIES = [
  "Trade",
  "Wallet",
  "Analyze",
  "Calculate",
  "Accounting",
] as const;
export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

export const EXECUTION_MODES = ["local", "read-only", "execution"] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];
export const TOOL_STATUSES = ["available", "testnet-only"] as const;
export type ToolStatus = (typeof TOOL_STATUSES)[number];
export const NETWORK_REQUIREMENTS = [
  "none",
  "ethereum-sepolia",
  "hyperliquid-testnet",
  "testnet-apis",
] as const;
export type NetworkRequirement = (typeof NETWORK_REQUIREMENTS)[number];

export type ToolDefinition = Readonly<{
  id: string;
  slug: string;
  path: `/tools/${string}/`;
  title: string;
  description: string;
  category: ToolCategory;
  executionMode: ExecutionMode;
  walletRequirement: "none" | "connected";
  networkRequirement: NetworkRequirement;
  status: ToolStatus;
}>;

export const TOOLS = [
  {
    id: "swap",
    slug: "swap",
    path: "/tools/swap/",
    title: "Swap",
    description:
      "Review CoW order history and submit a swap on Ethereum Sepolia.",
    category: "Trade",
    executionMode: "execution",
    walletRequirement: "connected",
    networkRequirement: "ethereum-sepolia",
    status: "testnet-only",
  },
  {
    id: "perps",
    slug: "perps",
    path: "/tools/perps/",
    title: "Perps",
    description:
      "Review positions, orders and fills or place a Hyperliquid testnet limit order.",
    category: "Trade",
    executionMode: "execution",
    walletRequirement: "connected",
    networkRequirement: "hyperliquid-testnet",
    status: "testnet-only",
  },
  {
    id: "wallet",
    slug: "wallet",
    path: "/tools/wallet/",
    title: "Wallet connection",
    description:
      "Connect an injected wallet and read its balance through the provider.",
    category: "Wallet",
    executionMode: "read-only",
    walletRequirement: "none",
    networkRequirement: "none",
    status: "available",
  },
  {
    id: "pnl",
    slug: "pnl",
    path: "/tools/pnl/",
    title: "PnL Calculator",
    description:
      "Calculate price-based profit or loss from entry, exit, size and fees.",
    category: "Calculate",
    executionMode: "local",
    walletRequirement: "none",
    networkRequirement: "none",
    status: "available",
  },
  {
    id: "liquidation",
    slug: "liquidation",
    path: "/tools/liquidation/",
    title: "Liquidation Price Calculator",
    description: "Solve a generic isolated-position maintenance threshold.",
    category: "Calculate",
    executionMode: "local",
    walletRequirement: "none",
    networkRequirement: "none",
    status: "available",
  },
  {
    id: "impermanent-loss",
    slug: "impermanent-loss",
    path: "/tools/impermanent-loss/",
    title: "Impermanent Loss Calculator",
    description: "Compare a fee-free 50/50 constant-product pool with holding.",
    category: "Calculate",
    executionMode: "local",
    walletRequirement: "none",
    networkRequirement: "none",
    status: "available",
  },
  {
    id: "taxlot-export",
    slug: "taxlot-export",
    path: "/tools/taxlot-export/",
    title: "Taxlot export",
    description:
      "Sync supported testnet fills and export local spot records as CSV.",
    category: "Accounting",
    executionMode: "read-only",
    walletRequirement: "connected",
    networkRequirement: "testnet-apis",
    status: "testnet-only",
  },
] as const satisfies readonly ToolDefinition[];

export function toolById(id: (typeof TOOLS)[number]["id"]) {
  const tool = TOOLS.find((entry) => entry.id === id);
  if (!tool) throw new Error(`Unknown tool: ${id}`);
  return tool;
}
