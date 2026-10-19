import { describe, expect, it } from "vitest";
import { calculateAmm, type AmmInput } from "../src/lib/amm-pool-math";
import {
  calculateConcentrated,
  integerSquareRoot,
  type ClInput,
} from "../src/lib/concentrated-liquidity";
import {
  runAmTool,
  ammPoolContract,
  concentratedLiquidityContract,
} from "../src/lib/am-tool-contracts";
import {
  compatiblePorts,
  PURE_TOOL_CONTRACTS,
  runPureTool,
} from "../src/lib/pure-tool-contract";

const ammBase: AmmInput = {
  mode: "reserves",
  token0: "TokenA",
  token1: "TokenB",
  decimals0: 6,
  decimals1: 6,
  reserve0: "100",
  reserve1: "10000",
  commonValuePrice: "100",
};
const clBase: ClInput = {
  mode: "composition",
  token0: "TokenA",
  token1: "TokenB",
  decimals0: 6,
  decimals1: 6,
  lowerPrice: "0.25",
  upperPrice: "4",
  initialPrice: "1",
  futurePrice: "4",
  budget0: "50",
  budget1: "50",
};
const get = (r: { fields: { name: string; raw: string }[] }, n: string) =>
  BigInt(r.fields.find((f) => f.name === n)!.raw);

