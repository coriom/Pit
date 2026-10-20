/** Explicit Phase AJ pure-local adapters. Registry metadata grants no execution power. */
import { localToolById } from "./local-tool-definitions";
import { AiInputError } from "./ai-math";
import {
  calculateRebalance,
  REBALANCE_VERSION,
  type RebalanceInput,
  type RebalanceResult,
} from "./portfolio-rebalance";
import {
  calculatePerformance,
  PERFORMANCE_VERSION,
  type PerformanceInput,
  type PerformanceResult,
} from "./performance-drawdown";
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
const exact = (
  value: unknown,
  strings: readonly string[],
  arrays: readonly string[] = [],
) => {
  if (!record(value)) throw new ShapeError("Input must be an object.");
  const keys = ["mode", ...strings, ...arrays];
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new ShapeError("Input has missing or unsupported fields.");
  for (const key of strings)
    if (typeof value[key] !== "string")
      throw new ShapeError(`${key} must be a string.`);
  for (const key of arrays)
    if (!Array.isArray(value[key]))
      throw new ShapeError(`${key} must be an array.`);
  return value;
};
const nested = (value: unknown, keys: readonly string[]) => {
  if (
    !record(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => typeof value[key] !== "string")
  )
    throw new ShapeError("Every row needs only its documented string fields.");
};
const raw = (value: unknown) =>
  typeof value === "string" && /^-?(?:0|[1-9]\d*)$/.test(value);
const fieldsValid = (value: unknown) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (item) =>
      record(item) &&
      typeof item.name === "string" &&
      raw(item.raw) &&
      typeof item.unit === "string" &&
      typeof item.display === "string" &&
      Number.isSafeInteger(item.decimals) &&
      (item.decimals as number) >= 0 &&
      (item.decimals as number) <= 36,
  );
const outputBase = (
  value: RebalanceResult | PerformanceResult,
  version: string,
) => {
  if (
    !value ||
    value.calculationVersion !== version ||
    !["complete", "incomplete"].includes(value.status) ||
    !Array.isArray(value.reasons) ||
    (value.status === "complete" && value.reasons.length !== 0) ||
    (value.status === "incomplete" && value.reasons.length === 0) ||
    !fieldsValid(value.fields) ||
    !Array.isArray(value.rows) ||
    value.rows.length !==
      ("snapshots" in value.input
        ? value.input.snapshots.length
        : value.input.rows.length)
  )
    throw Error("Phase AJ result violates its v1 output contract.");
};
const port = (
  id: "portfolio-rebalance" | "performance-drawdown",
  name: string,
  unit: ToolUnit | null,
  valueType: ToolPort["valueType"] = "raw-integer-string",
  observedAt?: string,
): ToolPort => ({
  name,
  unit,
  valueType,
  required: true,
  sourceToolId: id,
  sourceContractVersion: 1,
  ...(observedAt ? { observedAt } : {}),
});
const currencyUnit = (label: string): ToolUnit => ({
  kind: "manual-money",
  decimals: 18,
  label: label.trim().toLowerCase(),
});
const value = (
  id: "portfolio-rebalance" | "performance-drawdown",
  result: RebalanceResult | PerformanceResult,
  name: string,
  unit: ToolUnit,
  observedAt?: string,
): ToolValue[] => {
  const found = result.fields.find((item) => item.name === name);
  return found
    ? [
        {
          port: port(id, name, unit, "raw-integer-string", observedAt),
          value: found.raw,
        },
      ]
    : [];
};

export const portfolioRebalanceContract: PureToolContract<
  RebalanceInput,
  RebalanceResult
> = {
  id: "portfolio-rebalance",
  version: 1,
  title: localToolById("portfolio-rebalance").title,
  category: localToolById("portfolio-rebalance").category,
  capability: "local-pure",
  assumptions: [
    "Manually included buckets share one stated valuation currency.",
  ],
  limitations: [
    "No complete-wallet claim, token quantities, executable orders or tax result.",
  ],
  validateInput(input) {
    if (!record(input))
      throw new ShapeError("Rebalance input must be an object.");
    if (input.mode === "target") {
      const value = exact(input, ["currencyLabel", "feeBps"], ["rows"]);
      for (const row of value.rows as unknown[])
        nested(row, ["id", "label", "currentValue", "targetBps"]);
      return value as RebalanceInput;
    }
    if (input.mode === "contribution") {
      const value = exact(input, ["currencyLabel", "contribution"], ["rows"]);
      for (const row of value.rows as unknown[])
        nested(row, ["id", "label", "currentValue", "targetBps"]);
      return value as RebalanceInput;
    }
    if (input.mode === "shock") {
      const value = exact(input, ["currencyLabel"], ["rows"]);
      for (const row of value.rows as unknown[])
        nested(row, ["id", "label", "currentValue", "shockBps"]);
      return value as RebalanceInput;
    }
    throw new ShapeError("Unsupported rebalance mode.");
  },
  calculate: (input) => calculateRebalance(input),
  validateOutput(output) {
    outputBase(output, REBALANCE_VERSION);
    if (
      !["feasible", "infeasible", "not-evaluated"].includes(
        output.feasibility,
      ) ||
      output.rows.some(
        (row) =>
          !record(row) ||
          (!raw(row.currentValueRaw) && row.currentValueRaw !== null) ||
          (!raw(row.allocationDriftPpm) && row.allocationDriftPpm !== null) ||
          (!raw(row.idealTradeRaw) && row.idealTradeRaw !== null) ||
          (!raw(row.contributionRaw) && row.contributionRaw !== null) ||
          (!raw(row.projectedValueRaw) && row.projectedValueRaw !== null),
      )
    )
      throw Error("Rebalance row or feasibility is invalid.");
    if (
      output.mode === "contribution" &&
      output.feasibility === "feasible" &&
      output.rows.reduce(
        (sum, row) => sum + BigInt(row.contributionRaw ?? "0"),
        0n,
      ) !==
        BigInt(
          output.fields.find((item) => item.name === "contribution")?.raw ??
            "-1",
        )
    )
      throw Error("Contribution output does not conserve deposited capital.");
  },
  inputPorts(input) {
    return [
      port(
        "portfolio-rebalance",
        "rows",
        currencyUnit(input.currencyLabel),
        "collection",
      ),
      ...(input.mode === "shock"
        ? []
        : [
            port(
              "portfolio-rebalance",
              "targetBps",
              { kind: "weight-bps", decimals: 0 },
              "collection",
            ),
          ]),
    ];
  },
  outputValues(input, output) {
    const name =
      input.mode === "shock"
        ? "projectedTotal"
        : input.mode === "contribution"
          ? "postContributionTotal"
          : "currentTotal";
    return value(
      "portfolio-rebalance",
      output,
      name,
      currencyUnit(input.currencyLabel),
    );
  },
};

