import { parseUnits } from "viem";
import { eventsCSV, type TaxlotEvent } from "./events";
import type { DerivativeEvidence } from "./derivative-evidence";

export type CowNetworkFill = Readonly<{
  chainId: 11155111;
  owner: string;
  orderUid: string;
  txHash?: string | null;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  sellAmountBeforeFees: string;
  buyAmount: string;
  blockNumber: number;
  logIndex: number;
}>;
export type Reconciliation = Readonly<{
  status: "MATCH" | "MISSING_RECORD" | "ECONOMIC_MISMATCH" | "CSV_MISMATCH";
  economicDifferences: string[];
  metadataDifferences: string[];
}>;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export function reconcileCow(
  fill: CowNetworkFill,
  stored: TaxlotEvent | undefined,
  csv: string | undefined,
  sellDecimals: number,
  buyDecimals: number,
): Reconciliation {
  const economicDifferences: string[] = [],
    metadataDifferences: string[] = [];
  if (!stored)
    return {
      status: "MISSING_RECORD",
      economicDifferences,
      metadataDifferences,
    };
  if (
    !Number.isInteger(sellDecimals) ||
    !Number.isInteger(buyDecimals) ||
    sellDecimals < 0 ||
    buyDecimals < 0 ||
    sellDecimals > 255 ||
    buyDecimals > 255
  )
    throw new Error("Invalid token decimals");
  const compare = (
    label: string,
    got: string,
    expected: bigint,
    decimals: number,
  ) => {
    try {
      if (parseUnits(got, decimals) !== expected)
        economicDifferences.push(label);
    } catch {
      economicDifferences.push(label);
    }
  };
  const sellAmount = BigInt(fill.sellAmount),
    beforeFees = BigInt(fill.sellAmountBeforeFees),
    buyAmount = BigInt(fill.buyAmount);
  if (sellAmount < beforeFees || beforeFees < 0n || buyAmount < 0n)
    throw new Error("Invalid network fill amounts");
  compare("quantity", stored.quantity, beforeFees, sellDecimals);
  compare(
    "counter_quantity",
    stored.counter_quantity ?? "",
    buyAmount,
    buyDecimals,
  );
  compare(
    "fee_quantity",
    stored.fee[0]?.quantity ?? "",
    sellAmount - beforeFees,
    sellDecimals,
  );
  const sellAsset = `eip155:11155111/erc20:${fill.sellToken.toLowerCase()}`;
  const buyAsset = `eip155:11155111/erc20:${fill.buyToken.toLowerCase()}`;
  if (stored.asset !== sellAsset) economicDifferences.push("asset");
  if (stored.counter_asset !== buyAsset)
    economicDifferences.push("counter_asset");
  if (stored.fee.length !== 1 || stored.fee[0]?.asset !== sellAsset)
    economicDifferences.push("fee_asset");
  const id = `cow:11155111:${fill.orderUid}:${fill.blockNumber}:${fill.logIndex}`;
  if (stored.id !== id) metadataDifferences.push("event_id");
  if (stored.type !== "trade") metadataDifferences.push("event_type");
  if (!same(stored.account, fill.owner)) metadataDifferences.push("account");
  if (stored.txid !== (fill.txHash ?? undefined))
    metadataDifferences.push("settlement_tx_hash");
  if (stored.raw_row_ref !== id) metadataDifferences.push("raw_row_ref");
  if (stored.source !== "pit:cow:11155111") metadataDifferences.push("source");
  if (economicDifferences.length)
    return {
      status: "ECONOMIC_MISMATCH",
      economicDifferences,
      metadataDifferences,
    };
  if (csv !== eventsCSV([stored]))
    return { status: "CSV_MISMATCH", economicDifferences, metadataDifferences };
  return { status: "MATCH", economicDifferences, metadataDifferences };
}
export type HyperliquidNetworkFill = Readonly<{
  account: string;
  fillId: string;
  orderId: string | null;
  market: string;
  side: string;
  size: string;
  price: string;
  fee: string;
  feeAsset: string;
}>;
export function reconcileHyperliquid(
  fill: HyperliquidNetworkFill,
  raw: DerivativeEvidence | undefined,
  taxlotEvents: readonly TaxlotEvent[],
): "RAW_ONLY" | "MISSING_RECORD" | "FALSE_TAXLOT_EVENT" | "EVIDENCE_MISMATCH" {
  if (
    taxlotEvents.some(
      (e) =>
        e.source.toLowerCase().includes("hyperliquid") ||
        e.raw_row_ref === `fill:${fill.fillId}`,
    )
  )
    return "FALSE_TAXLOT_EVENT";
  if (!raw) return "MISSING_RECORD";
  return raw.record_kind === "fill" &&
    raw.protocol === "hyperliquid" &&
    raw.network === "testnet" &&
    raw.taxlot_status === "unsupported_derivative_v1" &&
    same(raw.account, fill.account) &&
    raw.fill_id === fill.fillId &&
    raw.order_id === fill.orderId &&
    raw.market === fill.market &&
    raw.side === fill.side &&
    raw.size === fill.size &&
    raw.price === fill.price &&
    raw.fee?.amount === fill.fee &&
    raw.fee.asset === fill.feeAsset
    ? "RAW_ONLY"
    : "EVIDENCE_MISMATCH";
}
