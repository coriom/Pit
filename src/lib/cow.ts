import {
  COW_PROTOCOL_SETTLEMENT_CONTRACT_ADDRESS,
  COW_PROTOCOL_VAULT_RELAYER_ADDRESS,
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
import {
  COW_RELEASE,
  executionPreflight,
  releaseFacts,
  requirePredicate,
  verifyWallet,
  verifyAccountingStorage,
} from "./execution-preflight";
function cowFacts() {
  return {
    api: COW_RELEASE.api,
    settlement: COW_PROTOCOL_SETTLEMENT_CONTRACT_ADDRESS[11155111],
    relayer: COW_PROTOCOL_VAULT_RELAYER_ADDRESS[11155111],
  };
}
export async function inspectCow(
  wallet: WalletClient | undefined,
  sellToken: string,
  buyToken: string,
  amount: string,
) {
  executionPreflight({
    ...releaseFacts(wallet),
    protocol: "cow",
    chainId: wallet?.chain?.id,
    cow: cowFacts(),
  });
  await verifyWallet(wallet!);
  const chainId = await wallet!.getChainId();
  executionPreflight({
    ...releaseFacts(wallet),
    protocol: "cow",
    chainId,
    cow: cowFacts(),
  });
  await verifyAccountingStorage();
  requirePredicate(
    isAddress(sellToken) &&
      isAddress(buyToken) &&
      sellToken.toLowerCase() !== buyToken.toLowerCase(),
    "UNSUPPORTED_ASSETS",
  );
  const provider = createPublicClient({
    chain: wallet!.chain,
    transport: custom({ request: wallet!.request }),
  });
  const [
    sellCode,
    buyCode,
    settlementCode,
    relayerCode,
    sellDecimals,
    buyDecimals,
    balance,
    gas,
  ] = await Promise.all([
    provider.getCode({ address: sellToken as `0x${string}` }),
    provider.getCode({ address: buyToken as `0x${string}` }),
    provider.getCode({ address: COW_RELEASE.settlement }),
    provider.getCode({ address: COW_RELEASE.relayer }),
    provider.readContract({
      address: sellToken as `0x${string}`,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    provider.readContract({
      address: buyToken as `0x${string}`,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    provider.readContract({
      address: sellToken as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet!.account!.address],
    }),
    provider.getBalance({ address: wallet!.account!.address }),
  ] as const);
  requirePredicate(
    !!sellCode && sellCode !== "0x" && !!buyCode && buyCode !== "0x",
    "UNSUPPORTED_ASSETS",
  );
  requirePredicate(
    !!settlementCode &&
      settlementCode !== "0x" &&
      !!relayerCode &&
      relayerCode !== "0x",
    "COW_CONFIGURATION",
  );
  requirePredicate(
    /^\d+(\.\d+)?$/.test(amount) &&
      (amount.split(".")[1]?.length ?? 0) <= Number(sellDecimals),
    "INVALID_AMOUNT",
  );
  const units = parseUnits(amount, Number(sellDecimals));
  requirePredicate(units > 0n, "INVALID_AMOUNT");
  requirePredicate(
    units <= BigInt(balance!) && BigInt(gas!) > 0n,
    "INSUFFICIENT_BALANCE",
  );
  const allowance = await provider.readContract({
    address: sellToken as `0x${string}`,
    abi: erc20Abi,
    functionName: "allowance",
    args: [wallet!.account!.address, COW_RELEASE.relayer],
  });
  if (allowance < units) {
    const [estimate, gasPrice] = await Promise.all([
      provider.estimateContractGas({
        account: wallet!.account!.address,
        address: sellToken as `0x${string}`,
        abi: erc20Abi,
        functionName: "approve",
        args: [COW_RELEASE.relayer, units],
      }),
      provider.getGasPrice(),
    ]);
    requirePredicate(gas >= estimate * gasPrice * 2n, "INSUFFICIENT_BALANCE");
  }
  await verifyWallet(wallet!);
  requirePredicate(
    (await wallet!.getChainId()) === COW_RELEASE.chainId,
    "WRONG_CHAIN",
  );
  return {
    provider,
    units,
    sellDecimals: Number(sellDecimals),
    buyDecimals: Number(buyDecimals),
  };
}
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
function cowClient(wallet: WalletClient) {
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
    { orderBookApi: orderbook(COW_RELEASE.chainId) },
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
  const { provider, units, sellDecimals, buyDecimals } = await inspectCow(
    wallet,
    sellToken,
    buyToken,
    amount,
  );
  const { sdk } = cowClient(wallet);
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
  const q = {
    quoteResults: quote.quoteResults,
    units,
    sellDecimals,
    buyDecimals,
    sellToken,
    buyToken,
    owner: wallet.account!.address,
    chainId: wallet.chain!.id,
    obtainedAt: Date.now(),
  };
  executions.set(q, {
    wallet,
    sdk,
    provider,
    post: quote.postSwapOrderFromQuote,
    amount,
  });
  return q;
}
export type SwapQuote = Awaited<ReturnType<typeof quoteSwap>>;
const executions = new WeakMap<
  object,
  {
    wallet: WalletClient;
    sdk: TradingSdk;
    provider: Awaited<ReturnType<typeof inspectCow>>["provider"];
    post: () => Promise<{ orderId: string }>;
    amount: string;
  }
>();
export async function inspectSwap(q: SwapQuote) {
  const execution = executions.get(q);
  requirePredicate(!!execution, "QUOTE_EXPIRED");
  requirePredicate(Date.now() - q.obtainedAt < 60000, "QUOTE_EXPIRED");
  const result = await inspectCow(
    execution.wallet,
    q.sellToken,
    q.buyToken,
    execution.amount,
  );
  requirePredicate(result.units === q.units, "INVALID_AMOUNT");
  requirePredicate(Date.now() - q.obtainedAt < 60000, "QUOTE_EXPIRED");
  return execution;
}
export async function approveSwap(q: SwapQuote) {
  const { sdk, provider } = await inspectSwap(q);
  const allowance = await sdk.getCowProtocolAllowance({
    tokenAddress: q.sellToken,
    owner: q.owner,
  });
  if (allowance >= q.units) return;
  await inspectSwap(q);
  const hash = await sdk.approveCowProtocol({
    tokenAddress: q.sellToken,
    amount: q.units,
    vaultRelayerAddress: COW_RELEASE.relayer,
  });
  const receipt = await provider.waitForTransactionReceipt({
    hash: hash as `0x${string}`,
  });
  if (receipt.status !== "success") throw new Error("Token approval reverted");
}
export async function submitSwap(q: SwapQuote) {
  const execution = await inspectSwap(q);
  return execution.post();
}
export function orderbook(chainId: number) {
  assertTradingChain(chainId);
  requirePredicate(chainId === COW_RELEASE.chainId, "WRONG_CHAIN");
  return new OrderBookApi({
    chainId: 11155111,
    env: "prod",
    baseUrls: { 11155111: COW_RELEASE.api } as never,
  });
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
