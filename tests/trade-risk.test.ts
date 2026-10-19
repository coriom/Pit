import { describe, expect, it } from "vitest";
import {
  calculateTradeRisk,
  tradeRiskReportJSON,
  type TradeRiskInput,
} from "../src/lib/trade-risk";
import { formatRaw } from "../src/lib/swap-cost";

const base = {
  baseLabel: "ETH",
  quoteLabel: "USDC",
  baseDecimals: 18,
  quoteDecimals: 6,
} as const;
const value = (result: ReturnType<typeof calculateTradeRisk>, name: string) =>
  result.fields.find((item) => item.name === name)!;
const risk = {
  ...base,
  mode: "risk" as const,
  entryPrice: "2000",
  stopPrice: "1900",
  quantity: "1",
  lossBudgetQuote: "100",
  entryFeeBps: "0",
  exitFeeBps: "0",
  entryFixedFeeQuote: "0",
  exitFixedFeeQuote: "0",
};

describe("manual long-only spot risk", () => {
  it("computes exact multi-fill gross and fee-adjusted entry and a conservative exit", () => {
    const result = calculateTradeRisk({
      ...base,
      mode: "average",
      fills: [
        { quantity: "0.1", price: "2000", feeQuote: "1" },
        { quantity: "0.2", price: "2500", feeQuote: "2" },
      ],
      exitFeeBps: "50",
      exitFixedFeeQuote: "1",
    });
    expect(value(result, "grossQuantity").display).toBe("0.3");
    expect(value(result, "grossCost").display).toBe("700");
    expect(value(result, "grossAveragePrice").display).toBe(
      "2333.333333333333333333",
    );
    expect(value(result, "entryFees").display).toBe("3");
    expect(value(result, "adjustedCost").display).toBe("703");
    expect(value(result, "adjustedAveragePrice").display).toBe(
      "2343.333333333333333334",
    );
    expect(value(result, "breakEvenPrice").display).toBe("2358.458964");
    expect(JSON.parse(tradeRiskReportJSON(result)).fields[1].raw).toBe(
      "700000000",
    );
  });
  it("keeps an unknown fill or exit fee incomplete rather than zero", () => {
    const input = {
      ...base,
      mode: "average" as const,
      fills: [{ quantity: "1", price: "100", feeQuote: "" }],
      exitFeeBps: "",
      exitFixedFeeQuote: "0",
    };
    const result = calculateTradeRisk(input);
    expect(result.status).toBe("incomplete");
    expect(value(result, "grossCost").display).toBe("100");
    expect(result.fields.some((item) => item.name === "breakEvenPrice")).toBe(
      false,
    );
    expect(result.reasons).toHaveLength(2);
  });
  it("supports a fee-free one-unit position under a 100-quote risk budget", () => {
    const result = calculateTradeRisk(risk);
    expect(value(result, "stopDistance").display).toBe("100");
    expect(value(result, "stopDistanceBps").display).toBe("500");
    expect(value(result, "modeledStopLoss").display).toBe("100");
    expect(value(result, "supportedQuantity").display).toBe("1");
  });
  it("uses fee-inclusive monotone risk with conservative base-unit sizing", () => {
    const input = {
      ...risk,
      entryPrice: "100",
      stopPrice: "95",
      quantity: "10",
      entryFeeBps: "50",
      exitFeeBps: "25",
      entryFixedFeeQuote: "1",
      exitFixedFeeQuote: "1",
    };
    for (const budget of ["3", "10", "100", "1000"]) {
      const result = calculateTradeRisk({
        ...input,
        lossBudgetQuote: budget,
        baseDecimals: 6,
      });
      const max = BigInt(value(result, "supportedQuantity").raw);
      if (max > 0n) {
        const atMax = calculateTradeRisk({
          ...input,
          baseDecimals: 6,
          quantity: formatRaw(max, 6),
          lossBudgetQuote: budget,
        });
        expect(BigInt(value(atMax, "modeledStopLoss").raw)).toBeLessThanOrEqual(
          BigInt(budget) * 1_000_000n,
        );
      }
      const over = calculateTradeRisk({
        ...input,
        baseDecimals: 6,
        quantity: formatRaw(max + 1n, 6),
        lossBudgetQuote: budget,
      });
      expect(BigInt(value(over, "modeledStopLoss").raw)).toBeGreaterThan(
        BigInt(budget) * 1_000_000n,
      );
      if (budget === "100")
        expect(value(result, "supportedQuantity").display).toBe("17.08061");
    }
  });
  it("never increases supported quantity when declared fees increase", () => {
    const feeFree = calculateTradeRisk({ ...risk, baseDecimals: 6 });
    const charged = calculateTradeRisk({
      ...risk,
      baseDecimals: 6,
      entryFeeBps: "50",
      exitFeeBps: "50",
      entryFixedFeeQuote: "1",
      exitFixedFeeQuote: "1",
    });
    expect(BigInt(value(charged, "supportedQuantity").raw)).toBeLessThan(
      BigInt(value(feeFree, "supportedQuantity").raw),
    );
  });
  it("returns fee-free 2R and signed net target payoff when fees overwhelm reward", () => {
    const input = {
      ...risk,
      mode: "reward" as const,
      entryPrice: "100",
      stopPrice: "95",
      targetPrice: "110",
      quantity: "1",
    };
    const result = calculateTradeRisk(input);
    expect(value(result, "modeledStopLoss").display).toBe("5");
    expect(value(result, "modeledTargetReward").display).toBe("10");
    expect(value(result, "rewardRiskRatio").display).toBe("2");
    const costly = calculateTradeRisk({ ...input, entryFixedFeeQuote: "20" });
    expect(value(costly, "modeledTargetReward").display).toBe("-10");
    expect(value(costly, "rewardRiskRatio").raw.startsWith("-")).toBe(true);
  });
  it("rejects impossible long stops, malformed units, excess precision and fill counts", () => {
    expect(() => calculateTradeRisk({ ...risk, stopPrice: "2000" })).toThrow(
      /below/,
    );
    expect(() => calculateTradeRisk({ ...risk, entryPrice: "1e3" })).toThrow();
    expect(() => calculateTradeRisk({ ...risk, baseDecimals: 37 })).toThrow();
    expect(() => calculateTradeRisk({ ...risk, quoteLabel: "ETH" })).toThrow(
      /differ/,
    );
    const average: TradeRiskInput = {
      ...base,
      mode: "average",
      fills: [],
      exitFeeBps: "0",
      exitFixedFeeQuote: "0",
    };
    expect(() => calculateTradeRisk(average)).toThrow(/between 1 and 10/);
    expect(() =>
      calculateTradeRisk({
        ...average,
        fills: Array(11).fill({ quantity: "1", price: "1", feeQuote: "0" }),
      }),
    ).toThrow();
    expect(() =>
      calculateTradeRisk({ ...risk, entryFeeBps: "10001" }),
    ).toThrow();
    expect(() =>
      calculateTradeRisk({ ...risk, quantity: "9".repeat(100) }),
    ).toThrow(/supported precision/);
  });
});