describe("Phase AM exact constant-product model", () => {
  it("normalizes reserve prices and preserves the raw invariant", () => {
    const r = calculateAmm(ammBase);
    expect(get(r, "spotToken1PerToken0")).toBe(100n * 10n ** 18n);
    expect(get(r, "reverseToken0PerToken1")).toBe(10n ** 16n);
    expect(get(r, "invariantRawProduct")).toBe(10n ** 18n);
    expect(r.spotPriceRational).toMatchObject({
      numeratorRaw: "10000000000000000",
      denominatorRaw: "100000000000000",
      orientation: "TokenB/TokenA",
    });
    expect(get(r, "token0Composition")).toBe(5n * 10n ** 17n);
    const distinct = calculateAmm({ ...ammBase, decimals0: 18, decimals1: 6 });
    expect(get(distinct, "spotToken1PerToken0")).toBe(100n * 10n ** 18n);
    const maxScale = calculateAmm({
      ...ammBase,
      decimals0: 36,
      decimals1: 36,
      reserve0: "1",
      reserve1: "1",
    });
    expect(maxScale.invariantHumanDecimals).toBe(72);
    expect(get(maxScale, "invariantRawProduct")).toBe(10n ** 72n);
  });
  it("matches the independent zero-fee 10-in/909.090909-out reference", () => {
    const r = calculateAmm({
      ...ammBase,
      mode: "swap",
      direction: "zero-to-one",
      amountIn: "10",
      feeBps: "0",
      commonValuePrice: undefined,
    });
    expect(get(r, "hypotheticalOutput")).toBe(909090909n);
    expect(get(r, "postInputReserve")).toBe(110000000n);
    expect(get(r, "postOutputReserve")).toBe(9090909091n);
    expect(get(r, "postInvariantRawProduct")).toBeGreaterThanOrEqual(
      get(r, "invariantRawProduct"),
    );
    expect(get(r, "feeInclusiveDeviation")).toBe(
      get(r, "feeFreeReserveImpact"),
    );
  });
  it("retains the entire input, separates fee and fee-free impact, and works in reverse", () => {
    for (const direction of ["zero-to-one", "one-to-zero"] as const) {
      const r = calculateAmm({
        ...ammBase,
        mode: "swap",
        direction,
        amountIn: "10",
        feeBps: "30",
        commonValuePrice: undefined,
      });
      expect(get(r, "effectiveInput")).toBe(9970000n);
      expect(get(r, "poolFeeRetained")).toBe(30000n);
      expect(get(r, "feeInclusiveDeviation")).toBeGreaterThan(
        get(r, "feeFreeReserveImpact"),
      );
      expect(get(r, "postInvariantRawProduct")).toBeGreaterThanOrEqual(
        get(r, "invariantRawProduct"),
      );
      expect(get(r, "hypotheticalOutput")).toBeLessThan(
        direction === "zero-to-one" ? 10000000000n : 100000000n,
      );
    }
  });
  it("preserves reserve and fee monotonicity across bounded raw-unit samples", () => {
    for (const amount of ["0.1", "1", "10", "99"])
      for (const feeBps of ["0", "1", "30", "500"]) {
        const r = calculateAmm({
          ...ammBase,
          mode: "swap",
          direction: "zero-to-one",
          amountIn: amount,
          feeBps,
        });
        expect(get(r, "postInputReserve")).toBe(
          get(r, "reserve0") + get(r, "inputAmount"),
        );
        expect(get(r, "postOutputReserve")).toBe(
          get(r, "reserve1") - get(r, "hypotheticalOutput"),
        );
        expect(get(r, "postInvariantRawProduct")).toBeGreaterThanOrEqual(
          get(r, "invariantRawProduct"),
        );
        expect(get(r, "poolFeeRetained") + get(r, "effectiveInput")).toBe(
          get(r, "inputAmount"),
        );
      }
    const zero = calculateAmm({
      ...ammBase,
      mode: "swap",
      direction: "zero-to-one",
      amountIn: "10",
      feeBps: "0",
    });
    const tiny = calculateAmm({
      ...ammBase,
      mode: "swap",
      direction: "zero-to-one",
      amountIn: "0.000001",
      feeBps: "0",
    });
    expect(get(tiny, "hypotheticalOutput")).toBe(99n);
    const costly = calculateAmm({
      ...ammBase,
      mode: "swap",
      direction: "zero-to-one",
      amountIn: "10",
      feeBps: "500",
    });
    expect(get(costly, "hypotheticalOutput")).toBeLessThan(
      get(zero, "hypotheticalOutput"),
    );
  });
  it("normalizes distinct token decimals in a swapped output", () => {
    const r = calculateAmm({
      ...ammBase,
      decimals0: 18,
      decimals1: 6,
      mode: "swap",
      direction: "zero-to-one",
      amountIn: "10",
      feeBps: "0",
    });
    expect(get(r, "hypotheticalOutput")).toBe(909090909n);
    expect(get(r, "averageExecutionPrice")).toBe(90909090900000000000n);
  });
  it("models proportional deposits and withdrawals without inventing LP minting", () => {
    const r = calculateAmm({
      ...ammBase,
      mode: "liquidity",
      deposit0: "10",
      available1: "1000",
      withdrawBps: "1000",
      commonValuePrice: undefined,
    });
    expect(get(r, "usedToken0")).toBe(10000000n);
    expect(get(r, "usedToken1")).toBe(1000000000n);
    expect(get(r, "postDepositReserve0")).toBe(110000000n);
    expect(get(r, "postDepositReserve1")).toBe(11000000000n);
    expect(get(r, "newProviderShare")).toBe(90909090909090909n);
    expect(get(r, "withdrawToken0")).toBe(10000000n);
    expect(get(r, "withdrawToken1")).toBe(1000000000n);
  });
  it("fails safely on zero reserves, dust output, excess precision and unsupported fee", () => {
    expect(() => calculateAmm({ ...ammBase, reserve0: "0" })).toThrow(
      /reserves/,
    );
    expect(() =>
      calculateAmm({
        ...ammBase,
        mode: "swap",
        direction: "zero-to-one",
        amountIn: "0.000001",
        feeBps: "10000",
      }),
    ).toThrow(/rounds to zero/);
    expect(() => calculateAmm({ ...ammBase, reserve0: "1.0000001" })).toThrow();
    expect(() =>
      calculateAmm({
        ...ammBase,
        mode: "swap",
        direction: "zero-to-one",
        amountIn: "1",
        feeBps: "10001",
      }),
    ).toThrow();
    expect(() =>
      calculateAmm({
        ...ammBase,
        mode: "liquidity",
        deposit0: "1",
        available1: "0",
        withdrawBps: "0",
      }),
    ).toThrow();
  });
});

