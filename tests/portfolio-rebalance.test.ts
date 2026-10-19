import { describe, expect, it } from "vitest";
import {
  apportionTarget,
  calculateRebalance,
  rebalanceReportJSON,
  type RebalanceInput,
} from "../src/lib/portfolio-rebalance";

const rows = [
  { id: "a", label: "Asset A", currentValue: "600", targetBps: "5000" },
  { id: "b", label: "Asset B", currentValue: "400", targetBps: "5000" },
];
const target: RebalanceInput = {
  mode: "target",
  currencyLabel: "USD",
  rows,
  feeBps: "100",
};
const raw = (result: ReturnType<typeof calculateRebalance>, name: string) =>
  result.fields.find((item) => item.name === name)!.raw;
const display = (result: ReturnType<typeof calculateRebalance>, name: string) =>
  result.fields.find((item) => item.name === name)!.display;

describe("manual portfolio rebalance", () => {
  it("conserves 600/400 capital at 50/50 and separates estimated fees", () => {
    const result = calculateRebalance(target);
    expect(result.status).toBe("complete");
    expect(result.rows.map((row) => row.currentWeightPpm)).toEqual([
      "600000",
      "400000",
    ]);
    expect(result.rows.map((row) => row.allocationDriftPpm)).toEqual([
      "-100000",
      "100000",
    ]);
    expect(result.rows.map((row) => row.desiredValueRaw)).toEqual([
      "500000000000000000000",
      "500000000000000000000",
    ]);
    expect(result.rows.map((row) => row.idealTradeRaw)).toEqual([
      "-100000000000000000000",
      "100000000000000000000",
    ]);
    expect(display(result, "grossTurnover")).toBe("200");
    expect(display(result, "oneWayTurnover")).toBe("100");
    expect(display(result, "oneWayTurnoverBps")).toBe("1000");
    expect(display(result, "separateEstimatedFeeDrag")).toBe("2");
    expect(JSON.parse(rebalanceReportJSON(result)).rows[0].idealTradeRaw).toBe(
      "-100000000000000000000",
    );
  });

  it("finds exact contribution feasibility, blocking overweights and minimum capital", () => {
    const input: RebalanceInput = {
      mode: "contribution",
      currencyLabel: "USD",
      rows,
      contribution: "200",
    };
    const feasible = calculateRebalance(input);
    expect(feasible.feasibility).toBe("feasible");
    expect(feasible.rows.map((row) => row.contributionRaw)).toEqual([
      "0",
      "200000000000000000000",
    ]);
    expect(display(feasible, "minimumContribution")).toBe("200");
    const blocked = calculateRebalance({ ...input, contribution: "100" });
    expect(blocked.status).toBe("complete");
    expect(blocked.feasibility).toBe("infeasible");
    expect(blocked.rows[0].blockingOverweightRaw).toBe("50000000000000000000");
    expect(blocked.rows.every((row) => row.contributionRaw === null)).toBe(
      true,
    );
    expect(display(blocked, "minimumContribution")).toBe("200");
  });

  it("declares zero-target positive holdings impossible without selling", () => {
    const result = calculateRebalance({
      mode: "contribution",
      currencyLabel: "USD",
      contribution: "1000",
      rows: [
        { ...rows[0], targetBps: "0" },
        { ...rows[1], targetBps: "10000" },
      ],
    });
    expect(result.feasibility).toBe("infeasible");
    expect(
      result.fields.some((field) => field.name === "minimumContribution"),
    ).toBe(false);
  });

  it("requires a positive smallest-unit deposit before a zero-value portfolio has an allocation", () => {
    const result = calculateRebalance({
      mode: "contribution",
      currencyLabel: "USD",
      contribution: "0.000000000000000001",
      rows: rows.map((row) => ({ ...row, currentValue: "0" })),
    });
    expect(result.feasibility).toBe("feasible");
    expect(raw(result, "minimumContribution")).toBe("1");
    expect(
      result.rows.reduce((sum, row) => sum + BigInt(row.contributionRaw!), 0n),
    ).toBe(1n);
  });

  it("apportions rounding residual without creating phantom currency units", () => {
    const apportioned = apportionTarget(1n, [
      { id: "a", targetBps: 5000n },
      { id: "b", targetBps: 5000n },
    ]);
    expect(apportioned).toEqual([1n, 0n]);
    for (const total of [1n, 2n, 3n, 9n, 101n, 1001n]) {
      const parts = apportionTarget(total, [
        { id: "a", targetBps: 3333n },
        { id: "b", targetBps: 3333n },
        { id: "c", targetBps: 3334n },
      ]);
      expect(parts.reduce((sum, value) => sum + value, 0n)).toBe(total);
      expect(parts.every((value) => value >= 0n)).toBe(true);
    }
  });

  it("calculates a manual shock from the projected rather than original denominator", () => {
    const result = calculateRebalance({
      mode: "shock",
      currencyLabel: "USD",
      rows: [
        { id: "a", label: "Asset A", currentValue: "600", shockBps: "-2000" },
        { id: "b", label: "Asset B", currentValue: "400", shockBps: "1000" },
      ],
    });
    expect(display(result, "projectedTotal")).toBe("920");
    expect(display(result, "portfolioChange")).toBe("-80");
    expect(display(result, "portfolioChangePercent")).toBe("-8");
    expect(result.rows.map((row) => row.projectedValueRaw)).toEqual([
      "480000000000000000000",
      "440000000000000000000",
    ]);
    expect(result.rows.map((row) => row.projectedWeightPpm)).toEqual([
      "521739",
      "478261",
    ]);
  });

  it("rejects incomplete and impossible inputs without treating unknown values as zero", () => {
    const missing = calculateRebalance({
      ...target,
      rows: [{ ...rows[0], currentValue: "" }, rows[1]],
    });
    expect(missing.status).toBe("incomplete");
    expect(missing.rows[0].currentValueRaw).toBeNull();
    expect(missing.fields.some((item) => item.name === "currentTotal")).toBe(
      false,
    );
    expect(() =>
      calculateRebalance({
        ...target,
        rows: [{ ...rows[0], targetBps: "4900" }, rows[1]],
      }),
    ).toThrow(/10000/);
    expect(() =>
      calculateRebalance({
        ...target,
        rows: [rows[0], { ...rows[1], id: "a" }],
      }),
    ).toThrow(/Duplicate/);
    expect(() =>
      calculateRebalance({
        mode: "shock",
        currencyLabel: "USD",
        rows: [
          { id: "a", label: "A", currentValue: "600", shockBps: "-10001" },
          { id: "b", label: "B", currentValue: "400", shockBps: "0" },
        ],
      }),
    ).toThrow(/between/);
    expect(() =>
      calculateRebalance({
        ...target,
        rows: [{ ...rows[0], currentValue: "1e3" }, rows[1]],
      }),
    ).toThrow();
    expect(
      raw(calculateRebalance({ ...target, feeBps: "" }), "currentTotal"),
    ).toBe("1000000000000000000000");
  });
});
