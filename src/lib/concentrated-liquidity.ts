/** Continuous, fee-free concentrated-range model with bounded fixed-point roots. */
import {
  bounded,
  fail,
  field,
  label,
  parse,
  precision,
  SCALE,
} from "./ai-math";

export const CL_VERSION = "pit.concentrated-liquidity.local.v1" as const;
export type ClInput = {
  mode: "composition" | "scenario" | "fees";
  token0: string;
  token1: string;
  decimals0: number;
  decimals1: number;
  lowerPrice: string;
  upperPrice: string;
  initialPrice: string;
  futurePrice: string;
  budget0: string;
  budget1: string;
  accruedFee0?: string;
  accruedFee1?: string;
  managementCost1?: string;
  costCoverage?: "known" | "unknown";
};
export type ClResult = {
  calculationVersion: typeof CL_VERSION;
  mode: ClInput["mode"];
  status: "complete" | "incomplete";
  reasons: string[];
  input: ClInput;
  fields: ReturnType<typeof field>[];
  initialRegion: string;
  futureRegion: string;
  assumptions: string[];
  limitations: string[];
};
const MAX = 10n ** 36n;
const PRICE_MAX = 10n ** 30n; // 10^12 token1 per token0, at 18-decimal precision
const PRICE_MIN = 10n ** 6n; // 10^-12 token1 per token0
const Q = SCALE;
const cap = (n: bigint, name: string) => {
  if (n < 0n || n > MAX) fail(`${name} exceeds the bounded model range.`);
  return n;
};
export function integerSquareRoot(n: bigint): bigint {
  if (n < 0n || n > 10n ** 48n) fail("Square-root argument exceeds its bound.");
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  for (let i = 0; i < 256; i++) {
    const next = (x + n / x) >> 1n;
    if (next >= x) return x;
    x = next;
  }
  return fail("Square-root iteration bound exceeded.");
}
const price = (text: string, name: string) => {
  const n = parse(text, 18, name);
  if (n < PRICE_MIN || n > PRICE_MAX)
    fail(`${name} must be between 0.000000000001 and 1000000000000.`);
  return n;
};
const root = (p: bigint) => integerSquareRoot(p * Q);
const region = (q: bigint, a: bigint, b: bigint) =>
  q <= a ? "below-or-at-lower" : q >= b ? "above-or-at-upper" : "within-range";
