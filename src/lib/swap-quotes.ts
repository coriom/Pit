import { formatUnits, isAddress, parseUnits } from "viem";
import { config } from "./config";
import type { SwapQuote } from "./cow";

export const QUOTE_CHAIN_ID = 11155111;
export const QUOTE_TIMEOUT_MS = 8000;
export const MAX_QUOTE_SKEW_MS = 10000;
export type QuoteProviderId = "cow" | "uniswap-v3";
export type QuoteIntent = Readonly<{
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmountText: string;
  direction: "exact-in";
}>;
export type NormalizedQuote = Readonly<{
  provider: QuoteProviderId;
  availability: "available";
  chainId: number;
  sellToken: string;
  buyToken: string;
  direction: "exact-in";
  sellDecimals: number;
  buyDecimals: number;
  sellAmount: bigint;
  // Same total ERC20 debit budget for every venue. CoW's solver input is lower
  // because the orderbook quote has already removed its network fee.
  swapInputSellAmount: bigint;
  buyAmount: bigint; // Output after known provider/protocol fees, before slippage and wallet gas.
  minimumReceiveBuyAmount: bigint | null;
  protocolFee: Readonly<{
    amount: bigint | null;
    token: "buy" | "sell";
    ratePpm: number | null;
    includedInBuyAmount: true;
  }>;
  networkCostSellAmount: bigint | null;
  estimatedGasUnits: bigint | null;
  gasEstimateScope: "none" | "quoter-internal-only";
  singlePoolAddress: string | null;
  pitFeeBuyAmount: bigint;
  quotedAtMs: number;
  expiresAtMs: number;
  executableThroughPit: boolean;
}>;
export type QuoteUnavailableReason =
  "TIMEOUT" | "NO_LIQUIDITY" | "PROVIDER_ERROR" | "MALFORMED_QUOTE";
export type QuoteOutcome =
  | Readonly<{
      provider: QuoteProviderId;
      availability: "available";
      quote: NormalizedQuote;
    }>
  | Readonly<{
      provider: QuoteProviderId;
      availability: "unavailable";
      reason: QuoteUnavailableReason;
    }>;
export interface QuoteProvider {
  readonly id: QuoteProviderId;
  quote(intent: QuoteIntent): Promise<NormalizedQuote>;
}

export function normalizeCowQuote(q: SwapQuote): NormalizedQuote {
  const a = q.quoteResults.amountsAndCosts;
  if (config.FEES_ENABLED || a.costs.partnerFee.amount !== 0n)
    throw new Error("PIT fee-disabled quote invariant failed");
  if (
    !a.isSell ||
    a.beforeAllFees.sellAmount !== q.units ||
    a.afterNetworkCosts.sellAmount + a.costs.networkFee.amountInSellCurrency !==
      q.units ||
    a.afterPartnerFees.buyAmount !==
      a.afterNetworkCosts.buyAmount - a.costs.partnerFee.amount
  )
    throw new Error("CoW total sell debit or SDK amount stages mismatch");
  return {
    provider: "cow",
    availability: "available",
    chainId: q.chainId,
    sellToken: q.sellToken,
    buyToken: q.buyToken,
    direction: "exact-in",
    sellDecimals: q.sellDecimals,
    buyDecimals: q.buyDecimals,
    sellAmount: a.beforeAllFees.sellAmount,
    swapInputSellAmount: a.afterNetworkCosts.sellAmount,
    buyAmount: a.afterPartnerFees.buyAmount,
    minimumReceiveBuyAmount: a.afterSlippage.buyAmount,
    protocolFee: {
      amount: a.costs.protocolFee.amount,
      token: "buy",
      ratePpm: a.costs.protocolFee.bps * 100,
      includedInBuyAmount: true,
    },
    networkCostSellAmount: a.costs.networkFee.amountInSellCurrency,
    estimatedGasUnits: null,
    gasEstimateScope: "none",
    singlePoolAddress: null,
    pitFeeBuyAmount: a.costs.partnerFee.amount,
    quotedAtMs: q.obtainedAt,
    expiresAtMs: q.obtainedAt + 60000,
    executableThroughPit: true,
  };
}

