/** Two explicitly reviewed, pure-local Phase AK adapters. */
import { localToolById } from "./local-tool-definitions";
import { AiInputError } from "./ai-math";
import {
  calculateStaking,
  STAKING_VERSION,
  type StakingInput,
  type StakingResult,
} from "./staking-rewards";
import {
  calculateVesting,
  VESTING_VERSION,
  type VestingInput,
  type VestingResult,
} from "./vesting-unlocks";
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
  strings: readonly string[],
  numbers: readonly string[] = [],
  booleans: readonly string[] = [],
  arrays: readonly string[] = [],
) => {
  if (!record(value)) throw new ShapeError("Input must be an object.");
  const keys = ["mode", ...strings, ...numbers, ...booleans, ...arrays];
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new ShapeError("Input has missing or unsupported fields.");
  for (const key of strings)
    if (typeof value[key] !== "string")
      throw new ShapeError(`${key} must be text.`);
  for (const key of numbers)
    if (!Number.isSafeInteger(value[key]))
      throw new ShapeError(`${key} must be a safe whole number.`);
  for (const key of booleans)
    if (typeof value[key] !== "boolean")
      throw new ShapeError(`${key} must be a boolean.`);
  for (const key of arrays)
    if (!Array.isArray(value[key]))
      throw new ShapeError(`${key} must be an array.`);
  return value;
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
const baseOutput = (value: StakingResult | VestingResult, version: string) => {
  if (
    !value ||
    value.calculationVersion !== version ||
    !["complete", "incomplete"].includes(value.status) ||
    !Array.isArray(value.reasons) ||
    (value.status === "complete" && value.reasons.length !== 0) ||
    (value.status === "incomplete" && value.reasons.length === 0) ||
    !fieldsValid(value.fields)
  )
    throw Error("Phase AK result violates its v1 output contract.");
};
type AkId = "staking-rewards" | "vesting-unlocks";
const port = (
  id: AkId,
  name: string,
  unit: ToolUnit,
  observedAt?: string,
): ToolPort => ({
  name,
  unit,
  valueType: "raw-integer-string",
  required: true,
  sourceToolId: id,
  sourceContractVersion: 1,
  ...(observedAt ? { observedAt } : {}),
});
const unit = (name: string, decimals: number): ToolUnit => ({
  kind: "token",
  decimals,
  identity: { kind: "manual-label", label: name.toLowerCase() },
});
const output = (
  id: AkId,
  result: StakingResult | VestingResult,
  name: string,
  observedAt?: string,
): ToolValue[] => {
  const found = result.fields.find((item) => item.name === name);
  return found
    ? [
        {
          port: port(
            id,
            name,
            unit(result.tokenLabel, result.decimals),
            observedAt,
          ),
          value: found.raw,
        },
      ]
    : [];
};
const commonStaking = ["tokenLabel"];

export const stakingRewardsContract: PureToolContract<
  StakingInput,
  StakingResult
> = {
  id: "staking-rewards",
  version: 1,
  title: localToolById("staking-rewards").title,
  category: localToolById("staking-rewards").category,
  capability: "local-pure",
  assumptions: [
    "Manually supplied rates and token identity; ACT/365 simple accrual unless restaking is selected.",
  ],
  limitations: [
    "No actual validator rate, reward claimability or staking transaction.",
  ],
  validateInput(input) {
    if (!record(input))
      throw new ShapeError("Staking input must be an object.");
    if (input.mode === "projection")
      return shape(
        input,
        [
          ...commonStaking,
          "stake",
          "grossAprBps",
          "commissionBps",
          "otherFee",
          "otherFeeCoverage",
        ],
        ["decimals", "elapsedDays"],
      ) as StakingInput;
    if (input.mode === "claim")
      return shape(
        input,
        [
          ...commonStaking,
          "grossReward",
          "commissionBps",
          "commissionCoverage",
          "claimFee",
          "feeAssetLabel",
          "feeAssetRelation",
          "rewardPerFeeAsset",
          "feeCoverage",
          "dailyGrossAccrual",
        ],
        ["decimals", "feeDecimals"],
      ) as StakingInput;
    if (input.mode === "restake")
      return shape(
        input,
        [
          ...commonStaking,
          "stake",
          "grossAprBps",
          "commissionBps",
          "slashBps",
          "restakeFeePerPeriod",
          "feeCoverage",
        ],
        ["decimals", "years", "periodsPerYear"],
        ["sameAssetConfirmed"],
      ) as StakingInput;
    throw new ShapeError("Unsupported staking mode.");
  },
  calculate: (input) => calculateStaking(input),
  validateOutput(value) {
    baseOutput(value, STAKING_VERSION);
    if (
      value.mode !== value.input.mode ||
      !["profitable", "break-even", "unprofitable", "not-evaluated"].includes(
        value.assessment,
      )
    )
      throw Error("Staking mode or assessment is invalid.");
    const get = (name: string) =>
      value.fields.find((item) => item.name === name)?.raw;
    if (
      value.mode === "projection" &&
      get("grossRewards") &&
      get("operatorCommission") &&
      get("netRewardsBeforeOtherCosts") &&
      BigInt(get("grossRewards")!) - BigInt(get("operatorCommission")!) !==
        BigInt(get("netRewardsBeforeOtherCosts")!)
    )
      throw Error("Projection commission identity failed.");
  },
  inputPorts(input) {
    return [
      port(
        "staking-rewards",
        "manualTokenAmount",
        unit(input.tokenLabel, input.decimals),
      ),
      {
        ...port("staking-rewards", "nominalApr", {
          kind: "nominal-apr",
          decimals: 18,
        }),
        required: input.mode !== "claim",
      },
    ];
  },
  outputValues(input, value) {
    const name =
      input.mode === "projection"
        ? "netRewardsAfterKnownCosts"
        : input.mode === "claim"
          ? "netAfterClaimCost"
          : "restakedEndingValue";
    return output("staking-rewards", value, name);
  },
};

export const vestingUnlocksContract: PureToolContract<
  VestingInput,
  VestingResult
> = {
  id: "vesting-unlocks",
  version: 1,
  title: localToolById("vesting-unlocks").title,
  category: localToolById("vesting-unlocks").category,
  capability: "local-pure",
  assumptions: [
    "Dates are UTC calendar days, token allocation and receipt amounts are manual.",
  ],
  limitations: [
    "Modeled unlock is not on-chain claimability or custody evidence.",
  ],
  validateInput(input) {
    if (!record(input))
      throw new ShapeError("Vesting input must be an object.");
    const common = [
      "tokenLabel",
      "totalAllocation",
      "startDate",
      "endDate",
      "observationDate",
      "previouslyReceived",
    ];
    if (input.mode === "linear")
      return shape(
        input,
        [...common, "cliffDate"],
        ["decimals"],
      ) as VestingInput;
    if (input.mode === "initial-linear")
      return shape(
        input,
        [...common, "cliffDate", "initialBps"],
        ["decimals"],
      ) as VestingInput;
    if (input.mode === "tranches") {
      const value = shape(input, common, ["decimals"], [], ["tranches"]);
      for (const item of value.tranches as unknown[]) {
        if (
          !record(item) ||
          Object.keys(item).length !== 2 ||
          typeof item.date !== "string" ||
          typeof item.amount !== "string"
        )
          throw new ShapeError(
            "Every tranche requires only date and amount strings.",
          );
      }
      return value as VestingInput;
    }
    throw new ShapeError("Unsupported vesting mode.");
  },
  calculate: (input) => calculateVesting(input),
  validateOutput(value) {
    baseOutput(value, VESTING_VERSION);
    if (
      value.mode !== value.input.mode ||
      !Array.isArray(value.schedule) ||
      value.schedule.some(
        (item) =>
          !record(item) ||
          !raw(item.amountRaw) ||
          !["unlocked", "future"].includes(String(item.status)),
      )
    )
      throw Error("Vesting schedule output is invalid.");
    const get = (name: string) =>
      value.fields.find((item) => item.name === name)?.raw;
    if (
      !get("totalAllocation") ||
      !get("vestedAllocation") ||
      !get("lockedAllocation") ||
      BigInt(get("vestedAllocation")!) + BigInt(get("lockedAllocation")!) !==
        BigInt(get("totalAllocation")!)
    )
      throw Error("Vesting allocation conservation failed.");
  },
  inputPorts(input) {
    return [
      port(
        "vesting-unlocks",
        "manualAllocation",
        unit(input.tokenLabel, input.decimals),
      ),
    ];
  },
  outputValues(input, value) {
    return output(
      "vesting-unlocks",
      value,
      "vestedAllocation",
      input.observationDate,
    );
  },
};

export function runAkTool(
  id: "staking-rewards",
  value: unknown,
): ToolRunResult<StakingResult>;
export function runAkTool(
  id: "vesting-unlocks",
  value: unknown,
): ToolRunResult<VestingResult>;
export function runAkTool(
  id: AkId,
  value: unknown,
): ToolRunResult<StakingResult | VestingResult>;
export function runAkTool(
  id: AkId,
  value: unknown,
): ToolRunResult<StakingResult | VestingResult> {
  try {
    if (id === "staking-rewards") {
      const input = stakingRewardsContract.validateInput(value);
      const result = stakingRewardsContract.calculate(input, {});
      stakingRewardsContract.validateOutput(result);
      return {
        status: result.status === "complete" ? "COMPLETE" : "INCOMPLETE",
        output: result,
        inputPorts: stakingRewardsContract.inputPorts(input),
        values: stakingRewardsContract.outputValues(input, result),
      };
    }
    const input = vestingUnlocksContract.validateInput(value);
    const result = vestingUnlocksContract.calculate(input, {});
    vestingUnlocksContract.validateOutput(result);
    return {
      status: result.status === "complete" ? "COMPLETE" : "INCOMPLETE",
      output: result,
      inputPorts: vestingUnlocksContract.inputPorts(input),
      values: vestingUnlocksContract.outputValues(input, result),
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
