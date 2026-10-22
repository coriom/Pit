import { BN_TOOLS, runBnTool, type ExplorerChain, type RpcFetch } from "./explorer-bn";
import { BO_TOOLS, runBoTool } from "./explorer-bo";
export const EXPLORER_TOOLS = [...BN_TOOLS, ...BO_TOOLS];
export const EXPLORER_IDS = EXPLORER_TOOLS.map((tool) => tool.id);
export function runExplorerTool(id: string, values: Record<string, string>, chain: ExplorerChain, fetcher?: RpcFetch) {
  return BN_TOOLS.some((tool) => tool.id === id) ? runBnTool(id, values, chain, fetcher) : runBoTool(id, values, chain, fetcher);
}
