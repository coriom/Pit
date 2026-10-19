/** Phase AH opt-in adapters. The existing v1 pilots remain unchanged. */
import { toolById } from "./tool-registry";
import type {
  PureToolContract,
  ToolPort,
  ToolUnit,
  ToolValue,
  ToolRunResult,
} from "./pure-tool-contract";
import {
  calculateTokenFee,
  TOKEN_FEE_VERSION,
  ConverterInputError,
  type ConverterInput,
  type ConverterResult,
} from "./token-fee-converter";
import {
  calculateYieldGrowth,
  YIELD_GROWTH_VERSION,
  YieldInputError,
  type YieldInput,
  type YieldResult,
} from "./yield-growth";

class ShapeError extends Error {
  readonly name = "ShapeError";
}
const fail = (message: string): never => {
  throw new ShapeError(message);
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const shape = (
  value: unknown,
  strings: readonly string[],
  integers: readonly string[],
) => {
  if (!isRecord(value)) throw new ShapeError("Input must be an object.");
  const expected = ["mode", ...strings, ...integers];
  if (
    Object.keys(value).length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !expected.includes(key))
  )
    fail("Input has missing or unsupported fields.");
  for (const key of strings)
    if (typeof value[key] !== "string") fail(`${key} must be a string.`);
  for (const key of integers)
    if (typeof value[key] !== "number" || !Number.isSafeInteger(value[key]))
      fail(`${key} must be a safe integer.`);
  return value;
};
const p = (
  id: "token-fee-converter" | "yield-growth",
  name: string,
  unit: ToolUnit | null,
  valueType: ToolPort["valueType"] = "raw-integer-string",
): ToolPort => ({
  name,
  unit,
  valueType,
  required: true,
  sourceToolId: id,
  sourceContractVersion: 1,
});
const manualToken = (label: string, decimals: number): ToolUnit => ({
  kind: "token",
  decimals,
  identity: { kind: "manual-label", label: label.trim().toLowerCase() },
});
const manualMoney = (label: string): ToolUnit => ({
  kind: "manual-money",
  decimals: 18,
  label: label.trim().toLowerCase(),
});
const raw = (value: unknown) =>
  typeof value === "string" && /^-?(?:0|[1-9]\d*)$/.test(value);

export const tokenFeeContract: PureToolContract<
  ConverterInput,
  ConverterResult