export function cowQuoteProvider(
  getExistingQuote: (intent: QuoteIntent) => Promise<SwapQuote>,
): QuoteProvider {
  return {
    id: "cow",
    quote: async (intent) => normalizeCowQuote(await getExistingQuote(intent)),
  };
}

export function assertQuoteIntent(intent: QuoteIntent) {
  if (
    config.FEES_ENABLED ||
    config.MAINNET_ENABLED ||
    intent.chainId !== QUOTE_CHAIN_ID ||
    intent.direction !== "exact-in" ||
    !isAddress(intent.sellToken) ||
    !isAddress(intent.buyToken) ||
    intent.sellToken.toLowerCase() === intent.buyToken.toLowerCase() ||
    !/^\d+(?:\.\d+)?$/.test(intent.sellAmountText)
  )
    throw new Error("Unsupported Sepolia exact-input quote intent");
}

export function parseExactSellAmount(text: string, decimals: number): bigint {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 36 ||
    !/^\d+(?:\.\d+)?$/.test(text) ||
    (text.split(".")[1]?.length ?? 0) > decimals
  )
    throw new Error("Mismatched token precision");
  const amount = parseUnits(text, decimals);
  if (amount <= 0n) throw new Error("Invalid integer sell amount");
  return amount;
}

export function assertNormalizedQuote(
  q: NormalizedQuote,
  intent: QuoteIntent,
  now = Date.now(),
) {
  assertQuoteIntent(intent);
  if (!q || !q.protocolFee || !["cow", "uniswap-v3"].includes(q.provider))
    throw new Error("Malformed quote");
  if (
    q.availability !== "available" ||
    q.chainId !== intent.chainId ||
    q.direction !== intent.direction ||
    q.sellToken.toLowerCase() !== intent.sellToken.toLowerCase() ||
    q.buyToken.toLowerCase() !== intent.buyToken.toLowerCase() ||
    !Number.isInteger(q.sellDecimals) ||
    q.sellDecimals < 0 ||
    q.sellDecimals > 36 ||
    !Number.isInteger(q.buyDecimals) ||
    q.buyDecimals < 0 ||
    q.buyDecimals > 36 ||
    typeof q.sellAmount !== "bigint" ||
    typeof q.swapInputSellAmount !== "bigint" ||
    typeof q.buyAmount !== "bigint" ||
    q.sellAmount <= 0n ||
    q.swapInputSellAmount <= 0n ||
    q.swapInputSellAmount > q.sellAmount ||
    q.buyAmount <= 0n ||
    !Number.isSafeInteger(q.quotedAtMs) ||
    !Number.isSafeInteger(q.expiresAtMs) ||
    q.quotedAtMs > now + 1000 ||
    q.expiresAtMs <= now ||
    q.expiresAtMs <= q.quotedAtMs ||
    now - q.quotedAtMs > 60000 ||
    q.expiresAtMs - q.quotedAtMs > 60000 ||
    q.pitFeeBuyAmount !== 0n ||
    (q.minimumReceiveBuyAmount !== null &&
      (typeof q.minimumReceiveBuyAmount !== "bigint" ||
        q.minimumReceiveBuyAmount < 0n ||
        q.minimumReceiveBuyAmount > q.buyAmount)) ||
    (q.networkCostSellAmount !== null &&
      (typeof q.networkCostSellAmount !== "bigint" ||
        q.networkCostSellAmount < 0n)) ||
    (q.estimatedGasUnits !== null &&
      (typeof q.estimatedGasUnits !== "bigint" || q.estimatedGasUnits < 0n)) ||
    !["none", "quoter-internal-only"].includes(q.gasEstimateScope) ||
    (q.singlePoolAddress !== null && !isAddress(q.singlePoolAddress)) ||
    (q.protocolFee.amount !== null &&
      (typeof q.protocolFee.amount !== "bigint" ||
        q.protocolFee.amount < 0n)) ||
    !["buy", "sell"].includes(q.protocolFee.token) ||
    q.protocolFee.includedInBuyAmount !== true ||
    (q.protocolFee.ratePpm !== null &&
      (!Number.isInteger(q.protocolFee.ratePpm) ||
        q.protocolFee.ratePpm < 0 ||
        q.protocolFee.ratePpm > 1000000)) ||
    q.executableThroughPit !== (q.provider === "cow") ||
    (q.provider === "cow" &&
      (q.protocolFee.amount === null ||
        q.protocolFee.token !== "buy" ||
        q.networkCostSellAmount === null ||
        q.minimumReceiveBuyAmount === null ||
        q.swapInputSellAmount + q.networkCostSellAmount !== q.sellAmount ||
        q.estimatedGasUnits !== null ||
        q.gasEstimateScope !== "none" ||
        q.singlePoolAddress !== null)) ||
    (q.provider === "uniswap-v3" &&
      (q.protocolFee.amount !== null ||
        q.protocolFee.token !== "sell" ||
        q.protocolFee.ratePpm === null ||
        q.estimatedGasUnits === null ||
        q.gasEstimateScope !== "quoter-internal-only" ||
        q.swapInputSellAmount !== q.sellAmount ||
        q.networkCostSellAmount !== null ||
        !q.singlePoolAddress ||
        q.minimumReceiveBuyAmount !== null))
  )
    throw new Error("Malformed or stale quote");
  const expectedAmount = parseExactSellAmount(
    intent.sellAmountText,
    q.sellDecimals,
  );
  if (q.sellAmount !== expectedAmount)
    throw new Error("Mismatched integer sell amount");
}

