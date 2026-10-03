import {
  createPublicClient,
  erc20Abi,
  http,
  zeroAddress,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { publicRpc, config } from "./config";
import {
  assertQuoteIntent,
  NoLiquidityError,
  parseExactSellAmount,
  QUOTE_CHAIN_ID,
  type QuoteIntent,
  type QuoteProvider,
  type NormalizedQuote,
} from "./swap-quotes";

// Official Uniswap v3 Ethereum Sepolia deployment table, independently checked with eth_getCode.
export const UNISWAP_V3_SEPOLIA_QUOTER_V2 =
  "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3" as const;
export const UNISWAP_V3_SEPOLIA_FACTORY =
  "0x0227628f3F023bb0B980b67D528571c95c6DaC1c" as const;
export const UNISWAP_V3_FEE_TIERS = [100, 500, 3000, 10000] as const;
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);
const factoryAbi = parseAbi([
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
]);
export type FeeTier = (typeof UNISWAP_V3_FEE_TIERS)[number];
export type UniswapReadOps = Readonly<{
  chainId(): Promise<number>;
  code(address: Address): Promise<Hex | undefined>;
  decimals(token: Address): Promise<number>;
  pool(tokenIn: Address, tokenOut: Address, fee: FeeTier): Promise<Address>;
  exactInputSingle(params: {
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    fee: FeeTier;
  }): Promise<readonly [bigint, bigint, number, bigint]>;
}>;

export function publicUniswapReadOps(blockNumber?: bigint): UniswapReadOps {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(publicRpc[11155111][0]),
  });
  return {
    chainId: () => client.getChainId(),
    code: (address) => client.getCode({ address, blockNumber }),
    decimals: async (token) =>
      Number(
        await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "decimals",
          blockNumber,
        }),
      ),
    pool: (tokenIn, tokenOut, fee) =>
      client.readContract({
        address: UNISWAP_V3_SEPOLIA_FACTORY,
        abi: factoryAbi,
        functionName: "getPool",
        args: [tokenIn, tokenOut, fee],
        blockNumber,
      }),
    exactInputSingle: (params) =>
      client.readContract({
        address: UNISWAP_V3_SEPOLIA_QUOTER_V2,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            amountIn: params.amountIn,
            fee: params.fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
        blockNumber,
      }),
  };
}

export function uniswapV3QuoteProvider(
  ops: UniswapReadOps = publicUniswapReadOps(),
  feeTiers: readonly FeeTier[] = UNISWAP_V3_FEE_TIERS,
): QuoteProvider {
  return {
    id: "uniswap-v3",
    async quote(intent: QuoteIntent): Promise<NormalizedQuote> {
      assertQuoteIntent(intent);
      if (config.FEES_ENABLED) throw new Error("PIT fees must remain disabled");
      const [chainId, code, sellDecimals, buyDecimals] = await Promise.all([
        ops.chainId(),
        ops.code(UNISWAP_V3_SEPOLIA_QUOTER_V2),
        ops.decimals(intent.sellToken as Address),
        ops.decimals(intent.buyToken as Address),
      ]);
      if (chainId !== QUOTE_CHAIN_ID || !code || code === "0x")
        throw new Error("Uniswap Sepolia quoter unavailable");
      if (
        !Number.isInteger(sellDecimals) ||
        sellDecimals < 0 ||
        sellDecimals > 36 ||
        !Number.isInteger(buyDecimals) ||
        buyDecimals < 0 ||
        buyDecimals > 36
      )
        throw new Error("Malformed ERC20 decimals");
      const sellAmount = parseExactSellAmount(
        intent.sellAmountText,
        sellDecimals,
      );
      const results = await Promise.allSettled(
        feeTiers.map(async (fee) => {
          const value = await ops.exactInputSingle({
            tokenIn: intent.sellToken as Address,
            tokenOut: intent.buyToken as Address,
            amountIn: sellAmount,
            fee,
          });
          if (
            !Array.isArray(value) ||
            typeof value[0] !== "bigint" ||
            value[0] <= 0n ||
            typeof value[3] !== "bigint" ||
            value[3] < 0n
          )
            throw new Error("Malformed Uniswap quoter response");
          return { fee, buyAmount: value[0], gasUnits: value[3] };
        }),
      );
      const valid = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      if (!valid.length) {
        if (
          results.some(
            (result) =>
              result.status === "rejected" &&
              result.reason instanceof Error &&
              /Malformed/.test(result.reason.message),
          )
        )
          throw new Error("Malformed Uniswap quoter response");
        if (
          results.every(
            (result) =>
              result.status === "rejected" &&
              result.reason instanceof Error &&
              /revert|pool|liquidity/i.test(result.reason.message),
          )
        )
          throw new NoLiquidityError(
            "No supported Uniswap v3 single-pool quote",
          );
        throw new Error("Uniswap quote provider read failed");
      }
      valid.sort((a, b) =>
        a.buyAmount === b.buyAmount
          ? a.fee - b.fee
          : a.buyAmount > b.buyAmount
            ? -1
            : 1,
      );
      const best = valid[0];
      const pool = await ops.pool(
        intent.sellToken as Address,
        intent.buyToken as Address,
        best.fee,
      );
      if (pool.toLowerCase() === zeroAddress)
        throw new NoLiquidityError("Selected Uniswap v3 pool does not exist");
      const quotedAtMs = Date.now();
      return {
        provider: "uniswap-v3",
        availability: "available",
        chainId: QUOTE_CHAIN_ID,
        sellToken: intent.sellToken,
        buyToken: intent.buyToken,
        direction: "exact-in",
        sellDecimals,
        buyDecimals,
        sellAmount,
        swapInputSellAmount: sellAmount,
        buyAmount: best.buyAmount,
        minimumReceiveBuyAmount: null,
        protocolFee: {
          amount: null,
          token: "sell",
          ratePpm: best.fee,
          includedInBuyAmount: true,
        },
        networkCostSellAmount: null,
        estimatedGasUnits: best.gasUnits,
        gasEstimateScope: "quoter-internal-only",
        singlePoolAddress: pool,
        pitFeeBuyAmount: 0n,
        quotedAtMs,
        expiresAtMs: quotedAtMs + 30000,
        executableThroughPit: false,
      };
    },
  };
}
