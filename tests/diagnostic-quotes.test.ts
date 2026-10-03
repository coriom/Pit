import { expect, it, vi } from "vitest";
import {
  DIAGNOSTIC_FROM,
  DIAGNOSTIC_QUALITY,
  classifyDiagnosticError,
  diagnosticCowQuote,
} from "../src/lib/diagnostic-quotes";
import {
  assertQuoteMarket,
  assertVerifiedTokenMetadata,
  quoteMarkets,
} from "../src/lib/quote-markets";
import {
  assertNormalizedQuote,
  collectQuotes,
  displayQuote,
  rankQuotedOutput,
  type QuoteIntent,
} from "../src/lib/swap-quotes";
import { approveSwap, submitSwap } from "../src/lib/cow";

const market = quoteMarkets[0];
const intent: QuoteIntent = {
  chainId: 11155111,
  sellToken: market.sell.address,
  buyToken: market.buy.address,
  sellAmountText: "0.01",
  direction: "exact-in",
};

it("pins exact read-only Sepolia identities and decimal metadata", () => {
  expect(() => assertQuoteMarket(market)).not.toThrow();
  expect(market.sell.source).toBe(
    "https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments",
  );
  for (const bad of [
    { ...market, chainId: 84532 },
    { ...market, buy: { ...market.buy, address: market.sell.address } },
    { ...market, buy: { ...market.buy, decimals: 18 } },
    { ...market, uniswapFeeTiers: [10000] },
  ])
    expect(() => assertQuoteMarket(bad as never)).toThrow("CONFIG_INVALID");
  expect(DIAGNOSTIC_FROM).toBe("0x6f473606a9053ed49bbaa90c23f689348655c947");
  expect(DIAGNOSTIC_QUALITY).toBe("verified");
  const metadata = [market.sell, market.buy].map((token) => ({
    address: token.address,
    codePresent: true,
    codeKeccak256: token.codeKeccak256,
    decimals: token.decimals,
  }));
  expect(() => assertVerifiedTokenMetadata(market, metadata)).not.toThrow();
  expect(() =>
    assertVerifiedTokenMetadata(market, [
      metadata[0],
      { ...metadata[1], decimals: 18 },
    ]),
  ).toThrow("CONFIG_INVALID");
  expect(() =>
    assertVerifiedTokenMetadata(market, [
      metadata[0],
      { ...metadata[1], codePresent: false },
    ]),
  ).toThrow("CONFIG_INVALID");
});

it("normalizes actual-shaped CoW response as display-only and never promotes it to execution", async () => {
  const getQuote = vi.fn(async (_request?: unknown) => ({
    quote: {
      sellToken: market.sell.address,
      buyToken: market.buy.address,
      receiver: null,
      sellAmount: "9708279395149612",
      buyAmount: "440977303",
      validTo: Math.floor(Date.now() / 1000) + 1200,
      appData: `0x${"0".repeat(64)}`,
      feeAmount: "291720604850388",
      gasAmount: "244203",
      gasPrice: "1194582396",
      sellTokenPrice: "1",
      kind: "sell",
      partiallyFillable: false,
      sellTokenBalance: "erc20",
      buyTokenBalance: "erc20",
      signingScheme: "eip712",
    },
    from: DIAGNOSTIC_FROM,
    expiration: new Date(Date.now() + 120000).toISOString(),
    id: 1657938,
    verified: true,
    protocolFeeBps: "2",
  }));
  const result = await diagnosticCowQuote(
    { ...intent, sellAmountText: "10000000000000000" },
    getQuote as never,
  );
  expect(getQuote).toHaveBeenCalledOnce();
  expect(getQuote.mock.calls[0][0]).toMatchObject({
    from: DIAGNOSTIC_FROM,
    sellAmountBeforeFee: "10000000000000000",
    priceQuality: "verified",
  });
  expect(result.normalized).toMatchObject({
    provider: "cow",
    diagnosticOnly: true,
    executableThroughPit: false,
    sellAmount: 10000000000000000n,
    buyAmount: 440977303n,
    pitFeeBuyAmount: 0n,
  });
  assertNormalizedQuote(result.normalized, intent);
  expect(displayQuote(result.normalized).output).toBe("440.977303");
  await expect(
    diagnosticCowQuote(
      { ...intent, sellAmountText: "10000000000000000" },
      vi.fn(async () => ({ ...(await getQuote()), verified: false })) as never,
    ),
  ).rejects.toThrow("INVALID_RESPONSE");
  await expect(
    diagnosticCowQuote(
      { ...intent, sellAmountText: "10000000000000000" },
      vi.fn(async () => ({
        ...(await getQuote()),
        from: "0x1111111111111111111111111111111111111111",
      })) as never,
    ),
  ).rejects.toThrow("INVALID_RESPONSE");
  await expect(approveSwap(result.normalized as never)).rejects.toThrow(
    "INVALID_EXECUTION_QUOTE",
  );
  await expect(submitSwap(result.normalized as never)).rejects.toThrow(
    "INVALID_EXECUTION_QUOTE",
  );
  // A later wallet connection cannot register this object in CoW's private execution map.
  vi.stubGlobal("location", new URL("http://localhost:4321"));
  await expect(
    approveSwap({ ...result.normalized, executableThroughPit: true } as never),
  ).rejects.toThrow("INVALID_EXECUTION_QUOTE");
  vi.unstubAllGlobals();
});

it("ranks one diagnostic survivor without a winner", async () => {
  const now = Date.now();
  const cow = {
    provider: "cow" as const,
    availability: "available" as const,
    chainId: 11155111,
    sellToken: market.sell.address,
    buyToken: market.buy.address,
    direction: "exact-in" as const,
    sellDecimals: 18,
    buyDecimals: 6,
    sellAmount: 10000000000000000n,
    swapInputSellAmount: 9708279395149612n,
    buyAmount: 440977303n,
    minimumReceiveBuyAmount: 438772417n,
    protocolFee: {
      amount: 88213n,
      token: "buy" as const,
      ratePpm: 200,
      includedInBuyAmount: true as const,
    },
    networkCostSellAmount: 291720604850388n,
    estimatedGasUnits: null,
    gasEstimateScope: "none" as const,
    singlePoolAddress: null,
    pitFeeBuyAmount: 0n,
    quotedAtMs: now,
    expiresAtMs: now + 30000,
    executableThroughPit: false,
    diagnosticOnly: true as const,
  };
  const outcomes = await collectQuotes(
    [
      { id: "cow", quote: async () => cow },
      {
        id: "uniswap-v3",
        quote: async () => {
          throw Error("pool absent");
        },
      },
    ],
    intent,
  );
  expect(outcomes.map((item) => item.availability)).toEqual([
    "available",
    "unavailable",
  ]);
  expect(rankQuotedOutput(outcomes).comparable).toBe(false);
  expect(classifyDiagnosticError("pool absent")).toBe(
    "POOL_ABSENT_OR_UNINITIALIZED",
  );
  expect(classifyDiagnosticError("unsupported token")).toBe(
    "TOKEN_UNSUPPORTED",
  );
  expect(classifyDiagnosticError("invalid from address")).toBe(
    "CONTEXT_REJECTED",
  );
});