describe("Phase AM bounded concentrated-range model", () => {
  it("floors square roots within one integer step", () => {
    for (const n of [
      0n,
      1n,
      2n,
      10n,
      10n ** 36n,
      4n * 10n ** 36n,
      10n ** 48n,
    ]) {
      const q = integerSquareRoot(n);
      expect(q * q).toBeLessThanOrEqual(n);
      expect((q + 1n) * (q + 1n)).toBeGreaterThan(n);
    }
  });
  it("matches the independent L=100 / 50+50 / upper-bound -40% example", () => {
    const r = calculateConcentrated(clBase);
    expect(get(r, "liquidityParameter")).toBe(100n * 10n ** 18n);
    expect(get(r, "initialToken0")).toBe(50000000n);
    expect(get(r, "initialToken1")).toBe(50000000n);
    expect(get(r, "futureToken0")).toBe(0n);
    expect(get(r, "futureToken1")).toBe(150000000n);
    expect(get(r, "futureLpValue")).toBe(150000000n);
    expect(get(r, "futureHodlValue")).toBe(250000000n);
    expect(get(r, "lpMinusHodl")).toBe(-100000000n);
    expect(get(r, "lpVsHodlFraction")).toBe(-400000000000000000n);
  });
  it("matches lower-bound value and same-price HODL parity", () => {
    const low = calculateConcentrated({ ...clBase, futurePrice: "0.25" });
    expect(get(low, "futureToken0")).toBe(150000000n);
    expect(get(low, "futureToken1")).toBe(0n);
    expect(get(low, "futureLpValue")).toBe(37500000n);
    expect(get(low, "futureHodlValue")).toBe(62500000n);
    expect(get(low, "lpVsHodlFraction")).toBe(-400000000000000000n);
    const same = calculateConcentrated({ ...clBase, futurePrice: "1" });
    expect(get(same, "lpMinusHodl")).toBe(0n);
  });
  it("derives below/within/above compositions without exceeding budgets", () => {
    for (const initialPrice of ["0.1", "1", "10"]) {
      const r = calculateConcentrated({
        ...clBase,
        initialPrice,
        futurePrice: initialPrice,
      });
      expect(get(r, "initialToken0")).toBeLessThanOrEqual(50000000n);
      expect(get(r, "initialToken1")).toBeLessThanOrEqual(50000000n);
      expect(get(r, "futureToken0")).toBeGreaterThanOrEqual(0n);
      expect(get(r, "futureToken1")).toBeGreaterThanOrEqual(0n);
      expect(get(r, "lpMinusHodl")).toBe(0n);
    }
  });
  it("keeps boundary composition continuous and supports mismatched token decimals", () => {
    const base = { ...clBase, decimals0: 18, decimals1: 6 };
    const lower = calculateConcentrated({ ...base, futurePrice: "0.25" });
    const upper = calculateConcentrated({ ...base, futurePrice: "4" });
    expect(get(lower, "futureToken1")).toBe(0n);
    expect(get(upper, "futureToken0")).toBe(0n);
    expect(get(lower, "initialToken0")).toBe(50n * 10n ** 18n);
    expect(get(lower, "initialToken1")).toBe(50_000_000n);
    expect(get(lower, "futureLpValue")).toBe(37_500_000n);
    expect(get(upper, "futureLpValue")).toBe(150_000_000n);
  });
  it("has nonnegative used amounts and no phantom budget across several ranges", () => {
    for (const [lowerPrice, upperPrice] of [
      ["0.25", "4"],
      ["0.5", "2"],
      ["0.0001", "10000"],
    ]) {
      const r = calculateConcentrated({
        ...clBase,
        lowerPrice,
        upperPrice,
        futurePrice: "1",
      });
      expect(get(r, "initialToken0") + get(r, "unusedToken0")).toBe(
        50_000_000n,
      );
      expect(get(r, "initialToken1") + get(r, "unusedToken1")).toBe(
        50_000_000n,
      );
      expect(get(r, "initialToken0")).toBeGreaterThanOrEqual(0n);
      expect(get(r, "initialToken1")).toBeGreaterThanOrEqual(0n);
    }
  });
  it("shows 100 before cost and 105 after cost, withholding unknown-cost net", () => {
    const fees = calculateConcentrated({
      ...clBase,
      mode: "fees",
      accruedFee0: "0",
      accruedFee1: "0",
      managementCost1: "5",
      costCoverage: "known",
    });
    expect(get(fees, "feeRequirementBeforeCosts")).toBe(100000000n);
    expect(get(fees, "feeRequirementIncludingCosts")).toBe(105000000n);
    expect(get(fees, "netLpMinusHodl")).toBe(-105000000n);
    const unknown = calculateConcentrated({
      ...clBase,
      mode: "fees",
      accruedFee0: "0",
      accruedFee1: "0",
      managementCost1: "0",
      costCoverage: "unknown",
    });
    expect(unknown.status).toBe("incomplete");
    expect(unknown.fields.some((f) => f.name === "netLpMinusHodl")).toBe(false);
  });
  it("rejects invalid ranges, prices, fee denominations and impossible budgets", () => {
    expect(() =>
      calculateConcentrated({ ...clBase, lowerPrice: "4" }),
    ).toThrow();
    expect(() =>
      calculateConcentrated({ ...clBase, initialPrice: "0" }),
    ).toThrow();
    expect(() =>
      calculateConcentrated({ ...clBase, budget0: "0", budget1: "0" }),
    ).toThrow();
    expect(() =>
      calculateConcentrated({
        ...clBase,
        mode: "fees",
        accruedFee0: "0",
        accruedFee1: "0",
        managementCost1: "1",
        costCoverage: "token0" as any,
      }),
    ).toThrow();
  });
});

