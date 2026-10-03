import {
  OrderBookApi,
  OrderQuoteSideKindSell,
  PriceQuality,
  SigningScheme,
  getQuoteAmountsAndCosts,
} from "@cowprotocol/cow-sdk";
import {
  createPublicClient,
  decodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  http,
  isAddress,
  keccak256,
  parseAbi,
  parseUnits,
  toBytes,
  toHex,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { config, publicRpc } from "./config";
import { COW_RELEASE } from "./execution-preflight";
import {
  assertQuoteMarket,
  assertVerifiedTokenMetadata,
  quoteMarkets,
  type QuoteMarket,
} from "./quote-markets";
import {
  assertQuoteIntent,
  collectQuotes,
  normalizeCowQuote,
  rankQuotedOutput,
  type NormalizedQuote,
  type QuoteIntent,
  type QuoteOutcome,
  type QuoteProvider,
} from "./swap-quotes";
import {
  publicUniswapReadOps,
  uniswapV3QuoteProvider,
  UNISWAP_V3_SEPOLIA_QUOTER_V2,
  type FeeTier,
} from "./uniswap-quote";

const LABEL = "PIT-Q-DIAGNOSTIC-NON-SIGNING-ADDRESS-v1";
export const DIAGNOSTIC_FROM =
  `0x${keccak256(toBytes(LABEL)).slice(-40)}` as Address;
export const DIAGNOSTIC_QUALITY = PriceQuality.VERIFIED;
const quoteAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);
const poolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
]);
export type DiagnosticClass =
  | "CONFIG_INVALID"
  | "CONTEXT_REJECTED"
  | "TOKEN_UNSUPPORTED"
  | "POOL_ABSENT_OR_UNINITIALIZED"
  | "NO_LIQUIDITY"
  | "AMOUNT_BELOW_FEE"
  | "RATE_LIMITED_OR_UNREACHABLE"
  | "INVALID_RESPONSE"
  | "QUOTE_OK"
  | "COMPARISON_OK";

export function classifyDiagnosticError(message: string): DiagnosticClass {
  if (
    /\b429\b|rate.limit|timeout|timed out|\b50[0-9]\b|fetch failed|network/i.test(
      message,
    )
  )
    return "RATE_LIMITED_OR_UNREACHABLE";
  if (
    /from|owner|signer|receiver/i.test(message) &&
    /invalid|reject|unsupported/i.test(message)
  )
    return "CONTEXT_REJECTED";
  if (/token.*unsupported|unsupported.*token/i.test(message))
    return "TOKEN_UNSUPPORTED";
  if (/pool.*(?:absent|uninitialized|does not exist)/i.test(message))
    return "POOL_ABSENT_OR_UNINITIALIZED";
  if (/amount.*(?:below|fee)|fee.*exceed/i.test(message))
    return "AMOUNT_BELOW_FEE";
  if (/liquidity|revert/i.test(message)) return "NO_LIQUIDITY";
  return "INVALID_RESPONSE";
}
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export async function diagnosticCowQuote(
  intent: QuoteIntent,
  getQuote?: OrderBookApi["getQuote"],
) {
  assertQuoteIntent(intent);
  const request = {
    from: DIAGNOSTIC_FROM,
    sellToken: intent.sellToken as Address,
    buyToken: intent.buyToken as Address,
    kind: OrderQuoteSideKindSell.SELL,
    sellAmountBeforeFee: intent.sellAmountText,
    validFor: 1200,
    priceQuality: DIAGNOSTIC_QUALITY,
    signingScheme: SigningScheme.EIP712,
  } as const;
  // The supplied amount must be base units; caller replaces the decimal text.
  const api = new OrderBookApi({
    chainId: 11155111,
    env: "prod",
    baseUrls: { 11155111: COW_RELEASE.api } as never,
  });
  const response = await (getQuote ?? api.getQuote.bind(api))(request);
  const expirationMs = Date.parse(response.expiration);
  if (
    response.verified !== true ||
    response.from?.toLowerCase() !== request.from.toLowerCase() ||
    response.quote.sellToken.toLowerCase() !==
      request.sellToken.toLowerCase() ||
    response.quote.buyToken.toLowerCase() !== request.buyToken.toLowerCase() ||
    response.quote.kind !== "sell" ||
    BigInt(response.quote.sellAmount) + BigInt(response.quote.feeAmount) !==
      BigInt(request.sellAmountBeforeFee) ||
    !Number.isFinite(expirationMs) ||
    expirationMs <= Date.now()
  )
    throw new Error("INVALID_RESPONSE: verified CoW diagnostic quote context");
  const amounts = getQuoteAmountsAndCosts({
    orderParams: response.quote,
    slippagePercentBps: 50,
    partnerFeeBps: 0,
    protocolFeeBps: Number(response.protocolFeeBps ?? "0"),
  });
  const quotedAtMs = Date.now();
  const q = normalizeCowQuote({
    quoteResults: { amountsAndCosts: amounts },
    units: BigInt(request.sellAmountBeforeFee),
    sellDecimals: 18,
    buyDecimals: 6,
    sellToken: request.sellToken,
    buyToken: request.buyToken,
    owner: DIAGNOSTIC_FROM,
    chainId: 11155111,
    obtainedAt: quotedAtMs,
  } as never);
  const normalized: NormalizedQuote = {
    ...q,
    executableThroughPit: false,
    diagnosticOnly: true,
    expiresAtMs: Number.isFinite(expirationMs)
      ? Math.min(quotedAtMs + 60000, expirationMs)
      : quotedAtMs + 60000,
  };
  return { request, response, normalized, amounts };
}

