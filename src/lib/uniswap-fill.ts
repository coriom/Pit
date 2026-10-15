import {
  decodeEventLog,
  erc20Abi,
  formatUnits,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { appendEvent, listEvents, eventsCSV, type TaxlotEvent } from "./events";
import { UNISWAP_SEPOLIA, type UniswapExecutionQuote } from "./uniswap-execution";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export type UniswapFillResult = Readonly<{
  event: TaxlotEvent;
  inserted: boolean;
  sellAmount: bigint;
  buyAmount: bigint;
  gasWei: bigint;
  csv: string;
}>;

/** The receipt is the economic source, never the quoted output. */
export async function recordUniswapFill(
  q: UniswapExecutionQuote,
  receipt: TransactionReceipt,
  provider: PublicClient,
): Promise<UniswapFillResult> {
  if (receipt.status !== "success" ||
      (await provider.getChainId()) !== UNISWAP_SEPOLIA.chainId)
    throw new Error("Uniswap settlement is not confirmed on Sepolia");
  const transfers = receipt.logs.flatMap((log) => {
    if (!same(log.address, q.sellToken) && !same(log.address, q.buyToken)) return [];
    try {
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      return event.eventName === "Transfer"
        ? [{ token: log.address, from: event.args.from, to: event.args.to, value: event.args.value }]
        : [];
    } catch { return []; }
  });
  const sell = transfers.filter((t) => same(t.token, q.sellToken) && same(t.from, q.owner));
  const buy = transfers.filter((t) => same(t.token, q.buyToken) && same(t.to, q.owner));
  if (sell.length !== 1 || buy.length !== 1 ||
      sell[0].value !== q.sellAmount || buy[0].value < q.minimumBuy)
    throw new Error("Uniswap receipt transfer economics mismatch");
  const [sellDecimals, buyDecimals, block] = await Promise.all([
    provider.readContract({ address: q.sellToken, abi: erc20Abi, functionName: "decimals" }),
    provider.readContract({ address: q.buyToken, abi: erc20Abi, functionName: "decimals" }),
    provider.getBlock({ blockNumber: receipt.blockNumber }),
  ]);
  if (sellDecimals !== q.normalized.sellDecimals || buyDecimals !== q.normalized.buyDecimals)
    throw new Error("Uniswap token decimals changed");
  const id = `uniswap-v3:11155111:${receipt.transactionHash.toLowerCase()}`;
  const asset = `eip155:11155111/erc20:${q.sellToken.toLowerCase()}`;
  const counterAsset = `eip155:11155111/erc20:${q.buyToken.toLowerCase()}`;
  const event: TaxlotEvent = {
    version: 1, id, type: "trade",
    timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
    sequence: 0, asset, quantity: formatUnits(sell[0].value, sellDecimals),
    counter_asset: counterAsset,
    counter_quantity: formatUnits(buy[0].value, buyDecimals),
    fee: [], source: "pit:uniswap-v3:11155111",
    account: q.owner.toLowerCase(), raw_row_ref: id,
    txid: receipt.transactionHash,
    valuation_note: "Crypto-to-crypto trade; swap pool fee is included in output. Wallet-paid Sepolia gas is separate; no EUR valuation supplied.",
  };
  const gasWei = receipt.gasUsed * receipt.effectiveGasPrice;
  const inserted = await appendEvent(event, {
    kind: "uniswap-v3-settlement", id, txHash: receipt.transactionHash,
    chainId: 11155111, router: q.router, pool: q.pool,
    sellToken: q.sellToken, buyToken: q.buyToken,
    sellAmount: sell[0].value.toString(), buyAmount: buy[0].value.toString(),
    gasWei: gasWei.toString(), pitFee: "0",
  });
  const stored = (await listEvents(q.owner)).find((row) => row.id === id);
  if (!stored || stored.asset !== event.asset || stored.quantity !== event.quantity ||
      stored.counter_asset !== event.counter_asset ||
      stored.counter_quantity !== event.counter_quantity)
    throw new Error("Uniswap persisted economic reconciliation mismatch");
  const csv = eventsCSV([stored]);
  if (!csv.includes(`"${event.quantity}"`) || !csv.includes(`"${event.counter_quantity}"`))
    throw new Error("Uniswap CSV economic reconciliation mismatch");
  return { event: stored, inserted, sellAmount: sell[0].value,
    buyAmount: buy[0].value, gasWei, csv };
}
