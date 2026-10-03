import { describe, expect, it, vi } from "vitest";
import { getQuoteAmountsAndCosts, OrderKind } from "@cowprotocol/cow-sdk";
import { approveSwap, submitSwap } from "../src/lib/cow";
import {
  assertNormalizedQuote,
  collectQuotes,
  displayQuote,
  NoLiquidityError,
  normalizeCowQuote,
  rankQuotedOutput,
  type NormalizedQuote,
  type QuoteIntent,
  type QuoteProvider,
} from "../src/lib/swap-quotes";
import {
  UNISWAP_V3_SEPOLIA_QUOTER_V2,
  uniswapV3QuoteProvider,
  type UniswapReadOps,
} from "../src/lib/uniswap-quote";

const sell = "0x1111111111111111111111111111111111111111";
const buy = "0x2222222222222222222222222222222222222222";
const intent: QuoteIntent = {
  chainId: 11155111,
  sellToken: sell,
  buyToken: buy,
  sellAmountText: "1",
  direction: "exact-in",
};
const at = Date.now();
function quote(
  provider: "cow" | "uniswap-v3",
  buyAmount: bigint,
  changes: Partial<NormalizedQuote> = {},
): NormalizedQuote {
  return {
    provider,
    availability: "available",
    chainId: 11155111,
    sellToken: sell,
    buyToken: buy,
    direction: "exact-in",
    sellDecimals: 18,
    buyDecimals: 6,
    sellAmount: 10n ** 18n,
    buyAmount,
    minimumReceiveBuyAmount: provider === "cow" ? buyAmount - 1n : null,
    protocolFee: {
      amount: provider === "cow" ? 10n : null,
      token: provider === "cow" ? "buy" : "sell",
      ratePpm: provider === "cow" ? 0 : 3000,
      includedInBuyAmount: true,
    },
    networkCostSellAmount: provider === "cow" ? 10n : null,
    estimatedGasUnits: provider === "cow" ? null : 100000n,
    pitFeeBuyAmount: 0n,
    quotedAtMs: at,
    expiresAtMs: at + 30000,
    executableThroughPit: provider === "cow",
    ...changes,
  };
}
const available = (q: NormalizedQuote) => ({
  provider: q.provider,
  availability: "available" as const,
  quote: q,
});

