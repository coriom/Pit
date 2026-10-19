import { describe, expect, it } from "vitest";
import {
  calculateExecutionMath,
  executionMathReportJSON,
} from "../src/lib/execution-math";
const value = (
  result: ReturnType<typeof calculateExecutionMath>,
  name: string,
) => result.fields.find((item) => item.name === name)!;
const gas = {
  mode: "gas" as const,
  nativeLabel: "ETH",
  transactionGasUnits: "21000",
  approvalRequired: "no" as const,
  approvalGasUnits: "",
  gasPriceGwei: "20",
  budgetNative: "0.001",
  notionalNative: "",
  coverage: "complete" as const,
};

describe("manual execution mathematics", () => {
  it("computes midpoint, midpoint-denominated spread and signed reference deviation", () => {
    const input = {
      mode: "spread" as const,
      quoteLabel: "USD",
      quoteDecimals: 2,
      bid: "99",
      ask: "101",
      referencePrice: "100",
      executionPrice: "101",
    };
    const result = calculateExecutionMath(input);
    expect(value(result, "midpoint").display).toBe("100");
    expect(value(result, "absoluteSpread").display).toBe("2");
    expect(value(result, "midpointSpreadBps").display).toBe("200");
    expect(value(result, "executionDeviationBps").display).toBe("100");
    expect(
      value(
        calculateExecutionMath({ ...input, executionPrice: "99" }),
        "executionDeviationBps",
      ).display,
    ).toBe("-100");
    expect(() => calculateExecutionMath({ ...input, ask: "98" })).toThrow(
      /Ask/,
    );
  });
  it("floors minimum receive and ceilings maximum spend in exact token base units", () => {
    const input = {
      mode: "slippage" as const,
      tokenLabel: "USDC",
      tokenDecimals: 6,
      direction: "exact-input" as const,
      expectedAmount: "100",
      toleranceBps: "50",
    };
    expect(value(calculateExecutionMath(input), "minimumReceive").display).toBe(
      "99.5",
    );
    expect(
      value(
        calculateExecutionMath({ ...input, direction: "exact-output" }),
        "maximumSpend",
      ).display,
    ).toBe("100.5");
    const tiny = {
      ...input,
      tokenDecimals: 0,
      expectedAmount: "1",
      toleranceBps: "1",
    };
    expect(value(calculateExecutionMath(tiny), "minimumReceive").raw).toBe("0");
    expect(
      value(
        calculateExecutionMath({ ...tiny, direction: "exact-output" }),
        "maximumSpend",
      ).raw,
    ).toBe("2");
    expect(() =>
      calculateExecutionMath({ ...input, toleranceBps: "10001" }),
    ).toThrow();
    expect(() =>
      calculateExecutionMath({ ...input, expectedAmount: "1.0000001" }),
    ).toThrow(/precision/);
  });
  it("keeps slippage bounds monotone across precisions and tolerances", () => {
    for (const tokenDecimals of [0, 6, 18, 36]) {
      let previousMinimum: bigint | null = null;
      let previousMaximum: bigint | null = null;
      for (const toleranceBps of ["0", "1", "50", "500", "10000"]) {
        const input = {
          mode: "slippage" as const,
          tokenLabel: "TEST",
          tokenDecimals,
          direction: "exact-input" as const,
          expectedAmount: "100",
          toleranceBps,
        };
        const minimum = BigInt(
          value(calculateExecutionMath(input), "minimumReceive").raw,
        );
        const maximum = BigInt(
          value(
            calculateExecutionMath({ ...input, direction: "exact-output" }),
            "maximumSpend",
          ).raw,
        );
        expect(minimum).toBeLessThanOrEqual(
          100n * 10n ** BigInt(tokenDecimals),
        );
        expect(maximum).toBeGreaterThanOrEqual(
          100n * 10n ** BigInt(tokenDecimals),
        );
        if (previousMinimum !== null)
          expect(minimum).toBeLessThanOrEqual(previousMinimum);
        if (previousMaximum !== null)
          expect(maximum).toBeGreaterThanOrEqual(previousMaximum);
        previousMinimum = minimum;
        previousMaximum = maximum;
      }
    }
  });
  it("models transaction and optional approval gas without double counting", () => {
    const result = calculateExecutionMath(gas);
    expect(value(result, "transactionGasWei").raw).toBe("420000000000000");
    expect(value(result, "knownTotalGasNative").display).toBe("0.00042");
    expect(value(result, "maximumGasPriceWei").raw).toBe("47619047619");
    const withApproval = calculateExecutionMath({
      ...gas,
      approvalRequired: "yes",
      approvalGasUnits: "45000",
    });
    expect(value(withApproval, "knownGasUnits").raw).toBe("66000");
    expect(value(withApproval, "knownTotalGasNative").display).toBe("0.00132");
    expect(() =>
      calculateExecutionMath({ ...gas, approvalGasUnits: "45000" }),
    ).toThrow(/twice/);
    expect(() =>
      calculateExecutionMath({ ...gas, transactionGasUnits: "0" }),
    ).toThrow(/positive/);
  });
  it("marks unknown approval, price, budget and extra fee coverage incomplete", () => {
    const unknown = calculateExecutionMath({
      ...gas,
      approvalRequired: "unknown",
      gasPriceGwei: "",
      budgetNative: "",
      coverage: "unknown-extra",
    });
    expect(unknown.status).toBe("incomplete");
    expect(unknown.reasons).toHaveLength(4);
    expect(
      unknown.fields.some((item) => item.name === "knownTotalGasWei"),
    ).toBe(false);
    expect(
      unknown.fields.some(
        (item) =>
          item.name === "knownGasUnits" || item.name === "approvalGasUnits",
      ),
    ).toBe(false);
    const extra = calculateExecutionMath({ ...gas, coverage: "unknown-extra" });
    expect(extra.status).toBe("incomplete");
    expect(value(extra, "knownTotalGasWei").raw).toBe("420000000000000");
    expect(JSON.parse(executionMathReportJSON(extra)).simulated).toBe(true);
  });
  it("uses only same-native-unit notional for an optional ratio", () => {
    const result = calculateExecutionMath({ ...gas, notionalNative: "1" });
    expect(value(result, "gasShareOfNativeNotionalBps").display).toBe("4.2");
    expect(() =>
      calculateExecutionMath({ ...gas, notionalNative: "0" }),
    ).toThrow(/positive/);
    expect(() =>
      calculateExecutionMath({
        ...gas,
        gasPriceGwei: "",
        notionalNative: "bad",
      }),
    ).toThrow(/nonnegative decimal/);
    expect(() =>
      calculateExecutionMath({ ...gas, transactionGasUnits: "1000000001" }),
    ).toThrow(/cap/);
  });
});
