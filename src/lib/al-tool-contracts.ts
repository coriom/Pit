/** Explicitly reviewed Phase AL local-only adapters. */
import { AiInputError } from "./ai-math";
import { toolById } from "./tool-registry";
import {
  calculateCollateral,
  COLLATERAL_VERSION,
  type CollateralInput,
  type CollateralResult,
} from "./collateral-health";
import {
  calculateBorrowing,
  BORROWING_VERSION,
  type BorrowingInput,
  type BorrowingResult,
} from "./borrowing-cost";
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
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const shape = (
  value: unknown,
  strings: readonly string[],
  numbers: readonly string[] = [],
) => {
  if (!object(value)) throw new ShapeError("Input must be an object.");
  const names = ["mode", ...strings, ...numbers];
  if (
    Object.keys(value).length !== names.length ||
    names.some((name) => !Object.hasOwn(value, name))
  )
    throw new ShapeError("Input has missing or unsupported fields.");
  for (const name of strings)
    if (typeof value[name] !== "string")
      throw new ShapeError(`${name} must be text.`);
  for (const name of numbers)
    if (!Number.isSafeInteger(value[name]))
      throw new ShapeError(`${name} must be a safe whole number.`);
  return value;
};
const raw = (value: unknown) =>
  typeof value === "string" && /^-?(?:0|[1-9]\d*)$/.test(value);
const validateFields = (value: unknown) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (item) =>
      object(item) &&
      typeof item.name === "string" &&
      raw(item.raw) &&
      typeof item.unit === "string" &&
      typeof item.display === "string" &&
      Number.isSafeInteger(item.decimals) &&
      (item.decimals as number) >= 0 &&
      (item.decimals as number) <= 18,
  );
const validateBase = (
  value: CollateralResult | BorrowingResult,
  version: string,
) => {
  if (
    !value ||
    value.calculationVersion !== version ||
    !["complete", "incomplete"].includes(value.status) ||
    !Array.isArray(value.reasons) ||
    (value.status === "complete" && value.reasons.length !== 0) ||
    (value.status === "incomplete" && value.reasons.length === 0) ||
    !validateFields(value.fields)
  )
    throw Error("Phase AL output violates its v1 contract.");
};
type AlId = "collateral-health" | "borrowing-cost";
const port = (id: AlId, name: string, unit: ToolUnit): ToolPort => ({
  name,
  unit,
  valueType: "raw-integer-string",
  required: true,
  sourceToolId: id,
  sourceContractVersion: 1,
});
const manualUnit = (name: string, decimals: number): ToolUnit => ({
  kind: "manual-quote",
  decimals,
  label: name.toLowerCase(),
});
const value = (
  id: AlId,
  result: CollateralResult | BorrowingResult,
  name: string,
): ToolValue[] => {
  const found = result.fields.find((item) => item.name === name);
  return found
    ? [
        {
          port: port(id, name, manualUnit(result.currency, result.decimals)),
          value: found.raw,
        },
      ]
    : [];
};

export const collateralHealthContract: PureToolContract<
  CollateralInput,
  CollateralResult
> = {
  id: "collateral-health",
  version: 1,
  title: toolById("collateral-health").title,
  category: toolById("collateral-health").category,
  capability: "local-pure",
  assumptions: [
    "Single collateral and single debt are manually valued in one declared currency.",
  ],
  limitations: [
    "No oracle, protocol liquidation rule, approval or borrow action.",
  ],
  validateInput(input) {
    if (!object(input))
      throw new ShapeError("Collateral input must be an object.");
    const strings = [
      "currency",
      "collateral",
      "debt",
      "maxLtvBps",
      "liquidationThresholdBps",
      "targetHealthFactor",
    ];
    if (input.mode === "health" || input.mode === "adjust")
      return shape(input, strings, ["decimals"]) as CollateralInput;
    if (input.mode === "shock")
      return shape(
        input,
        [...strings, "collateralShockBps"],
        ["decimals"],
      ) as CollateralInput;
    throw new ShapeError("Unsupported collateral mode.");
  },
  calculate: (input) => calculateCollateral(input),
  validateOutput(output) {
    validateBase(output, COLLATERAL_VERSION);
    if (output.mode !== output.input.mode || !Array.isArray(output.breaches))
      throw Error("Collateral mode or breach status is invalid.");
    const get = (name: string) =>
      output.fields.find((item) => item.name === name)?.raw;
    if (!get("collateralValue") || !get("debtValue"))
      throw Error("Collateral values are missing.");
    if (
      output.mode === "health" &&
      get("additionalBorrowHeadroom") &&
      get("selectedDebtCeiling")
    ) {
      const debt = BigInt(get("debtValue")!);
      const ceiling = BigInt(get("selectedDebtCeiling")!);
      const headroom = BigInt(get("additionalBorrowHeadroom")!);
      if (headroom !== (debt >= ceiling ? 0n : ceiling - debt))
        throw Error("Borrow headroom identity failed.");
    }
  },
  inputPorts(input) {
    return [
      port(
        "collateral-health",
        "manualCollateral",
        manualUnit(input.currency, input.decimals),
      ),
      port(
        "collateral-health",
        "manualDebt",
        manualUnit(input.currency, input.decimals),
      ),
      port("collateral-health", "maximumLtv", {
        kind: "manual-ltv-bps",
        decimals: 0,
      }),
      port("collateral-health", "targetHealthFactor", {
        kind: "health-factor",
        decimals: 18,
      }),
    ];
  },
  outputValues(input, result) {
    return value(
      "collateral-health",
      result,
      input.mode === "health"
        ? "additionalBorrowHeadroom"
        : input.mode === "adjust"
          ? "minimumRepayment"
          : "shockedCollateralValue",
    );
  },
};
export const borrowingCostContract: PureToolContract<
  BorrowingInput,
  BorrowingResult
