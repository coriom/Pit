import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import {
  TOOL_CATEGORIES,
  EXECUTION_MODES,
  NETWORK_REQUIREMENTS,
  TOOL_STATUSES,
  TOOLS,
  toolById,
} from "../src/lib/tool-registry";

describe("authoritative toolbox registry", () => {
  it("has unique IDs, slugs and paths, and every slug has an Astro page", () => {
    expect(new Set(TOOLS.map((tool) => tool.id)).size).toBe(TOOLS.length);
    expect(new Set(TOOLS.map((tool) => tool.slug)).size).toBe(TOOLS.length);
    expect(new Set(TOOLS.map((tool) => tool.path)).size).toBe(TOOLS.length);
    for (const tool of TOOLS) {
      expect(tool.path).toBe(`/tools/${tool.slug}/`);
      expect(existsSync(`src/pages/tools/${tool.slug}/index.astro`)).toBe(true);
      expect(toolById(tool.id)).toBe(tool);
    }
  });
  it("uses the closed taxonomy, modes, requirements and statuses", () => {
    expect(TOOL_CATEGORIES).toEqual([
      "Trade",
      "Wallet",
      "Analyze",
      "Calculate",
      "Accounting",
    ]);
    for (const tool of TOOLS) {
      expect(TOOL_CATEGORIES).toContain(tool.category);
      expect(EXECUTION_MODES).toContain(tool.executionMode);
      expect(NETWORK_REQUIREMENTS).toContain(tool.networkRequirement);
      expect(TOOL_STATUSES).toContain(tool.status);
      expect(["none", "connected"]).toContain(tool.walletRequirement);
    }
  });
  it("keeps execution metadata separate from the execution gate", () => {
    const execution = TOOLS.filter(
      (tool) => tool.executionMode === "execution",
    );
    expect(execution.map((tool) => tool.id)).toEqual(["swap", "perps"]);
    for (const tool of execution) {
      expect(tool.walletRequirement).toBe("connected");
      expect(tool.status).toBe("testnet-only");
      expect(tool.networkRequirement).not.toBe("none");
    }
    expect(
      TOOLS.filter((tool) => tool.executionMode === "local").map(
        (tool) => tool.id,
      ),
    ).toEqual([
      "evm-data-inspector",
      "crypto-data-workshop",
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
    ]);
    for (const tool of TOOLS.filter(
      (entry) => entry.executionMode === "local",
    )) {
      expect(tool.walletRequirement).toBe("none");
      expect(tool.networkRequirement).toBe("none");
    }
  });
});