> = {
  id: "token-fee-converter",
  version: 1,
  title: toolById("token-fee-converter").title,
  category: toolById("token-fee-converter").category,
  capability: "local-pure",
  assumptions: ["All quantities and rate denominations are manually supplied."],
  limitations: [
    "No token identity, exchange rate, balance or fee schedule is verified.",
  ],
  validateInput(value) {
    if (!isRecord(value) || typeof value.mode !== "string")
      throw new ShapeError("A converter mode is required.");
    switch (value.mode) {
      case "native":
        return shape(value, ["amount", "unit"], []) as ConverterInput;
      case "token":
        return shape(
          value,
          ["amount", "direction", "tokenLabel"],
          ["decimals"],
        ) as ConverterInput;
      case "rate":
        return shape(value, ["amount", "unit"], []) as ConverterInput;
      case "fee":
        return shape(
          value,
          ["amount", "tokenLabel", "rate", "rateUnit"],
          ["decimals"],
        ) as ConverterInput;
      default:
        return fail("Unsupported converter mode.");
    }
  },
  calculate: (input) => calculateTokenFee(input),
  validateOutput(output) {
    if (
      !output ||
      output.calculationVersion !== TOKEN_FEE_VERSION ||
      !isRecord(output.raw) ||
      !isRecord(output.display) ||
      !Object.values(output.raw).length ||
      !Object.values(output.raw).every(raw) ||
      !Object.values(output.display).every((value) => typeof value === "string")
    )
      throw Error("Converter result violates v1 output contract.");
  },
  inputPorts(input) {
    if (input.mode === "native") {
      const unit: ToolUnit =
        input.unit === "wei"
          ? { kind: "wei", decimals: 0 }
          : input.unit === "gwei"
            ? { kind: "gwei", decimals: 9 }
            : { kind: "eth", decimals: 18 };
      return [p("token-fee-converter", "amount", unit, "decimal-string")];
    }
    if (input.mode === "rate") {
      const unit: ToolUnit =
        input.unit === "percent"
          ? { kind: "percent-input", decimals: 16 }
          : input.unit === "bps"
            ? { kind: "bps-input", decimals: 14 }
            : { kind: "ppm-input", decimals: 12 };
      return [p("token-fee-converter", "amount", unit, "decimal-string")];
    }
    const unit = manualToken(input.tokenLabel, input.decimals);
    return input.mode === "fee"
      ? [
          p("token-fee-converter", "amount", unit, "decimal-string"),
          p(
            "token-fee-converter",
            "rate",
            input.rateUnit === "percent"
              ? { kind: "percent-input", decimals: 16 }
              : input.rateUnit === "bps"
                ? { kind: "bps-input", decimals: 14 }
                : { kind: "ppm-input", decimals: 12 },
            "decimal-string",
          ),
        ]
      : [
          p(
            "token-fee-converter",
            "amount",
            unit,
            input.direction === "raw-to-human"
              ? "raw-integer-string"
              : "decimal-string",
          ),
        ];
  },
  outputValues(input, output) {
    const key = {
      native: "wei",
      token: "tokenBaseUnits",
      rate: "ratio1e18",
      fee: "afterFeeBaseUnits",
    }[input.mode];
    const unit: ToolUnit =
      input.mode === "native"
        ? { kind: "wei", decimals: 0 }
        : input.mode === "rate"
          ? { kind: "rate-ratio", decimals: 18 }
          : manualToken(input.tokenLabel, input.decimals);
    return [
      { port: p("token-fee-converter", key, unit), value: output.raw[key] },
    ];
  },
};

const yieldShapes: Record<
  YieldInput["mode"],
  { strings: string[]; integers: string[] }
