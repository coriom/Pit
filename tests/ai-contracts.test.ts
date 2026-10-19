import { describe, expect, it } from "vitest";
import {
  compatiblePorts,
  PURE_TOOL_CONTRACTS,
  runPureTool,
} from "../src/lib/pure-tool-contract";
import {
  runAiTool,
  tradeRiskContract,
  executionMathContract,
} from "../src/lib/ai-tool-contracts";

describe("Phase AI reviewed local contract boundary", () => {
  it("adds only two IDs and preserves execution denial", () => {
    expect(PURE_TOOL_CONTRACTS.map((item) => item.id)).toEqual([
      "swap-cost",
      "portfolio-exposure",
      "token-fee-converter",
      "yield-growth",
      "trade-risk",
      "execution-math",
    ]);
    for (const id of ["swap", "perps", "taxlot-export", "token-approvals"])
      expect(runPureTool(id, {}).status).toBe("ERROR");
  });
  it("validates nested fills and returns incomplete for missing quote fees", () => {
    const input = {
      mode: "average",
      baseLabel: "ETH",
      quoteLabel: "USDC",
      baseDecimals: 18,
      quoteDecimals: 6,
      fills: [{ quantity: "1", price: "100", feeQuote: "" }],
      exitFeeBps: "0",
      exitFixedFeeQuote: "0",
    };
    const result = runAiTool("trade-risk", input);
    expect(result.status).toBe("INCOMPLETE");
    if (result.status === "ERROR") throw Error(result.error.message);
    expect(
      result.output.fields.some((item) => item.name === "breakEvenPrice"),
    ).toBe(false);
    expect(
      runAiTool("trade-risk", {
        ...input,
        fills: [{ quantity: "1", price: "100", extra: "0" }],
      }).status,
    ).toBe("ERROR");
    expect(() =>
      tradeRiskContract.validateOutput({
        ...result.output,
        fields: [{ ...result.output.fields[0], raw: "NaN" }],
      }),
    ).toThrow();
  });
  it("rejects manual unit compatibility even when labels match", () => {
    const slip = runPureTool("execution-math", {
      mode: "slippage",
      tokenLabel: "USDC",
      tokenDecimals: 6,
      direction: "exact-input",
      expectedAmount: "100",
      toleranceBps: "50",
    });
    const manual = runPureTool("token-fee-converter", {
      mode: "token",
      tokenLabel: "USDC",
      decimals: 6,
      direction: "human-to-raw",
      amount: "100",
    });
    if (slip.status === "ERROR" || manual.status === "ERROR")
      throw Error("Unexpected rejection");
    expect(compatiblePorts(slip.values[0].port, manual.values[0].port)).toBe(
      false,
    );
  });
  it("validates execution outputs and returns structured errors", () => {
    const input = {
      mode: "gas",
      nativeLabel: "ETH",
      transactionGasUnits: "21000",
      approvalRequired: "no",
      approvalGasUnits: "",
      gasPriceGwei: "20",
      budgetNative: "0.001",
      notionalNative: "",
      coverage: "complete",
    };
    const response = runAiTool("execution-math", input);
    expect(response.status).toBe("COMPLETE");
    if (response.status === "ERROR") throw Error(response.error.message);
    expect(response.values[0].port.unit?.kind).toBe("manual-native-wei");
    expect(() =>
      executionMathContract.validateOutput({
        ...response.output,
        status: "incomplete",
        reasons: [],
      }),
    ).toThrow();
    const bad = runAiTool("execution-math", {
      ...input,
      transactionGasUnits: "0",
    });
    expect(bad.status).toBe("ERROR");
    if (bad.status === "ERROR") expect(bad.error.code).toBe("INVALID_INPUT");
  });
});