export class NoLiquidityError extends Error {}
export class QuoteTimeoutError extends Error {}
export async function collectQuotes(
  providers: readonly QuoteProvider[],
  intent: QuoteIntent,
  timeoutMs = QUOTE_TIMEOUT_MS,
  now = () => Date.now(),
): Promise<QuoteOutcome[]> {
  assertQuoteIntent(intent);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error("Invalid quote timeout");
  return Promise.all(
    providers.map(async (provider): Promise<QuoteOutcome> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const quote = await Promise.race([
          provider.quote(intent),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new QuoteTimeoutError()),
              timeoutMs,
            );
          }),
        ]);
        if (quote.provider !== provider.id)
          throw new Error("Provider identity mismatch");
        assertNormalizedQuote(quote, intent, now());
        return { provider: provider.id, availability: "available", quote };
      } catch (error) {
        const reason: QuoteUnavailableReason =
          error instanceof QuoteTimeoutError
            ? "TIMEOUT"
            : error instanceof NoLiquidityError
              ? "NO_LIQUIDITY"
              : error instanceof Error &&
                  /Malformed|Mismatched|identity/.test(error.message)
                ? "MALFORMED_QUOTE"
                : "PROVIDER_ERROR";
        return { provider: provider.id, availability: "unavailable", reason };
      } finally {
        if (timer) clearTimeout(timer);
      }
    }),
  );
}

