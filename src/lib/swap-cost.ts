/** Manual, local-only cost arithmetic. This module never imports a quote or execution adapter. */
export const SWAP_COST_VERSION = "pit.swap-cost.simulation.v1" as const;
export const SWAP_COST_DISCLAIMER =
  "Illustrative manual assumptions only. No live quote, verified gas estimate, executable route, or guaranteed outcome.";

export type SimulatedVenue = "cow-like" | "uniswap-like";
export type FeeCoverage = "included" | "not-included" | "unknown";
export type ApprovalRequirement = "yes" | "no" | "unknown";

export type SwapCostInput = {
  sellToken: string;
  buyToken: string;
  sellDecimals: number;
  buyDecimals: number;
  sellAmount: string;
  quotedBuyAmount: string;
  venue: SimulatedVenue;
  feeCoverage: FeeCoverage;
  /** Required only when a CoW-like quote explicitly excludes a buy-token-denominated fee. */
  unembeddedVenueFeeBuyAmount: string;
  approvalRequired: ApprovalRequirement;
  swapGasUnits: string;
  approvalGasUnits: string;
  gasPriceGwei: string;
  nativeGasToken: string;
  nativeToBuyRate: string; // buy-token units per one native gas token
  slippageBps: number;
};

export type SwapCostResult = {
  input: SwapCostInput;
  status: "complete" | "incomplete";
  reasons: string[];
  sellAmountRaw: string;
  quotedBuyRaw: string;
  /** Null until fee coverage is explicit. Included fees are never subtracted again. */
  separatelyDeductedVenueFeeBuyRaw: string | null;
  expectedBeforeWalletGasRaw: string | null;
  minimumReceiveRaw: string | null;
  swapGasUnits: string | null;
  approvalGasUnits: string | null;
  gasPriceWei: string | null;
  swapGasWei: string | null;
  approvalGasWei: string | null;
  totalWalletGasWei: string | null;
  nativeToBuyRateRaw: string | null;
  convertedWalletGasBuyRaw: string | null;
  netAfterWalletGasRaw: string | null;
  netMinimumAfterWalletGasRaw: string | null;
  gasImpactNumeratorRaw: string | null;
  gasImpactDenominatorRaw: string | null;
  gasImpactPercent: string | null;
  pitFeeBuyRaw: "0";
};

export type SwapCostComparison = {
  status:
    | "NOT COMPARABLE — incomplete cost coverage"
    | "Best estimated net output under supplied assumptions";
  reasons: string[];
  winner: "A" | "B" | "tie" | null;
  differenceBuyRaw: string | null;
};

export class SwapCostInputError extends Error {
  readonly name = "SwapCostInputError";
}

const MAX_RAW = (1n << 256n) - 1n;
const WEI_PER_NATIVE = 10n ** 18n;
const pow10 = (decimals: number) => 10n ** BigInt(decimals);
const ceilDiv = (n: bigint, d: bigint) => (n + d - 1n) / d;

function decimals(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 36)
    throw new SwapCostInputError(`${label} must be an integer from 0 to 36.`);
  return value;
}

function identity(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/.test(normalized))
    throw new SwapCostInputError(
      `${label} needs an unambiguous manual identifier.`,
    );
  return normalized;
}

/** Exact decimal parser: no Number conversion, exponent, sign, or silent rounding. */
export function parseExactAmount(
  value: string,
  places: number,
  label: string,
): bigint {
  decimals(places, `${label} decimals`);
  const text = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text))
    throw new SwapCostInputError(`${label} must be a nonnegative decimal.`);
  const [integer, fraction = ""] = text.split(".");
  if (integer.length > 78 || fraction.length > places)
    throw new SwapCostInputError(`${label} exceeds its supported precision.`);
  const raw =
    BigInt(integer) * pow10(places) +
    BigInt((fraction + "0".repeat(places)).slice(0, places) || "0");
  if (raw > MAX_RAW)
    throw new SwapCostInputError(`${label} exceeds uint256 range.`);
  return raw;
}