describe("integer exact-input quote normalization and ranking", () => {
  it("uses the CoW SDK's after-fee output and exact zero-fee helper values", () => {
    const amounts = getQuoteAmountsAndCosts({
      orderParams: {
        kind: OrderKind.SELL,
        sellAmount: "1000000000000000000",
        buyAmount: "2000000",
        feeAmount: "1000000000000000",
      } as any,
      slippagePercentBps: 50,
      partnerFeeBps: 0,
      protocolFeeBps: 15,
    });
    const normalized = normalizeCowQuote({
      quoteResults: { amountsAndCosts: amounts },
      units: 10n ** 18n,
      sellDecimals: 18,
      buyDecimals: 6,
      sellToken: sell,
      buyToken: buy,
      owner: sell,
      chainId: 11155111,
      obtainedAt: at,
    } as never);
    expect(normalized.buyAmount).toBe(amounts.afterPartnerFees.buyAmount);
    expect(normalized.minimumReceiveBuyAmount).toBe(
      amounts.afterSlippage.buyAmount,
    );
    expect(normalized.protocolFee.amount).toBe(
      amounts.costs.protocolFee.amount,
    );
    expect(normalized.networkCostSellAmount).toBe(
      amounts.costs.networkFee.amountInSellCurrency,
    );
    expect(normalized.pitFeeBuyAmount).toBe(0n);
    expect(() =>
      assertNormalizedQuote(normalized, intent, at + 100),
    ).not.toThrow();
    expect(() =>
      normalizeCowQuote({
        quoteResults: {
          amountsAndCosts: {
            ...amounts,
            costs: { ...amounts.costs, partnerFee: { amount: 1n, bps: 1 } },
          },
        },
      } as never),
    ).toThrow(/fee-disabled/);
  });
  it("ranks only exact integer buy output, handles ties and never converts gas into buy token", () => {
    const cow = quote("cow", 9007199254740993n);
    const uni = quote("uniswap-v3", 9007199254740994n);
    const ranked = rankQuotedOutput([available(cow), available(uni)], at + 100);
    expect(ranked.bestProviderIds).toEqual(["uniswap-v3"]);
    expect(displayQuote(uni, at + 100).gas).toContain("100000 gas units");
    expect(displayQuote(uni, at + 100).protocolFee).toContain("0.3%");
    expect(
      rankQuotedOutput(
        [available(cow), available({ ...uni, buyAmount: cow.buyAmount })],
        at + 100,
      ).bestProviderIds,
    ).toEqual(["cow", "uniswap-v3"]);
    expect(
      rankQuotedOutput(
        [
          available(quote("cow", 2000000n)),
          available(quote("uniswap-v3", 2000001n)),
        ],
        at + 100,
      ).bestProviderIds,
    ).toEqual(["uniswap-v3"]);
  });
  it("rejects stale, cross-chain, mismatched assets, malformed integers and precision", () => {
    const base = quote("cow", 100n);
    for (const altered of [
      { chainId: 1 },
      { buyToken: sell },
      { sellAmount: 1n },
      { sellAmount: "100" as never },
      { sellDecimals: 6 },
      { quotedAtMs: at - 70000, expiresAtMs: at + 1000 },
      { pitFeeBuyAmount: 1n },
      { executableThroughPit: false },
    ])
      expect(() =>
        assertNormalizedQuote({ ...base, ...altered }, intent, at),
      ).toThrow();
    expect(() =>
      assertNormalizedQuote(
        base,
        { ...intent, sellAmountText: "1.0000000000000000001" },
        at,
      ),
    ).toThrow();
    expect(
      rankQuotedOutput(
        [
          available(base),
          available(quote("uniswap-v3", 101n, { buyDecimals: 18 })),
        ],
        at,
      ).reason,
    ).toBe("DECIMALS_MISMATCH");
    expect(
      rankQuotedOutput(
        [available(base), available(quote("uniswap-v3", 101n, { chainId: 1 }))],
        at,
      ).reason,
    ).toBe("CHAIN_MISMATCH");
    expect(
      rankQuotedOutput(
        [
          available(base),
          available(
            quote("uniswap-v3", 101n, {
              buyToken: "0x3333333333333333333333333333333333333333",
            }),
          ),
        ],
        at,
      ).reason,
    ).toBe("ASSET_MISMATCH");
    expect(
      rankQuotedOutput(
        [
          available(base),
          available(quote("uniswap-v3", 101n, { sellAmount: 2n })),
        ],
        at,
      ).reason,
    ).toBe("AMOUNT_MISMATCH");
    expect(
      rankQuotedOutput(
        [
          available(base),
          available(quote("uniswap-v3", 101n, { quotedAtMs: at - 11000 })),
        ],
        at,
      ).reason,
    ).toBe("FRESHNESS_SKEW");
    expect(
      rankQuotedOutput(
        [
          available(base),
          available(quote("uniswap-v3", 101n, { expiresAtMs: at - 1 })),
        ],
        at,
      ).fresh,
    ).toHaveLength(1);
  });
  it("isolates timeout, no-liquidity, revert and malformed provider results", async () => {
    const providers: QuoteProvider[] = [
      { id: "cow", quote: async () => quote("cow", 100n) },
      {
        id: "uniswap-v3",
        quote: async () => new Promise<NormalizedQuote>(() => {}),
      },
    ];
    expect((await collectQuotes(providers, intent, 10, () => at))[1]).toEqual({
      provider: "uniswap-v3",
      availability: "unavailable",
      reason: "TIMEOUT",
    });
    providers[1] = {
      id: "uniswap-v3",
      quote: async () => {
        throw new NoLiquidityError();
      },
    };
    expect(
      (await collectQuotes(providers, intent, 10, () => at))[1],
    ).toMatchObject({ availability: "unavailable", reason: "NO_LIQUIDITY" });
    providers[1] = {
      id: "uniswap-v3",
      quote: async () => {
        throw new Error("execution reverted");
      },
    };
    expect(
      (await collectQuotes(providers, intent, 10, () => at))[1],
    ).toMatchObject({ availability: "unavailable", reason: "PROVIDER_ERROR" });
    providers[1] = {
      id: "uniswap-v3",
      quote: async () => quote("uniswap-v3", 0n),
    };
    const outcomes = await collectQuotes(providers, intent, 10, () => at);
    expect(outcomes[0].availability).toBe("available");
    expect(outcomes[1]).toMatchObject({
      availability: "unavailable",
      reason: "MALFORMED_QUOTE",
    });
    providers[1] = {
      id: "uniswap-v3",
      quote: async () =>
        ({ ...quote("uniswap-v3", 100n), protocolFee: undefined }) as never,
    };
    expect(
      (await collectQuotes(providers, intent, 10, () => at))[1],
    ).toMatchObject({ availability: "unavailable", reason: "MALFORMED_QUOTE" });
  });
});

