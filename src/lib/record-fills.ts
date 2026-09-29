import type { Trade } from "@cowprotocol/cow-sdk";
import { erc20Abi, formatUnits, type PublicClient } from "viem";
import { appendEvent, eventDB, type TaxlotEvent } from "./events";
import { assertNotDerivativeSource } from "./accounting-compatibility";
export async function recordCowFill(
  fill: Trade,
  chainId: number,
  provider: PublicClient,
) {
  assertNotDerivativeSource(fill);
  if (
    !fill ||
    typeof fill.orderUid !== "string" ||
    !fill.orderUid ||
    typeof fill.sellToken !== "string" ||
    typeof fill.buyToken !== "string"
  )
    throw new Error("Invalid CoW trade source");
  const key = `cow:${chainId}:${fill.orderUid}:${fill.blockNumber}:${fill.logIndex}`;
  if (await (await eventDB()).get("events", key)) return false;
  if ((await provider.getChainId()) !== chainId)
    throw new Error("Wallet chain changed during fill sync");
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
  if ((await provider.getChainId()) !== chainId)
    throw new Error("Wallet chain changed during fill sync");
  return appendEvent(event, fill);
}
