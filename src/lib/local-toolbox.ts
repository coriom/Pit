import { LOCAL_TOOL_DEFINITIONS } from "./local-tool-definitions";

// Build-time review boundary. Registry membership alone never authorizes a route.
export const LOCAL_TOOL_IDS = [
  "pnl",
  "swap-cost",
  "token-fee-converter",
  "yield-growth",
  "trade-risk",
  "execution-math",
  "bridge-cost",
  "portfolio-exposure",
  "portfolio-rebalance",
  "performance-drawdown",
  "staking-rewards",
  "vesting-unlocks",
  "collateral-health",
  "borrowing-cost",
  "liquidation",
  "amm-pool-math",
  "concentrated-liquidity",
  "impermanent-loss",
  "evm-data-inspector",
  "crypto-data-workshop",
] as const;

export const LOCAL_TOOLS = LOCAL_TOOL_IDS.map((id) => {
  const tool = LOCAL_TOOL_DEFINITIONS.find((entry) => entry.id === id);
  if (!tool || tool.executionMode !== "local" || tool.walletRequirement !== "none" || tool.networkRequirement !== "none" || tool.status !== "available")
    throw new Error(`Unsafe local toolbox tool: ${id}`);
  return tool;
});

export const LOCAL_TOOL_ID_SET: ReadonlySet<string> = new Set(LOCAL_TOOL_IDS);

export const LOCAL_TASK_GROUPS = [
  { id: "portfolio", label: "Portfolio & performance", ids: ["portfolio-exposure", "portfolio-rebalance", "performance-drawdown", "pnl", "trade-risk"] },
  { id: "costs", label: "Costs & conversions", ids: ["swap-cost", "bridge-cost", "execution-math", "token-fee-converter"] },
  { id: "yield", label: "Yield, debt & schedules", ids: ["yield-growth", "staking-rewards", "vesting-unlocks", "collateral-health", "borrowing-cost", "liquidation"] },
  { id: "liquidity", label: "Liquidity mathematics", ids: ["amm-pool-math", "concentrated-liquidity", "impermanent-loss"] },
  { id: "data", label: "Data inspection", ids: ["evm-data-inspector", "crypto-data-workshop"] },
] as const;

const grouped = LOCAL_TASK_GROUPS.flatMap((group) => group.ids);
if (grouped.length !== LOCAL_TOOL_IDS.length || new Set(grouped).size !== grouped.length || grouped.some((id) => !LOCAL_TOOL_ID_SET.has(id)))
  throw new Error("Local toolbox task groups must cover each approved tool exactly once");
