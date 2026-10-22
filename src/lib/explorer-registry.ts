import { BN_TOOLS, runBnTool, type ExplorerChain, type RpcFetch } from "./explorer-bn";
import { BO_TOOLS, runBoTool } from "./explorer-bo";
import { BP_TOOLS, runBpTool } from "./explorer-bp";
export const EXPLORER_TOOLS = [...BN_TOOLS, ...BO_TOOLS, ...BP_TOOLS];
export const EXPLORER_IDS = EXPLORER_TOOLS.map((tool) => tool.id);
export function runExplorerTool(id: string, values: Record<string, string>, chain: ExplorerChain, fetcher?: RpcFetch) {
  if (BN_TOOLS.some((tool) => tool.id === id)) return runBnTool(id, values, chain, fetcher);
  if (BO_TOOLS.some((tool) => tool.id === id)) return runBoTool(id, values, chain, fetcher);
  return runBpTool(id, values, chain, fetcher);
}
