import { describe, expect, it } from "vitest";
import {
  BRIDGE_COST_VERSION,
  FEE_KINDS,
  bridgeCostReportJSON,
  calculateBridgeCost,
  compareBridgeCosts,
  type BridgeRouteInput,
} from "../src/lib/bridge-cost";
const source = "0x1111111111111111111111111111111111111111";
const destination = "0x2222222222222222222222222222222222222222";
function route(): BridgeRouteInput {
  const fees = {} as BridgeRouteInput["fees"];
  for (const kind of FEE_KINDS)
    fees[kind] = {
      coverage: "included",
      payer: "destination-proceeds",
      denomination: "destination-token",
      chainId: 84532,
      amount: "0",
    };
  fees.bridge.amount = "1.5";
  fees.relayer.amount = "0.5";
  return {
    sourceChainId: 11155111,
    destinationChainId: 84532,
    sourceToken: { chainId: 11155111, address: source, decimals: 6 },
    destinationToken: { chainId: 84532, address: destination, decimals: 6 },
    sourceAmount: "100",
    quotedDestinationAmount: "98",
    minimumDestinationAmount: "97",
    estimatedMinutes: "8",
    fees,
    approvalRequired: "no",
    approvalGasUnits: "",
    sourceGas: {
      coverage: "included",
      units: "",
      gasPriceGwei: "",
      nativeAsset: "ETH",
      destinationTokensPerNative: "2800",
    },
    destinationGas: {
      coverage: "included",
      units: "",
      gasPriceGwei: "",
      nativeAsset: "ETH",
      destinationTokensPerNative: "3000",
    },
    destinationTokensPerSourceToken: "",
    commonUnit: "",
    commonUnitDecimals: 2,
    commonUnitsPerDestinationToken: "",
  };
}
function separate(): BridgeRouteInput {
  const b = route();
  b.quotedDestinationAmount = "99";
  b.minimumDestinationAmount = "96";
  b.estimatedMinutes = "15";
  b.fees.bridge = { ...b.fees.bridge, coverage: "separate", amount: "0.2" };
  b.fees.claim = { ...b.fees.claim, coverage: "separate", amount: "0.1" };
  b.fees.relayer.amount = "0";
  b.approvalRequired = "yes";
  b.approvalGasUnits = "50000";
  b.sourceGas = {
    ...b.sourceGas,
    coverage: "wallet",
    units: "150000",
    gasPriceGwei: "2",
  };
  b.destinationGas = {
    ...b.destinationGas,
    coverage: "wallet",
    units: "40000",
    gasPriceGwei: "3",
  };
  return b;
}
describe("local cross-chain bridge economics", () => {
  it("does not deduct embedded bridge and relayer fees or relayer-covered destination gas twice", () => {
    const a = calculateBridgeCost(route());
    expect(a.status).toBe("complete");
    expect(a.quotedDestinationRaw).toBe("98000000");
    expect(a.expectedDestinationReceivedRaw).toBe("98000000");
    expect(a.totalSeparateUserCostDestinationRaw).toBe("0");
    expect(a.netDestinationValueRaw).toBe("98000000");
    expect(a.destinationGasWei).toBe("0");
    expect(a.fees.bridge.amountRaw).toBe("1500000");
    expect(a.minimumDestinationReceivedRaw).toBe("97000000");
  });
  it("keeps source approval gas and destination claim gas in separate native units", () => {
    const b = calculateBridgeCost(separate());
    expect(b.status).toBe("complete");
    expect(b.sourceGasWei).toBe("300000000000000");
    expect(b.sourceApprovalGasWei).toBe("100000000000000");
    expect(b.destinationGasWei).toBe("120000000000000");
    expect(b.sourceGasCostDestinationRaw).toBe("1120000");
    expect(b.destinationGasCostDestinationRaw).toBe("360000");
    expect(b.payoutFeeDestinationRaw).toBe("300000");
    expect(b.expectedDestinationReceivedRaw).toBe("98700000");
    expect(b.totalSeparateUserCostDestinationRaw).toBe("1780000");
    expect(b.netDestinationValueRaw).toBe("97220000");
    expect(b.minimumDestinationReceivedRaw).toBe("95700000");
    expect(b.netMinimumValueRaw).toBe("94220000");
  });
  it("ranks only compatible complete routes and gives exact cost and net differences", () => {
    const comparison = compareBridgeCosts(
      calculateBridgeCost(route()),
      calculateBridgeCost(separate()),
    );
    expect(comparison.status).toBe(
      "Best estimated net destination value under supplied assumptions",
    );
    expect(comparison.winner).toBe("A");
    expect(comparison.netDifferenceDestinationRaw).toBe("780000");
    expect(comparison.separateCostDifferenceDestinationRaw).toBe("1780000");
    expect(comparison.costDifferencePercent).toBe("100");
  });
  it("requires different supported chains and exact chain-scoped token identities", () => {
    const a = route();
    a.destinationChainId = 11155111;
    a.destinationToken.chainId = 11155111;
    expect(() => calculateBridgeCost(a)).toThrow("must differ");
    const b = route();
    b.sourceChainId = 1;
    expect(() => calculateBridgeCost(b)).toThrow(
      "approved hypothetical testnet",
    );
    const c = route();
    c.destinationToken.chainId = 421614;
    expect(() => calculateBridgeCost(c)).toThrow("chain differs");
  });
  it("supports different source and destination decimals and very large exact integers", () => {
    const a = route();
    a.sourceToken.decimals = 18;
    a.destinationToken.decimals = 6;
    a.sourceAmount = "12345678901234567890.123456789012345678";
    const result = calculateBridgeCost(a);
    expect(result.sourceAmountRaw).toBe(
      "12345678901234567890123456789012345678",
    );
    expect(result.quotedDestinationRaw).toBe("98000000");
  });
  it("converts separate source-token wallet fees with a manual rational rate and upward rounding", () => {
    const a = route();
    a.fees.liquidity = {
      coverage: "separate",
      payer: "wallet",
      denomination: "source-token",
      chainId: 11155111,
      amount: "0.000001",
    };
    a.destinationTokensPerSourceToken = "1.000000000000000001";
    const result = calculateBridgeCost(a);
    expect(result.fees.liquidity.amountRaw).toBe("1");
    expect(result.fees.liquidity.externalWalletCostDestinationRaw).toBe("2");
    expect(result.netDestinationValueRaw).toBe("97999998");
  });
  it("makes missing source or destination conversion and unknown approval incomplete", () => {
    const a = separate();
    a.sourceGas.destinationTokensPerNative = "";
    expect(calculateBridgeCost(a).reasons).toContain(
      "Source-native conversion rate is missing.",
    );
    const b = separate();
    b.destinationGas.destinationTokensPerNative = "";
    expect(calculateBridgeCost(b).netDestinationValueRaw).toBeNull();
    const c = route();
    c.approvalRequired = "unknown";
    expect(calculateBridgeCost(c).sourceApprovalGasWei).toBeNull();
  });
  it("does not invent zero gas when destination coverage is unknown", () => {
    const a = separate();
    a.destinationGas.coverage = "unknown";
    a.destinationGas.units = "";
    const result = calculateBridgeCost(a);
    expect(result.status).toBe("incomplete");
    expect(result.destinationGasWei).toBeNull();
    expect(
      compareBridgeCosts(calculateBridgeCost(route()), result).status,
    ).toBe("NOT COMPARABLE — incomplete or incompatible route economics");
  });
  it("supports Arbitrum Sepolia as a scenario identifier and keeps relayer-paid separate costs off the wallet", () => {
    const a = route();
    a.destinationChainId = 421614;
    a.destinationToken.chainId = 421614;
    for (const kind of FEE_KINDS) a.fees[kind].chainId = 421614;
    a.fees.claim = {
      ...a.fees.claim,
      coverage: "separate",
      payer: "relayer",
      amount: "2",
    };
    const result = calculateBridgeCost(a);
    expect(result.status).toBe("complete");
    expect(result.netDestinationValueRaw).toBe("98000000");
    expect(result.fees.claim.amountRaw).toBe("2000000");
    expect(result.fees.claim.externalWalletCostDestinationRaw).toBe("0");
  });
  it("keeps missing source gas units incomplete rather than substituting zero", () => {
    const a = separate();
    a.sourceGas.units = "";
    const result = calculateBridgeCost(a);
    expect(result.status).toBe("incomplete");
    expect(result.sourceGasWei).toBeNull();
    expect(result.netDestinationValueRaw).toBeNull();
  });
  it("rejects mismatched tokens, budgets and conversion assumptions", () => {
    const a = calculateBridgeCost(route());
    const b = separate();
    b.destinationToken.address = "0x3333333333333333333333333333333333333333";
    expect(compareBridgeCosts(a, calculateBridgeCost(b)).reasons).toContain(
      "Source or destination chain/token identity differs.",
    );
    const c = separate();
    c.sourceAmount = "101";
    expect(compareBridgeCosts(a, calculateBridgeCost(c)).reasons).toContain(
      "Gross source transfer budgets differ.",
    );
    const d = separate();
    d.sourceGas.destinationTokensPerNative = "3000";
    expect(compareBridgeCosts(a, calculateBridgeCost(d)).reasons).toContain(
      "source-native conversion assumptions differ.",
    );
    const e = separate();
    e.destinationGas.nativeAsset = "ALT";
    expect(compareBridgeCosts(a, calculateBridgeCost(e)).reasons).toContain(
      "Native gas-asset identities differ.",
    );
  });
  it("keeps an uneconomic negative net rather than clipping it", () => {
    const a = separate();
    a.destinationGas.units = "20000000";
    expect(BigInt(calculateBridgeCost(a).netDestinationValueRaw!)).toBeLessThan(
      0n,
    );
  });
  it("rejects impossible fees, missing identities and invalid rational inputs", () => {
    const a = route();
    a.fees.bridge = {
      ...a.fees.bridge,
      coverage: "separate",
      amount: "100",
      payer: "destination-proceeds",
    };
    expect(() => calculateBridgeCost(a)).toThrow("exceed quoted output");
    const b = route();
    b.sourceToken.address = "USDC";
    expect(() => calculateBridgeCost(b)).toThrow("EVM address");
    const c = separate();
    c.sourceGas.destinationTokensPerNative = "-1";
    expect(() => calculateBridgeCost(c)).toThrow("nonnegative decimal");
    const d = route();
    d.fees.bridge.chainId = 11155111;
    expect(() => calculateBridgeCost(d)).toThrow("chain differs");
    const e = route();
    e.fees.bridge = { ...e.fees.bridge, coverage: "unknown", amount: "1" };
    expect(() => calculateBridgeCost(e)).toThrow("falsely known amount");
    const f = route();
    f.fees.bridge.payer = "wallet";
    expect(() => calculateBridgeCost(f)).toThrow("cannot be marked embedded");
  });
  it("reports optional time and common valuation separately without changing destination ranking", () => {
    const a = route();
    a.commonUnit = "USD";
    a.commonUnitDecimals = 2;
    a.commonUnitsPerDestinationToken = "1.25";
    const b = separate();
    b.commonUnit = "USD";
    b.commonUnitDecimals = 2;
    b.commonUnitsPerDestinationToken = "1.25";
    const result = calculateBridgeCost(b);
    expect(result.commonUnitCostRaw).toBe("223"); // 1.78 × 1.25 = 2.225, rounded upward to cents
    expect(result.commonUnitNetRaw).toBe("12152"); // 97.22 × 1.25 = 121.525, rounded down
    expect(result.estimatedMinutes).toBe("15");
    expect(compareBridgeCosts(calculateBridgeCost(a), result).winner).toBe("A");
  });
  it("exports exact raw economics, coverage and simulated-only provenance", () => {
    const a = calculateBridgeCost(route()),
      b = calculateBridgeCost(separate());
    const report = JSON.parse(
      bridgeCostReportJSON(a, b, compareBridgeCosts(a, b)),
    );
    expect(report.calculationVersion).toBe(BRIDGE_COST_VERSION);
    expect(report.disclaimer).toContain("manual routes only");
    expect(report.scenarios.B.sourceApprovalGasWei).toBe("100000000000000");
    expect(report.scenarios.B.fees.claim.coverage).toBe("separate");
    expect(report.scenarios.B.fees.claim.chainId).toBe(84532);
    expect(report.scenarios.B.netDestinationValueRaw).toBe("97220000");
    expect(report.comparison.winner).toBe("A");
  });
});
