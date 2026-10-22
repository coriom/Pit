import { BN_TOOLS, runBnTool, type ExplorerChain, type RpcFetch } from "./explorer-bn";
import { BO_TOOLS, runBoTool } from "./explorer-bo";
import { BP_TOOLS, runBpTool } from "./explorer-bp";
import { BQ_TOOLS, runBqTool } from "./explorer-bq";
export const EXPLORER_CATEGORIES = ["Assets & accounts", "Transactions & network", "Contracts & standards", "DeFi protocol state"] as const;
export const EXPLORER_TOOLS = [
  ...BN_TOOLS.map((tool) => ({ ...tool, category: EXPLORER_CATEGORIES[0] })),
  ...BO_TOOLS.map((tool) => ({ ...tool, category: EXPLORER_CATEGORIES[1] })),
  ...BP_TOOLS.map((tool) => ({ ...tool, category: EXPLORER_CATEGORIES[2] })),
  ...BQ_TOOLS.map((tool) => ({ ...tool, category: EXPLORER_CATEGORIES[3] })),
];
export const EXPLORER_IDS = EXPLORER_TOOLS.map((tool) => tool.id);
export function runExplorerTool(id: string, values: Record<string, string>, chain: ExplorerChain, fetcher?: RpcFetch) {
  if (BN_TOOLS.some((tool) => tool.id === id)) return runBnTool(id, values, chain, fetcher);
  if (BO_TOOLS.some((tool) => tool.id === id)) return runBoTool(id, values, chain, fetcher);
  if (BP_TOOLS.some((tool) => tool.id === id)) return runBpTool(id, values, chain, fetcher);
  return runBqTool(id, values, chain, fetcher);
}
