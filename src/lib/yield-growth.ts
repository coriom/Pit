/** Bounded deterministic fixed-point yield scenarios; no live rates or implicit clock. */
import { formatRaw, parseExactAmount, SwapCostInputError } from "./swap-cost";

export const YIELD_GROWTH_VERSION = "pit.yield-growth.local.v1" as const;
export type YieldMode =
  | "apr-to-apy"
  | "apy-to-apr"
  | "periodic-to-annual"
  | "simple"
  | "compound"
  | "contributions"
  | "required-principal"
  | "recovery";
export type YieldInput =
  | { mode: "apr-to-apy"; aprPercent: string; periodsPerYear: number }
  | { mode: "apy-to-apr"; apyPercent: string; periodsPerYear: number }
  | {
      mode: "periodic-to-annual";
      periodicPercent: string;
      periodsPerYear: number;
    }
  | {
      mode: "simple";
      principal: string;
      annualRatePercent: string;
      years: number;
      currency: string;
    }
  | {
      mode: "compound";
      principal: string;
      nominalAprPercent: string;
      periodsPerYear: number;
      years: number;
      currency: string;
    }
  | {
      mode: "contributions";
      principal: string;
      contribution: string;
      timing: "beginning" | "end";
      nominalAprPercent: string;
      periodsPerYear: number;
      years: number;
      currency: string;
    }
  | {
      mode: "required-principal";
      annualIncome: string;
      effectiveApyPercent: string;
      currency: string;
    }
  | { mode: "recovery"; lossPercent: string };
export type YieldField = {
  name: string;
  raw: string;
  unit:
    | "money"
    | "nominal-apr"
    | "effective-apy"
    | "periodic-rate"
    | "percentage"
    | "count";
  decimals: number;
  display: string;
};
export type YieldResult = {
  calculationVersion: typeof YIELD_GROWTH_VERSION;
  mode: YieldMode;
  input: YieldInput;
  fields: YieldField[];
  currency: string | null;
  rounding: string;
  limitations: string;
};
export class YieldInputError extends Error {
  readonly name = "YieldInputError";
}
const SCALE = 10n ** 18n;
const HI = 10n ** 36n;
const MAX = 10n ** 72n;
const roundDiv = (n: bigint, d: bigint) =>
  n < 0n ? -((-n + d / 2n) / d) : (n + d / 2n) / d;
const ceilDiv = (n: bigint, d: bigint) => (n + d - 1n) / d;
const fail = (message: string): never => {
  throw new YieldInputError(message);
};
const parse = (text: string, places: number, label: string): bigint => {
  try {
    return parseExactAmount(text, places, label);
  } catch (error) {
    if (error instanceof SwapCostInputError) fail(error.message);
    throw error;
  }
};
const bounded = (value: bigint) => {
  if (value > MAX || value < -MAX)
    fail("Modeled value exceeds the bounded calculation range.");
  return value;
};
const integer = (value: number, label: string, max: number) => {
  if (!Number.isSafeInteger(value) || value < 1 || value > max)
    fail(`${label} must be a whole number from 1 to ${max}.`);
  return value;
};
const money = (value: string, label: string) => {
  const raw = parse(value, 18, label);
  return bounded(raw);
};
const currency = (value: string) => {
  const text = value.trim();
  if (!/^[A-Za-z][A-Za-z0-9._:-]{0,31}$/.test(text))
    fail(
      "Enter a manual currency label; no asset identity or price is verified.",
    );
  return text;
};
/** Raw ratio uses 10^18. Human percent has at most 16 fractional digits. */
export function signedPercentRaw(
  value: string,
  label: string,
  allowMinus = true,
): bigint {
  const negative = value.startsWith("-");
  if (negative && !allowMinus) fail(`${label} must be nonnegative.`);
  const raw = parse(negative ? value.slice(1) : value, 16, label);
  const signed = negative ? -raw : raw;
  if (signed < -SCALE || signed > 10n * SCALE)
    fail(`${label} must be between -100% and 1000%.`);
  return signed;
}
const factorForNominal = (apr: bigint, frequency: number) => {
  const factor = HI + roundDiv(apr * HI, SCALE * BigInt(frequency));
  if (factor < 0n) fail("Compounding factor cannot be negative.");
  return factor;
};
const mulFixed = (a: bigint, b: bigint) => bounded(roundDiv(a * b, HI));
function powerFixed(factor: bigint, periods: number): bigint {
  let result = HI,
    base = factor,
    exponent = periods;
  while (exponent > 0) {
    if (exponent % 2) result = mulFixed(result, base);
    exponent = Math.floor(exponent / 2); // integer loop counter only
    if (exponent) base = mulFixed(base, base);
  }
  return result;
}
const annualEffectiveRaw = (apr: bigint, frequency: number) =>
  roundDiv(
    (powerFixed(factorForNominal(apr, frequency), frequency) - HI) * SCALE,
    HI,
  );
const field = (
  name: string,
  raw: bigint,
  unit: YieldField["unit"],
): YieldField => ({
  name,
  raw: raw.toString(),
  unit,
  decimals: unit === "money" ? 18 : unit === "count" ? 0 : 18,
  display:
    unit === "money"
      ? formatRaw(raw, 18)
      : unit === "count"
        ? raw.toString()
        : `${formatRaw(raw, 16)}%`,
});
const result = (
  input: YieldInput,
  fields: YieldField[],
  label: string | null,
): YieldResult => ({
  calculationVersion: YIELD_GROWTH_VERSION,
  mode: input.mode,
  input,
  fields,
  currency: label,
  rounding:
    "Rates use 10^36 internal fixed point and 10^18 ratio outputs; products round half-up. Recurring-contribution balances round half-up each period; other monetary products round half-up at the final result. Required principal rounds up.",
  limitations:
    "Manual constant-rate scenario only; no guaranteed yield, taxes, inflation, fees or live market data.",
});

