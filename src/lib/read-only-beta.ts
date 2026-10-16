import { TOOLS } from "./tool-registry";

// This allowlist drives separate beta source entries, not a runtime route filter.
export const READ_ONLY_TOOL_IDS = [
  "portfolio-exposure", "swap-cost", "impermanent-loss",
  "pnl", "bridge-cost", "liquidation",
] as const;

export const READ_ONLY_TOOLS = READ_ONLY_TOOL_IDS.map((id) => {
  const tool = TOOLS.find((entry) => entry.id === id);
  if (!tool || tool.executionMode !== "local" || tool.walletRequirement !== "none" || tool.networkRequirement !== "none")
    throw new Error(`Unsafe read-only beta tool: ${id}`);
  return tool;
});