export type QuoteRanking = Readonly<{
  comparable: boolean;
  reason:
    | "NONE"
    | "CHAIN_MISMATCH"
    | "ASSET_MISMATCH"
    | "DIRECTION_MISMATCH"
    | "DECIMALS_MISMATCH"
    | "AMOUNT_MISMATCH"
    | "FRESHNESS_SKEW";
  fresh: readonly NormalizedQuote[];
  bestProviderIds: readonly QuoteProviderId[];
}>;
export function rankQuotedOutput(
  outcomes: readonly QuoteOutcome[],
  now = Date.now(),
): QuoteRanking {
  const fresh = outcomes.flatMap((outcome) =>
    outcome.availability === "available" &&
    outcome.quote.quotedAtMs <= now + 1000 &&
    outcome.quote.expiresAtMs > now &&
    now - outcome.quote.quotedAtMs <= 60000
      ? [outcome.quote]
      : [],
  );
  if (fresh.length < 2)
    return { comparable: false, reason: "NONE", fresh, bestProviderIds: [] };
  const first = fresh[0];
  if (fresh.some((q) => q.chainId !== first.chainId))
    return {
      comparable: false,
      reason: "CHAIN_MISMATCH",
      fresh,
      bestProviderIds: [],
    };
  if (fresh.some((q) => q.direction !== first.direction))
    return {
      comparable: false,
      reason: "DIRECTION_MISMATCH",
      fresh,
      bestProviderIds: [],
    };
  if (
    fresh.some(
      (q) =>
        q.sellToken.toLowerCase() !== first.sellToken.toLowerCase() ||
        q.buyToken.toLowerCase() !== first.buyToken.toLowerCase(),
    )
  )
    return {
      comparable: false,
      reason: "ASSET_MISMATCH",
      fresh,
      bestProviderIds: [],
    };
  if (
    fresh.some(
      (q) =>
        q.sellDecimals !== first.sellDecimals ||
        q.buyDecimals !== first.buyDecimals,
    )
  )
    return {
      comparable: false,
      reason: "DECIMALS_MISMATCH",
      fresh,
      bestProviderIds: [],
    };
  if (fresh.some((q) => q.sellAmount !== first.sellAmount))
    return {
      comparable: false,
      reason: "AMOUNT_MISMATCH",
      fresh,
      bestProviderIds: [],
    };
  if (
    Math.max(...fresh.map((q) => q.quotedAtMs)) -
      Math.min(...fresh.map((q) => q.quotedAtMs)) >
    MAX_QUOTE_SKEW_MS
  )
    return {
      comparable: false,
      reason: "FRESHNESS_SKEW",
      fresh,
      bestProviderIds: [],
    };
  const maximum = fresh.reduce(
    (best, q) => (q.buyAmount > best ? q.buyAmount : best),
    0n,
  );
  return {
    comparable: true,
    reason: "NONE",
    fresh,
    bestProviderIds: fresh
      .filter((q) => q.buyAmount === maximum)
      .map((q) => q.provider),
  };
}

export function displayQuote(q: NormalizedQuote, now = Date.now()) {
  return {
    budget: formatUnits(q.sellAmount, q.sellDecimals),
    swapInput: formatUnits(q.swapInputSellAmount, q.sellDecimals),
    pool:
      q.singlePoolAddress === null
        ? "CoW solver route; not a single Uniswap pool"
        : `${q.sellToken} → ${q.buyToken} via ${q.singlePoolAddress} (one v3 pool; no route search)`,
    output: formatUnits(q.buyAmount, q.buyDecimals),
    protocolFee:
      q.protocolFee.amount === null
        ? `Pool fee tier ${formatUnits(BigInt(q.protocolFee.ratePpm ?? 0), 4)}% of input; included in output`
        : `${formatUnits(q.protocolFee.amount, q.buyDecimals)} buy token; included in output`,
    gas:
      q.estimatedGasUnits === null
        ? "Wallet approval gas unknown; solver network fee is embedded in output"
        : `${q.estimatedGasUnits} gas units (QuoterV2 internal estimate only; wallet swap/approval gas unknown)`,
    networkCost:
      q.networkCostSellAmount === null
        ? "No solver fee quoted; wallet gas paid separately and unknown"
        : `${formatUnits(q.networkCostSellAmount, q.sellDecimals)} sell token (solver cost embedded in output)`,
    pitFee: `${formatUnits(q.pitFeeBuyAmount, q.buyDecimals)} buy token`,
    age: `${Math.max(0, Math.floor((now - q.quotedAtMs) / 1000))}s / ${q.expiresAtMs > now ? "fresh" : "expired"}`,
  };
}
