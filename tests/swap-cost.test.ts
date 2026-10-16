import { describe, expect, it } from "vitest";
import {
  SWAP_COST_DISCLAIMER,
  SWAP_COST_VERSION,
  SwapCostInputError,
  calculateSwapCost,
  compareSwapCosts,
  formatRaw,
  parseExactAmount,
  swapCostReportJSON,
  type SwapCostInput,
} from "../src/lib/swap-cost";

const cow: SwapCostInput = {
  sellToken: "USDC",
  buyToken: "WETH",
  sellDecimals: 6,
  buyDecimals: 18,
  sellAmount: "10",
  quotedBuyAmount: "0.005",
  venue: "cow-like",
  feeCoverage: "included",
  unembeddedVenueFeeBuyAmount: "",
  approvalRequired: "no",
  swapGasUnits: "",
  approvalGasUnits: "",
  gasPriceGwei: "",
  nativeGasToken: "ETH",
  nativeToBuyRate: "",
  slippageBps: 50,
};
const uni: SwapCostInput = {
  ...cow,
  venue: "uniswap-like",
  quotedBuyAmount: "0.0051",
  swapGasUnits: "150000",
  approvalRequired: "yes",
  approvalGasUnits: "50000",
  gasPriceGwei: "1",
  nativeToBuyRate: "1",
};

