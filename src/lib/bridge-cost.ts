/** Browser-local hypothetical bridge economics. No network or execution imports. */
import { formatRaw, parseExactAmount, SwapCostInputError } from "./swap-cost";

export const BRIDGE_COST_VERSION = "pit.bridge-cost.simulation.v1" as const;
export const BRIDGE_COST_DISCLAIMER =
  "Illustrative manual routes only. No bridge availability, token equivalence, live quote, verified gas, finality, or guaranteed outcome.";
export const BRIDGE_CHAINS = [11155111, 84532, 421614] as const;
export type BridgeChain = (typeof BRIDGE_CHAINS)[number];
export type FeeKind =
  "bridge" | "liquidity" | "relayer" | "claim" | "intermediateSwap";
export const FEE_KINDS: readonly FeeKind[] = [
  "bridge",
  "liquidity",
  "relayer",
  "claim",
  "intermediateSwap",
];
export type FeeCoverage = "included" | "separate" | "unknown";
export type FeePayer = "wallet" | "destination-proceeds" | "relayer";
export type FeeDenomination =
  "source-token" | "destination-token" | "source-native" | "destination-native";
export type GasCoverage = "wallet" | "included" | "unknown";
export type ApprovalRequirement = "yes" | "no" | "unknown";
export type TokenIdentity = {
  chainId: number;
  address: string;
  decimals: number;
};
export type BridgeFee = {
  coverage: FeeCoverage;
  payer: FeePayer;
  denomination: FeeDenomination;
  chainId: number;
  amount: string;
};
export type GasAssumption = {
  coverage: GasCoverage;
  units: string;
  gasPriceGwei: string;
  nativeAsset: string;
  destinationTokensPerNative: string;
};
export type BridgeRouteInput = {
  sourceChainId: number;
  destinationChainId: number;
  sourceToken: TokenIdentity;
  destinationToken: TokenIdentity;
  /** Same gross source-token transfer budget across comparable routes; wallet gas/fees are external. */
  sourceAmount: string;
  /** Destination tokens after embedded fees, before separate payout fees or external wallet costs. */
  quotedDestinationAmount: string;
  /** Optional manual floor on the quoted amount before separate payout fees. */
  minimumDestinationAmount: string;
  estimatedMinutes: string;
  fees: Record<FeeKind, BridgeFee>;
  approvalRequired: ApprovalRequirement;
  sourceGas: GasAssumption;
  approvalGasUnits: string;
  destinationGas: GasAssumption;
  /** Explicit destination tokens per one source token, only needed for separate source-token wallet fees. */
  destinationTokensPerSourceToken: string;
  /** Optional separate reporting unit; never used to infer token equivalence. */
  commonUnit: string;
  commonUnitDecimals: number;
  commonUnitsPerDestinationToken: string;
};
export type FeeResult = BridgeFee & {
  tokenIdentity: string;
  amountRaw: string | null;
  deductedFromDestinationRaw: string | null;
  externalWalletCostDestinationRaw: string | null;
};
export type BridgeRouteResult = {
  input: BridgeRouteInput;
  status: "complete" | "incomplete";
  reasons: string[];
  sourceAmountRaw: string;
  quotedDestinationRaw: string;
  fees: Record<FeeKind, FeeResult>;
  payoutFeeDestinationRaw: string | null;
  externalFeeDestinationRaw: string | null;
  sourceGasWei: string | null;
  sourceApprovalGasWei: string | null;
  destinationGasWei: string | null;
  sourceGasCostDestinationRaw: string | null;
  destinationGasCostDestinationRaw: string | null;
  expectedDestinationReceivedRaw: string | null;
  totalSeparateUserCostDestinationRaw: string | null;
  netDestinationValueRaw: string | null;
  minimumDestinationReceivedRaw: string | null;
  netMinimumValueRaw: string | null;
  estimatedMinutes: string | null;
  commonUnitCostRaw: string | null;
  commonUnitNetRaw: string | null;
  pitFeeDestinationRaw: "0";
};
export type BridgeComparison = {
  status:
    | "NOT COMPARABLE — incomplete or incompatible route economics"
    | "Best estimated net destination value under supplied assumptions";
  reasons: string[];
  winner: "A" | "B" | "tie" | null;
  netDifferenceDestinationRaw: string | null;
  separateCostDifferenceDestinationRaw: string | null;
  costDifferenceNumeratorRaw: string | null;
  costDifferenceDenominatorRaw: string | null;
  costDifferencePercent: string | null;
};
const UINT256 = (1n << 256n) - 1n;
const RATE_SCALE = 10n ** 18n;
const pow10 = (n: number) => 10n ** BigInt(n);
const ceilDiv = (n: bigint, d: bigint) => (n + d - 1n) / d;
const fail = (message: string): never => {
  throw new SwapCostInputError(message);
};
const text = (value: string, label: string) => {
  const cleaned = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/.test(cleaned))
    fail(`${label} must be an explicit identifier.`);
  return cleaned;
};
const chain = (value: number, label: string): BridgeChain => {
  if (!BRIDGE_CHAINS.includes(value as BridgeChain))
    fail(`${label} must be an approved hypothetical testnet.`);
  return value as BridgeChain;
};
const token = (
  value: TokenIdentity,
  routeChain: number,
  label: string,
): TokenIdentity => {
  if (value.chainId !== routeChain)
    fail(`${label} chain differs from route chain.`);
  if (
    !/^0x[a-fA-F0-9]{40}$/.test(value.address) ||
    /^0x0{40}$/i.test(value.address)
  )
    fail(`${label} requires a nonzero syntactically valid EVM address.`);
  if (
    !Number.isSafeInteger(value.decimals) ||
    value.decimals < 0 ||
    value.decimals > 36
  )
    fail(`${label} decimals must be 0–36.`);
  return { ...value, address: value.address.toLowerCase() };
};
const whole = (value: string, label: string) =>
  parseExactAmount(value, 0, label);
