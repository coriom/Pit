import { describe, expect, it } from "vitest";
import {
  calculateYieldGrowth,
  yieldGrowthReportJSON,
} from "../src/lib/yield-growth";
import { runAhTool, yieldGrowthContract } from "../src/lib/ah-tool-contracts";
const field = (value: ReturnType<typeof calculateYieldGrowth>, name: string) =>
  value.fields.find((item) => item.name === name)!;

describe("bounded exact yield and growth scenarios", () => {
  it("matches independently calculated 12% monthly APY and differs from annual compounding", () => {
    const monthly = calculateYieldGrowth({
      mode: "apr-to-apy",
      aprPercent: "12",
      periodsPerYear: 12,
    });
    expect(field(monthly, "effectiveApy").raw).toBe("126825030131969721");
    expect(field(monthly, "effectiveApy").display).toBe("12.6825030131969721%");
    expect(
      field(
        calculateYieldGrowth({
          mode: "apr-to-apy",
          aprPercent: "12",
          periodsPerYear: 1,
        }),
        "effectiveApy",
      ).display,
    ).toBe("12%");
  });
  it("inverts the effective APY through a bounded integer root search", () => {
    const inverse = calculateYieldGrowth({
      mode: "apy-to-apr",
      apyPercent: "12.6825030131969721",
      periodsPerYear: 12,
    });
    const apr = BigInt(field(inverse, "nominalApr").raw);
    expect(
      apr > 120000000000000000n - 12n && apr < 120000000000000000n + 12n,
    ).toBe(true);
    expect(field(inverse, "nominalApr").unit).toBe("nominal-apr");
  });
  it("annualizes a periodic return without labeling it nominal APR", () => {
    const value = calculateYieldGrowth({
      mode: "periodic-to-annual",
      periodicPercent: "1",
      periodsPerYear: 12,
    });
    expect(field(value, "periodicRate").unit).toBe("periodic-rate");
    expect(field(value, "effectiveAnnualReturn").raw).toBe(
      "126825030131969721",
    );
  });
  it("separates principal, simple interest and ending value", () => {
    const value = calculateYieldGrowth({
      mode: "simple",
      principal: "1000",
      annualRatePercent: "5",
      years: 2,
      currency: "USD",
    });
    expect(field(value, "principal").display).toBe("1000");
    expect(field(value, "growth").display).toBe("100");
    expect(field(value, "endingValue").display).toBe("1100");
    expect(
      field(
        calculateYieldGrowth({
          mode: "simple",
          principal: "1000",
          annualRatePercent: "-5",
          years: 2,
          currency: "USD",
        }),
        "endingValue",
      ).display,
    ).toBe("900");
  });
  it("compounds only whole periods and differs from simple interest", () => {
    const value = calculateYieldGrowth({
      mode: "compound",
      principal: "1000",
      nominalAprPercent: "5",
      periodsPerYear: 1,
      years: 2,
      currency: "USD",
    });
    expect(field(value, "endingValue").display).toBe("1102.5");
    expect(field(value, "growth").display).toBe("102.5");
    expect(field(value, "periods").raw).toBe("2");
  });
  it("distinguishes beginning and end contributions", () => {
    const base = {
      mode: "contributions" as const,
      principal: "0",
      contribution: "100",
      nominalAprPercent: "12",
      periodsPerYear: 12,
      years: 1,
      currency: "USD",
    };
    const beginning = calculateYieldGrowth({ ...base, timing: "beginning" });
    const end = calculateYieldGrowth({ ...base, timing: "end" });
    expect(field(beginning, "contributions").display).toBe("1200");
    expect(BigInt(field(beginning, "endingValue").raw)).toBeGreaterThan(
      BigInt(field(end, "endingValue").raw),
    );
    const zero = calculateYieldGrowth({
      ...base,
      nominalAprPercent: "0",
      timing: "end",
    });
    expect(field(zero, "endingValue").display).toBe("1200");
    const twoPeriods = { ...base, nominalAprPercent: "2", periodsPerYear: 2 };
    expect(
      field(
        calculateYieldGrowth({ ...twoPeriods, timing: "beginning" }),
        "endingValue",
      ).display,
    ).toBe("203.01");
    expect(
      field(
        calculateYieldGrowth({ ...twoPeriods, timing: "end" }),
        "endingValue",
      ).display,
    ).toBe("201");
  });
  it("solves annual-income principal and 20% loss recovery", () => {
    expect(
      field(
        calculateYieldGrowth({
          mode: "required-principal",
          annualIncome: "100",
          effectiveApyPercent: "5",
          currency: "USD",
        }),
        "requiredPrincipal",
      ).display,
    ).toBe("2000");
    expect(
      field(
        calculateYieldGrowth({ mode: "recovery", lossPercent: "20" }),
        "requiredGain",
      ).display,
    ).toBe("25%");
  });
  it("rejects unreachable targets, invalid periods and excessive growth", () => {
    expect(() =>
      calculateYieldGrowth({
        mode: "apy-to-apr",
        apyPercent: "-90",
        periodsPerYear: 12,
      }),
    ).toThrow(/unreachable/);
    expect(() =>
      calculateYieldGrowth({
        mode: "required-principal",
        annualIncome: "100",
        effectiveApyPercent: "0",
        currency: "USD",
      }),
    ).toThrow(/positive/);
    expect(() =>
      calculateYieldGrowth({ mode: "recovery", lossPercent: "100" }),
    ).toThrow(/finite/);
    expect(() =>
      calculateYieldGrowth({
        mode: "compound",
        principal: "1000",
        nominalAprPercent: "5",
        periodsPerYear: 12,
        years: 1.5,
        currency: "USD",
      }),
    ).toThrow(/whole number/);
    expect(() =>
      calculateYieldGrowth({
        mode: "compound",
        principal: "1000",
        nominalAprPercent: "1000",
        periodsPerYear: 1,
        years: 100,
        currency: "USD",
      }),
    ).toThrow(/bounded/);
    expect(() =>
      calculateYieldGrowth({
        mode: "simple",
        principal: "100",
        annualRatePercent: "-100",
        years: 2,
        currency: "USD",
      }),
    ).toThrow(/negative/);
  });
  it("validates contract shape, units and exact JSON serialization", () => {
    const input = { mode: "apr-to-apy", aprPercent: "12", periodsPerYear: 12 };
    const response = runAhTool("yield-growth", input);
    expect(response.status).toBe("COMPLETE");
    if (response.status === "ERROR") throw Error(response.error.message);
    expect(
      response.values.find((item) => item.port.name === "effectiveApy")?.port
        .unit,
    ).toEqual({ kind: "effective-apy", decimals: 18 });
    expect(
      JSON.parse(yieldGrowthReportJSON(response.output)).fields[1].raw,
    ).toBe("126825030131969721");
    const invalid = runAhTool("yield-growth", {
      ...input,
      periodsPerYear: "12",
    });
    expect(invalid.status).toBe("ERROR");
    if (invalid.status === "ERROR")
      expect(invalid.error.code).toBe("INVALID_INPUT");
    const broken = {
      ...response.output,
      fields: [{ ...response.output.fields[0], raw: "NaN" }],
    };
    expect(() => yieldGrowthContract.validateOutput(broken)).toThrow(
      /output contract/,
    );
  });
});
