/** Long-only spot arithmetic from manual prices and quote-unit fees. No order path. */
import {
  BPS,
  SCALE,
  AiInputError,
  bps,
  bounded,
  ceilDiv,
  fail,
  field,
  floorDiv,
  label,
  parse,
  positive,
  pow10,
  precision,
  roundHalfUp,
  type AiField,
} from "./ai-math";

export const TRADE_RISK_VERSION = "pit.trade-risk.local.v1" as const;
export type Fill = { quantity: string; price: string; feeQuote: string };
type Shared = {
  baseLabel: string;
  quoteLabel: string;
  baseDecimals: number;
  quoteDecimals: number;
};
type Fees = {
  entryFeeBps: string;
  exitFeeBps: string;
  entryFixedFeeQuote: string;
  exitFixedFeeQuote: string;
};
export type TradeRiskInput =
  | (Shared & {
      mode: "average";
      fills: Fill[];
      exitFeeBps: string;
      exitFixedFeeQuote: string;
    })
  | (Shared &
      Fees & {
        mode: "risk";
        entryPrice: string;
        stopPrice: string;
        quantity: string;
        lossBudgetQuote: string;
      })
  | (Shared &
      Fees & {
        mode: "reward";
        entryPrice: string;
        stopPrice: string;
        targetPrice: string;
        quantity: string;
      });
export type TradeRiskResult = {
  calculationVersion: typeof TRADE_RISK_VERSION;
  mode: TradeRiskInput["mode"];
  status: "complete" | "incomplete";
  reasons: string[];
  input: TradeRiskInput;
  fields: AiField[];
  assumptions: string[];
  limitations: string[];
};
export { AiInputError as TradeRiskInputError };

const MAX_FILLS = 10;
const labels = (input: Shared) => {
  const base = label(input.baseLabel, "Base asset"),
    quote = label(input.quoteLabel, "Quote unit");
  if (base.toLowerCase() === quote.toLowerCase())
    fail("Base and quote labels must differ.");
  const baseDecimals = precision(
    input.baseDecimals,
    "Base quantity decimals",
    36,
  );
  const quoteDecimals = precision(
    input.quoteDecimals,
    "Quote unit decimals",
    18,
  );
  return {
    base,
    quote,
    baseDecimals,
    quoteDecimals,
    baseScale: pow10(baseDecimals),
    quoteScale: pow10(quoteDecimals),
  };
};
const outcome = (
  input: TradeRiskInput,
  fields: AiField[],
  reasons: string[],
): TradeRiskResult => ({
  calculationVersion: TRADE_RISK_VERSION,
  mode: input.mode,
  status: reasons.length ? "incomplete" : "complete",
  reasons,
  input,
  fields,
  assumptions: [
    "Long-only spot; all prices and fees are manual and share one declared quote unit.",
    "The stop and target are hypothetical execution prices, not guarantees.",
  ],
  limitations: [
    "Not Taxlot cost basis, a quote, an order or a maximum real-world loss.",
    "Other fees, gaps, slippage and price changes are excluded.",
  ],
});
const quoteFee = (value: string, decimals: number, name: string) =>
  value.trim() === "" ? null : parse(value, decimals, name);
const rate = (value: string, name: string) =>
  value.trim() === "" ? null : bps(value, name);
const priceField = (name: string, raw: bigint, base: string, quote: string) =>
  field(name, raw, 18, `${quote}/${base} (manual)`);
const signedFloor = (n: bigint, d: bigint) =>
  n < 0n ? -ceilDiv(-n, d) : floorDiv(n, d);