describe("closed AM contracts", () => {
  it("adds exactly two reviewed IDs and rejects execution IDs", () => {
    expect(PURE_TOOL_CONTRACTS.slice(-2).map((c) => c.id)).toEqual([
      "amm-pool-math",
      "concentrated-liquidity",
    ]);
    expect(runPureTool("swap", {})).toMatchObject({
      status: "ERROR",
      error: { code: "UNSUPPORTED_CALCULATION" },
    });
    expect(runPureTool("perps", {})).toMatchObject({
      status: "ERROR",
      error: { code: "UNSUPPORTED_CALCULATION" },
    });
  });
  it("validates exact shapes, integer results and incompatible manual ports", () => {
    const a = runAmTool("amm-pool-math", ammBase);
    const c = runAmTool("concentrated-liquidity", clBase);
    expect(a.status).toBe("COMPLETE");
    expect(c.status).toBe("COMPLETE");
    expect(
      runAmTool("amm-pool-math", { ...ammBase, extra: "x" }),
    ).toMatchObject({ status: "ERROR", error: { code: "INVALID_INPUT" } });
    expect(
      compatiblePorts(
        a.status === "COMPLETE" ? a.values[0].port : (null as never),
        c.status === "COMPLETE" ? c.inputPorts[0] : (null as never),
      ),
    ).toBe(false);
    expect(() =>
      ammPoolContract.validateOutput({ ...calculateAmm(ammBase), fields: [] }),
    ).toThrow();
    expect(() =>
      concentratedLiquidityContract.validateOutput({
        ...calculateConcentrated(clBase),
        fields: [],
      }),
    ).toThrow();
  });
});
