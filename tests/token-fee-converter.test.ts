import { describe, expect, it } from "vitest";
import {
  calculateTokenFee,
  tokenFeeReportJSON,
  type ConverterInput,
} from "../src/lib/token-fee-converter";
import { runAhTool, tokenFeeContract } from "../src/lib/ah-tool-contracts";

describe("exact token and fee conversion", () => {
  it("converts ETH, gwei and wei without rounding", () => {
    const eth = calculateTokenFee({ mode: "native", amount: "1", unit: "eth" });
    expect(eth.raw.wei).toBe("1000000000000000000");
    expect(eth.display.gwei).toBe("1000000000");
    expect(
      calculateTokenFee({ mode: "native", amount: "1", unit: "gwei" }).raw.wei,
    ).toBe("1000000000");
    expect(
      calculateTokenFee({ mode: "native", amount: eth.raw.wei, unit: "wei" })
        .display.eth,
    ).toBe("1");
  });
  it("roundtrips a six-decimal ERC-20 manual amount and preserves uint-sized precision", () => {
    const initial = calculateTokenFee({
      mode: "token",
      amount: "1.234567",
      direction: "human-to-raw",
      decimals: 6,
      tokenLabel: "TEST",
    });
    expect(initial.raw.tokenBaseUnits).toBe("1234567");
    expect(
      calculateTokenFee({
        mode: "token",
        amount: initial.raw.tokenBaseUnits,
        direction: "raw-to-human",
        decimals: 6,
        tokenLabel: "TEST",
      }).display.humanAmount,
    ).toBe("1.234567");
    const huge = calculateTokenFee({
      mode: "token",
      amount: "123456789012345678901234567890",
      direction: "raw-to-human",
      decimals: 6,
      tokenLabel: "TEST",
    });
    expect(huge.raw.tokenBaseUnits).toBe("123456789012345678901234567890");
    expect(huge.display.humanAmount).toBe("123456789012345678901234.56789");
  });
  it("converts 50 bps to 0.5 percent and 5000 ppm", () => {
    const value = calculateTokenFee({
      mode: "rate",
      amount: "50",
      unit: "bps",
    });
    expect(value.raw.ratio1e18).toBe("5000000000000000");
    expect(value.display).toEqual({ percent: "0.5", bps: "50", ppm: "5000" });
  });
  it("rounds a fee once to base units and leaves the original amount separate", () => {
    const value = calculateTokenFee({
      mode: "fee",
      amount: "100",
      decimals: 6,
      tokenLabel: "TEST",
      rate: "50",
      rateUnit: "bps",
    });
    expect(value.raw).toMatchObject({
      amountBaseUnits: "100000000",
      feeBaseUnits: "500000",
      afterFeeBaseUnits: "99500000",
      feeRatio1e18: "5000000000000000",
    });
    const tiny = calculateTokenFee({
      mode: "fee",
      amount: "0.000001",
      decimals: 6,
      tokenLabel: "TEST",
      rate: "50",
      rateUnit: "percent",
    });
    expect(tiny.raw.feeBaseUnits).toBe("1"); // half-up tie
    expect(tiny.raw.afterFeeBaseUnits).toBe("0");
  });
  it("rejects excess decimals, signs, exponent notation, overflow and invalid token precision", () => {
    const base: ConverterInput = {
      mode: "token",
      amount: "1",
      direction: "human-to-raw",
      decimals: 6,
      tokenLabel: "TEST",
    };
    for (const amount of ["1.2345678", "-1", "+1", "1e3", "1,000"])
      expect(() => calculateTokenFee({ ...base, amount })).toThrow();
    expect(() => calculateTokenFee({ ...base, decimals: 37 })).toThrow();
    expect(() =>
      calculateTokenFee({
        mode: "native",
        amount: "9".repeat(79),
        unit: "wei",
      }),
    ).toThrow();
    expect(() =>
      calculateTokenFee({
        mode: "fee",
        amount: "1",
        decimals: 0,
        tokenLabel: "TEST",
        rate: "10001",
        rateUnit: "bps",
      }),
    ).toThrow(/100%/);
  });
  it("validates runtime shape, output and deterministic local report", () => {
    const input: ConverterInput = { mode: "native", amount: "1", unit: "eth" };
    const response = runAhTool("token-fee-converter", input);
    expect(response.status).toBe("COMPLETE");
    if (response.status === "ERROR") throw Error(response.error.message);
    expect(response.values[0]?.value).toBe("1000000000000000000");
    expect(response.values[0]?.port.unit).toEqual({ kind: "wei", decimals: 0 });
    const report = JSON.parse(tokenFeeReportJSON(response.output));
    expect(report.calculationVersion).toBe("pit.token-fee.local.v1");
    expect(report.raw.wei).toBe("1000000000000000000");
    expect(report.rawUnits.wei).toEqual({ unit: "wei", decimals: 0 });
    expect(report.assumptions).toHaveLength(1);
    expect(tokenFeeReportJSON(response.output)).toBe(
      tokenFeeReportJSON(response.output),
    );
    expect(() =>
      tokenFeeContract.validateOutput({
        ...response.output,
        raw: { wei: "bad" },
      }),
    ).toThrow(/output contract/);
    const invalid = runAhTool("token-fee-converter", { ...input, extra: "no" });
    expect(invalid.status).toBe("ERROR");
    if (invalid.status === "ERROR")
      expect(invalid.error.code).toBe("INVALID_INPUT");
  });
});