const rate = (value: string, label: string) => {
  if (!value.trim()) return null;
  const result = parseExactAmount(value, 18, label);
  if (result === 0n) fail(`${label} must be positive.`);
  return result;
};
const toDestination = (
  raw: bigint,
  sourceDecimals: number,
  destDecimals: number,
  scaledRate: bigint,
) =>
  ceilDiv(
    raw * scaledRate * pow10(destDecimals),
    pow10(sourceDecimals) * RATE_SCALE,
  );
const toDestinationFloor = (
  raw: bigint,
  sourceDecimals: number,
  destDecimals: number,
  scaledRate: bigint,
) =>
  (raw * scaledRate * pow10(destDecimals)) /
  (pow10(sourceDecimals) * RATE_SCALE);
const gweiToWei = (value: string, label: string) => {
  if (!value.trim()) return null;
  const parsed = parseExactAmount(value, 9, label);
  if (!parsed) fail(`${label} must be positive.`);
  return parsed;
};
const gasUnits = (value: string, label: string) => {
  if (!value.trim()) return null;
  const parsed = whole(value, label);
  if (!parsed) fail(`${label} must be positive.`);
  return parsed;
};
const addReason = (reasons: string[], condition: boolean, message: string) => {
  if (condition) reasons.push(message);
};

