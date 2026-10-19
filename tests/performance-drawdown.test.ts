import { describe, expect, it } from "vitest";
import {
  calculatePerformance,
  performanceReportJSON,
  type PerformanceInput,
} from "../src/lib/performance-drawdown";

const snapshots = [
  { date: "2026-01-01", endingValue: "100", externalFlow: "0" },
  { date: "2026-01-02", endingValue: "160", externalFlow: "50" },
  { date: "2026-01-03", endingValue: "144", externalFlow: "0" },
];
const input: PerformanceInput = {
  mode: "performance",
  currencyLabel: "USD",
  snapshots,
};
const value = (result: ReturnType<typeof calculatePerformance>, name: string) =>
  result.fields.find((field) => field.name === name)!.display;

describe("manual cash-flow-adjusted performance and drawdown", () => {
  it("distinguishes nominal -6 gain from chained -1% TWR", () => {
    const result = calculatePerformance(input);
    expect(result.status).toBe("complete");
    expect(value(result, "netExternalFlows")).toBe("50");
    expect(value(result, "nominalGain")).toBe("-6");
    expect(result.rows.map((row) => row.periodReturnPercentRaw)).toEqual([
      null,
      "10000000000000000000",
      "-10000000000000000000",
    ]);
    expect(value(result, "timeWeightedReturnPercent")).toBe("-1");
    expect(result.rows.map((row) => row.normalizedIndexRaw)).toEqual([
      "1000000000000000000",
      "1100000000000000000",
      "990000000000000000",
    ]);
    expect(
      JSON.parse(performanceReportJSON(result)).rows[2].normalizedIndexRaw,
    ).toBe("990000000000000000");
  });

  it("draws down 10% from the flow-neutral peak and later records recovery", () => {
    const result = calculatePerformance({ ...input, mode: "drawdown" });
    expect(value(result, "maximumDrawdownPercent")).toBe("-10");
    expect(value(result, "currentDrawdownPercent")).toBe("-10");
    expect(result.maxDrawdownPeakDate).toBe("2026-01-02");
    expect(result.maxDrawdownTroughDate).toBe("2026-01-03");
    expect(result.recovered).toBe(false);
    expect(result.recoveryDate).toBeNull();
    const recovered = calculatePerformance({
      ...input,
      mode: "drawdown",
      snapshots: [
        ...snapshots,
        { date: "2026-01-04", endingValue: "176", externalFlow: "0" },
      ],
    });
    expect(recovered.recoveryDate).toBe("2026-01-04");
    expect(recovered.recovered).toBe(true);
    expect(value(recovered, "maxDrawdownRecoveryDays")).toBe("2");
    expect(value(recovered, "currentDrawdownPercent")).toBe("0");
  });

  it("uses the latest equal high before a later decline and leaves the earliest tied worst trough", () => {
    const result = calculatePerformance({
      ...input,
      mode: "drawdown",
      snapshots: [
        { date: "2026-01-01", endingValue: "100", externalFlow: "0" },
        { date: "2026-01-02", endingValue: "110", externalFlow: "0" },
        { date: "2026-01-03", endingValue: "110", externalFlow: "0" },
        { date: "2026-01-04", endingValue: "99", externalFlow: "0" },
        { date: "2026-01-05", endingValue: "99", externalFlow: "0" },
      ],
    });
    expect(result.maxDrawdownPeakDate).toBe("2026-01-03");
    expect(result.maxDrawdownTroughDate).toBe("2026-01-04");
    expect(value(result, "currentUnderwaterDays")).toBe("2");
  });

  it("makes deposits and withdrawals return-neutral when portfolio economics are unchanged", () => {
    for (const [endingValue, externalFlow] of [
      ["150", "50"],
      ["80", "-20"],
    ]) {
      const result = calculatePerformance({
        ...input,
        snapshots: [
          snapshots[0],
          { date: "2026-01-02", endingValue, externalFlow },
        ],
      });
      expect(value(result, "nominalGain")).toBe("0");
      expect(value(result, "timeWeightedReturnPercent")).toBe("0");
      expect(value(result, "maximumDrawdownPercent")).toBe("0");
    }
  });

  it("defines complete loss but keeps a zero opening denominator incomplete", () => {
    const lost = calculatePerformance({
      ...input,
      snapshots: [
        snapshots[0],
        { date: "2026-01-02", endingValue: "0", externalFlow: "0" },
      ],
    });
    expect(value(lost, "timeWeightedReturnPercent")).toBe("-100");
    expect(value(lost, "maximumDrawdownPercent")).toBe("-100");
    expect(lost.recovered).toBe(false);
    const undefinedReturn = calculatePerformance({
      ...input,
      snapshots: [
        { ...snapshots[0], endingValue: "0" },
        { date: "2026-01-02", endingValue: "50", externalFlow: "50" },
      ],
    });
    expect(undefinedReturn.status).toBe("incomplete");
    expect(undefinedReturn.rows[1].periodReturnPercentRaw).toBeNull();
    expect(
      undefinedReturn.fields.some(
        (field) => field.name === "timeWeightedReturnPercent",
      ),
    ).toBe(false);
  });

  it("rejects ambiguous dates, malformed flows and impossible end-of-period values", () => {
    expect(() =>
      calculatePerformance({
        ...input,
        snapshots: [snapshots[0], { ...snapshots[1], date: "2026-01-01" }],
      }),
    ).toThrow(/strictly increasing/);
    expect(() =>
      calculatePerformance({
        ...input,
        snapshots: [snapshots[0], { ...snapshots[1], date: "2026-02-30" }],
      }),
    ).toThrow(/calendar date/);
    expect(() =>
      calculatePerformance({
        ...input,
        snapshots: [snapshots[0], { ...snapshots[1], externalFlow: "1e3" }],
      }),
    ).toThrow();
    expect(() =>
      calculatePerformance({
        ...input,
        snapshots: [{ ...snapshots[0], externalFlow: "1" }, snapshots[1]],
      }),
    ).toThrow(/Opening/);
    expect(() =>
      calculatePerformance({
        ...input,
        snapshots: [snapshots[0], { ...snapshots[1], endingValue: "40" }],
      }),
    ).toThrow(/exceeds/);
  });

  it("keeps a largest recorded drawdown within 0 and -100% over bounded manual series", () => {
    for (const values of [
      [100, 101, 90],
      [100, 100, 100],
      [100, 50, 75],
      [100, 0],
    ]) {
      const result = calculatePerformance({
        ...input,
        mode: "drawdown",
        snapshots: values.map((number, i) => ({
          date: `2026-01-${String(i + 1).padStart(2, "0")}`,
          endingValue: String(number),
          externalFlow: "0",
        })),
      });
      const depth = BigInt(
        result.fields.find((field) => field.name === "maximumDrawdownPercent")!
          .raw,
      );
      expect(depth).toBeLessThanOrEqual(0n);
      expect(depth).toBeGreaterThanOrEqual(-100n * 10n ** 18n);
    }
  });
});
