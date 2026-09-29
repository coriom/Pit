import type { Trade } from "@cowprotocol/cow-sdk";
import { erc20Abi, formatUnits, type PublicClient } from "viem";
import { appendEvent, eventDB, type TaxlotEvent } from "./events";
import type { readPerps } from "./hyperliquid";
export async function recordCowFill(
  fill: Trade,
  chainId: number,
  provider: PublicClient,
) {
  const key = `cow:${chainId}:${fill.orderUid}:${fill.blockNumber}:${fill.logIndex}`;
  if (await (await eventDB()).get("events", key)) return false;
  const [sellDecimals, buyDecimals, block] = await Promise.all([
    provider.readContract({
      address: fill.sellToken as `0x${string}`,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    provider.readContract({
      address: fill.buyToken as `0x${string}`,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    provider.getBlock({ blockNumber: BigInt(fill.blockNumber) }),
  ]);
  const id = `cow:${chainId}:${fill.orderUid}:${fill.blockNumber}:${fill.logIndex}`;
  const asset = `eip155:${chainId}/erc20:${fill.sellToken.toLowerCase()}`;
  const event: TaxlotEvent = {
    version: 1,
    id,
    type: "trade",
    timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
    sequence: 0,
    asset,
    quantity: formatUnits(BigInt(fill.sellAmountBeforeFees), sellDecimals),
    counter_asset: `eip155:${chainId}/erc20:${fill.buyToken.toLowerCase()}`,
    counter_quantity: formatUnits(BigInt(fill.buyAmount), buyDecimals),
    fee: [
      {
        asset,
        quantity: formatUnits(
          BigInt(fill.sellAmount) - BigInt(fill.sellAmountBeforeFees),
          sellDecimals,
        ),
      },
    ],
    source: `pit:cow:${chainId}`,
    account: fill.owner.toLowerCase(),
    raw_row_ref: id,
    ...(fill.txHash ? { txid: fill.txHash } : {}),
    valuation_note:
      "Crypto-to-crypto trade, including stablecoins. Amounts from executed fill; no EUR valuation supplied.",
  };
  return appendEvent(event, fill);
}
function multiply(a: string, b: string) {
  const da = a.split(".")[1]?.length ?? 0,
    db = b.split(".")[1]?.length ?? 0;
  return formatUnits(
    BigInt(a.replace(".", "")) * BigInt(b.replace(".", "")),
    da + db,
  );
}
type HlFill = Awaited<ReturnType<typeof readPerps>>["fills"][number];
export function perpEvent(fill: HlFill, account: string): TaxlotEvent {
  const id = `hl:testnet:${account.toLowerCase()}:${fill.tid}`;
  return {
    version: 1,
    id,
    type: "trade",
    timestamp: new Date(fill.time).toISOString(),
    sequence: 0,
    asset: `HL-PERP:${fill.coin}:${fill.side}`,
    quantity: fill.sz,
    counter_asset: "USDC-NOTIONAL",
    counter_quantity: multiply(fill.px, fill.sz),
    fee:
      Number(fill.fee) >= 0
        ? [{ asset: fill.feeToken, quantity: fill.fee }]
        : [],
    source: "pit:hyperliquid:testnet:derivative-review",
    account: account.toLowerCase(),
    raw_row_ref: id,
    txid: fill.hash,
    valuation_note: `DERIVATIVE REVIEW ONLY; not a spot acquisition or disposal. Direction=${fill.dir}; closedPnl=${fill.closedPnl}; signed fee=${fill.fee}. Raw fill preserved. Do not import into spot tax calculation.`,
  };
}
export async function recordPerpFills(fills: HlFill[], account: string) {
  for (const fill of fills) await appendEvent(perpEvent(fill, account), fill);
}
