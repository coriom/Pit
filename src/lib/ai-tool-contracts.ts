/** Reviewed Phase AI pure-local contracts; no registry-derived execution permissions. */
import { toolById } from "./tool-registry";
import { AiInputError } from "./ai-math";
import {
  calculateTradeRisk,
  TRADE_RISK_VERSION,
  type TradeRiskInput,
  type TradeRiskResult,
} from "./trade-risk";
import {
  calculateExecutionMath,
  EXECUTION_MATH_VERSION,
  type ExecutionMathInput,
  type ExecutionMathResult,
} from "./execution-math";
import type {
  PureToolContract,
  ToolPort,
  ToolRunResult,
  ToolUnit,
  ToolValue,
} from "./pure-tool-contract";

class ShapeError extends Error {
  readonly name = "ShapeError";
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const shape = (
  value: unknown,
  strings: string[],
  integers: string[],
  arrays: string[] = [],
) => {
  if (!record(value)) throw new ShapeError("Input must be an object.");
  const keys = ["mode", ...strings, ...integers, ...arrays];
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new ShapeError("Input has missing or unsupported fields.");
  for (const key of strings)
    if (typeof value[key] !== "string")
      throw new ShapeError(`${key} must be a string.`);
  for (const key of integers)
    if (typeof value[key] !== "number" || !Number.isSafeInteger(value[key]))
      throw new ShapeError(`${key} must be a safe integer.`);
  for (const key of arrays)
    if (!Array.isArray(value[key]))
      throw new ShapeError(`${key} must be an array.`);
  return value;
};
const sharedStrings = ["baseLabel", "quoteLabel"];
const sharedInts = ["baseDecimals", "quoteDecimals"];
const feeStrings = [
  "entryFeeBps",
  "exitFeeBps",
  "entryFixedFeeQuote",
  "exitFixedFeeQuote",
];
const raw = (value: unknown) =>
  typeof value === "string" && /^-?(?:0|[1-9]\d*)$/.test(value);
const outputShape = (
  value: TradeRiskResult | ExecutionMathResult,
  version: string,
) => {
  if (
    !value ||
    value.calculationVersion !== version ||
    !["complete", "incomplete"].includes(value.status) ||
    !Array.isArray(value.reasons) ||
    (value.status === "complete" && value.reasons.length !== 0) ||
    (value.status === "incomplete" && value.reasons.length === 0) ||
    !Array.isArray(value.fields) ||
    value.fields.length < 1 ||
    value.fields.some(
      (item) =>
        !item ||
        typeof item.name !== "string" ||
        !raw(item.raw) ||
        typeof item.unit !== "string" ||
        typeof item.display !== "string" ||
        !Number.isSafeInteger(item.decimals) ||
        item.decimals < 0 ||
        item.decimals > 36,
    )
  )
    throw Error("Local calculation result violates the v1 output contract.");
};
const port = (
  id: "trade-risk" | "execution-math",
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
const quoteUnit = (label: string, decimals: number): ToolUnit => ({
  kind: "manual-quote",
  label: label.trim().toLowerCase(),
  decimals,
});
const baseUnit = (label: string, decimals: number): ToolUnit => ({
  kind: "token",
  decimals,
  identity: { kind: "manual-label", label: label.trim().toLowerCase() },
});
const priceUnit = (base: string, quote: string): ToolUnit => ({
  kind: "manual-price",
  decimals: 18,
  baseLabel: base.trim().toLowerCase(),
  quoteLabel: quote.trim().toLowerCase(),
});
const fieldValue = (
  id: "trade-risk" | "execution-math",
  result: TradeRiskResult | ExecutionMathResult,
  name: string,
  unit: ToolUnit,
): ToolValue[] => {
  const found = result.fields.find((item) => item.name === name);
  return found ? [{ port: port(id, name, unit), value: found.raw }] : [];
};

export const tradeRiskContract: PureToolContract<
  TradeRiskInput,
  TradeRiskResult
> = {
  id: "trade-risk",
  version: 1,
  title: toolById("trade-risk").title,
  category: toolById("trade-risk").category,
  capability: "local-pure",
  assumptions: ["Manual long-only spot prices and same-quote-unit fees."],
  limitations: [
    "No guaranteed stop execution, tax basis, leverage or order submission.",
  ],
  validateInput(value) {
    if (!record(value))
      throw new ShapeError("Trade-risk input must be an object.");
    switch (value.mode) {
      case "average": {
        const input = shape(
          value,
          [...sharedStrings, "exitFeeBps", "exitFixedFeeQuote"],
          sharedInts,
          ["fills"],
        );
        for (const fill of input.fills as unknown[]) {
          if (
            !record(fill) ||
            Object.keys(fill).length !== 3 ||
            ["quantity", "price", "feeQuote"].some(
              (key) => typeof fill[key] !== "string",
            )
          )
            throw new ShapeError(
              "Every fill needs quantity, price and explicit or blank quote fee.",
            );
        }
        return input as TradeRiskInput;
      }
      case "risk":
        return shape(
          value,
          [
            ...sharedStrings,
            ...feeStrings,
            "entryPrice",
            "stopPrice",
            "quantity",
            "lossBudgetQuote",
          ],
          sharedInts,
        ) as TradeRiskInput;
      case "reward":
        return shape(
          value,
          [
            ...sharedStrings,
            ...feeStrings,
            "entryPrice",
            "stopPrice",
            "targetPrice",
            "quantity",
          ],
          sharedInts,
        ) as TradeRiskInput;
      default:
        throw new ShapeError("Unsupported trade-risk mode.");
    }
  },
  calculate: (input) => calculateTradeRisk(input),
  validateOutput: (value) => outputShape(value, TRADE_RISK_VERSION),
  inputPorts(input) {
    const quote = quoteUnit(input.quoteLabel, input.quoteDecimals),
      base = baseUnit(input.baseLabel, input.baseDecimals);
    if (input.mode === "average")
      return [
        port("trade-risk", "fills", null, "collection"),
        port("trade-risk", "exitFixedFeeQuote", quote, "decimal-string"),
      ];
    return [
      port("trade-risk", "quantity", base, "decimal-string"),
      port(
        "trade-risk",
        "entryPrice",
        priceUnit(input.baseLabel, input.quoteLabel),
        "decimal-string",
      ),
      port("trade-risk", "entryFixedFeeQuote", quote, "decimal-string"),
    ];
  },
  outputValues(input, output) {
    if (input.mode === "average")
      return fieldValue(
        "trade-risk",
        output,
        "grossAveragePrice",
        priceUnit(input.baseLabel, input.quoteLabel),
      );
    if (input.mode === "risk")
      return fieldValue(
        "trade-risk",
        output,
        "supportedQuantity",
        baseUnit(input.baseLabel, input.baseDecimals),
      );
    return fieldValue("trade-risk", output, "rewardRiskRatio", {
      kind: "reward-risk-ratio",
      decimals: 18,
    });
  },
};

export const executionMathContract: PureToolContract<
  ExecutionMathInput,
  ExecutionMathResult
> = {
  id: "execution-math",
  version: 1,
  title: toolById("execution-math").title,
  category: toolById("execution-math").category,
  capability: "local-pure",
  assumptions: [
    "All prices, amounts and gas figures are manual scenario inputs.",
  ],
  limitations: ["No live gas estimate, quote, chain identity or transaction."],
  validateInput(value) {
    if (!record(value))
      throw new ShapeError("Execution-math input must be an object.");
    switch (value.mode) {
      case "spread":
        return shape(
          value,
          ["quoteLabel", "bid", "ask", "referencePrice", "executionPrice"],
          ["quoteDecimals"],
        ) as ExecutionMathInput;
      case "slippage":
        return shape(
          value,
          ["tokenLabel", "direction", "expectedAmount", "toleranceBps"],
          ["tokenDecimals"],
        ) as ExecutionMathInput;
      case "gas":
        return shape(
          value,
          [
            "nativeLabel",
            "transactionGasUnits",
            "approvalRequired",
            "approvalGasUnits",
            "gasPriceGwei",
            "budgetNative",
            "notionalNative",
            "coverage",
          ],
          [],
        ) as ExecutionMathInput;
      default:
        throw new ShapeError("Unsupported execution-math mode.");
    }
  },
  calculate: (input) => calculateExecutionMath(input),
  validateOutput: (value) => outputShape(value, EXECUTION_MATH_VERSION),
  inputPorts(input) {
    if (input.mode === "spread")
      return [
        port(
          "execution-math",
          "bid",
          quoteUnit(input.quoteLabel, input.quoteDecimals),
          "decimal-string",
        ),
      ];
    if (input.mode === "slippage")
      return [
        port(
          "execution-math",
          "expectedAmount",
          baseUnit(input.tokenLabel, input.tokenDecimals),
          "decimal-string",
        ),
      ];
    return [
      port("execution-math", "transactionGasUnits", {
        kind: "gas-units",
        decimals: 0,
      }),
      port(
        "execution-math",
        "budgetNative",
        {
          kind: "manual-native-wei",
          decimals: 0,
          label: input.nativeLabel.trim().toLowerCase(),
        },
        "decimal-string",
      ),
    ];
  },
  outputValues(input, output) {
    if (input.mode === "spread")
      return fieldValue(
        "execution-math",
        output,
        "absoluteSpread",
        quoteUnit(input.quoteLabel, input.quoteDecimals),
      );
    if (input.mode === "slippage")
      return fieldValue(
        "execution-math",
        output,
        input.direction === "exact-input" ? "minimumReceive" : "maximumSpend",
        baseUnit(input.tokenLabel, input.tokenDecimals),
      );
    return fieldValue("execution-math", output, "knownTotalGasWei", {
      kind: "manual-native-wei",
      decimals: 0,
      label: input.nativeLabel.trim().toLowerCase(),
    });
  },
};

export function runAiTool(
  id: "trade-risk",
  value: unknown,
): ToolRunResult<TradeRiskResult>;
export function runAiTool(
  id: "execution-math",
  value: unknown,
): ToolRunResult<ExecutionMathResult>;
export function runAiTool(
  id: "trade-risk" | "execution-math",
  value: unknown,
): ToolRunResult<TradeRiskResult | ExecutionMathResult>;
export function runAiTool(
  id: "trade-risk" | "execution-math",
  value: unknown,
): ToolRunResult<TradeRiskResult | ExecutionMathResult> {
  try {
    if (id === "trade-risk") {
      const input = tradeRiskContract.validateInput(value),
        output = tradeRiskContract.calculate(input, {});
      tradeRiskContract.validateOutput(output);
      return {
        status: output.status === "incomplete" ? "INCOMPLETE" : "COMPLETE",
        output,
        inputPorts: tradeRiskContract.inputPorts(input),
        values: tradeRiskContract.outputValues(input, output),
      };
    }
    const input = executionMathContract.validateInput(value),
      output = executionMathContract.calculate(input, {});
    executionMathContract.validateOutput(output);
    return {
      status: output.status === "incomplete" ? "INCOMPLETE" : "COMPLETE",
      output,
      inputPorts: executionMathContract.inputPorts(input),
      values: executionMathContract.outputValues(input, output),
    };
  } catch (error) {
    if (error instanceof ShapeError || error instanceof AiInputError)
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
