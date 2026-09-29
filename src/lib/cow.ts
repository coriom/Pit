import {
  TradingSdk,
  OrderBookApi,
  OrderKind,
  buildAppData,
  type SupportedChainId,
  type QuoteAmountsAndCosts,
} from "@cowprotocol/cow-sdk";
import { ViemAdapter } from "@cowprotocol/sdk-viem-adapter";
import {
  createPublicClient,
  custom,
  erc20Abi,
  formatUnits,
  isAddress,
  parseUnits,
  zeroAddress,
  type WalletClient,
} from "viem";
import { assertTradingChain, config } from "./config";
export function partnerFee(
  enabled = config.FEES_ENABLED,
  recipient = config.feeRecipient,
  bps: number = config.partnerFeeBps,
) {
  if (!enabled) return undefined;
  if (!isAddress(recipient) || recipient === zeroAddress)
    throw new Error("Configure a nonzero fee recipient");
  if (!Number.isInteger(bps) || bps < 0 || bps > 100)
    throw new Error("PIT partner fee cap is 100 bps");
  return { volumeBps: bps, recipient };
}
export function cowAppData(
  enabled = config.FEES_ENABLED,
  recipient = config.feeRecipient,
) {
  return buildAppData({
    appCode: config.cowAppCode,
    slippageBps: 50,
    orderClass: "market",
    partnerFee: partnerFee(enabled, recipient),
  });
}
export function cowClient(wallet: WalletClient) {
  if (!wallet.chain || !wallet.account) throw new Error("Connect wallet");
  assertTradingChain(wallet.chain.id);
  const provider = createPublicClient({
    chain: wallet.chain,
    transport: custom({ request: wallet.request }),
  });
  const sdk = new TradingSdk(
    {
      chainId: wallet.chain.id as SupportedChainId,
      appCode: config.cowAppCode,
    },
    {},
    new ViemAdapter({ provider, walletClient: wallet }),
  );
  return { sdk, provider };
}
export async function quoteSwap(
  wallet: WalletClient,
  sellToken: string,
  buyToken: string,
  amount: string,
) {
  if (!wallet.account) throw new Error("Connect wallet");
  if (
    !isAddress(sellToken) ||
    !isAddress(buyToken) ||
    sellToken.toLowerCase() === buyToken.toLowerCase()
  )
    throw new Error("Enter two different ERC20 addresses");
  const { sdk, provider } = cowClient(wallet);
  const [sellDecimals, buyDecimals, balance] = await Promise.all([
    provider.readContract({
      address: sellToken,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    provider.readContract({
      address: buyToken,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    provider.readContract({
      address: sellToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet.account.address],
    }),
  ]);
  if (
    !/^\d+(\.\d+)?$/.test(amount) ||
    (amount.split(".")[1]?.length ?? 0) > sellDecimals
  )
    throw new Error("Invalid amount or excess token precision");
  const units = parseUnits(amount, sellDecimals);
  if (units <= 0n || units > balance)
    throw new Error("Insufficient token balance or invalid amount");
  const quote = await sdk.getQuote({
    kind: OrderKind.SELL,
    sellToken,
    buyToken,
    sellTokenDecimals: sellDecimals,
    buyTokenDecimals: buyDecimals,
    amount: units.toString(),
    slippageBps: 50,
    validFor: 1200,
    partnerFee: partnerFee(),
  });
  return {
    ...quote,
    sdk,
    provider,
    units,
    sellDecimals,
    buyDecimals,
    sellToken,
    buyToken,
    owner: wallet.account.address,
    chainId: wallet.chain!.id,
    obtainedAt: Date.now(),
  };
}
export type SwapQuote = Awaited<ReturnType<typeof quoteSwap>>;
export async function approveSwap(q: SwapQuote) {
  const allowance = await q.sdk.getCowProtocolAllowance({
    tokenAddress: q.sellToken,
    owner: q.owner,
  });
  if (allowance >= q.units) return;
  const hash = await q.sdk.approveCowProtocol({
    tokenAddress: q.sellToken,
    amount: q.units,
  });
  const receipt = await q.provider.waitForTransactionReceipt({
    hash: hash as `0x${string}`,
  });
  if (receipt.status !== "success") throw new Error("Token approval reverted");
}
export function orderbook(chainId: number) {
  assertTradingChain(chainId);
  return new OrderBookApi({ chainId: chainId as SupportedChainId });
}
export function costsDisplay(
  a: QuoteAmountsAndCosts,
  sellDecimals: number,
  buyDecimals: number,
) {
  return {
    "Spot price (buy / sell)": `${formatUnits(a.beforeAllFees.buyAmount, buyDecimals)} / ${formatUnits(a.beforeAllFees.sellAmount, sellDecimals)}`,
    "Protocol fee (buy token)": formatUnits(
      a.costs.protocolFee.amount,
      buyDecimals,
    ),
    "Network cost (sell token)": formatUnits(
      a.costs.networkFee.amountInSellCurrency,
      sellDecimals,
    ),
    "Partner fee (buy token)": formatUnits(
      a.costs.partnerFee.amount,
      buyDecimals,
    ),
    "Minimum receive (buy token)": formatUnits(
      a.afterSlippage.buyAmount,
      buyDecimals,
    ),
  };
}
