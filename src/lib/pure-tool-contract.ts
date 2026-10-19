/** Explicitly allowlisted, side-effect-free entry points. This is not an execution registry. */
import { toolById, type ToolCategory } from "./tool-registry";
import {
  calculateSwapCost,
  SwapCostInputError,
  type SwapCostInput,
  type SwapCostResult,
} from "./swap-cost";
import {
  calculatePortfolio,
  PortfolioInputError,
  MAX_POSITIONS,
  type PositionInput,
  type PortfolioResult,
} from "./portfolio-exposure";
import {
  tokenFeeContract,
  yieldGrowthContract,
  runAhTool,
} from "./ah-tool-contracts";
import type { ConverterResult } from "./token-fee-converter";
import type { YieldResult } from "./yield-growth";
import {
  tradeRiskContract,
  executionMathContract,
  runAiTool,
} from "./ai-tool-contracts";
import type { TradeRiskResult } from "./trade-risk";
import type { ExecutionMathResult } from "./execution-math";
import {
  portfolioRebalanceContract,
  performanceDrawdownContract,
  runAjTool,
} from "./aj-tool-contracts";
import type { RebalanceResult } from "./portfolio-rebalance";
import type { PerformanceResult } from "./performance-drawdown";
import {
  stakingRewardsContract,
  vestingUnlocksContract,
  runAkTool,
} from "./ak-tool-contracts";
import type { StakingResult } from "./staking-rewards";
import type { VestingResult } from "./vesting-unlocks";
import {
  collateralHealthContract,
  borrowingCostContract,
  runAlTool,
} from "./al-tool-contracts";
import type { CollateralResult } from "./collateral-health";
import type { BorrowingResult } from "./borrowing-cost";
import {
  ammPoolContract,
  concentratedLiquidityContract,
  runAmTool,
} from "./am-tool-contracts";
import type { AmmResult } from "./amm-pool-math";
import type { ClResult } from "./concentrated-liquidity";

export const TOOL_CONTRACT_VERSION = 1 as const;
export type ToolCapability =
  "local-pure" | "external-read" | "wallet-read" | "transaction-execution";
export type ToolErrorCode =
  | "INVALID_INPUT"
  | "INCOMPLETE_INPUTS"
  | "INCOMPATIBLE_UNITS"
  | "UNAVAILABLE_DATA"
  | "UNSUPPORTED_CALCULATION"
  | "INTERNAL_FAILURE";
export type ToolError = Readonly<{ code: ToolErrorCode; message: string }>;
export type TokenIdentity = Readonly<
  | { kind: "manual-label"; label: string }
  | {
      kind: "chain-scoped";
      chainId: number;
      assetType: "native" | "erc20";
      address: string;
    }
>;
export type ToolUnit = Readonly<
  | { kind: "token"; decimals: number; identity: TokenIdentity }
  | { kind: "usd-manual"; decimals: 18 }
  | { kind: "wei"; decimals: 0 }
  | { kind: "gwei"; decimals: 9 }
  | { kind: "eth"; decimals: 18 }
  | { kind: "gas-units"; decimals: 0 }
  | { kind: "days"; decimals: 0 }
  | { kind: "years"; decimals: 0 }
  | { kind: "count"; decimals: 0 }
  | { kind: "basis-points"; decimals: 0 }
  | { kind: "parts-per-million"; decimals: 0 }
  | { kind: "percent-input"; decimals: 16 }
  | { kind: "bps-input"; decimals: 14 }
  | { kind: "ppm-input"; decimals: 12 }
  | { kind: "rate-ratio"; decimals: 18 }
  | { kind: "nominal-apr"; decimals: 18 }
  | { kind: "effective-apy"; decimals: 18 }
  | { kind: "periodic-rate"; decimals: 18 }
  | { kind: "simple-annual-rate"; decimals: 18 }
  | { kind: "nominal-apr-percent-input"; decimals: 16 }
  | { kind: "effective-apy-percent-input"; decimals: 16 }
  | { kind: "periodic-rate-percent-input"; decimals: 16 }
  | { kind: "simple-annual-percent-input"; decimals: 16 }
  | { kind: "loss-percent-input"; decimals: 16 }
  | { kind: "manual-money"; decimals: 18; label: string }
  | { kind: "manual-quote"; decimals: number; label: string }
  | {
      kind: "manual-price";
      decimals: 18;
      baseLabel: string;
      quoteLabel: string;
    }
  | { kind: "manual-native-wei"; decimals: 0; label: string }
  | { kind: "reward-risk-ratio"; decimals: 18 }
  | { kind: "manual-ltv-bps"; decimals: 0 }
  | { kind: "health-factor"; decimals: 18 }
  | { kind: "weight-bps"; decimals: 0 }
  | { kind: "signed-manual-cash-flow"; decimals: 18; label: string }
  | { kind: "normalized-performance-index"; decimals: 18 }
  | {
      kind: "manual-conversion-rate";
      decimals: number;
      numerator: TokenIdentity;
      denominator: TokenIdentity;
    }
  | { kind: "timestamp-iso" }