function readOps(overrides: Partial<UniswapReadOps> = {}): UniswapReadOps {
  return {
    chainId: async () => 11155111,
    code: async () => "0x6000",
    decimals: async (token) =>
      token.toLowerCase() === sell.toLowerCase() ? 18 : 6,
    exactInputSingle: async ({ fee }) => [
      fee === 500 ? 2000001n : 2000000n,
      1n,
      0,
      100000n,
    ],
    ...overrides,
  };
}
describe("Uniswap v3 Sepolia read-only adapter", () => {
  it("uses the verified quoter, integer amounts, best valid pool tier and no executable payload", async () => {
    expect(UNISWAP_V3_SEPOLIA_QUOTER_V2).toBe(
      "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
    );
    const sign = vi.fn();
    const sendTransaction = vi.fn();
    const ops = Object.assign(
      readOps({
        exactInputSingle: async ({ fee }) => {
          if (fee === 100) throw new Error("pool missing");
          return [fee === 500 ? 2000001n : 2000000n, 1n, 0, 100000n];
        },
      }),
      { sign, sendTransaction },
    );
    const result = await uniswapV3QuoteProvider(ops).quote(intent);
    expect(result.sellAmount).toBe(10n ** 18n);
    expect(result.buyAmount).toBe(2000001n);
    expect(result.protocolFee).toEqual({
      amount: null,
      token: "sell",
      ratePpm: 500,
      includedInBuyAmount: true,
    });
    expect(result.estimatedGasUnits).toBe(100000n);
    expect(result.pitFeeBuyAmount).toBe(0n);
    expect(result.executableThroughPit).toBe(false);
    expect("calldata" in result).toBe(false);
    expect(sign).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
    await expect(approveSwap(result as never)).rejects.toThrow("QUOTE_EXPIRED");
    await expect(submitSwap(result as never)).rejects.toThrow("QUOTE_EXPIRED");
    expect(sendTransaction).not.toHaveBeenCalled();
  });
  it("fails closed on wrong RPC chain, missing bytecode, bad decimals, no liquidity and malformed data", async () => {
    await expect(
      uniswapV3QuoteProvider(readOps({ chainId: async () => 1 })).quote(intent),
    ).rejects.toThrow(/unavailable/);
    await expect(
      uniswapV3QuoteProvider(readOps({ code: async () => "0x" })).quote(intent),
    ).rejects.toThrow(/unavailable/);
    await expect(
      uniswapV3QuoteProvider(readOps({ decimals: async () => 255 })).quote(
        intent,
      ),
    ).rejects.toThrow(/decimals/);
    await expect(
      uniswapV3QuoteProvider(
        readOps({
          exactInputSingle: async () => {
            throw Error("revert");
          },
        }),
      ).quote(intent),
    ).rejects.toBeInstanceOf(NoLiquidityError);
    await expect(
      uniswapV3QuoteProvider(
        readOps({
          exactInputSingle: async () => {
            throw Error("network unavailable");
          },
        }),
      ).quote(intent),
    ).rejects.toThrow(/read failed/);
    await expect(
      uniswapV3QuoteProvider(
        readOps({ exactInputSingle: async () => [0n, 1n, 0, 1n] }),
      ).quote(intent),
    ).rejects.toThrow(/Malformed/);
    await expect(
      uniswapV3QuoteProvider(readOps()).quote({ ...intent, chainId: 1 }),
    ).rejects.toThrow(/Unsupported/);
  });
});