export function calculateBridgeCost(
  original: BridgeRouteInput,
): BridgeRouteResult {
  const sourceChainId = chain(original.sourceChainId, "Source chain");
  const destinationChainId = chain(
    original.destinationChainId,
    "Destination chain",
  );
  if (sourceChainId === destinationChainId)
    fail("Source and destination chains must differ.");
  const sourceToken = token(
    original.sourceToken,
    sourceChainId,
    "Source token",
  );
  const destinationToken = token(
    original.destinationToken,
    destinationChainId,
    "Destination token",
  );
  const input: BridgeRouteInput = {
    ...original,
    sourceToken,
    destinationToken,
  };
  const sourceAmountRaw = parseExactAmount(
    input.sourceAmount,
    sourceToken.decimals,
    "Source budget",
  );
  const quotedRaw = parseExactAmount(
    input.quotedDestinationAmount,
    destinationToken.decimals,
    "Quoted destination amount",
  );
  if (!sourceAmountRaw || !quotedRaw)
    fail("Source budget and quoted destination amount must be positive.");
  const minimumRaw = input.minimumDestinationAmount.trim()
    ? parseExactAmount(
        input.minimumDestinationAmount,
        destinationToken.decimals,
        "Minimum destination amount",
      )
    : null;
  if (minimumRaw !== null && minimumRaw > quotedRaw)
    fail("Minimum destination amount exceeds quoted amount.");
  let estimatedMinutes: string | null = null;
  if (input.estimatedMinutes.trim()) {
    const minutes = whole(
      input.estimatedMinutes,
      "Estimated completion minutes",
    );
    if (!minutes) fail("Estimated completion minutes must be positive.");
    estimatedMinutes = minutes.toString();
  }
  if (!["yes", "no", "unknown"].includes(input.approvalRequired))
    fail("Invalid approval requirement.");
  const reasons: string[] = [];
  const sourceTokenRate = rate(
    input.destinationTokensPerSourceToken,
    "Source-token conversion rate",
  );
  const sourceNativeRate = rate(
    input.sourceGas.destinationTokensPerNative,
    "Source-native conversion rate",
  );
  const destinationNativeRate = rate(
    input.destinationGas.destinationTokensPerNative,
    "Destination-native conversion rate",
  );
  const commonUnit = input.commonUnit.trim();
  if (
    !Number.isSafeInteger(input.commonUnitDecimals) ||
    input.commonUnitDecimals < 0 ||
    input.commonUnitDecimals > 36
  )
    fail("Common valuation unit decimals must be 0–36.");
  const commonRate = rate(
    input.commonUnitsPerDestinationToken,
    "Common-unit conversion rate",
  );
  if ((commonUnit && !commonRate) || (!commonUnit && commonRate))
    reasons.push(
      "Common valuation requires both an explicit unit and destination-token rate.",
    );
  if (commonUnit) text(commonUnit, "Common valuation unit");
  text(input.sourceGas.nativeAsset, "Source-native asset");
  text(input.destinationGas.nativeAsset, "Destination-native asset");
  let payoutCost = 0n,
    externalFeeCost = 0n;
  const fees = {} as Record<FeeKind, FeeResult>;
  const denomination = (kind: FeeDenomination) => {
    switch (kind) {
      case "source-token":
        return {
          chainId: sourceChainId,
          decimals: sourceToken.decimals,
          identity: `${sourceChainId}:${sourceToken.address}`,
        };
      case "destination-token":
        return {
          chainId: destinationChainId,
          decimals: destinationToken.decimals,
          identity: `${destinationChainId}:${destinationToken.address}`,
        };
      case "source-native":
        return {
          chainId: sourceChainId,
          decimals: 18,
          identity: `${sourceChainId}:native:${input.sourceGas.nativeAsset.toLowerCase()}`,
        };
      case "destination-native":
        return {
          chainId: destinationChainId,
          decimals: 18,
          identity: `${destinationChainId}:native:${input.destinationGas.nativeAsset.toLowerCase()}`,
        };
      default:
        return fail("Invalid fee denomination.");
    }
  };
  for (const kind of FEE_KINDS) {
    const fee = input.fees[kind];
    if (
      !fee ||
      !["included", "separate", "unknown"].includes(fee.coverage) ||
      !["wallet", "destination-proceeds", "relayer"].includes(fee.payer)
    )
      fail(`Invalid ${kind} fee coverage or payer.`);
    const denom = denomination(fee.denomination);
    if (fee.chainId !== denom.chainId)
      fail(`${kind} fee chain differs from its denomination.`);
    if (
      fee.payer === "destination-proceeds" &&
      fee.denomination !== "destination-token"
    )
      fail(`${kind} destination-proceeds fee must use the destination token.`);
    if (fee.coverage === "included" && fee.payer === "wallet")
      fail(
        `${kind} wallet-paid fee cannot be marked embedded in destination output.`,
      );
    if (fee.coverage === "unknown") {
      if (fee.amount.trim())
        fail(`${kind} unknown fee must not have a falsely known amount.`);
      reasons.push(`${kind} fee coverage is unknown.`);
      fees[kind] = {
        ...fee,
        tokenIdentity: denom.identity,
        amountRaw: null,
        deductedFromDestinationRaw: null,
        externalWalletCostDestinationRaw: null,
      };
      continue;
    }
    const amountRaw = parseExactAmount(
      fee.amount,
      denom.decimals,
      `${kind} fee`,
    );
    let payout: bigint | null = 0n,
      external: bigint | null = 0n;
    if (fee.coverage === "separate" && fee.payer === "destination-proceeds") {
      payout = amountRaw;
      payoutCost += amountRaw;
    } else if (fee.coverage === "separate" && fee.payer === "wallet") {
      const conversion =
        fee.denomination === "destination-token"
          ? RATE_SCALE
          : fee.denomination === "source-token"
            ? sourceTokenRate
            : fee.denomination === "source-native"
              ? sourceNativeRate
              : destinationNativeRate;
      if (conversion === null) {
        reasons.push(
          `${kind} wallet fee needs a ${fee.denomination} conversion rate.`,
        );
        external = null;
      } else {
        external = toDestination(
          amountRaw,
          denom.decimals,
          destinationToken.decimals,
          conversion,
        );
        externalFeeCost += external;
      }
    }
    fees[kind] = {
      ...fee,
      tokenIdentity: denom.identity,
      amountRaw: amountRaw.toString(),
      deductedFromDestinationRaw: payout?.toString() ?? null,
      externalWalletCostDestinationRaw: external?.toString() ?? null,
    };
  }
  if (payoutCost > quotedRaw)
    fail("Separate destination-proceeds fees exceed quoted output.");
  if (minimumRaw !== null && payoutCost > minimumRaw)
    fail("Separate destination-proceeds fees exceed the stated minimum.");
  const sourceGas = input.sourceGas,
    destinationGas = input.destinationGas;
  if (
    !["wallet", "included", "unknown"].includes(sourceGas.coverage) ||
    !["wallet", "included", "unknown"].includes(destinationGas.coverage)
  )
    fail("Invalid gas coverage.");
  if (sourceGas.coverage === "unknown")
    reasons.push("Source-chain wallet gas coverage is unknown.");
  if (destinationGas.coverage === "unknown")
    reasons.push("Destination-chain wallet gas coverage is unknown.");
  if (input.approvalRequired === "unknown")
    reasons.push("Approval requirement is unknown.");
  if (input.approvalRequired !== "yes" && input.approvalGasUnits.trim())
    fail("Approval gas units require an explicit YES approval condition.");
  const sourceUnits =
    sourceGas.coverage === "wallet"
      ? gasUnits(sourceGas.units, "Source gas units")
      : sourceGas.coverage === "unknown"
        ? null
        : 0n;
  const destinationUnits =
    destinationGas.coverage === "wallet"
      ? gasUnits(destinationGas.units, "Destination gas units")
      : destinationGas.coverage === "unknown"
        ? null
        : 0n;
  const approvalUnits =
    input.approvalRequired === "yes"
      ? gasUnits(input.approvalGasUnits, "Approval gas units")
      : input.approvalRequired === "unknown"
        ? null
        : 0n;
  addReason(
    reasons,
    sourceGas.coverage === "wallet" && sourceUnits === null,
    "Source-chain wallet gas units are missing.",
  );
  addReason(
    reasons,
    destinationGas.coverage === "wallet" && destinationUnits === null,
    "Destination-chain wallet gas units are missing.",
  );
  addReason(
    reasons,
    input.approvalRequired === "yes" && approvalUnits === null,
    "Approval gas units are missing.",
  );
  if (sourceGas.coverage !== "wallet" && sourceGas.units.trim())
    fail("Source gas units apply only to wallet-paid source gas.");
  if (destinationGas.coverage !== "wallet" && destinationGas.units.trim())
    fail("Destination gas units apply only to wallet-paid destination gas.");
  const needsSourcePrice =
    sourceGas.coverage === "wallet" || input.approvalRequired === "yes";
  const needsDestinationPrice = destinationGas.coverage === "wallet";
  const sourcePrice = needsSourcePrice
    ? gweiToWei(sourceGas.gasPriceGwei, "Source gas price")
    : 0n;
  const destinationPrice = needsDestinationPrice
    ? gweiToWei(destinationGas.gasPriceGwei, "Destination gas price")
    : 0n;
  addReason(
    reasons,
    needsSourcePrice && sourcePrice === null,
    "Source gas price is missing.",
  );
  addReason(
    reasons,
    needsDestinationPrice && destinationPrice === null,
    "Destination gas price is missing.",
  );
  addReason(
    reasons,
    needsSourcePrice && sourceNativeRate === null,
    "Source-native conversion rate is missing.",
  );
  addReason(
    reasons,
    needsDestinationPrice && destinationNativeRate === null,
    "Destination-native conversion rate is missing.",
  );
  const sourceGasWei =
    sourceUnits === null || sourcePrice === null
      ? null
      : sourceUnits * sourcePrice;
  const approvalGasWei =
    approvalUnits === null || sourcePrice === null
      ? null
      : approvalUnits * sourcePrice;
  const destinationGasWei =
    destinationUnits === null || destinationPrice === null
      ? null
      : destinationUnits * destinationPrice;
  const sourceGasCost =
    sourceGasWei === null ||
    approvalGasWei === null ||
    (needsSourcePrice && sourceNativeRate === null)
      ? null
      : toDestination(
          sourceGasWei + approvalGasWei,
          18,
          destinationToken.decimals,
          sourceNativeRate ?? RATE_SCALE,
        );
  const destinationGasCost =
    destinationGasWei === null ||
    (needsDestinationPrice && destinationNativeRate === null)
      ? null
      : toDestination(
          destinationGasWei,
          18,
          destinationToken.decimals,
          destinationNativeRate ?? RATE_SCALE,
        );
  const expectedReceived = quotedRaw - payoutCost;
  const allKnown =
    reasons.length === 0 &&
    sourceGasCost !== null &&
    destinationGasCost !== null;
  const separateUserCost = allKnown
    ? payoutCost + externalFeeCost + sourceGasCost! + destinationGasCost!
    : null;
  const net = separateUserCost === null ? null : quotedRaw - separateUserCost;
  const commonCost =
    separateUserCost === null || !commonRate
      ? null
      : toDestination(
          separateUserCost,
          destinationToken.decimals,
          input.commonUnitDecimals,
          commonRate,
        );
  const commonNet =
    net === null || !commonRate
      ? null
      : net < 0n
        ? -toDestination(
            -net,
            destinationToken.decimals,
            input.commonUnitDecimals,
            commonRate,
          )
        : toDestinationFloor(
            net,
            destinationToken.decimals,
            input.commonUnitDecimals,
            commonRate,
          );
  if (net !== null && (net > UINT256 || net < -UINT256))
    fail("Net value exceeds supported range.");
  return {
    input,
    status: allKnown ? "complete" : "incomplete",
    reasons,
    sourceAmountRaw: sourceAmountRaw.toString(),
    quotedDestinationRaw: quotedRaw.toString(),
    fees,
    payoutFeeDestinationRaw: reasons.some((reason) =>
      reason.includes("fee coverage is unknown"),
    )
      ? null
      : payoutCost.toString(),
    externalFeeDestinationRaw: allKnown ? externalFeeCost.toString() : null,
    sourceGasWei: sourceGasWei?.toString() ?? null,
    sourceApprovalGasWei: approvalGasWei?.toString() ?? null,
    destinationGasWei: destinationGasWei?.toString() ?? null,
    sourceGasCostDestinationRaw: sourceGasCost?.toString() ?? null,
    destinationGasCostDestinationRaw: destinationGasCost?.toString() ?? null,
    expectedDestinationReceivedRaw: reasons.some((reason) =>
      reason.includes("fee coverage is unknown"),
    )
      ? null
      : expectedReceived.toString(),
    totalSeparateUserCostDestinationRaw: separateUserCost?.toString() ?? null,
    netDestinationValueRaw: net?.toString() ?? null,
    minimumDestinationReceivedRaw:
      minimumRaw === null ||
      reasons.some((reason) => reason.includes("fee coverage is unknown"))
        ? null
        : (minimumRaw - payoutCost).toString(),
    netMinimumValueRaw:
      minimumRaw === null || separateUserCost === null
        ? null
        : (minimumRaw - separateUserCost).toString(),
    estimatedMinutes,
    commonUnitCostRaw: commonCost?.toString() ?? null,
    commonUnitNetRaw: commonNet?.toString() ?? null,
    pitFeeDestinationRaw: "0",
  };
}