describe("exact local swap-cost arithmetic", () => {
  it("does not deduct an embedded CoW-like solver fee or invent settlement gas", () => {
    const result = calculateSwapCost(cow);
    expect(result).toMatchObject({
      status: "complete",
      sellAmountRaw: "10000000",
      quotedBuyRaw: "5000000000000000",
      separatelyDeductedVenueFeeBuyRaw: "0",
      expectedBeforeWalletGasRaw: "5000000000000000",
      totalWalletGasWei: "0",
      convertedWalletGasBuyRaw: "0",
      netAfterWalletGasRaw: "5000000000000000",
      minimumReceiveRaw: "4975000000000000",
      pitFeeBuyRaw: "0",
    });
    expect(result.gasImpactPercent).toBe("0");
  });

  it("charges Uniswap-like wallet swap gas and one exact approval separately", () => {
    const result = calculateSwapCost(uni);
    expect(result).toMatchObject({
      status: "complete",
      quotedBuyRaw: "5100000000000000",
      separatelyDeductedVenueFeeBuyRaw: "0",
      swapGasWei: "150000000000000",
      approvalGasWei: "50000000000000",
      totalWalletGasWei: "200000000000000",
      convertedWalletGasBuyRaw: "200000000000000",
      netAfterWalletGasRaw: "4900000000000000",
      minimumReceiveRaw: "5074500000000000",
      netMinimumAfterWalletGasRaw: "4874500000000000",
      pitFeeBuyRaw: "0",
    });
    expect(result.gasImpactPercent).toBe("3.9216");
  });

  it("omits approval gas only when approval is explicitly not required", () => {
    const result = calculateSwapCost({
      ...uni,
      approvalRequired: "no",
      approvalGasUnits: "",
    });
    expect(result.approvalGasWei).toBe("0");
    expect(result.convertedWalletGasBuyRaw).toBe("150000000000000");
    expect(result.netAfterWalletGasRaw).toBe("4950000000000000");
  });

  it("leaves approval, gas price or conversion assumptions visibly incomplete", () => {
    for (const change of [
      { approvalRequired: "unknown" as const, approvalGasUnits: "" },
      { gasPriceGwei: "" },
      { nativeToBuyRate: "" },
      { swapGasUnits: "" },
      { approvalGasUnits: "" },
      { feeCoverage: "unknown" as const },
    ]) {
      const result = calculateSwapCost({ ...uni, ...change });
      expect(result.status).toBe("incomplete");
      expect(result.netAfterWalletGasRaw).toBeNull();
      expect(compareSwapCosts(calculateSwapCost(cow), result).status).toBe(
        "NOT COMPARABLE — incomplete cost coverage",
      );
    }
  });

  it("deducts an explicitly unembedded CoW-like buy-token fee exactly once", () => {
    const result = calculateSwapCost({
      ...cow,
      quotedBuyAmount: "0.0051",
      feeCoverage: "not-included",
      unembeddedVenueFeeBuyAmount: "0.0001",
    });
    expect(result.separatelyDeductedVenueFeeBuyRaw).toBe("100000000000000");
    expect(result.expectedBeforeWalletGasRaw).toBe("5000000000000000");
    expect(result.netAfterWalletGasRaw).toBe("5000000000000000");
    expect(() =>
      calculateSwapCost({ ...cow, unembeddedVenueFeeBuyAmount: "0.0001" }),
    ).toThrow(/deduct.*twice/);
    expect(() =>
      calculateSwapCost({
        ...uni,
        feeCoverage: "not-included",
        unembeddedVenueFeeBuyAmount: "0.1",
      }),
    ).toThrow(/pool fee must be included/);
  });

  it("preserves integer precision, handles decimal differences and rounds gas up once", () => {
    const result = calculateSwapCost({
      ...uni,
      buyToken: "USDC",
      sellToken: "WETH",
      sellDecimals: 18,
      buyDecimals: 6,
      sellAmount: "0.000000000000000001",
      quotedBuyAmount: "1.000001",
      swapGasUnits: "1",
      approvalGasUnits: "1",
      gasPriceGwei: "0.000000001",
      nativeToBuyRate: "1",
    });
    expect(result.sellAmountRaw).toBe("1");
    expect(result.quotedBuyRaw).toBe("1000001");
    expect(result.totalWalletGasWei).toBe("2");
    expect(result.convertedWalletGasBuyRaw).toBe("1");
    expect(result.netAfterWalletGasRaw).toBe("1000000");
    expect(parseExactAmount("0.000000000000000001", 18, "Amount")).toBe(1n);
    expect(formatRaw("-1", 6)).toBe("-0.000001");
  });

  it("keeps a uint256-sized manual amount exact without Number conversion", () => {
    const largest = ((1n << 256n) - 1n).toString();
    const result = calculateSwapCost({
      ...cow,
      sellDecimals: 0,
      buyDecimals: 0,
      sellAmount: largest,
      quotedBuyAmount: largest,
      slippageBps: 0,
    });
    expect(result.sellAmountRaw).toBe(largest);
    expect(result.quotedBuyRaw).toBe(largest);
    expect(result.netAfterWalletGasRaw).toBe(largest);
  });

  it("shows a negative net rather than clipping a gas-heavy result to zero", () => {
    const result = calculateSwapCost({
      ...uni,
      swapGasUnits: "6000000",
      approvalRequired: "no",
      approvalGasUnits: "",
    });
    expect(result.convertedWalletGasBuyRaw).toBe("6000000000000000");
    expect(result.netAfterWalletGasRaw).toBe("-900000000000000");
    expect(formatRaw(result.netAfterWalletGasRaw!, 18)).toBe("-0.0009");
  });

  it("keeps slippage separate from fees at both boundaries", () => {
    expect(
      calculateSwapCost({ ...cow, slippageBps: 0 }).minimumReceiveRaw,
    ).toBe("5000000000000000");
    expect(
      calculateSwapCost({ ...cow, slippageBps: 10000 }).minimumReceiveRaw,
    ).toBe("0");
    expect(() => calculateSwapCost({ ...cow, slippageBps: 10001 })).toThrow(
      /Slippage/,
    );
    expect(() => calculateSwapCost({ ...cow, slippageBps: -1 })).toThrow(
      /Slippage/,
    );
  });

  it("compares only identical manual token identities, decimals, sell budget and conversion basis", () => {
    const A = calculateSwapCost(cow);
    const B = calculateSwapCost(uni);
    expect(compareSwapCosts(A, B)).toEqual({
      status: "Best estimated net output under supplied assumptions",
      reasons: [],
      winner: "A",
      differenceBuyRaw: "100000000000000",
    });
    for (const change of [
      { sellToken: "USDT" },
      { buyToken: "OTHER" },
      { sellDecimals: 18, sellAmount: "0.00000000001" },
      { sellAmount: "11" },
    ]) {
      const other = calculateSwapCost({ ...uni, ...change });
      expect(compareSwapCosts(A, other).status).toBe(
        "NOT COMPARABLE — incomplete cost coverage",
      );
    }
    const differentRate = calculateSwapCost({
      ...uni,
      nativeToBuyRate: "2",
    });
    const bothGas = calculateSwapCost({
      ...cow,
      approvalRequired: "yes",
      approvalGasUnits: "50000",
      gasPriceGwei: "1",
      nativeToBuyRate: "1",
    });
    expect(compareSwapCosts(bothGas, differentRate).reasons).toContain(
      "Native-gas-token conversion assumptions differ.",
    );
  });

  it("rejects malformed values and impossible fee or gas combinations", () => {
    for (const value of ["-1", "1e3", "NaN", "Infinity", "1.0000001", "1,000"])
      expect(() => parseExactAmount(value, 6, "Amount")).toThrow(
        SwapCostInputError,
      );
    expect(() => calculateSwapCost({ ...cow, sellAmount: "0" })).toThrow(
      /positive/,
    );
    expect(() => calculateSwapCost({ ...cow, quotedBuyAmount: "0" })).toThrow(
      /positive/,
    );
    expect(() => calculateSwapCost({ ...cow, sellDecimals: 37 })).toThrow(
      /decimals/,
    );
    expect(() =>
      calculateSwapCost({ ...cow, sellToken: "WETH", buyToken: "WETH" }),
    ).toThrow(/differ/);
    expect(() => calculateSwapCost({ ...cow, swapGasUnits: "123" })).toThrow(
      /not a wallet-paid/,
    );
    expect(() => calculateSwapCost({ ...uni, approvalRequired: "no" })).toThrow(
      /Approval gas units/,
    );
    expect(() => calculateSwapCost({ ...uni, swapGasUnits: "0" })).toThrow(
      /positive/,
    );
    expect(() => calculateSwapCost({ ...uni, gasPriceGwei: "0" })).toThrow(
      /positive/,
    );
    expect(() => calculateSwapCost({ ...uni, nativeToBuyRate: "0" })).toThrow(
      /positive/,
    );
    expect(() => calculateSwapCost({ ...cow, gasPriceGwei: "1" })).toThrow(
      /unused gas price/,
    );
    expect(() =>
      calculateSwapCost({
        ...cow,
        feeCoverage: "not-included",
        unembeddedVenueFeeBuyAmount: "0.01",
      }),
    ).toThrow(/exceeds quoted/);
    expect(() => parseExactAmount("9".repeat(79), 0, "Amount")).toThrow();
  });

  it("exports exact assumptions, raw integers, coverage, version and simulated status", () => {
    const A = calculateSwapCost(cow);
    const B = calculateSwapCost(uni);
    const comparison = compareSwapCosts(A, B);
    const exported = JSON.parse(swapCostReportJSON(A, B, comparison));
    expect(exported.calculationVersion).toBe(SWAP_COST_VERSION);
    expect(exported.disclaimer).toBe(SWAP_COST_DISCLAIMER);
    expect(exported.scenarios.A).toEqual(A);
    expect(exported.scenarios.B).toEqual(B);
    expect(exported.comparison).toEqual(comparison);
    expect(swapCostReportJSON(A, B, comparison).endsWith("\n")).toBe(true);
  });
});