export const performanceDrawdownContract: PureToolContract<
  PerformanceInput,
  PerformanceResult
> = {
  id: "performance-drawdown",
  version: 1,
  title: localToolById("performance-drawdown").title,
  category: localToolById("performance-drawdown").category,
  capability: "local-pure",
  assumptions: [
    "External flows occur at interval end and are included in ending values.",
  ],
  limitations: [
    "No intraperiod flow reconstruction, IRR, market feed or tax conclusion.",
  ],
  validateInput(input) {
    const value = exact(input, ["currencyLabel"], ["snapshots"]);
    for (const row of value.snapshots as unknown[])
      nested(row, ["date", "endingValue", "externalFlow"]);
    if (value.mode !== "performance" && value.mode !== "drawdown")
      throw new ShapeError("Unsupported performance mode.");
    return value as PerformanceInput;
  },
  calculate: (input) => calculatePerformance(input),
  validateOutput(output) {
    outputBase(output, PERFORMANCE_VERSION);
    if (
      output.rows.some(
        (row) =>
          !record(row) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(String(row.date)) ||
          !raw(row.endingValueRaw) ||
          !raw(row.externalFlowRaw) ||
          (row.periodReturnPercentRaw !== null &&
            !raw(row.periodReturnPercentRaw)) ||
          (row.normalizedIndexRaw !== null && !raw(row.normalizedIndexRaw)),
      )
    )
      throw Error("Historical row violates its v1 output shape.");
    const fields = new Map(output.fields.map((item) => [item.name, item.raw]));
    if (
      BigInt(fields.get("closingValue") ?? "0") -
        BigInt(fields.get("openingValue") ?? "0") -
        BigInt(fields.get("netExternalFlows") ?? "0") !==
      BigInt(fields.get("nominalGain") ?? "1")
    )
      throw Error("Historical nominal-gain identity failed.");
  },
  inputPorts(input) {
    return [
      port(
        "performance-drawdown",
        "snapshots",
        currencyUnit(input.currencyLabel),
        "collection",
      ),
      port(
        "performance-drawdown",
        "externalFlows",
        {
          kind: "signed-manual-cash-flow",
          decimals: 18,
          label: input.currencyLabel.trim().toLowerCase(),
        },
        "collection",
      ),
    ];
  },
  outputValues(input, output) {
    const lastDate = input.snapshots[input.snapshots.length - 1].date;
    if (input.mode === "drawdown")
      return value(
        "performance-drawdown",
        output,
        "closingNormalizedIndex",
        { kind: "normalized-performance-index", decimals: 18 },
        lastDate,
      );
    return value(
      "performance-drawdown",
      output,
      "nominalGain",
      currencyUnit(input.currencyLabel),
      lastDate,
    );
  },
};

export function runAjTool(
  id: "portfolio-rebalance",
  value: unknown,
): ToolRunResult<RebalanceResult>;
export function runAjTool(
  id: "performance-drawdown",
  value: unknown,
): ToolRunResult<PerformanceResult>;
export function runAjTool(
  id: "portfolio-rebalance" | "performance-drawdown",
  value: unknown,
): ToolRunResult<RebalanceResult | PerformanceResult>;
export function runAjTool(
  id: "portfolio-rebalance" | "performance-drawdown",
  value: unknown,
): ToolRunResult<RebalanceResult | PerformanceResult> {
  try {
    if (id === "portfolio-rebalance") {
      const input = portfolioRebalanceContract.validateInput(value);
      const output = portfolioRebalanceContract.calculate(input, {});
      portfolioRebalanceContract.validateOutput(output);
      return {
        status: output.status === "complete" ? "COMPLETE" : "INCOMPLETE",
        output,
        inputPorts: portfolioRebalanceContract.inputPorts(input),
        values: portfolioRebalanceContract.outputValues(input, output),
      };
    }
    const input = performanceDrawdownContract.validateInput(value);
    const output = performanceDrawdownContract.calculate(input, {});
    performanceDrawdownContract.validateOutput(output);
    return {
      status: output.status === "complete" ? "COMPLETE" : "INCOMPLETE",
      output,
      inputPorts: performanceDrawdownContract.inputPorts(input),
      values: performanceDrawdownContract.outputValues(input, output),
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
