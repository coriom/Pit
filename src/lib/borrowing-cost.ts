/** Manual single-currency debt scenarios; no lender, wallet, clock or market data. */
import {
  BPS,
  MAX_PERIODS,
  bounded,
  ceilDiv,
  currency,
  fail,
  field,
  money,
  moneyField,
  precision,
  rate,
  signedFloor,
  signedRate,
  whole,
} from "./al-math";

export const BORROWING_VERSION = "pit.borrowing-cost.local.v1" as const;
type Common = {
  currency: string;
  decimals: number;
  principal: string;
  borrowAprBps: string;
};
export type BorrowingInput =
  | (Common & {
      mode: "growth";
      elapsedDays: number;
      periodsPerYear: number;
      elapsedPeriods: number;
    })
  | (Common & {
      mode: "repayment";
      periodsPerYear: number;
      horizonPeriods: number;
      fixedPayment: string;
    })
  | (Common & {
      mode: "carry";
      elapsedDays: number;
      investmentYieldBps: string;
      otherCosts: string;
      costCoverage: "none" | "separate" | "embedded" | "unknown";
    });
export type BorrowingPeriod = {
  period: number;
  openingDebtRaw: string;
  interestRaw: string;
  paymentRaw: string;
  principalPaidRaw: string;
  endingDebtRaw: string;
};
export type BorrowingResult = {
  calculationVersion: typeof BORROWING_VERSION;
  mode: BorrowingInput["mode"];
  status: "complete" | "incomplete";
  reasons: string[];
  assessment:
    | "paid-off"
    | "amortizing"
    | "non-amortizing"
    | "negative-amortization"
    | "positive-carry"
    | "zero-carry"
    | "negative-carry"
    | "not-evaluated";
  payoffPeriod: number | null;
  input: BorrowingInput;
  currency: string;
  decimals: number;
  fields: ReturnType<typeof field>[];
  schedule: BorrowingPeriod[];
  assumptions: string[];
  limitations: string[];
};
const interest = (
  principal: bigint,
  apr: bigint,
  numerator: bigint,
  denominator: bigint,
) =>
  bounded(
    ceilDiv(principal * apr * numerator, BPS * denominator),
    "Modeled interest",
  );
