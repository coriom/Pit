import { describe, expect, it } from "vitest";
import {
  CalculationInputError,
  calculateImpermanentLoss,
  calculateLiquidation,
  calculatePnL,
  parseDecimal,
} from "../src/lib/calculators";

describe("decimal input", () => {
  it.each(["", " ", "NaN", "Infinity", "-1", "0x10", "1,000", "1e309", "abc"])(
    "rejects malformed or non-finite %s",
    (raw) => {
      expect(() => parseDecimal(raw, "Value")).toThrow(CalculationInputError);
    },
  );
  it("accepts finite decimal and scientific notation", () => {
    expect(parseDecimal(" 0.125 ", "Value")).toBe(0.125);
    expect(parseDecimal("1e-3", "Value")).toBe(0.001);
  });
});

describe("PnL calculator", () => {
  it("calculates long and short outcomes with quote-unit fees", () => {
    expect(
      calculatePnL({
        side: "long",
        entryPrice: 100,
        exitPrice: 120,
        quantity: 2,
        totalFees: 2,
      }),
    ).toEqual({ entryNotional: 200, grossPnL: 40, netPnL: 38, returnPct: 19 });
    expect(
      calculatePnL({
        side: "short",
        entryPrice: 100,
        exitPrice: 80,
        quantity: 2,
        totalFees: 2,
      }),
    ).toEqual({ entryNotional: 200, grossPnL: 40, netPnL: 38, returnPct: 19 });
  });
  it("handles a zero-price move and fees", () => {
    expect(
      calculatePnL({
        side: "long",
        entryPrice: 100,
        exitPrice: 100,
        quantity: 1,
        totalFees: 3,
      }).netPnL,
    ).toBe(-3);
  });
  it("rejects invalid sides, non-positive values, negative fees and overflow", () => {
    const base = {
      side: "long" as const,
      entryPrice: 100,
      exitPrice: 120,
      quantity: 2,
      totalFees: 0,
    };
    expect(() => calculatePnL({ ...base, side: "flat" as never })).toThrow(
      CalculationInputError,
    );
    expect(() => calculatePnL({ ...base, quantity: 0 })).toThrow(
      CalculationInputError,
    );
    expect(() => calculatePnL({ ...base, totalFees: -1 })).toThrow(
      CalculationInputError,
    );
    expect(() =>
      calculatePnL({ ...base, entryPrice: Number.POSITIVE_INFINITY }),
    ).toThrow(CalculationInputError);
    expect(() =>
      calculatePnL({ ...base, entryPrice: 1e308, quantity: 1e308 }),
    ).toThrow(CalculationInputError);
  });
});

describe("generic liquidation threshold", () => {
  const base = {
    side: "long" as const,
    entryPrice: 100,
    quantity: 1,
    collateral: 20,
    maintenanceRatePct: 5,
  };
  it("solves equity equal to maintenance on marked notional", () => {
    expect(calculateLiquidation(base).thresholdPrice).toBeCloseTo(
      80 / 0.95,
      10,
    );
    expect(
      calculateLiquidation({ ...base, side: "short" }).thresholdPrice,
    ).toBeCloseTo(120 / 1.05, 10);
    expect(calculateLiquidation(base).maintenanceAtEntry).toBe(5);
  });
  it("reports no positive long threshold when collateral covers entry notional", () => {
    expect(
      calculateLiquidation({ ...base, collateral: 100 }).thresholdPrice,
    ).toBeNull();
  });
  it("rejects an already-breached maintenance boundary and invalid rates", () => {
    expect(() => calculateLiquidation({ ...base, collateral: 5 })).toThrow(
      CalculationInputError,
    );
    expect(() =>
      calculateLiquidation({ ...base, maintenanceRatePct: 100 }),
    ).toThrow(CalculationInputError);
    expect(() =>
      calculateLiquidation({ ...base, maintenanceRatePct: -1 }),
    ).toThrow(CalculationInputError);
    expect(() =>
      calculateLiquidation({ ...base, quantity: Number.NaN }),
    ).toThrow(CalculationInputError);
    expect(() =>
      calculateLiquidation({ ...base, collateral: Number.POSITIVE_INFINITY }),
    ).toThrow(CalculationInputError);
  });
});

describe("50/50 constant-product impermanent loss", () => {
  it("matches the 4x and reciprocal 0.25x reference fixtures", () => {
    expect(
      calculateImpermanentLoss({
        initialPrice: 100,
        finalPrice: 400,
        initialPoolValue: 1000,
      }),
    ).toEqual({
      priceRatio: 4,
      holdValue: 2500,
      poolValue: 2000,
      difference: -500,
      lossPct: -20,
    });
    expect(
      calculateImpermanentLoss({
        initialPrice: 100,
        finalPrice: 25,
        initialPoolValue: 1000,
      }).lossPct,
    ).toBe(-20);
  });
  it("returns zero divergence when price is unchanged", () => {
    expect(
      calculateImpermanentLoss({
        initialPrice: 1,
        finalPrice: 1,
        initialPoolValue: 100,
      }).lossPct,
    ).toBe(0);
  });
  it("rejects zero, non-finite, underflowed ratio and overflow", () => {
    const base = { initialPrice: 100, finalPrice: 400, initialPoolValue: 1000 };
    expect(() => calculateImpermanentLoss({ ...base, finalPrice: 0 })).toThrow(
      CalculationInputError,
    );
    expect(() =>
      calculateImpermanentLoss({ ...base, initialPoolValue: Number.NaN }),
    ).toThrow(CalculationInputError);
    expect(() =>
      calculateImpermanentLoss({
        ...base,
        initialPrice: 1e308,
        finalPrice: 1e-308,
      }),
    ).toThrow(CalculationInputError);
    expect(() =>
      calculateImpermanentLoss({
        ...base,
        initialPoolValue: 1e308,
        finalPrice: 1e308,
        initialPrice: 1,
      }),
    ).toThrow(CalculationInputError);
  });
});
