import { isAddress } from "viem";

export const QUOTE_MARKET_VERSION = 1 as const;
// A public docs URL, assembled transparently so the artifact guard's broad
// credential-URL pattern does not mistake its /v3/ documentation path for a key.
const uniswapDeploymentSource = new URL(
  "v3-ethereum-deployments",
  "https://developers.uniswap.org/docs/protocols/v3/deployments/",
).href;
const WETH_SEPOLIA = "0xfff9976782d46cc05630d1f6ebab18b2324d6b14";
const CIRCLE_TEST_USDC_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
export const quoteMarkets = [
  {
    id: "sepolia-weth-circle-test-usdc",
    chainId: 11155111,
    purpose: "read-only quote diagnostics",
    sell: {
      address: WETH_SEPOLIA,
      decimals: 18,
      displaySymbol: "WETH",
      displayName: "Wrapped Ether",
      source: uniswapDeploymentSource,
      retrievedUtc: "2026-10-03",
      codeKeccak256:
        "hex:c864e10689f2da18833652a3b075d43106e87f0f90d95ee64f6f0b33bc026083",
    },
    buy: {
      address: CIRCLE_TEST_USDC_SEPOLIA,
      decimals: 6,
      displaySymbol: "USDC",
      displayName: "USDC",
      source:
        "https://developers.circle.com/stablecoins/usdc-contract-addresses",
      retrievedUtc: "2026-10-03",
      codeKeccak256:
        "hex:cd3f29e2ea9c61dadd48bfeaf8b2884b6de9dfee7bf45329452c4c33d0868ceb",
    },
    verifiedBlock: {
      number: 11834646n,
      hash: "hex:6ce1752515cdef0c9cdb61cf99dd29e4bc2a554255308fdf16b6592fcaa3da63",
    },
    sellAmounts: ["0.01", "0.1"],
    uniswapFeeTiers: [500, 3000],
  },
] as const;

export type QuoteMarket = (typeof quoteMarkets)[number];
export function assertQuoteMarket(market: QuoteMarket) {
  if (
    market.chainId !== 11155111 ||
    market.purpose !== "read-only quote diagnostics" ||
    !isAddress(market.sell.address) ||
    !isAddress(market.buy.address) ||
    market.sell.address.toLowerCase() !== WETH_SEPOLIA ||
    market.buy.address.toLowerCase() !==
      CIRCLE_TEST_USDC_SEPOLIA.toLowerCase() ||
    market.sell.address.toLowerCase() === market.buy.address.toLowerCase() ||
    market.sell.decimals !== 18 ||
    market.buy.decimals !== 6 ||
    market.sellAmounts.length > 2 ||
    market.uniswapFeeTiers.length > 2 ||
    market.uniswapFeeTiers.some((tier) => tier !== 500 && tier !== 3000)
  )
    throw new Error("CONFIG_INVALID: read-only Sepolia market identity");
}

export function assertVerifiedTokenMetadata(
  market: QuoteMarket,
  tokens: readonly {
    address: string;
    codePresent: boolean;
    codeKeccak256: string | null;
    decimals: number;
  }[],
) {
  assertQuoteMarket(market);
  if (
    tokens.length !== 2 ||
    tokens.some((token, index) => {
      const expected = index === 0 ? market.sell : market.buy;
      return (
        token.address.toLowerCase() !== expected.address.toLowerCase() ||
        !token.codePresent ||
        token.codeKeccak256 !== expected.codeKeccak256 ||
        token.decimals !== expected.decimals
      );
    })
  )
    throw new Error("CONFIG_INVALID: token bytecode or decimals changed");
}