> = {
  "apr-to-apy": { strings: ["aprPercent"], integers: ["periodsPerYear"] },
  "apy-to-apr": { strings: ["apyPercent"], integers: ["periodsPerYear"] },
  "periodic-to-annual": {
    strings: ["periodicPercent"],
    integers: ["periodsPerYear"],
  },
  simple: {
    strings: ["principal", "annualRatePercent", "currency"],
    integers: ["years"],
  },
  compound: {
    strings: ["principal", "nominalAprPercent", "currency"],
    integers: ["periodsPerYear", "years"],
  },
  contributions: {
    strings: [
      "principal",
      "contribution",
      "timing",
      "nominalAprPercent",
      "currency",
    ],
    integers: ["periodsPerYear", "years"],
  },
  "required-principal": {
    strings: ["annualIncome", "effectiveApyPercent", "currency"],
    integers: [],
  },
  recovery: { strings: ["lossPercent"], integers: [] },
};
const yieldUnit = (
  unit: YieldResult["fields"][number]["unit"],
  currency: string | null,
): ToolUnit => {
  if (unit === "money") return manualMoney(currency || "unit");
  if (unit === "count") return { kind: "count", decimals: 0 };
  return {
    kind: unit === "percentage" ? "rate-ratio" : unit,
    decimals: 18,
  } as ToolUnit;
};
export const yieldGrowthContract: PureToolContract<YieldInput, YieldResult> = {
  id: "yield-growth",
  version: 1,
  title: toolById("yield-growth").title,
  category: toolById("yield-growth").category,
  capability: "local-pure",
  assumptions: [
    "Rates and horizons are manually supplied and constant within each scenario.",
  ],
  limitations: [
    "No guaranteed yield, market data, taxes, inflation or protocol-specific rewards.",
  ],
  validateInput(value) {
    if (
      !isRecord(value) ||
      typeof value.mode !== "string" ||
      !Object.hasOwn(yieldShapes, value.mode)
    )
      throw new ShapeError("A supported yield-growth mode is required.");
    const spec = yieldShapes[value.mode as YieldInput["mode"]];
    return shape(value, spec.strings, spec.integers) as YieldInput;
  },
  calculate: (input) => calculateYieldGrowth(input),
  validateOutput(output) {
    if (
      !output ||
      output.calculationVersion !== YIELD_GROWTH_VERSION ||
      !Array.isArray(output.fields) ||
      output.fields.length < 2 ||
      output.fields.some(
        (item) =>
          !item ||
          typeof item.name !== "string" ||
          !raw(item.raw) ||
          typeof item.display !== "string" ||
          !Number.isSafeInteger(item.decimals) ||
          item.decimals < 0 ||
          item.decimals > 36,
      )
    )
      throw Error("Yield-growth result violates v1 output contract.");
  },
  inputPorts(input) {
    const moneyLabel = "currency" in input ? input.currency : "unit";
    const units: Record<string, ToolUnit> = {
      principal: manualMoney(moneyLabel),
      contribution: manualMoney(moneyLabel),
      annualIncome: manualMoney(moneyLabel),
      aprPercent: { kind: "nominal-apr-percent-input", decimals: 16 },
      nominalAprPercent: { kind: "nominal-apr-percent-input", decimals: 16 },
      apyPercent: { kind: "effective-apy-percent-input", decimals: 16 },
      effectiveApyPercent: {
        kind: "effective-apy-percent-input",
        decimals: 16,
      },
      periodicPercent: { kind: "periodic-rate-percent-input", decimals: 16 },
      annualRatePercent: { kind: "simple-annual-percent-input", decimals: 16 },
      lossPercent: { kind: "loss-percent-input", decimals: 16 },
      periodsPerYear: { kind: "count", decimals: 0 },
      years: { kind: "years", decimals: 0 },
    };
    return Object.keys(input)
      .filter((key) => key in units)
      .map((key) =>
        p(
          "yield-growth",
          key,
          units[key],
          ["periodsPerYear", "years"].includes(key)
            ? "raw-integer-string"
            : "decimal-string",
        ),
      );
  },
  outputValues(_input, output): readonly ToolValue[] {
    return output.fields.map((item) => ({
      port: p("yield-growth", item.name, yieldUnit(item.unit, output.currency)),
      value: item.raw,
    }));
  },
};

export function runAhTool(
  id: "token-fee-converter",
  value: unknown,
): ToolRunResult<ConverterResult>;
export function runAhTool(
  id: "yield-growth",
  value: unknown,
): ToolRunResult<YieldResult>;
export function runAhTool(
  id: "token-fee-converter" | "yield-growth",
  value: unknown,
): ToolRunResult<ConverterResult | YieldResult>;
export function runAhTool(
  id: "token-fee-converter" | "yield-growth",
  value: unknown,
): ToolRunResult<ConverterResult | YieldResult> {
  try {
    if (id === "token-fee-converter") {
      const input = tokenFeeContract.validateInput(value);
      const output = tokenFeeContract.calculate(input, {});
      tokenFeeContract.validateOutput(output);
      return {
        status: "COMPLETE",
        output,
        inputPorts: tokenFeeContract.inputPorts(input),
        values: tokenFeeContract.outputValues(input, output),
      };
    }
    const input = yieldGrowthContract.validateInput(value);
    const output = yieldGrowthContract.calculate(input, {});
    yieldGrowthContract.validateOutput(output);
    return {
      status: "COMPLETE",
      output,
      inputPorts: yieldGrowthContract.inputPorts(input),
      values: yieldGrowthContract.outputValues(input, output),
    };
  } catch (error) {
    if (
      error instanceof ShapeError ||
      error instanceof ConverterInputError ||
      error instanceof YieldInputError
    )
      return {
        status: "ERROR",
        error: { code: "INVALID_INPUT", message: error.message },
      };
    return {
      status: "ERROR",
      error: {
        code: "INTERNAL_FAILURE",
        message: "The local calculation failed validation.",
      },
    };
  }
}
