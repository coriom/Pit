/** Historical manual-value arithmetic with end-of-period external cash flows. */
import {
  SCALE,
  AiInputError,
  bounded,
  fail,
  field,
  label,
  parse,
  roundHalfUp,
  type AiField,
} from "./ai-math";

export const PERFORMANCE_VERSION = "pit.performance-drawdown.local.v1" as const;
export const PERFORMANCE_DECIMALS = 18;
export const MAX_PERFORMANCE_SNAPSHOTS = 30;
const MAX_RATIONAL_BITS = 8192;
export type PerformanceSnapshotInput = {
  date: string;
  endingValue: string;
  externalFlow: string;
};
export type PerformanceInput = {
  mode: "performance" | "drawdown";
  currencyLabel: string;
  snapshots: PerformanceSnapshotInput[];
};
export type PerformanceRow = {
  date: string;
  endingValueRaw: string;
  externalFlowRaw: string;
  preFlowEndingValueRaw: string | null;
  periodReturnPercentRaw: string | null;
  normalizedIndexRaw: string | null;
  highWaterIndexRaw: string | null;
  drawdownPercentRaw: string | null;
};
export type PerformanceResult = {
  calculationVersion: typeof PERFORMANCE_VERSION;
  mode: PerformanceInput["mode"];
  status: "complete" | "incomplete";
  reasons: string[];
  input: PerformanceInput;
  currencyLabel: string;
  fields: AiField[];
  rows: PerformanceRow[];
  maxDrawdownPeakDate: string | null;
  maxDrawdownTroughDate: string | null;
  recoveryDate: string | null;
  recovered: boolean | null;
  assumptions: string[];
  limitations: string[];
};
export { AiInputError as PerformanceInputError };

const money = (name: string, raw: bigint, currency: string) =>
  field(name, raw, PERFORMANCE_DECIMALS, `${currency} (manual)`);
const percent = (name: string, raw: bigint) =>
  field(name, raw, 18, "% (manual historical series)");
const signedFlow = (value: string, name: string) => {
  if (
    typeof value !== "string" ||
    value.length > 100 ||
    !/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
  )
    fail(`${name} must be a bounded signed decimal amount.`);
  const sign = value[0] === "-" ? -1n : 1n;
  const unsigned =
    value[0] === "-" || value[0] === "+" ? value.slice(1) : value;
  return bounded(sign * parse(unsigned, PERFORMANCE_DECIMALS, name), name);
};
const calendarDay = (value: string) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail("Snapshot date must be YYYY-MM-DD.");
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1900 || year > 2100) fail("Snapshot year must be 1900–2100.");
  const milliseconds = Date.UTC(year, month - 1, day);
  const date = new Date(milliseconds);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  )
    fail("Snapshot date is not a calendar date.");
  return milliseconds / 86_400_000;
};
const gcd = (left: bigint, right: bigint): bigint => {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
};
const bits = (value: bigint) => value.toString(2).length;
const compare = (a: bigint, b: bigint, c: bigint, d: bigint) => a * d - c * b;
const signedPercent = (numerator: bigint, denominator: bigint) => {
  if (denominator <= 0n) fail("Historical percentage denominator is zero.");
  return bounded(
    roundHalfUp(numerator * 100n * SCALE, denominator),
    "Historical percentage",
  );
};
const result = (
  input: PerformanceInput,
  currency: string,
  fields: AiField[],
  rows: PerformanceRow[],
  reasons: string[],
  peakDate: string | null,
  troughDate: string | null,
  recoveryDate: string | null,
): PerformanceResult => ({
  calculationVersion: PERFORMANCE_VERSION,
  mode: input.mode,
  status: reasons.length ? "incomplete" : "complete",
  reasons,
  input,
  currencyLabel: currency,
  fields,
  rows,
  maxDrawdownPeakDate: peakDate,
  maxDrawdownTroughDate: troughDate,
  recoveryDate,
  recovered: troughDate === null ? null : recoveryDate !== null,
  assumptions: [
    "External cash flow occurs at each interval end immediately before the ending snapshot and is included in its value.",
    "Positive flow is a deposit; negative flow is a withdrawal. All values use one manually named currency.",
  ],
  limitations: [
    "Intraperiod flows need additional valuation boundaries; they cannot be reconstructed from these snapshots.",
    "Time-weighted return is distinct from monetary gain and money-weighted IRR; this is not a tax or advice result.",
  ],
});