export async function probeDiagnosticMarket(
  market: QuoteMarket = quoteMarkets[0],
  amountIndex = 0,
  dependencies: {
    cow?: typeof diagnosticCowQuote;
    uniswap?: QuoteProvider;
  } = {},
) {
  const startedUtc = new Date().toISOString();
  assertQuoteMarket(market);
  if (
    config.FEES_ENABLED ||
    config.MAINNET_ENABLED ||
    amountIndex < 0 ||
    amountIndex >= market.sellAmounts.length
  )
    throw new Error("CONFIG_INVALID: release flags or amount index");
  const client = createPublicClient({
    chain: sepolia,
    transport: http(publicRpc[11155111][0], { timeout: 12000, retryCount: 0 }),
  });
  let block: Awaited<ReturnType<typeof client.getBlock>> | undefined;
  let tokens: unknown[] = [];
  let metadataError: string | null = null;
  try {
    if ((await client.getChainId()) !== 11155111)
      throw new Error("CONFIG_INVALID: RPC chain");
    block = await client.getBlock();
    tokens = await Promise.all(
      [market.sell, market.buy].map(async (token) => {
        const address = token.address as Address;
        const code = await client.getCode({
          address,
          blockNumber: block!.number!,
        });
        const decimals = await client.readContract({
          address,
          abi: erc20Abi,
          functionName: "decimals",
          blockNumber: block!.number!,
        });
        return {
          address,
          codePresent: !!code && code !== "0x",
          codeKeccak256: code ? `hex:${keccak256(code).slice(2)}` : null,
          decimals: Number(decimals),
        };
      }),
    );
    assertVerifiedTokenMetadata(
      market,
      tokens as Parameters<typeof assertVerifiedTokenMetadata>[1],
    );
  } catch (error) {
    if (errorText(error).startsWith("CONFIG_INVALID")) throw error;
    metadataError = errorText(error);
  }
  const amountText = market.sellAmounts[amountIndex];
  const amount = parseUnits(amountText, market.sell.decimals);
  const intent: QuoteIntent = {
    chainId: 11155111,
    sellToken: market.sell.address,
    buyToken: market.buy.address,
    sellAmountText: amountText,
    direction: "exact-in",
  };
  const raw: Record<string, unknown> = {
    cow: null,
    uniswap: [],
    metadataError,
  };
  const uniswapBase = block ? publicUniswapReadOps(block.number!) : null;
  const uniOps =
    uniswapBase && block
      ? {
          ...uniswapBase,
          exactInputSingle: async (params: {
            tokenIn: Address;
            tokenOut: Address;
            amountIn: bigint;
            fee: FeeTier;
          }) => {
            const data = encodeFunctionData({
              abi: quoteAbi,
              functionName: "quoteExactInputSingle",
              args: [{ ...params, sqrtPriceLimitX96: 0n }],
            });
            try {
              const result = await client.request({
                method: "eth_call",
                params: [
                  { to: UNISWAP_V3_SEPOLIA_QUOTER_V2, data },
                  toHex(block!.number!),
                ],
              });
              const decoded = decodeAbiParameters(
                [
                  { type: "uint256" },
                  { type: "uint160" },
                  { type: "uint32" },
                  { type: "uint256" },
                ],
                result,
              );
              (raw.uniswap as unknown[]).push({
                fee: params.fee,
                request: {
                  to: UNISWAP_V3_SEPOLIA_QUOTER_V2,
                  data,
                  block: toHex(block!.number!),
                },
                response: result,
              });
              return decoded;
            } catch (error) {
              (raw.uniswap as unknown[]).push({
                fee: params.fee,
                error: errorText(error),
              });
              throw error;
            }
          },
        }
      : null;
  const cowProvider: QuoteProvider = {
    id: "cow",
    quote: async () => {
      try {
        const result = await (dependencies.cow ?? diagnosticCowQuote)({
          ...intent,
          sellAmountText: amount.toString(),
        });
        raw.cow = {
          request: result.request,
          response: result.response,
          amounts: result.amounts,
        };
        return result.normalized;
      } catch (error) {
        raw.cow = { error: errorText(error) };
        throw error;
      }
    },
  };
  const uniBase =
    dependencies.uniswap ??
    (uniOps
      ? uniswapV3QuoteProvider(uniOps, market.uniswapFeeTiers)
      : {
          id: "uniswap-v3" as const,
          quote: async () => {
            throw new Error(metadataError ?? "RPC unavailable");
          },
        });
  const uniProvider: QuoteProvider = {
    id: "uniswap-v3",
    quote: async (input) => {
      try {
        return await uniBase.quote(input);
      } catch (error) {
        raw.uniswapProviderError = errorText(error);
        throw error;
      }
    },
  };
  const outcomes: QuoteOutcome[] = await collectQuotes(
    [cowProvider, uniProvider],
    intent,
  );
  const ranking = rankQuotedOutput(outcomes);
  const pool = outcomes.find(
    (outcome) =>
      outcome.provider === "uniswap-v3" && outcome.availability === "available",
  );
  let poolState: unknown = null;
  if (
    block &&
    pool?.availability === "available" &&
    pool.quote.singlePoolAddress &&
    isAddress(pool.quote.singlePoolAddress)
  ) {
    const address = pool.quote.singlePoolAddress as Address;
    try {
      const [slot0, token0, token1, fee] = await Promise.all([
        client.readContract({
          address,
          abi: poolAbi,
          functionName: "slot0",
          blockNumber: block.number!,
        }),
        client.readContract({
          address,
          abi: poolAbi,
          functionName: "token0",
          blockNumber: block.number!,
        }),
        client.readContract({
          address,
          abi: poolAbi,
          functionName: "token1",
          blockNumber: block.number!,
        }),
        client.readContract({
          address,
          abi: poolAbi,
          functionName: "fee",
          blockNumber: block.number!,
        }),
      ]);
      poolState = {
        address,
        token0,
        token1,
        fee,
        initialized: slot0[0] > 0n,
        sqrtPriceX96: slot0[0],
      };
    } catch (error) {
      poolState = { address, error: errorText(error) };
    }
  }
  const classes = outcomes.map((outcome) => ({
    provider: outcome.provider,
    classification:
      outcome.availability === "available"
        ? "QUOTE_OK"
        : classifyDiagnosticError(
            outcome.provider === "cow"
              ? String((raw.cow as { error?: string } | null)?.error ?? "")
              : String(raw.uniswapProviderError ?? ""),
          ),
    availability: outcome.availability,
    error:
      outcome.provider === "cow"
        ? (raw.cow as { error?: string } | null)?.error
        : raw.uniswapProviderError,
  }));
  return {
    status: ranking.comparable ? "COMPARISON_OK" : "BLOCKED",
    startedUtc,
    finishedUtc: new Date().toISOString(),
    marketId: market.id,
    diagnosticFrom: DIAGNOSTIC_FROM,
    requestedQuality: DIAGNOSTIC_QUALITY,
    block: block ? { number: block.number!, hash: block.hash } : null,
    tokens,
    intent,
    outcomes,
    ranking,
    classes,
    poolState,
    raw,
  };
}