function whole(value: string, label: string): bigint {
  return parseExactAmount(value, 0, label);
}

export function formatRaw(raw: bigint | string, places: number): string {
  decimals(places, "Display decimals");
  const amount = typeof raw === "bigint" ? raw : BigInt(raw);
  const sign = amount < 0n ? "-" : "";
  const absolute = amount < 0n ? -amount : amount;
  if (!places) return sign + absolute.toString();
  const integer = absolute / pow10(places);
  const fraction = (absolute % pow10(places))
    .toString()
    .padStart(places, "0")
    .replace(/0+$/, "");
  return sign + integer.toString() + (fraction ? `.${fraction}` : "");
}

function percent(numerator: bigint, denominator: bigint): string | null {
  if (denominator === 0n) return null;
  // Display only: percentage rounded to four decimal places.
  const scaled = (numerator * 1_000_000n + denominator / 2n) / denominator;
  return formatRaw(scaled, 4);
}

export function calculateSwapCost(input: SwapCostInput): SwapCostResult {
  const sellDecimals = decimals(input.sellDecimals, "Sell-token decimals");
  const buyDecimals = decimals(input.buyDecimals, "Buy-token decimals");
  const sellToken = identity(input.sellToken, "Sell token");
  const buyToken = identity(input.buyToken, "Buy token");
  if (sellToken.toLowerCase() === buyToken.toLowerCase())
    throw new SwapCostInputError("Sell and buy tokens must differ.");
  identity(input.nativeGasToken, "Native gas token");
  if (!["cow-like", "uniswap-like"].includes(input.venue))
    throw new SwapCostInputError("Unsupported simulated venue.");
  if (!["included", "not-included", "unknown"].includes(input.feeCoverage))
    throw new SwapCostInputError("Invalid fee-coverage choice.");
  if (!["yes", "no", "unknown"].includes(input.approvalRequired))
    throw new SwapCostInputError("Invalid approval requirement.");
  if (
    !Number.isSafeInteger(input.slippageBps) ||
    input.slippageBps < 0 ||
    input.slippageBps > 10_000
  )
    throw new SwapCostInputError(
      "Slippage must be from 0 to 10000 basis points.",
    );
  if (input.venue === "uniswap-like" && input.feeCoverage === "not-included")
    throw new SwapCostInputError(
      "Uniswap-like pool fee must be included in quoted output.",
    );
  if (input.venue === "cow-like" && input.swapGasUnits.trim() !== "")
    throw new SwapCostInputError(
      "CoW-like solver settlement gas is not a wallet-paid swap transaction.",
    );
  if (
    input.feeCoverage !== "not-included" &&
    input.unembeddedVenueFeeBuyAmount.trim() !== ""
  )
    throw new SwapCostInputError(
      "Do not deduct an embedded or unknown venue fee twice.",
    );
  if (input.approvalRequired !== "yes" && input.approvalGasUnits.trim() !== "")
    throw new SwapCostInputError(
      "Approval gas units apply only when approval is required.",
    );

  const sellRaw = parseExactAmount(
    input.sellAmount,
    sellDecimals,
    "Sell amount",
  );
  const quotedRaw = parseExactAmount(
    input.quotedBuyAmount,
    buyDecimals,
    "Quoted output",
  );
  if (sellRaw === 0n || quotedRaw === 0n)
    throw new SwapCostInputError(
      "Sell amount and quoted output must be positive.",
    );
  const reasons: string[] = [];
  let feeRaw: bigint | null = null;
  if (input.feeCoverage === "included") feeRaw = 0n;
  else if (input.feeCoverage === "unknown")
    reasons.push("Venue fee coverage is unknown.");
  else if (!input.unembeddedVenueFeeBuyAmount.trim())
    reasons.push("Unembedded venue fee in buy-token units is missing.");
  else
    feeRaw = parseExactAmount(
      input.unembeddedVenueFeeBuyAmount,
      buyDecimals,
      "Unembedded venue fee",
    );
  if (feeRaw !== null && feeRaw > quotedRaw)
    throw new SwapCostInputError("Unembedded venue fee exceeds quoted output.");
  const beforeGas = feeRaw === null ? null : quotedRaw - feeRaw;
  const minReceive =
    beforeGas === null
      ? null
      : (beforeGas * BigInt(10_000 - input.slippageBps)) / 10_000n;

  let swapUnits: bigint | null = input.venue === "cow-like" ? 0n : null;
  if (input.venue === "uniswap-like") {
    if (!input.swapGasUnits.trim())
      reasons.push("Wallet swap gas estimate is missing.");
    else {
      swapUnits = whole(input.swapGasUnits, "Wallet swap gas units");
      if (swapUnits === 0n)
        throw new SwapCostInputError("Wallet swap gas units must be positive.");
    }
  }
  let approvalUnits: bigint | null =
    input.approvalRequired === "no" ? 0n : null;
  if (input.approvalRequired === "unknown")
    reasons.push("Approval requirement is unknown.");
  if (input.approvalRequired === "yes") {
    if (!input.approvalGasUnits.trim())
      reasons.push("Wallet approval gas estimate is missing.");
    else {
      approvalUnits = whole(
        input.approvalGasUnits,
        "Wallet approval gas units",
      );
      if (approvalUnits === 0n)
        throw new SwapCostInputError(
          "Wallet approval gas units must be positive.",
        );
    }
  }
  const totalUnits =
    swapUnits === null || approvalUnits === null
      ? null
      : swapUnits + approvalUnits;
  const gasPossible =
    input.venue === "uniswap-like" || input.approvalRequired !== "no";
  let gasPriceWei: bigint | null = null;
  let rateRaw: bigint | null = null;
  if (gasPossible) {
    if (!input.gasPriceGwei.trim()) reasons.push("Gas price is missing.");
    else {
      gasPriceWei = parseExactAmount(
        input.gasPriceGwei,
        9,
        "Gas price in gwei",
      );
      if (gasPriceWei === 0n)
        throw new SwapCostInputError(
          "Gas price must be positive when wallet gas is possible.",
        );
    }
    if (!input.nativeToBuyRate.trim())
      reasons.push("Native-gas-token to buy-token conversion rate is missing.");
    else {
      rateRaw = parseExactAmount(
        input.nativeToBuyRate,
        buyDecimals,
        "Native to buy conversion rate",
      );
      if (rateRaw === 0n)
        throw new SwapCostInputError(
          "Native to buy conversion rate must be positive.",
        );
    }
  } else {
    // No wallet-paid gas; absent price/rate are genuinely not required.
    if (input.gasPriceGwei.trim() || input.nativeToBuyRate.trim())
      throw new SwapCostInputError(
        "Remove unused gas price and conversion rate when wallet gas is zero.",
      );
    gasPriceWei = 0n;
    rateRaw = 0n;
  }
  const swapGasWei =
    swapUnits === null || gasPriceWei === null ? null : swapUnits * gasPriceWei;
  const approvalGasWei =
    approvalUnits === null || gasPriceWei === null
      ? null
      : approvalUnits * gasPriceWei;
  const totalGasWei =
    totalUnits === null || gasPriceWei === null
      ? null
      : totalUnits * gasPriceWei;
  const gasBuyRaw =
    totalGasWei === null || rateRaw === null
      ? null
      : ceilDiv(totalGasWei * rateRaw, WEI_PER_NATIVE);
  const net =
    beforeGas === null || gasBuyRaw === null ? null : beforeGas - gasBuyRaw;
  const netMin =
    minReceive === null || gasBuyRaw === null ? null : minReceive - gasBuyRaw;
  return {
    input: { ...input, sellToken, buyToken },
    status: reasons.length ? "incomplete" : "complete",
    reasons,
    sellAmountRaw: sellRaw.toString(),
    quotedBuyRaw: quotedRaw.toString(),
    separatelyDeductedVenueFeeBuyRaw: feeRaw?.toString() ?? null,
    expectedBeforeWalletGasRaw: beforeGas?.toString() ?? null,
    minimumReceiveRaw: minReceive?.toString() ?? null,
    swapGasUnits: swapUnits?.toString() ?? null,
    approvalGasUnits: approvalUnits?.toString() ?? null,
    gasPriceWei: gasPriceWei?.toString() ?? null,
    swapGasWei: swapGasWei?.toString() ?? null,
    approvalGasWei: approvalGasWei?.toString() ?? null,
    totalWalletGasWei: totalGasWei?.toString() ?? null,
    nativeToBuyRateRaw: rateRaw?.toString() ?? null,
    convertedWalletGasBuyRaw: gasBuyRaw?.toString() ?? null,
    netAfterWalletGasRaw: net?.toString() ?? null,
    netMinimumAfterWalletGasRaw: netMin?.toString() ?? null,
    gasImpactNumeratorRaw: gasBuyRaw?.toString() ?? null,
    gasImpactDenominatorRaw: beforeGas?.toString() ?? null,
    gasImpactPercent:
      gasBuyRaw === null || beforeGas === null
        ? null
        : percent(gasBuyRaw, beforeGas),
    pitFeeBuyRaw: "0",
  };
}