const sameToken = (a: TokenIdentity, b: TokenIdentity) =>
  a.chainId === b.chainId &&
  a.address.toLowerCase() === b.address.toLowerCase() &&
  a.decimals === b.decimals;
const usedRate = (result: BridgeRouteResult, denomination: FeeDenomination) =>
  FEE_KINDS.some(
    (kind) =>
      result.input.fees[kind].coverage === "separate" &&
      result.input.fees[kind].payer === "wallet" &&
      result.input.fees[kind].denomination === denomination,
  );
const canonicalRate = (value: string) =>
  value.trim() ? rate(value, "Comparison conversion rate")?.toString() : null;
const costPercent = (a: bigint, b: bigint) => {
  const largest = a > b ? a : b;
  if (largest === 0n) return "0";
  const difference = a > b ? a - b : b - a;
  return formatRaw((difference * 1_000_000n + largest / 2n) / largest, 4);
};
export function compareBridgeCosts(
  a: BridgeRouteResult,
  b: BridgeRouteResult,
): BridgeComparison {
  const reasons: string[] = [];
  if (a.status !== "complete" || b.status !== "complete")
    reasons.push("One or both routes have incomplete cost coverage.");
  if (
    a.input.sourceChainId !== b.input.sourceChainId ||
    a.input.destinationChainId !== b.input.destinationChainId ||
    !sameToken(a.input.sourceToken, b.input.sourceToken) ||
    !sameToken(a.input.destinationToken, b.input.destinationToken)
  )
    reasons.push("Source or destination chain/token identity differs.");
  if (a.sourceAmountRaw !== b.sourceAmountRaw)
    reasons.push("Gross source transfer budgets differ.");
  if (
    a.input.sourceGas.nativeAsset.trim().toLowerCase() !==
      b.input.sourceGas.nativeAsset.trim().toLowerCase() ||
    a.input.destinationGas.nativeAsset.trim().toLowerCase() !==
      b.input.destinationGas.nativeAsset.trim().toLowerCase()
  )
    reasons.push("Native gas-asset identities differ.");
  for (const [denomination, aValue, bValue] of [
    [
      "source-token",
      a.input.destinationTokensPerSourceToken,
      b.input.destinationTokensPerSourceToken,
    ],
    [
      "source-native",
      a.input.sourceGas.destinationTokensPerNative,
      b.input.sourceGas.destinationTokensPerNative,
    ],
    [
      "destination-native",
      a.input.destinationGas.destinationTokensPerNative,
      b.input.destinationGas.destinationTokensPerNative,
    ],
  ] as const) {
    const active =
      denomination === "source-token"
        ? usedRate(a, denomination) || usedRate(b, denomination)
        : denomination === "source-native"
          ? BigInt(a.sourceGasWei ?? "0") +
              BigInt(a.sourceApprovalGasWei ?? "0") >
              0n ||
            usedRate(a, denomination) ||
            BigInt(b.sourceGasWei ?? "0") +
              BigInt(b.sourceApprovalGasWei ?? "0") >
              0n ||
            usedRate(b, denomination)
          : BigInt(a.destinationGasWei ?? "0") > 0n ||
            usedRate(a, denomination) ||
            BigInt(b.destinationGasWei ?? "0") > 0n ||
            usedRate(b, denomination);
    if (active && canonicalRate(aValue) !== canonicalRate(bValue))
      reasons.push(`${denomination} conversion assumptions differ.`);
  }
  if (
    a.input.commonUnitDecimals !== b.input.commonUnitDecimals ||
    a.input.commonUnit.trim().toLowerCase() !==
      b.input.commonUnit.trim().toLowerCase() ||
    canonicalRate(a.input.commonUnitsPerDestinationToken) !==
      canonicalRate(b.input.commonUnitsPerDestinationToken)
  )
    reasons.push("Common valuation unit or rate differs.");
  if (
    reasons.length ||
    a.netDestinationValueRaw === null ||
    b.netDestinationValueRaw === null ||
    a.totalSeparateUserCostDestinationRaw === null ||
    b.totalSeparateUserCostDestinationRaw === null
  )
    return {
      status: "NOT COMPARABLE — incomplete or incompatible route economics",
      reasons,
      winner: null,
      netDifferenceDestinationRaw: null,
      separateCostDifferenceDestinationRaw: null,
      costDifferenceNumeratorRaw: null,
      costDifferenceDenominatorRaw: null,
      costDifferencePercent: null,
    };
  const aNet = BigInt(a.netDestinationValueRaw),
    bNet = BigInt(b.netDestinationValueRaw);
  const aCost = BigInt(a.totalSeparateUserCostDestinationRaw),
    bCost = BigInt(b.totalSeparateUserCostDestinationRaw);
  const netDiff = aNet > bNet ? aNet - bNet : bNet - aNet;
  const costDiff = aCost > bCost ? aCost - bCost : bCost - aCost;
  const largerCost = aCost > bCost ? aCost : bCost;
  return {
    status: "Best estimated net destination value under supplied assumptions",
    reasons: [],
    winner: aNet > bNet ? "A" : aNet < bNet ? "B" : "tie",
    netDifferenceDestinationRaw: netDiff.toString(),
    separateCostDifferenceDestinationRaw: costDiff.toString(),
    costDifferenceNumeratorRaw: costDiff.toString(),
    costDifferenceDenominatorRaw: largerCost.toString(),
    costDifferencePercent: costPercent(aCost, bCost),
  };
}
export function bridgeCostReportJSON(
  a: BridgeRouteResult,
  b: BridgeRouteResult,
  comparison: BridgeComparison,
) {
  return (
    JSON.stringify(
      {
        calculationVersion: BRIDGE_COST_VERSION,
        disclaimer: BRIDGE_COST_DISCLAIMER,
        scenarios: { A: a, B: b },
        comparison,
      },
      null,
      2,
    ) + "\n"
  );
}