export function calculateTradeRisk(input: TradeRiskInput): TradeRiskResult {
  const { base, quote, baseDecimals, quoteDecimals, baseScale, quoteScale } =
    labels(input);
  const quantityField = (name: string, raw: bigint) =>
    field(name, raw, baseDecimals, `${base} (manual)`);
  const quoteField = (name: string, raw: bigint) =>
    field(name, raw, quoteDecimals, `${quote} (manual)`);
  if (input.mode === "average") {
    if (
      !Array.isArray(input.fills) ||
      input.fills.length < 1 ||
      input.fills.length > MAX_FILLS
    )
      fail(`Enter between 1 and ${MAX_FILLS} purchase fills.`);
    let qty = 0n,
      grossNumerator = 0n,
      entryFees = 0n;
    const reasons: string[] = [];
    for (const [index, fill] of input.fills.entries()) {
      if (!fill || typeof fill !== "object")
        fail(`Fill ${index + 1} is invalid.`);
      const q = positive(
        parse(fill.quantity, baseDecimals, `Fill ${index + 1} quantity`),
        "Fill quantity",
      );
      const p = positive(
        parse(fill.price, quoteDecimals, `Fill ${index + 1} price`),
        "Fill price",
      );
      qty = bounded(qty + q, "Total quantity");
      grossNumerator = bounded(
        grossNumerator + q * p,
        "Gross purchase numerator",
      );
      const fee = quoteFee(
        fill.feeQuote,
        quoteDecimals,
        `Fill ${index + 1} quote fee`,
      );
      if (fee === null)
        reasons.push(`Fill ${index + 1} quote-unit fee is unknown.`);
      else entryFees = bounded(entryFees + fee, "Acquisition fees");
    }
    const grossCost = bounded(ceilDiv(grossNumerator, baseScale), "Gross cost");
    const grossAverage = bounded(
      floorDiv(grossNumerator * SCALE, qty * quoteScale),
      "Gross average price",
    );
    const fields = [
      quantityField("grossQuantity", qty),
      quoteField("grossCost", grossCost),
      priceField("grossAveragePrice", grossAverage, base, quote),
    ];
    const exitBps = rate(input.exitFeeBps, "Exit fee rate");
    const exitFixed = quoteFee(
      input.exitFixedFeeQuote,
      quoteDecimals,
      "Fixed exit fee",
    );
    if (exitBps === null) reasons.push("Proportional exit fee is unknown.");
    if (exitFixed === null) reasons.push("Fixed exit fee is unknown.");
    if (reasons.length || exitBps === null || exitFixed === null)
      return outcome(input, fields, reasons);
    if (exitBps === BPS)
      fail("A 100% exit fee has no finite break-even price.");
    const adjustedCost = bounded(
      grossCost + entryFees,
      "Adjusted acquisition cost",
    );
    const adjustedAverage = bounded(
      ceilDiv(adjustedCost * baseScale * SCALE, qty * quoteScale),
      "Adjusted average price",
    );
    const neededGrossExit = ceilDiv(
      (adjustedCost + exitFixed) * BPS,
      BPS - exitBps,
    );
    const breakEvenPriceBaseRaw = bounded(
      ceilDiv(neededGrossExit * baseScale, qty),
      "Break-even price",
    );
    fields.push(
      quoteField("entryFees", entryFees),
      quoteField("adjustedCost", adjustedCost),
      priceField("adjustedAveragePrice", adjustedAverage, base, quote),
      field(
        "breakEvenPrice",
        breakEvenPriceBaseRaw,
        quoteDecimals,
        `${quote}/${base} (manual)`,
      ),
    );
    return outcome(input, fields, []);
  }
  if (input.mode !== "risk" && input.mode !== "reward")
    fail("Unsupported trade-risk mode.");
  const entry = positive(
    parse(input.entryPrice, quoteDecimals, "Entry price"),
    "Entry price",
  );
  const stop = positive(
    parse(input.stopPrice, quoteDecimals, "Stop price"),
    "Stop price",
  );
  if (stop >= entry) fail("A long-only stop must be below entry price.");
  const qty = positive(
    parse(input.quantity, baseDecimals, "Position quantity"),
    "Position quantity",
  );
  const fields = [
    quoteField("stopDistance", entry - stop),
    field(
      "stopDistanceBps",
      roundHalfUp((entry - stop) * BPS * SCALE, entry),
      18,
      "bps of entry price",
    ),
    quantityField("positionQuantity", qty),
  ];
  const reasons: string[] = [];
  const entryBps = rate(input.entryFeeBps, "Entry fee rate");
  const exitBps = rate(input.exitFeeBps, "Exit fee rate");
  const entryFixed = quoteFee(
    input.entryFixedFeeQuote,
    quoteDecimals,
    "Fixed entry fee",
  );
  const exitFixed = quoteFee(
    input.exitFixedFeeQuote,
    quoteDecimals,
    "Fixed exit fee",
  );
  if (entryBps === null) reasons.push("Entry fee rate is unknown.");
  if (exitBps === null) reasons.push("Exit fee rate is unknown.");
  if (entryFixed === null) reasons.push("Fixed entry fee is unknown.");
  if (exitFixed === null) reasons.push("Fixed exit fee is unknown.");
  if (input.mode === "risk")
    positive(
      parse(input.lossBudgetQuote, quoteDecimals, "Loss budget"),
      "Loss budget",
    );
  if (input.mode === "reward") {
    const target = positive(
      parse(input.targetPrice, quoteDecimals, "Target price"),
      "Target price",
    );
    if (target <= entry) fail("A long-only target must be above entry price.");
  }
  if (
    reasons.length ||
    entryBps === null ||
    exitBps === null ||
    entryFixed === null ||
    exitFixed === null
  )
    return outcome(input, fields, reasons);
  const fixed = bounded(entryFixed + exitFixed, "Fixed fees");
  const denominator = baseScale * BPS;
  const riskNumerator = entry * (BPS + entryBps) - stop * (BPS - exitBps);
  const loss = bounded(
    ceilDiv(qty * riskNumerator, denominator) + fixed,
    "Modeled stop loss",
  );
  fields.push(
    quoteField("fixedFees", fixed),
    quoteField("modeledStopLoss", loss),
  );
  if (input.mode === "risk") {
    const budget = parse(input.lossBudgetQuote, quoteDecimals, "Loss budget");
    const available = budget > fixed ? budget - fixed : 0n;
    const maxQty = bounded(
      floorDiv(available * denominator, riskNumerator),
      "Supported quantity",
    );
    fields.push(
      quoteField("lossBudget", budget),
      quantityField("supportedQuantity", maxQty),
    );
    return outcome(input, fields, []);
  }
  const target = parse(input.targetPrice, quoteDecimals, "Target price");
  const rewardNumerator = target * (BPS - exitBps) - entry * (BPS + entryBps);
  const reward = bounded(
    signedFloor(qty * rewardNumerator, denominator) - fixed,
    "Modeled target reward",
  );
  const ratio = bounded(signedFloor(reward * SCALE, loss), "Reward/risk ratio");
  fields.push(
    quoteField("modeledTargetReward", reward),
    field("rewardRiskRatio", ratio, 18, "R (signed)"),
  );
  return outcome(input, fields, []);
}

export const tradeRiskReportJSON = (value: TradeRiskResult) =>
  JSON.stringify(
    {
      ...value,
      simulated: true,
      disclaimer:
        "Manual long-only spot scenario, not a quote, tax-lot statement or guaranteed stop loss.",
    },
    null,
    2,
  ) + "\n";