export function calculateYieldGrowth(input: YieldInput): YieldResult {
  switch (input.mode) {
    case "apr-to-apy": {
      const n = integer(
        input.periodsPerYear,
        "Compounding periods per year",
        365,
      );
      const apr = signedPercentRaw(input.aprPercent, "Nominal APR");
      return result(
        input,
        [
          field("nominalApr", apr, "nominal-apr"),
          field("effectiveApy", annualEffectiveRaw(apr, n), "effective-apy"),
        ],
        null,
      );
    }
    case "apy-to-apr": {
      const n = integer(
        input.periodsPerYear,
        "Compounding periods per year",
        365,
      );
      const apy = signedPercentRaw(input.apyPercent, "Effective APY");
      let low = -SCALE,
        high = 10n * SCALE;
      if (apy < annualEffectiveRaw(low, n) || apy > annualEffectiveRaw(high, n))
        fail(
          "Effective APY is unreachable within the supported nominal APR range.",
        );
      while (low < high) {
        const mid = (low + high + 1n) / 2n;
        if (annualEffectiveRaw(mid, n) <= apy) low = mid;
        else high = mid - 1n;
      }
      const next = low < 10n * SCALE ? low + 1n : low;
      const apr =
        next !== low &&
        annualEffectiveRaw(next, n) - apy < apy - annualEffectiveRaw(low, n)
          ? next
          : low;
      return result(
        input,
        [
          field("effectiveApy", apy, "effective-apy"),
          field("nominalApr", apr, "nominal-apr"),
        ],
        null,
      );
    }
    case "periodic-to-annual": {
      const n = integer(input.periodsPerYear, "Periods per year", 365);
      const periodic = signedPercentRaw(
        input.periodicPercent,
        "Periodic return",
      );
      const factor = HI + periodic * (HI / SCALE);
      return result(
        input,
        [
          field("periodicRate", periodic, "periodic-rate"),
          field(
            "effectiveAnnualReturn",
            roundDiv((powerFixed(factor, n) - HI) * SCALE, HI),
            "effective-apy",
          ),
        ],
        null,
      );
    }
    case "simple": {
      const years = integer(input.years, "Years", 100);
      const principal = money(input.principal, "Principal");
      const rate = signedPercentRaw(
        input.annualRatePercent,
        "Simple annual rate",
      );
      const growth = roundDiv(principal * rate * BigInt(years), SCALE);
      const ending = bounded(principal + growth);
      if (ending < 0n) fail("Simple-interest ending value would be negative.");
      return result(
        input,
        [
          field("principal", principal, "money"),
          field("contributions", 0n, "money"),
          field("growth", growth, "money"),
          field("endingValue", ending, "money"),
        ],
        currency(input.currency),
      );
    }
    case "compound":
    case "contributions": {
      const n = integer(
        input.periodsPerYear,
        "Compounding periods per year",
        365,
      );
      const years = integer(input.years, "Years", 100);
      const periods = n * years;
      if (periods > 1200)
        fail("At most 1200 compounding periods are supported.");
      const principal = money(input.principal, "Principal");
      const apr = signedPercentRaw(input.nominalAprPercent, "Nominal APR");
      const factor = factorForNominal(apr, n);
      let ending: bigint,
        contributed = 0n;
      if (input.mode === "compound")
        ending = bounded(roundDiv(principal * powerFixed(factor, periods), HI));
      else {
        if (input.timing !== "beginning" && input.timing !== "end")
          fail("Choose beginning or end of period contributions.");
        const perPeriod = money(input.contribution, "Recurring contribution");
        contributed = bounded(perPeriod * BigInt(periods));
        ending = principal;
        for (let i = 0; i < periods; i++)
          ending =
            input.timing === "beginning"
              ? bounded(roundDiv((ending + perPeriod) * factor, HI))
              : bounded(roundDiv(ending * factor, HI) + perPeriod);
      }
      return result(
        input,
        [
          field("principal", principal, "money"),
          field("contributions", contributed, "money"),
          field("growth", ending - principal - contributed, "money"),
          field("endingValue", ending, "money"),
          field("periods", BigInt(periods), "count"),
        ],
        currency(input.currency),
      );
    }
    case "required-principal": {
      const income = money(input.annualIncome, "Annual income target");
      const apy = signedPercentRaw(
        input.effectiveApyPercent,
        "Assumed effective APY",
        false,
      );
      if (apy === 0n)
        fail("A positive effective APY is required for an income target.");
      const principal = bounded(ceilDiv(income * SCALE, apy));
      return result(
        input,
        [
          field("annualIncome", income, "money"),
          field("effectiveApy", apy, "effective-apy"),
          field("requiredPrincipal", principal, "money"),
        ],
        currency(input.currency),
      );
    }
    case "recovery": {
      const loss = signedPercentRaw(input.lossPercent, "Loss", false);
      if (loss >= SCALE)
        fail("A 100% loss cannot be recovered by a finite gain.");
      const gain = roundDiv(loss * SCALE, SCALE - loss);
      return result(
        input,
        [
          field("loss", loss, "percentage"),
          field("requiredGain", gain, "percentage"),
        ],
        null,
      );
    }
    default:
      return fail("Unsupported yield-growth mode.");
  }
}

export const yieldGrowthReportJSON = (value: YieldResult) =>
  JSON.stringify(
    {
      ...value,
      assumptions: [
        "Manual constant rates and whole periods; no future yield is guaranteed.",
      ],
      simulated: true,
      disclaimer:
        "Illustrative constant-rate mathematics, not a forecast or investment advice.",
    },
    null,
    2,
  ) + "\n";
