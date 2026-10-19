/** Bounded, manual constant-product illustrations. No chain or wallet state. */
import {
  BPS,
  bounded,
  fail,
  field,
  label,
  parse,
  precision,
  SCALE,
} from "./ai-math";

export const AMM_VERSION = "pit.amm-pool-math.local.v1" as const;
export type AmmInput = {
  mode: "reserves" | "swap" | "liquidity";
  token0: string;
  token1: string;
  decimals0: number;
  decimals1: number;
  reserve0: string;
  reserve1: string;
  commonValuePrice?: string;
  direction?: "zero-to-one" | "one-to-zero";
  amountIn?: string;
  feeBps?: string;
  deposit0?: string;
  available1?: string;
  withdrawBps?: string;
};
export type AmmResult = {
  calculationVersion: typeof AMM_VERSION;
  mode: AmmInput["mode"];
  input: AmmInput;
  fields: ReturnType<typeof field>[];
  invariantHumanDecimals: number;
  spotPriceRational: {
    numeratorRaw: string;
    denominatorRaw: string;
    orientation: string;
  };
  reversePriceRational: {
    numeratorRaw: string;
    denominatorRaw: string;
    orientation: string;
  };
  assumptions: string[];
  limitations: string[];
};
const MAX = 10n ** 36n;
const cap = (x: bigint, name: string) => {
  if (x < 0n || x > MAX)
    fail(`${name} is outside the supported bounded range.`);
  return x;
};
const rate = (value: string | undefined, name: string) => {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,4})$/.test(value))
    fail(`${name} needs whole basis points.`);
  const n = BigInt(value!);
  if (n > BPS) fail(`${name} exceeds 10000 bps.`);
  return n;
};
const ratio = (name: string, n: bigint, d: bigint, unit: string) => {
  if (d <= 0n) fail(`${name} has zero denominator.`);
  return field(name, bounded((n * SCALE) / d, name), 18, unit);
};
export function calculateAmm(input: AmmInput): AmmResult {
  const t0 = label(input.token0, "Token0 label");
  const t1 = label(input.token1, "Token1 label");
  if (t0.toLowerCase() === t1.toLowerCase())
    fail("Token labels must differ; labels do not verify asset identity.");
  const d0 = precision(input.decimals0, "Token0 decimals", 36);
  const d1 = precision(input.decimals1, "Token1 decimals", 36);
  const x = cap(parse(input.reserve0, d0, "Token0 reserve"), "Token0 reserve");
  const y = cap(parse(input.reserve1, d1, "Token1 reserve"), "Token1 reserve");
  if (x === 0n || y === 0n)
    fail(
      "Both existing reserves must be positive; an empty pool has no marginal price or proportional share.",
    );
  const fields: AmmResult["fields"] = [];
  const add = (name: string, raw: bigint, decimals: number, unit: string) =>
    fields.push(field(name, bounded(raw, name), decimals, unit));
  const pNum = y * 10n ** BigInt(d0),
    pDen = x * 10n ** BigInt(d1);
  add("reserve0", x, d0, t0);
  add("reserve1", y, d1, t1);
  fields.push(ratio("spotToken1PerToken0", pNum, pDen, `${t1}/${t0}`));
  fields.push(ratio("reverseToken0PerToken1", pDen, pNum, `${t0}/${t1}`));
  // Raw reserve product plus its exact decimal scale preserves the invariant without division.
  add(
    "invariantRawProduct",
    x * y,
    0,
    `raw ${t0}·${t1} units (human scale 10^${d0 + d1})`,
  );
  if (input.mode === "reserves") {
    if (input.commonValuePrice !== undefined && input.commonValuePrice !== "") {
      const price = cap(
        parse(input.commonValuePrice, 18, "Manual token0 price in token1"),
        "Manual price",
      );
      if (price === 0n) fail("Manual valuation price must be positive.");
      const v0 = (x * price * 10n ** BigInt(d1)) / (SCALE * 10n ** BigInt(d0));
      const total = v0 + y;
      add("token0CommonValue", v0, d1, t1);
      add("token1CommonValue", y, d1, t1);
      fields.push(ratio("token0Composition", v0, total, "fraction"));
    }
  } else if (input.mode === "swap") {
    if (input.direction !== "zero-to-one" && input.direction !== "one-to-zero")
      fail("Swap direction is required.");
    const forward = input.direction === "zero-to-one";
    const src = forward ? x : y,
      dst = forward ? y : x;
    const ds = forward ? d0 : d1,
      dd = forward ? d1 : d0;
    const st = forward ? t0 : t1,
      dt = forward ? t1 : t0;
    const amount = cap(
      parse(input.amountIn ?? "", ds, "Input amount"),
      "Input amount",
    );
    if (amount === 0n) fail("Input amount must be positive.");
    const fee = rate(input.feeBps, "Pool fee");
    const effective = (amount * (BPS - fee)) / BPS;
    const out = (dst * effective) / (src + effective);
    const feeFree = (dst * amount) / (src + amount);
    const newSrc = src + amount,
      newDst = dst - out;
    if (newSrc > MAX || out === 0n)
      fail("Modeled output rounds to zero or exceeds bounds.");
    add("inputAmount", amount, ds, st);
    add("effectiveInput", effective, ds, st);
    add("poolFeeRetained", amount - effective, ds, st);
    add("hypotheticalOutput", out, dd, dt);
    add("feeFreeOutput", feeFree, dd, dt);
    fields.push(
      ratio(
        "averageExecutionPrice",
        out * 10n ** BigInt(ds),
        amount * 10n ** BigInt(dd),
        `${dt}/${st}`,
      ),
    );
    // Compare average output per input with the PRE-swap marginal price; fee-free and fee-inclusive stay distinct.
    const spotN = dst * amount,
      spotD = src;
    fields.push(
      ratio("feeFreeReserveImpact", spotN - feeFree * spotD, spotN, "fraction"),
    );
    fields.push(
      ratio("feeInclusiveDeviation", spotN - out * spotD, spotN, "fraction"),
    );
    add("postInputReserve", newSrc, ds, st);
    add("postOutputReserve", newDst, dd, dt);
    add(
      "postInvariantRawProduct",
      newSrc * newDst,
      0,
      `raw ${t0}·${t1} units (human scale 10^${d0 + d1})`,
    );
    fields.push(
      ratio(
        "postMarginalPrice",
        newDst * 10n ** BigInt(ds),
        newSrc * 10n ** BigInt(dd),
        `${dt}/${st}`,
      ),
    );
  } else if (input.mode === "liquidity") {
    const desired = cap(
      parse(input.deposit0 ?? "", d0, "Token0 contribution"),
      "Token0 contribution",
    );
    const available = cap(
      parse(input.available1 ?? "", d1, "Available token1"),
      "Available token1",
    );
    const share = desired < (available * x) / y ? desired : (available * x) / y;
    if (share === 0n)
      fail(
        "Budgets cannot fund one token0 base unit of proportional liquidity.",
      );
    const paired = (share * y) / x; // floors the required token1 to its smallest unit
    if (paired === 0n) fail("Paired token1 contribution rounds to zero.");
    add(
      "requiredPairedToken1ForDesiredToken0",
      (desired * y + x - 1n) / x,
      d1,
      t1,
    );
    add("usedToken0", share, d0, t0);
    add("usedToken1", paired, d1, t1);
    add("unusedToken0", desired - share, d0, t0);
    add("unusedToken1", available - paired, d1, t1);
    add("postDepositReserve0", x + share, d0, t0);
    add("postDepositReserve1", y + paired, d1, t1);
    fields.push(ratio("newProviderShare", share, x + share, "fraction"));
    const withdraw = rate(input.withdrawBps, "Withdrawal share");
    add("withdrawToken0", (x * withdraw) / BPS, d0, t0);
    add("withdrawToken1", (y * withdraw) / BPS, d1, t1);
    add("postWithdrawalReserve0", x - (x * withdraw) / BPS, d0, t0);
    add("postWithdrawalReserve1", y - (y * withdraw) / BPS, d1, t1);
  } else fail("Unsupported AMM mode.");
  return {
    calculationVersion: AMM_VERSION,
    mode: input.mode,
    input,
    fields,
    invariantHumanDecimals: d0 + d1,
    spotPriceRational: {
      numeratorRaw: pNum.toString(),
      denominatorRaw: pDen.toString(),
      orientation: `${t1}/${t0}`,
    },
    reversePriceRational: {
      numeratorRaw: pDen.toString(),
      denominatorRaw: pNum.toString(),
      orientation: `${t0}/${t1}`,
    },
    assumptions: [
      "Manual constant-product reserve model; token1 per token0 orientation.",
      "Swap fee retained in input reserve; integer output rounded down.",
    ],
    limitations: [
      "No live pool, LP mint/burn contract, gas, MEV, slippage guarantee or PIT fee.",
      "Labels are not verified token identities; proportional deposit rounding can leave a sub-unit ratio residual.",
    ],
  };
}
export const ammReportJSON = (result: AmmResult) =>
  JSON.stringify({ ...result, simulated: true }, null, 2);