export function calculateBorrowing(input: BorrowingInput): BorrowingResult {
  const unit = currency(input.currency);
  const places = precision(input.decimals, "Currency precision");
  const principal = money(input.principal, places, "Borrowed principal");
  const apr = rate(input.borrowAprBps, "Borrow APR");
  const fields = [moneyField("borrowedPrincipal", principal, places, unit)];
  const add = (name: string, raw: bigint) =>
    fields.push(moneyField(name, bounded(raw, name), places, unit));
  const reasons: string[] = [];
  const schedule: BorrowingPeriod[] = [];
  let assessment: BorrowingResult["assessment"] = "not-evaluated";
  let payoffPeriod: number | null = null;
  if (input.mode === "growth") {
    const days = whole(input.elapsedDays, "Elapsed days", 0, 36_500);
    const frequency = whole(input.periodsPerYear, "Periods per year", 1, 365);
    const periods = whole(
      input.elapsedPeriods,
      "Elapsed periods",
      0,
      MAX_PERIODS,
    );
    const simple = interest(principal, apr, BigInt(days), 365n);
    add("simpleInterest", simple);
    add("simpleEndingDebt", principal + simple);
    // Exact rational exponent with one conservative monetary rounding at the end.
    // Exponents and factors are bounded, so intermediates remain below 5,000 digits.
    const denominator = BPS * BigInt(frequency);
    const numerator = denominator + apr;
    const numeratorPower = numerator ** BigInt(periods);
    const denominatorPower = denominator ** BigInt(periods);
    const compounded = bounded(
      ceilDiv(principal * numeratorPower, denominatorPower),
      "Compounded debt",
    );
    add("compoundedEndingDebt", compounded);
    add("compoundedFinancingCost", compounded - principal);
    add(
      "additionalCompoundingCostVersusSimple",
      compounded - principal - simple,
    );
  } else if (input.mode === "repayment") {
    const frequency = whole(input.periodsPerYear, "Periods per year", 1, 365);
    const horizon = whole(
      input.horizonPeriods,
      "Horizon periods",
      1,
      MAX_PERIODS,
    );
    const payment = money(
      input.fixedPayment,
      places,
      "Fixed end-of-period payment",
    );
    let debt = principal,
      totalInterest = 0n,
      totalPaid = 0n;
    let grew = false,
      stalled = false;
    if (debt === 0n) payoffPeriod = 0;
    for (let i = 1; i <= horizon && debt > 0n; i++) {
      const periodInterest = interest(debt, apr, 1n, BigInt(frequency));
      const due = bounded(debt + periodInterest, "Period debt due");
      const paid = payment < due ? payment : due;
      const next = due - paid;
      const principalPaid = paid - periodInterest;
      if (next > debt) grew = true;
      else if (next === debt) stalled = true;
      totalInterest = bounded(
        totalInterest + periodInterest,
        "Cumulative interest",
      );
      totalPaid = bounded(totalPaid + paid, "Cumulative payments");
      schedule.push({
        period: i,
        openingDebtRaw: debt.toString(),
        interestRaw: periodInterest.toString(),
        paymentRaw: paid.toString(),
        principalPaidRaw: principalPaid.toString(),
        endingDebtRaw: next.toString(),
      });
      debt = next;
      if (debt === 0n) payoffPeriod = i;
    }
    add("endingDebt", debt);
    add("cumulativeInterest", totalInterest);
    add("totalPayments", totalPaid);
    add("paymentConservation", principal + totalInterest - totalPaid);
    assessment =
      payoffPeriod !== null
        ? "paid-off"
        : grew
          ? "negative-amortization"
          : stalled
            ? "non-amortizing"
            : "amortizing";
    if (payoffPeriod === null)
      reasons.push("Debt is not paid off within the supplied horizon.");
  } else if (input.mode === "carry") {
    const days = whole(input.elapsedDays, "Elapsed days", 0, 36_500);
    const yieldBps = signedRate(
      input.investmentYieldBps,
      "Investment yield assumption",
    );
    if (
      !["none", "separate", "embedded", "unknown"].includes(input.costCoverage)
    )
      fail("Unsupported cost coverage.");
    const other = input.otherCosts.trim()
      ? money(input.otherCosts, places, "Other manually stated costs")
      : null;
    if (input.costCoverage === "none" && other !== null && other !== 0n)
      fail("A nonzero cost cannot be declared absent.");
    const earnings = bounded(
      signedFloor(principal * yieldBps * BigInt(days), BPS * 365n),
      "Modeled investment return",
    );
    const finance = interest(principal, apr, BigInt(days), 365n);
    add("grossBorrowedExposure", principal);
    add("investmentReturn", earnings);
    add("borrowingCost", finance);
    add("grossCarryBeforeOtherCosts", earnings - finance);
    if (
      input.costCoverage === "unknown" ||
      (input.costCoverage === "separate" && other === null)
    )
      reasons.push(
        "Other cost coverage or amount is unknown; net carry is unavailable.",
      );
    else {
      const separate = input.costCoverage === "separate" ? other! : 0n;
      const net = bounded(earnings - finance - separate, "Net modeled carry");
      add("separateKnownCosts", separate);
      add("netCarryAfterKnownCosts", net);
      assessment =
        net > 0n
          ? "positive-carry"
          : net < 0n
            ? "negative-carry"
            : "zero-carry";
      if (principal > 0n && days > 0) {
        fields.push(
          field(
            "minimumWholeYieldBpsForBreakEven",
            ceilDiv(
              (finance + separate) * BPS * 365n,
              principal * BigInt(days),
            ),
            0,
            "whole bps annual simple yield",
          ),
        );
      } else
        reasons.push(
          "Break-even yield is undefined with zero principal or horizon.",
        );
    }
  } else fail("Unsupported borrowing mode.");
  return {
    calculationVersion: BORROWING_VERSION,
    mode: input.mode,
    status: reasons.length ? "incomplete" : "complete",
    reasons,
    assessment,
    payoffPeriod,
    input,
    currency: unit,
    decimals: places,
    fields,
    schedule,
    assumptions: [
      "One manually labelled quote currency; nominal borrow APR is not APY.",
      "Simple interest and carry use ACT/365 fixed; repayment uses end-of-period payments.",
    ],
    limitations: [
      "No live borrowing rate, protocol fee, liquidation, future yield guarantee or transaction.",
      "Intraperiod rate changes, price risk and unlisted costs are outside this model.",
    ],
  };
}
export const borrowingReportJSON = (result: BorrowingResult) =>
  JSON.stringify(
    {
      ...result,
      simulated: true,
      rounding:
        "Debt interest rounds up to the smallest manual currency unit; discrete growth compounds as an exact rational and rounds up once; final payments cap at debt due.",
    },
    null,
    2,
  ) + "\n";