> = {
  id: "borrowing-cost",
  version: 1,
  title: toolById("borrowing-cost").title,
  category: toolById("borrowing-cost").category,
  capability: "local-pure",
  assumptions: ["One manual currency and fixed stated nominal APR."],
  limitations: [
    "No live rate, credit decision, liquidation rule or transaction.",
  ],
  validateInput(input) {
    if (!object(input))
      throw new ShapeError("Borrowing input must be an object.");
    const strings = ["currency", "principal", "borrowAprBps"];
    if (input.mode === "growth")
      return shape(input, strings, [
        "decimals",
        "elapsedDays",
        "periodsPerYear",
        "elapsedPeriods",
      ]) as BorrowingInput;
    if (input.mode === "repayment")
      return shape(
        input,
        [...strings, "fixedPayment"],
        ["decimals", "periodsPerYear", "horizonPeriods"],
      ) as BorrowingInput;
    if (input.mode === "carry")
      return shape(
        input,
        [...strings, "investmentYieldBps", "otherCosts", "costCoverage"],
        ["decimals", "elapsedDays"],
      ) as BorrowingInput;
    throw new ShapeError("Unsupported borrowing mode.");
  },
  calculate: (input) => calculateBorrowing(input),
  validateOutput(output) {
    validateBase(output, BORROWING_VERSION);
    if (
      output.mode !== output.input.mode ||
      !Array.isArray(output.schedule) ||
      ![
        "paid-off",
        "amortizing",
        "non-amortizing",
        "negative-amortization",
        "positive-carry",
        "zero-carry",
        "negative-carry",
        "not-evaluated",
      ].includes(output.assessment)
    )
      throw Error("Borrowing mode or assessment is invalid.");
    const get = (name: string) =>
      output.fields.find((item) => item.name === name)?.raw;
    if (output.mode === "repayment") {
      if (
        !get("endingDebt") ||
        !get("paymentConservation") ||
        get("endingDebt") !== get("paymentConservation")
      )
        throw Error("Repayment conservation failed.");
      if (
        output.schedule.some(
          (row) =>
            !raw(row.openingDebtRaw) ||
            !raw(row.interestRaw) ||
            !raw(row.paymentRaw) ||
            !raw(row.principalPaidRaw) ||
            !raw(row.endingDebtRaw) ||
            BigInt(row.openingDebtRaw) +
              BigInt(row.interestRaw) -
              BigInt(row.paymentRaw) !==
              BigInt(row.endingDebtRaw),
        )
      )
        throw Error("Repayment period identity failed.");
    }
  },
  inputPorts(input) {
    return [
      port(
        "borrowing-cost",
        "manualPrincipal",
        manualUnit(input.currency, input.decimals),
      ),
      port("borrowing-cost", "nominalBorrowApr", {
        kind: "nominal-apr",
        decimals: 18,
      }),
    ];
  },
  outputValues(input, result) {
    return value(
      "borrowing-cost",
      result,
      input.mode === "growth"
        ? "compoundedEndingDebt"
        : input.mode === "repayment"
          ? "endingDebt"
          : "netCarryAfterKnownCosts",
    );
  },
};
export function runAlTool(
  id: "collateral-health",
  input: unknown,
): ToolRunResult<CollateralResult>;
export function runAlTool(
  id: "borrowing-cost",
  input: unknown,
): ToolRunResult<BorrowingResult>;
export function runAlTool(
  id: AlId,
  input: unknown,
): ToolRunResult<CollateralResult | BorrowingResult>;
export function runAlTool(
  id: AlId,
  input: unknown,
): ToolRunResult<CollateralResult | BorrowingResult> {
  try {
    if (id === "collateral-health") {
      const validated = collateralHealthContract.validateInput(input);
      const output = collateralHealthContract.calculate(validated, {});
      collateralHealthContract.validateOutput(output);
      return {
        status: output.status === "complete" ? "COMPLETE" : "INCOMPLETE",
        output,
        inputPorts: collateralHealthContract.inputPorts(validated),
        values: collateralHealthContract.outputValues(validated, output),
      };
    }
    const validated = borrowingCostContract.validateInput(input);
    const output = borrowingCostContract.calculate(validated, {});
    borrowingCostContract.validateOutput(output);
    return {
      status: output.status === "complete" ? "COMPLETE" : "INCOMPLETE",
      output,
      inputPorts: borrowingCostContract.inputPorts(validated),
      values: borrowingCostContract.outputValues(validated, output),
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