>;
export type ToolPort = Readonly<{
  name: string;
  valueType:
    "decimal-string" | "raw-integer-string" | "timestamp-string" | "collection";
  unit: ToolUnit | null;
  required: boolean;
  sourceToolId: string;
  sourceContractVersion: number;
  observedAt?: string;
}>;
export type ToolValue = Readonly<{ port: ToolPort; value: string | null }>;
export type ToolRunContext = Readonly<{ observationTimeIso?: string }>;
export type ToolRunResult<O> =
  | Readonly<{
      status: "COMPLETE" | "INCOMPLETE";
      output: O;
      inputPorts: readonly ToolPort[];
      values: readonly ToolValue[];
    }>
  | Readonly<{ status: "ERROR"; error: ToolError }>;

export type PureToolContract<I, O> = Readonly<{
  id:
    | "swap-cost"
    | "portfolio-exposure"
    | "token-fee-converter"
    | "yield-growth"
    | "trade-risk"
    | "execution-math"
    | "portfolio-rebalance"
    | "performance-drawdown"
    | "staking-rewards"
    | "vesting-unlocks"
    | "collateral-health"
    | "borrowing-cost"
    | "amm-pool-math"
    | "concentrated-liquidity";
  version: typeof TOOL_CONTRACT_VERSION;
  title: string;
  category: ToolCategory;
  capability: "local-pure";
  assumptions: readonly string[];
  limitations: readonly string[];
  validateInput: (value: unknown) => I;
  calculate: (input: I, context: ToolRunContext) => O;
  validateOutput: (value: O) => void;
  inputPorts: (input: I) => readonly ToolPort[];
  outputValues: (input: I, output: O) => readonly ToolValue[];
}>;