export function compareSwapCosts(
  a: SwapCostResult,
  b: SwapCostResult,
): SwapCostComparison {
  const reasons: string[] = [];
  if (a.status !== "complete" || b.status !== "complete")
    reasons.push("One or both scenarios have incomplete cost coverage.");
  if (
    a.input.sellToken.toLowerCase() !== b.input.sellToken.toLowerCase() ||
    a.input.buyToken.toLowerCase() !== b.input.buyToken.toLowerCase() ||
    a.input.sellDecimals !== b.input.sellDecimals ||
    a.input.buyDecimals !== b.input.buyDecimals
  )
    reasons.push("Token identities or decimals differ.");
  if (a.sellAmountRaw !== b.sellAmountRaw)
    reasons.push("Total sell-token budgets differ.");
  if (
    a.convertedWalletGasBuyRaw !== "0" &&
    b.convertedWalletGasBuyRaw !== "0" &&
    (a.input.nativeGasToken.toLowerCase() !==
      b.input.nativeGasToken.toLowerCase() ||
      a.nativeToBuyRateRaw !== b.nativeToBuyRateRaw)
  )
    reasons.push("Native-gas-token conversion assumptions differ.");
  if (
    reasons.length ||
    a.netAfterWalletGasRaw === null ||
    b.netAfterWalletGasRaw === null
  )
    return {
      status: "NOT COMPARABLE — incomplete cost coverage",
      reasons,
      winner: null,
      differenceBuyRaw: null,
    };
  const delta = BigInt(a.netAfterWalletGasRaw) - BigInt(b.netAfterWalletGasRaw);
  return {
    status: "Best estimated net output under supplied assumptions",
    reasons: [],
    winner: delta > 0n ? "A" : delta < 0n ? "B" : "tie",
    differenceBuyRaw: (delta < 0n ? -delta : delta).toString(),
  };
}

export function swapCostReportJSON(
  a: SwapCostResult,
  b: SwapCostResult,
  comparison: SwapCostComparison,
): string {
  return (
    JSON.stringify(
      {
        calculationVersion: SWAP_COST_VERSION,
        disclaimer: SWAP_COST_DISCLAIMER,
        scenarios: { A: a, B: b },
        comparison,
      },
      null,
      2,
    ) + "\n"
  );
}