const amounts = (
  L: bigint,
  q: bigint,
  a: bigint,
  b: bigint,
  d0: number,
  d1: number,
) => {
  const u = q < a ? a : q > b ? b : q;
  return {
    token0: (L * (b - u) * 10n ** BigInt(d0)) / (u * b),
    token1: (L * (u - a) * 10n ** BigInt(d1)) / (Q * Q),
  };
};
const quoteValue = (
  amount0: bigint,
  amount1: bigint,
  p: bigint,
  d0: number,
  d1: number,
) => amount1 + (amount0 * p * 10n ** BigInt(d1)) / (Q * 10n ** BigInt(d0));
const ratio = (name: string, n: bigint, d: bigint, unit: string) => {
  if (d <= 0n) fail(`${name} is undefined for a zero denominator.`);
  return field(name, bounded((n * Q) / d, name), 18, unit);
};
export function calculateConcentrated(input: ClInput): ClResult {
  const t0 = label(input.token0, "Token0 label"),
    t1 = label(input.token1, "Token1 label");
  if (t0.toLowerCase() === t1.toLowerCase())
    fail("Token labels must differ; labels do not verify asset identity.");
  const d0 = precision(input.decimals0, "Token0 decimals", 36),
    d1 = precision(input.decimals1, "Token1 decimals", 36);
  const pa = price(input.lowerPrice, "Lower price"),
    pb = price(input.upperPrice, "Upper price");
  if (pa >= pb) fail("Lower price must be strictly below upper price.");
  const p0 = price(input.initialPrice, "Initial price"),
    p1 = price(input.futurePrice, "Future price");
  const a = root(pa),
    b = root(pb),
    q0 = root(p0),
    q1 = root(p1);
  if (a >= b) fail("Range collapses at the supported square-root precision.");
  const budget0 = cap(
    parse(input.budget0, d0, "Initial token0 budget"),
    "Token0 budget",
  );
  const budget1 = cap(
    parse(input.budget1, d1, "Initial token1 budget"),
    "Token1 budget",
  );
  const u0 = q0 < a ? a : q0 > b ? b : q0;
  const limits: bigint[] = [];
  if (u0 < b) limits.push((budget0 * u0 * b) / ((b - u0) * 10n ** BigInt(d0)));
  if (u0 > a) limits.push((budget1 * Q * Q) / ((u0 - a) * 10n ** BigInt(d1)));
  const L = cap(
    limits.reduce((v, n) => (n < v ? n : v)),
    "Derived liquidity",
  );
  if (L === 0n)
    fail("Initial budgets cannot establish one fixed-point liquidity unit.");
  const initial = amounts(L, q0, a, b, d0, d1),
    future = amounts(L, q1, a, b, d0, d1);
  if (initial.token0 > budget0 || initial.token1 > budget1)
    fail("Derived liquidity exceeds a supplied budget.");
  const lp = quoteValue(future.token0, future.token1, p1, d0, d1);
  const hodl = quoteValue(initial.token0, initial.token1, p1, d0, d1);
  const diff = lp - hodl;
  const fields: ClResult["fields"] = [];
  const add = (name: string, raw: bigint, decimals: number, unit: string) =>
    fields.push(field(name, bounded(raw, name), decimals, unit));
  add("liquidityParameter", L, 18, "illustrative L");
  add("initialToken0", initial.token0, d0, t0);
  add("initialToken1", initial.token1, d1, t1);
  add("unusedToken0", budget0 - initial.token0, d0, t0);
  add("unusedToken1", budget1 - initial.token1, d1, t1);
  add(
    "initialValue",
    quoteValue(initial.token0, initial.token1, p0, d0, d1),
    d1,
    t1,
  );
  add("futureToken0", future.token0, d0, t0);
  add("futureToken1", future.token1, d1, t1);
  add("futureLpValue", lp, d1, t1);
  add("futureHodlValue", hodl, d1, t1);
  add("lpMinusHodl", diff, d1, t1);
  if (hodl > 0n) fields.push(ratio("lpVsHodlFraction", diff, hodl, "fraction"));
  const reasons: string[] = [];
  if (input.mode === "fees") {
    if (input.costCoverage !== "known" && input.costCoverage !== "unknown")
      fail("Cost coverage must be known or unknown.");
    const f0 = cap(
      parse(input.accruedFee0 ?? "", d0, "Accrued token0 fees"),
      "Token0 fees",
    );
    const f1 = cap(
      parse(input.accruedFee1 ?? "", d1, "Accrued token1 fees"),
      "Token1 fees",
    );
    const feeValue = quoteValue(f0, f1, p1, d0, d1);
    add("statedAccruedFeeValue", feeValue, d1, t1);
    add("feeRequirementBeforeCosts", diff < 0n ? -diff : 0n, d1, t1);
    if (input.costCoverage === "known") {
      const cost = cap(
        parse(input.managementCost1 ?? "", d1, "Known management cost"),
        "Management cost",
      );
      add("knownManagementCost", cost, d1, t1);
      add(
        "feeRequirementIncludingCosts",
        (diff < 0n ? -diff : 0n) + cost,
        d1,
        t1,
      );
      add("netLpMinusHodl", diff + feeValue - cost, d1, t1);
    } else
      reasons.push(
        "Management/gas cost is unknown; net break-even assessment is withheld.",
      );
  } else if (input.mode !== "composition" && input.mode !== "scenario")
    fail("Unsupported concentrated-liquidity mode.");
  return {
    calculationVersion: CL_VERSION,
    mode: input.mode,
    status: reasons.length ? "incomplete" : "complete",
    reasons,
    input,
    fields,
    initialRegion: region(q0, a, b),
    futureRegion: region(q1, a, b),
    assumptions: [
      "Continuous, fee-free range model; P is token1 per token0.",
      "Initial L is floored to satisfy both manual token budgets; token amounts floor to raw units.",
    ],
    limitations: [
      "Not Uniswap TickMath, Q64.96, fee growth, execution or a real position.",
      "Manual fees are not forecast; unknown costs prevent a definitive net assessment.",
    ],
  };
}
export const concentratedReportJSON = (result: ClResult) =>
  JSON.stringify({ ...result, simulated: true }, null, 2);