class ContractInputError extends Error {
  readonly name = "ContractInputError";
}
class ContractIncompleteError extends Error {
  readonly name = "ContractIncompleteError";
}
const fail = (message: string): never => {
  throw new ContractInputError(message);
};
const record = (value: unknown, label: string): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object.`);
  return value as Record<string, unknown>;
};
const exactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
) => {
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    fail(`${label} has missing or unsupported fields.`);
};
const stringField = (value: Record<string, unknown>, key: string) => {
  if (typeof value[key] !== "string") fail(`${key} must be a string.`);
};
const integerField = (value: Record<string, unknown>, key: string) => {
  if (typeof value[key] !== "number" || !Number.isSafeInteger(value[key]))
    fail(`${key} must be a safe integer.`);
};
const rawInteger = (value: unknown) =>
  typeof value === "string" && /^-?(?:0|[1-9]\d*)$/.test(value);
const port = (
  sourceToolId: PureToolContract<never, never>["id"],
  name: string,
  valueType: ToolPort["valueType"],
  unit: ToolUnit | null,
  required = true,
  observedAt?: string,
): ToolPort => ({
  name,
  valueType,
  unit,
  required,
  sourceToolId,
  sourceContractVersion: TOOL_CONTRACT_VERSION,
  ...(observedAt ? { observedAt } : {}),
});
const manualToken = (label: string, decimals: number): ToolUnit => ({
  kind: "token",
  decimals,
  identity: { kind: "manual-label", label: label.trim().toLowerCase() },
});
const usd: ToolUnit = { kind: "usd-manual", decimals: 18 };

const swapKeys = [
  "sellToken",
  "buyToken",
  "sellDecimals",
  "buyDecimals",
  "sellAmount",
  "quotedBuyAmount",
  "venue",
  "feeCoverage",
  "unembeddedVenueFeeBuyAmount",
  "approvalRequired",
  "swapGasUnits",
  "approvalGasUnits",
  "gasPriceGwei",
  "nativeGasToken",
  "nativeToBuyRate",
  "slippageBps",
] as const;
const swapNumberKeys = new Set<string>([
  "sellDecimals",
  "buyDecimals",
  "slippageBps",
]);

export const swapCostContract: PureToolContract<SwapCostInput, SwapCostResult> =
  {
    id: "swap-cost",
    version: TOOL_CONTRACT_VERSION,
    title: toolById("swap-cost").title,
    category: toolById("swap-cost").category,
    capability: "local-pure",
    assumptions: [
      "Manual token identifiers and quoted amounts are supplied by the user.",
      "Gas conversion is an explicit manual assumption.",
    ],
    limitations: ["No live quote, wallet gas estimate, or executable route."],
    validateInput(value) {
      const input = record(value, "Swap cost input");
      exactKeys(input, swapKeys, "Swap cost input");
      for (const key of swapKeys)
        swapNumberKeys.has(key)
          ? integerField(input, key)
          : stringField(input, key);
      return input as unknown as SwapCostInput;
    },
    calculate: (input) => calculateSwapCost(input),
    validateOutput(output) {
      if (
        !output ||
        !["complete", "incomplete"].includes(output.status) ||
        !rawInteger(output.sellAmountRaw) ||
        !rawInteger(output.quotedBuyRaw) ||
        !Array.isArray(output.reasons) ||
        (output.status === "complete" &&
          (output.reasons.length !== 0 ||
            output.netAfterWalletGasRaw === null)) ||
        output.pitFeeBuyRaw !== "0" ||
        (output.netAfterWalletGasRaw !== null &&
          !rawInteger(output.netAfterWalletGasRaw))
      )
        throw Error("Swap cost result violates the v1 output contract.");
    },
    inputPorts(input) {
      const buyUnit = manualToken(input.buyToken, input.buyDecimals);
      const gasPossible =
        input.venue === "uniswap-like" || input.approvalRequired !== "no";
      return [
        port(
          "swap-cost",
          "sellAmount",
          "decimal-string",
          manualToken(input.sellToken, input.sellDecimals),
        ),
        port("swap-cost", "quotedBuyAmount", "decimal-string", buyUnit),
        port(
          "swap-cost",
          "unembeddedVenueFeeBuyAmount",
          "decimal-string",
          buyUnit,
          input.feeCoverage === "not-included",
        ),
        port(
          "swap-cost",
          "swapGasUnits",
          "raw-integer-string",
          { kind: "gas-units", decimals: 0 },
          input.venue === "uniswap-like",
        ),
        port(
          "swap-cost",
          "approvalGasUnits",
          "raw-integer-string",
          { kind: "gas-units", decimals: 0 },
          input.approvalRequired === "yes",
        ),
        port(
          "swap-cost",
          "gasPriceGwei",
          "decimal-string",
          { kind: "gwei", decimals: 9 },
          gasPossible,
        ),
        port(
          "swap-cost",
          "nativeToBuyRate",
          "decimal-string",
          {
            kind: "manual-conversion-rate",
            decimals: input.buyDecimals,
            numerator: {
              kind: "manual-label",
              label: input.buyToken.trim().toLowerCase(),
            },
            denominator: {
              kind: "manual-label",
              label: input.nativeGasToken.trim().toLowerCase(),
            },
          },
          gasPossible,
        ),
        port("swap-cost", "slippageBps", "raw-integer-string", {
          kind: "basis-points",
          decimals: 0,
        }),
      ];
    },
    outputValues(input, output) {
      return [
        {
          port: port(
            "swap-cost",
            "netAfterWalletGasRaw",
            "raw-integer-string",
            manualToken(input.buyToken, input.buyDecimals),
          ),
          value: output.netAfterWalletGasRaw,
        },
      ];
    },
  };

const positionKeys = [
  "accountLabel",
  "chainId",
  "assetType",
  "tokenAddress",
  "symbol",
  "decimals",
  "quantity",
  "unitPriceUsd",
  "priceObservedAt",
  "exposureGroup",
] as const;
export type PortfolioToolInput = Readonly<{
  positions: PositionInput[];
  staleAfterDays: number;
}>;
export const portfolioExposureContract: PureToolContract<
  PortfolioToolInput,
  PortfolioResult
> = {
  id: "portfolio-exposure",
  version: TOOL_CONTRACT_VERSION,
  title: toolById("portfolio-exposure").title,
  category: toolById("portfolio-exposure").category,
  capability: "local-pure",
  assumptions: [
    "Spot holdings and USD prices are manually supplied.",
    "Observation time is supplied explicitly by the caller.",
  ],
  limitations: [
    "No wallet discovery, price feed, debt, derivatives or investment advice.",
  ],
  validateInput(value) {
    const input = record(value, "Portfolio input");
    exactKeys(input, ["positions", "staleAfterDays"], "Portfolio input");
    integerField(input, "staleAfterDays");
    const positions = input.positions;
    if (!Array.isArray(positions))
      throw new ContractInputError("Portfolio positions must be an array.");
    if (positions.length > MAX_POSITIONS)
      fail(
        `Portfolio positions must be an array of at most ${MAX_POSITIONS} rows.`,
      );
    for (const [index, unknownPosition] of positions.entries()) {
      const position = record(unknownPosition, `Position ${index + 1}`);
      exactKeys(position, positionKeys, `Position ${index + 1}`);
      for (const key of positionKeys)
        (["chainId", "decimals"].includes(key) ? integerField : stringField)(
          position,
          key,
        );
    }
    return input as unknown as PortfolioToolInput;
  },
  calculate(input, context) {
    if (
      typeof context.observationTimeIso !== "string" ||
      !context.observationTimeIso
    )
      throw new ContractIncompleteError(
        "An explicit observationTimeIso is required.",
      );
    return calculatePortfolio(input.positions, {
      nowIso: context.observationTimeIso,
      staleAfterDays: input.staleAfterDays,
    });
  },
  validateOutput(output) {
    if (
      !output ||
      !["COMPLETE", "INCOMPLETE", "EMPTY"].includes(output.status) ||
      !rawInteger(output.knownSubtotalUsdRaw) ||
      output.usdDecimals !== 18 ||
      !Array.isArray(output.positions) ||
      !Array.isArray(output.byAsset) ||
      output.positions.length > MAX_POSITIONS ||
      !Number.isSafeInteger(output.pricedCount) ||
      !Number.isSafeInteger(output.unpricedCount) ||
      output.pricedCount + output.unpricedCount !== output.positions.length ||
      (output.status === "COMPLETE" && output.unpricedCount !== 0) ||
      (output.status === "EMPTY" && output.positions.length !== 0)
    )
      throw Error("Portfolio result violates the v1 output contract.");
  },
  inputPorts() {
    return [
      port("portfolio-exposure", "positions", "collection", null),
      port("portfolio-exposure", "staleAfterDays", "raw-integer-string", {
        kind: "days",
        decimals: 0,
      }),
      port("portfolio-exposure", "observationTimeIso", "timestamp-string", {
        kind: "timestamp-iso",
      }),
    ];
  },
  outputValues(_input, output) {
    return [
      {
        port: port(
          "portfolio-exposure",
          "knownSubtotalUsdRaw",
          "raw-integer-string",
          usd,
          true,
          output.observedAt,
        ),
        value: output.knownSubtotalUsdRaw,
      },
    ];
  },
};

// The allowlist is intentionally closed. No UI registry entry can opt itself into execution.
export const PURE_TOOL_CONTRACTS = [
  swapCostContract,
  portfolioExposureContract,
  tokenFeeContract,
  yieldGrowthContract,
  tradeRiskContract,
  executionMathContract,
  portfolioRebalanceContract,
  performanceDrawdownContract,
  stakingRewardsContract,
  vestingUnlocksContract,
  collateralHealthContract,
  borrowingCostContract,
  ammPoolContract,
  concentratedLiquidityContract,
] as const;

export function compatiblePorts(source: ToolPort, target: ToolPort): boolean {
  if (
    source.sourceContractVersion !== TOOL_CONTRACT_VERSION ||
    target.sourceContractVersion !== TOOL_CONTRACT_VERSION ||
    source.sourceContractVersion !== target.sourceContractVersion ||
    source.valueType !== target.valueType ||
    !source.unit ||
    !target.unit ||
    ((source.observedAt || target.observedAt) &&
      source.observedAt !== target.observedAt) ||
    source.unit.kind !== target.unit.kind
  )
    return false;
  if (source.unit.kind === "timestamp-iso") return true;
  if (source.unit.kind === "manual-conversion-rate") return false;
  if (source.unit.kind === "manual-money") return false;
  if (
    [
      "manual-quote",
      "manual-price",
      "manual-native-wei",
      "weight-bps",
      "signed-manual-cash-flow",
      "normalized-performance-index",
      "manual-ltv-bps",
      "health-factor",
    ].includes(source.unit.kind)
  )
    return false;
  if (
    target.unit.kind === "timestamp-iso" ||
    source.unit.decimals !== target.unit.decimals
  )
    return false;
  if (source.unit.kind !== "token") return true;
  if (
    target.unit.kind !== "token" ||
    source.unit.identity.kind !== target.unit.identity.kind
  )
    return false;
  // A matching ticker/manual label is never proof of the same asset.
  if (source.unit.identity.kind === "manual-label") return false;
  return (
    target.unit.identity.kind === "chain-scoped" &&
    source.unit.identity.chainId === target.unit.identity.chainId &&
    source.unit.identity.assetType === target.unit.identity.assetType &&
    source.unit.identity.address.toLowerCase() ===
      target.unit.identity.address.toLowerCase()
  );
}

function run<I, O>(
  contract: PureToolContract<I, O>,
  value: unknown,
  context: ToolRunContext,
): ToolRunResult<O> {
  try {
    const input = contract.validateInput(value);
    const output = contract.calculate(input, context);
    contract.validateOutput(output);
    const inputPorts = contract.inputPorts(input);
    const values = contract.outputValues(input, output);
    return {
      status:
        output &&
        typeof output === "object" &&
        "status" in output &&
        ["incomplete", "INCOMPLETE", "EMPTY"].includes(String(output.status))
          ? "INCOMPLETE"
          : "COMPLETE",
      output,
      inputPorts,
      values,
    };
  } catch (error) {
    if (error instanceof ContractIncompleteError)
      return {
        status: "ERROR",
        error: { code: "INCOMPLETE_INPUTS", message: error.message },
      };
    if (
      error instanceof ContractInputError ||
      error instanceof SwapCostInputError ||
      error instanceof PortfolioInputError
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

export function runPureTool(
  id: "swap-cost",
  value: unknown,
  context?: ToolRunContext,
): ToolRunResult<SwapCostResult>;
export function runPureTool(
  id: "portfolio-exposure",
  value: unknown,
  context?: ToolRunContext,
): ToolRunResult<PortfolioResult>;
export function runPureTool(
  id: "token-fee-converter",
  value: unknown,
  context?: ToolRunContext,
): ToolRunResult<ConverterResult>;
export function runPureTool(
  id: "yield-growth",
  value: unknown,
  context?: ToolRunContext,
): ToolRunResult<YieldResult>;
export function runPureTool(
  id: "trade-risk",
  value: unknown,
  context?: ToolRunContext,
): ToolRunResult<TradeRiskResult>;
export function runPureTool(
  id: "execution-math",
  value: unknown,
  context?: ToolRunContext,
): ToolRunResult<ExecutionMathResult>;
export function runPureTool(
  id: "portfolio-rebalance",
  value: unknown,
  context?: ToolRunContext,
): ToolRunResult<RebalanceResult>;
export function runPureTool(
  id: "performance-drawdown",
  value: unknown,
  context?: ToolRunContext,
): ToolRunResult<PerformanceResult>;
export function runPureTool(
  id: "staking-rewards",
  value: unknown,
  context?: ToolRunContext,
): ToolRunResult<StakingResult>;
export function runPureTool(
  id: "vesting-unlocks",
  value: unknown,
  context?: ToolRunContext,
): ToolRunResult<VestingResult>;
export function runPureTool(
  id: "collateral-health",
  value: unknown,
  context?: ToolRunContext,
): ToolRunResult<CollateralResult>;
export function runPureTool(
  id: "borrowing-cost",
  value: unknown,
  context?: ToolRunContext,
): ToolRunResult<BorrowingResult>;
export function runPureTool(
  id: "amm-pool-math",
  value: unknown,
  context?: ToolRunContext,
): ToolRunResult<AmmResult>;
export function runPureTool(
  id: "concentrated-liquidity",
  value: unknown,
  context?: ToolRunContext,
): ToolRunResult<ClResult>;
export function runPureTool(
  id: string,
  value: unknown,
  context?: ToolRunContext,
): ToolRunResult<
  | SwapCostResult
  | PortfolioResult
  | ConverterResult
  | YieldResult
  | TradeRiskResult
  | ExecutionMathResult
  | RebalanceResult
  | PerformanceResult
  | StakingResult
  | VestingResult
  | CollateralResult
  | BorrowingResult
  | AmmResult
  | ClResult
>;
export function runPureTool(
  id: string,
  value: unknown,
  context: ToolRunContext = {},
): ToolRunResult<
  | SwapCostResult
  | PortfolioResult
  | ConverterResult
  | YieldResult
  | TradeRiskResult
  | ExecutionMathResult
  | RebalanceResult
  | PerformanceResult
  | StakingResult
  | VestingResult
  | CollateralResult
  | BorrowingResult
  | AmmResult
  | ClResult
> {
  if (id === "swap-cost") return run(swapCostContract, value, context);
  if (id === "portfolio-exposure")
    return run(portfolioExposureContract, value, context);
  if (id === "token-fee-converter" || id === "yield-growth")
    return runAhTool(id, value);
  if (id === "trade-risk" || id === "execution-math")
    return runAiTool(id, value);
  if (id === "portfolio-rebalance" || id === "performance-drawdown")
    return runAjTool(id, value);
  if (id === "staking-rewards" || id === "vesting-unlocks")
    return runAkTool(id, value);
  if (id === "collateral-health" || id === "borrowing-cost")
    return runAlTool(id, value);
  if (id === "amm-pool-math" || id === "concentrated-liquidity")
    return runAmTool(id, value);
  return {
    status: "ERROR",
    error: {
      code: "UNSUPPORTED_CALCULATION",
      message: "This tool is not approved for pure-local composition.",
    },
  };
}
