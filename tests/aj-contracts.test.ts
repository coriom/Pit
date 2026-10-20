import { describe, expect, it } from "vitest";
import {
  compatiblePorts,
  PURE_TOOL_CONTRACTS,
  runPureTool,
} from "../src/lib/pure-tool-contract";
import {
  performanceDrawdownContract,
  portfolioRebalanceContract,
  runAjTool,
} from "../src/lib/aj-tool-contracts";

const rebalance = {
  mode: "target",
  currencyLabel: "USD",
  feeBps: "0",
  rows: [
    { id: "a", label: "A", currentValue: "600", targetBps: "5000" },
    { id: "b", label: "B", currentValue: "400", targetBps: "5000" },
  ],
};
const history = {
  mode: "drawdown",
  currencyLabel: "USD",
  snapshots: [
    { date: "2026-01-01", endingValue: "100", externalFlow: "0" },
    { date: "2026-01-02", endingValue: "160", externalFlow: "50" },
    { date: "2026-01-03", endingValue: "144", externalFlow: "0" },
  ],
};

describe("Phase AJ closed pure-local adapters", () => {
  it("adds only two reviewed IDs and keeps execution IDs denied", () => {
    expect(PURE_TOOL_CONTRACTS.slice(0, 12).map((item) => item.id)).toEqual([
      "swap-cost",
      "portfolio-exposure",
      "token-fee-converter",
      "yield-growth",
      "trade-risk",
      "execution-math",
      "portfolio-rebalance",
      "performance-drawdown",
      "staking-rewards",
      "vesting-unlocks",
      "collateral-health",
      "borrowing-cost",
    ]);
    for (const id of [
      "swap",
      "perps",
      "taxlot-export",
      "wallet",
      "token-approvals",
    ]) {
      const denied = runPureTool(id, {});
      expect(denied.status).toBe("ERROR");
      if (denied.status === "ERROR")
        expect(denied.error.code).toBe("UNSUPPORTED_CALCULATION");
    }
  });

  it("validates nested input shape and rejects tampered economic output", () => {
    const good = runAjTool("portfolio-rebalance", rebalance);
    expect(good.status).toBe("COMPLETE");
    if (good.status === "ERROR") throw Error(good.error.message);
    expect(good.values[0].port.unit?.kind).toBe("manual-money");
    expect(
      runAjTool("portfolio-rebalance", { ...rebalance, extra: "unexpected" })
        .status,
    ).toBe("ERROR");
    expect(
      runAjTool("portfolio-rebalance", {
        ...rebalance,
        rows: [{ ...rebalance.rows[0], secret: "x" }, rebalance.rows[1]],
      }).status,
    ).toBe("ERROR");
    const contribution = runAjTool("portfolio-rebalance", {
      mode: "contribution",
      currencyLabel: "USD",
      contribution: "200",
      rows: rebalance.rows,
    });
    if (contribution.status === "ERROR")
      throw Error(contribution.error.message);
    expect(() =>
      portfolioRebalanceContract.validateOutput({
        ...contribution.output,
        rows: [
          { ...contribution.output.rows[0], contributionRaw: "1" },
          contribution.output.rows[1],
        ],
      }),
    ).toThrow(/conserve/);
  });

  it("keeps incomplete valuation and undefined returns out of composable values", () => {
    const unknown = runAjTool("portfolio-rebalance", {
      ...rebalance,
      rows: [{ ...rebalance.rows[0], currentValue: "" }, rebalance.rows[1]],
    });
    expect(unknown.status).toBe("INCOMPLETE");
    if (unknown.status === "ERROR") throw Error(unknown.error.message);
    expect(unknown.values).toEqual([]);
    const zero = runAjTool("performance-drawdown", {
      ...history,
      snapshots: [
        { date: "2026-01-01", endingValue: "0", externalFlow: "0" },
        { date: "2026-01-02", endingValue: "50", externalFlow: "50" },
      ],
    });
    expect(zero.status).toBe("INCOMPLETE");
    if (zero.status === "ERROR") throw Error(zero.error.message);
    expect(zero.values).toEqual([]);
  });

  it("separates cash flow, dates, currencies and normalized-index units", () => {
    const drawdown = runAjTool("performance-drawdown", history);
    const newer = runAjTool("performance-drawdown", {
      ...history,
      snapshots: [
        ...history.snapshots,
        { date: "2026-01-04", endingValue: "176", externalFlow: "0" },
      ],
    });
    const allocation = runAjTool("portfolio-rebalance", rebalance);
    if (
      drawdown.status === "ERROR" ||
      newer.status === "ERROR" ||
      allocation.status === "ERROR"
    )
      throw Error("Unexpected contract rejection");
    expect(drawdown.values[0].port.observedAt).toBe("2026-01-03");
    expect(compatiblePorts(drawdown.values[0].port, newer.values[0].port)).toBe(
      false,
    );
    expect(
      compatiblePorts(drawdown.values[0].port, allocation.values[0].port),
    ).toBe(false);
    expect(
      compatiblePorts(allocation.values[0].port, allocation.values[0].port),
    ).toBe(false);
    expect(drawdown.inputPorts[1].unit?.kind).toBe("signed-manual-cash-flow");
    expect(() =>
      performanceDrawdownContract.validateOutput({
        ...drawdown.output,
        fields: drawdown.output.fields.map((field) =>
          field.name === "nominalGain" ? { ...field, raw: "123" } : field,
        ),
      }),
    ).toThrow(/identity/);
  });
});
