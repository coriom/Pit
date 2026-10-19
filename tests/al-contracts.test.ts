import { describe, expect, it } from "vitest";
import {
  compatiblePorts,
  PURE_TOOL_CONTRACTS,
  runPureTool,
} from "../src/lib/pure-tool-contract";
import {
  borrowingCostContract,
  collateralHealthContract,
  runAlTool,
} from "../src/lib/al-tool-contracts";
const health = {
  mode: "health",
  currency: "USDmanual",
  decimals: 2,
  collateral: "2000",
  debt: "1000",
  maxLtvBps: "7500",
  liquidationThresholdBps: "8000",
  targetHealthFactor: "1.3",
};
const growth = {
  mode: "growth",
  currency: "USDmanual",
  decimals: 2,
  principal: "1000",
  borrowAprBps: "1200",
  elapsedDays: 365,
  periodsPerYear: 12,
  elapsedPeriods: 12,
};
describe("Phase AL closed local contracts", () => {
  it("allows only two new pure IDs and rejects execution IDs", () => {
    expect(PURE_TOOL_CONTRACTS.map((item) => item.id).slice(-2)).toEqual([
      "collateral-health",
      "borrowing-cost",
    ]);
    for (const id of [
      "swap",
      "perps",
      "taxlot-export",
      "wallet",
      "uniswap-execution",
    ])
      expect(runPureTool(id, {}).status).toBe("ERROR");
  });
  it("validates strict mode shapes and output conservation", () => {
    const c = runAlTool("collateral-health", health);
    const b = runAlTool("borrowing-cost", growth);
    expect(c.status).toBe("COMPLETE");
    expect(b.status).toBe("COMPLETE");
    if (c.status === "ERROR" || b.status === "ERROR")
      throw Error("Unexpected invalid example");
    expect(
      runAlTool("collateral-health", { ...health, extra: "x" }).status,
    ).toBe("ERROR");
    expect(
      runAlTool("borrowing-cost", { ...growth, elapsedPeriods: 1.5 }).status,
    ).toBe("ERROR");
    expect(() =>
      collateralHealthContract.validateOutput({
        ...c.output,
        fields: c.output.fields.map((f) =>
          f.name === "additionalBorrowHeadroom" ? { ...f, raw: "1" } : f,
        ),
      }),
    ).toThrow(/identity/);
    const repayment = runAlTool("borrowing-cost", {
      ...growth,
      mode: "repayment",
      horizonPeriods: 2,
      fixedPayment: "100",
      elapsedDays: undefined,
      elapsedPeriods: undefined,
    });
    expect(repayment.status).toBe("ERROR");
    expect(() =>
      borrowingCostContract.validateOutput({
        ...b.output,
        calculationVersion: "wrong" as typeof b.output.calculationVersion,
      }),
    ).toThrow(/contract/);
    const schedule = runAlTool("borrowing-cost", {
      mode: "repayment",
      currency: "USDmanual",
      decimals: 2,
      principal: "1000",
      borrowAprBps: "1200",
      periodsPerYear: 12,
      horizonPeriods: 2,
      fixedPayment: "100",
    });
    expect(schedule.status).toBe("INCOMPLETE");
    if (schedule.status === "ERROR") throw Error(schedule.error.message);
    expect(() =>
      borrowingCostContract.validateOutput({
        ...schedule.output,
        schedule: schedule.output.schedule.map((row, index) =>
          index === 0 ? { ...row, endingDebtRaw: "1" } : row,
        ),
      }),
    ).toThrow(/identity/);
  });
  it("does not connect manual currency, LTV, HF or APR by coincident label", () => {
    const c = runAlTool("collateral-health", health);
    const b = runAlTool("borrowing-cost", growth);
    if (c.status === "ERROR" || b.status === "ERROR")
      throw Error("Unexpected invalid example");
    expect(compatiblePorts(c.values[0].port, b.inputPorts[0])).toBe(false);
    expect(compatiblePorts(c.inputPorts[2], c.inputPorts[3])).toBe(false);
    expect(compatiblePorts(c.inputPorts[3], b.inputPorts[1])).toBe(false);
    expect(c.inputPorts[0].unit).toEqual({
      kind: "manual-quote",
      decimals: 2,
      label: "usdmanual",
    });
  });
  it("keeps unknown costs incomplete and absent from carry output ports", () => {
    const carry = runAlTool("borrowing-cost", {
      mode: "carry",
      currency: "USDmanual",
      decimals: 2,
      principal: "500",
      borrowAprBps: "800",
      elapsedDays: 365,
      investmentYieldBps: "1200",
      otherCosts: "",
      costCoverage: "unknown",
    });
    expect(carry.status).toBe("INCOMPLETE");
    if (carry.status === "ERROR") throw Error(carry.error.message);
    expect(carry.values).toEqual([]);
  });
});