export function calculatePerformance(
  input: PerformanceInput,
): PerformanceResult {
  if (input.mode !== "performance" && input.mode !== "drawdown")
    fail("Unsupported historical-analysis mode.");
  const currency = label(input.currencyLabel, "Manual valuation currency");
  if (
    !Array.isArray(input.snapshots) ||
    input.snapshots.length < 2 ||
    input.snapshots.length > MAX_PERFORMANCE_SNAPSHOTS
  )
    fail(`Enter 2–${MAX_PERFORMANCE_SNAPSHOTS} chronological snapshots.`);
  const days: number[] = [];
  const ending: bigint[] = [];
  const flows: bigint[] = [];
  const rows: PerformanceRow[] = [];
  for (const [i, item] of input.snapshots.entries()) {
    if (!item || typeof item !== "object")
      fail(`Snapshot ${i + 1} is invalid.`);
    const dateDay = calendarDay(item.date);
    if (days.length && dateDay <= days[days.length - 1])
      fail("Snapshot dates must be strictly increasing without duplicates.");
    days.push(dateDay);
    const value = parse(
      item.endingValue,
      PERFORMANCE_DECIMALS,
      `Snapshot ${i + 1} value`,
    );
    const flow = signedFlow(
      item.externalFlow,
      `Snapshot ${i + 1} external flow`,
    );
    if (i === 0 && flow !== 0n)
      fail(
        "Opening snapshot external flow must be zero; it has no preceding interval.",
      );
    ending.push(value);
    flows.push(flow);
    rows.push({
      date: item.date,
      endingValueRaw: value.toString(),
      externalFlowRaw: flow.toString(),
      preFlowEndingValueRaw: null,
      periodReturnPercentRaw: null,
      normalizedIndexRaw: null,
      highWaterIndexRaw: null,
      drawdownPercentRaw: null,
    });
  }
  const opening = ending[0];
  const closing = ending[ending.length - 1];
  const netFlows = bounded(
    flows.slice(1).reduce((sum, flow) => sum + flow, 0n),
    "Net external flows",
  );
  const nominalGain = bounded(
    closing - opening - netFlows,
    "Nominal gain or loss",
  );
  const fields: AiField[] = [
    money("openingValue", opening, currency),
    money("closingValue", closing, currency),
    money("netExternalFlows", netFlows, currency),
    money("nominalGain", nominalGain, currency),
  ];
  rows[0].normalizedIndexRaw = SCALE.toString();
  rows[0].highWaterIndexRaw = SCALE.toString();
  rows[0].drawdownPercentRaw = "0";
  const reasons: string[] = [];
  let numerator = 1n,
    denominator = 1n;
  let chainValid = true;
  let highNum = 1n,
    highDen = 1n,
    highDate = rows[0].date;
  let maximumDrawdown = 0n;
  let maximumPeakDate: string | null = null;
  let maximumTroughDate: string | null = null;
  let maximumPeakNum = 1n,
    maximumPeakDen = 1n;
  let recoveryDate: string | null = null;
  let lastDrawdown = 0n;
  let bestReturn: bigint | null = null,
    worstReturn: bigint | null = null;
  for (let i = 1; i < rows.length; i++) {
    const preFlow = bounded(ending[i] - flows[i], "Pre-flow ending value");
    if (preFlow < 0n)
      fail(`Snapshot ${i + 1}: flow exceeds the stated ending value.`);
    rows[i].preFlowEndingValueRaw = preFlow.toString();
    if (ending[i - 1] === 0n) {
      reasons.push(
        `${rows[i].date}: return is undefined because the preceding portfolio value is zero.`,
      );
      chainValid = false;
      continue;
    }
    const periodReturn = signedPercent(preFlow - ending[i - 1], ending[i - 1]);
    rows[i].periodReturnPercentRaw = periodReturn.toString();
    bestReturn =
      bestReturn === null || periodReturn > bestReturn
        ? periodReturn
        : bestReturn;
    worstReturn =
      worstReturn === null || periodReturn < worstReturn
        ? periodReturn
        : worstReturn;
    if (!chainValid) continue;
    numerator *= preFlow;
    denominator *= ending[i - 1];
    const divisor = gcd(numerator, denominator);
    numerator /= divisor;
    denominator /= divisor;
    if (
      bits(numerator) > MAX_RATIONAL_BITS ||
      bits(denominator) > MAX_RATIONAL_BITS
    )
      fail("Historical return product exceeds its bounded rational size.");
    const index = bounded(
      roundHalfUp(numerator * SCALE, denominator),
      "Normalized index",
    );
    rows[i].normalizedIndexRaw = index.toString();
    if (compare(numerator, denominator, highNum, highDen) >= 0n) {
      highNum = numerator;
      highDen = denominator;
      // Equal high-water marks choose the latest date for future underwater time.
      highDate = rows[i].date;
      lastDrawdown = 0n;
    } else {
      lastDrawdown = signedPercent(
        numerator * highDen - highNum * denominator,
        denominator * highNum,
      );
      if (lastDrawdown < maximumDrawdown) {
        maximumDrawdown = lastDrawdown;
        maximumPeakDate = highDate;
        maximumTroughDate = rows[i].date;
        maximumPeakNum = highNum;
        maximumPeakDen = highDen;
        recoveryDate = null;
      }
    }
    rows[i].highWaterIndexRaw = bounded(
      roundHalfUp(highNum * SCALE, highDen),
      "High-water index",
    ).toString();
    rows[i].drawdownPercentRaw = lastDrawdown.toString();
    if (
      maximumTroughDate !== null &&
      recoveryDate === null &&
      rows[i].date > maximumTroughDate &&
      compare(numerator, denominator, maximumPeakNum, maximumPeakDen) >= 0n
    )
      recoveryDate = rows[i].date;
  }
  if (bestReturn !== null)
    fields.push(percent("bestPeriodReturnPercent", bestReturn));
  if (worstReturn !== null)
    fields.push(percent("worstPeriodReturnPercent", worstReturn));
  if (chainValid) {
    fields.push(
      percent(
        "timeWeightedReturnPercent",
        signedPercent(numerator - denominator, denominator),
      ),
      field(
        "closingNormalizedIndex",
        bounded(
          roundHalfUp(numerator * SCALE, denominator),
          "Closing normalized index",
        ),
        18,
        "opening-index units",
      ),
      percent("maximumDrawdownPercent", maximumDrawdown),
      percent("currentDrawdownPercent", lastDrawdown),
    );
    if (maximumPeakDate !== null && recoveryDate !== null)
      fields.push(
        field(
          "maxDrawdownRecoveryDays",
          BigInt(calendarDay(recoveryDate) - calendarDay(maximumPeakDate)),
          0,
          "calendar days from peak",
        ),
      );
    if (lastDrawdown < 0n)
      fields.push(
        field(
          "currentUnderwaterDays",
          BigInt(days[days.length - 1] - calendarDay(highDate)),
          0,
          "calendar days since last high",
        ),
      );
  }
  return result(
    input,
    currency,
    fields,
    rows,
    reasons,
    chainValid ? maximumPeakDate : null,
    chainValid ? maximumTroughDate : null,
    chainValid ? recoveryDate : null,
  );
}

export const performanceReportJSON = (value: PerformanceResult) =>
  JSON.stringify(
    {
      ...value,
      manuallySupplied: true,
      independentlyVerified: false,
      disclaimer:
        "Historical manual valuations only; not a verified market return, money-weighted IRR, tax result or advice.",
    },
    null,
    2,
  ) + "\n";
