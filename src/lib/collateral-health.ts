/** Single-position, manually valued collateral algebra. No oracle or protocol state. */
import {
  BPS,
  SCALE,
  bounded,
  ceilDiv,
  currency,
  fail,
  field,
  money,
  moneyField,
  percentField,
  precision,
  rate,
  ratioField,
  signedRate,
} from "./al-math";

export const COLLATERAL_VERSION = "pit.collateral-health.local.v1" as const;
type Common = {
  currency: string;
  decimals: number;
  collateral: string;
  debt: string;
  maxLtvBps: string;
  liquidationThresholdBps: string;
  targetHealthFactor: string;
};
export type CollateralInput =
  | (Common & { mode: "health" })
  | (Common & { mode: "adjust" })
  | (Common & { mode: "shock"; collateralShockBps: string });
export type CollateralResult = {
  calculationVersion: typeof COLLATERAL_VERSION;
  mode: CollateralInput["mode"];
  status: "complete" | "incomplete";
  reasons: string[];
  breaches: string[];
  input: CollateralInput;
  currency: string;
  decimals: number;
  fields: ReturnType<typeof field>[];
  assumptions: string[];
  limitations: string[];
};
const target = (value: string) => {
  const raw = money(value, 18, "Target health factor");
  if (raw < SCALE || raw > 10n * SCALE)
    fail("Target health factor must be from 1 through 10.");
  return raw;
};
const hf = (c: bigint, d: bigint, lt: bigint) =>
  d === 0n ? null : (c * lt * SCALE) / (BPS * d);
const debtCeilings = (c: bigint, ltv: bigint, lt: bigint, h: bigint) => ({
  ltv: (c * ltv) / BPS,
  health: (c * lt * SCALE) / (BPS * h),
});
const requiredCollateral = (d: bigint, ltv: bigint, lt: bigint, h: bigint) => {
  if (d === 0n) return 0n;
  if (ltv === 0n || lt === 0n) return null;
  const ltvRequired = ceilDiv(d * BPS, ltv);
  const healthRequired = ceilDiv(d * BPS * h, lt * SCALE);
  return ltvRequired > healthRequired ? ltvRequired : healthRequired;
};
const ratioFields = (
  fields: ReturnType<typeof field>[],
  c: bigint,
  d: bigint,
  lt: bigint,
  suffix = "",
) => {
  if (c > 0n) fields.push(percentField(`ltv${suffix}`, d, c));
  if (d > 0n)
    fields.push(
      field(
        `healthFactor${suffix}`,
        hf(c, d, lt)!,
        18,
        "dimensionless health factor",
      ),
    );
};
export function calculateCollateral(input: CollateralInput): CollateralResult {
  const unit = currency(input.currency);
  const places = precision(input.decimals, "Currency precision");
  const c = money(input.collateral, places, "Collateral value");
  const d = money(input.debt, places, "Debt value");
  const ltv = rate(input.maxLtvBps, "Maximum LTV");
  const lt = rate(input.liquidationThresholdBps, "Liquidation threshold");
  if (ltv > lt) throw Error("Maximum LTV cannot exceed liquidation threshold.");
  const h = target(input.targetHealthFactor);
  if (lt === 0n && d > 0n)
    throw Error("A positive debt needs a positive liquidation threshold.");
  const reasons: string[] = [],
    breaches: string[] = [];
  const fields = [
    moneyField("collateralValue", c, places, unit),
    moneyField("debtValue", d, places, unit),
  ];
  ratioFields(fields, c, d, lt);
  if (c === 0n) reasons.push("Current LTV is undefined with zero collateral.");
  if (d === 0n) reasons.push("Health factor is not applicable with zero debt.");
  const limits = debtCeilings(c, ltv, lt, h);
  if (d > limits.ltv)
    breaches.push("Current debt exceeds the manually configured maximum LTV.");
  if (d > limits.health)
    breaches.push("Current debt breaches the selected target health factor.");
  const critical = d > 0n && lt > 0n ? ceilDiv(d * BPS, lt) : 0n;
  const selected = d > 0n ? requiredCollateral(d, ltv, lt, h) : 0n;
  const add = (name: string, raw: bigint) =>
    fields.push(moneyField(name, bounded(raw, name), places, unit));
  if (input.mode === "health") {
    add("maxLtvDebtCeiling", limits.ltv);
    add("targetHealthDebtCeiling", limits.health);
    const ceiling = limits.ltv < limits.health ? limits.ltv : limits.health;
    add("selectedDebtCeiling", ceiling);
    add("additionalBorrowHeadroom", d >= ceiling ? 0n : ceiling - d);
    add("equity", c - d);
    if (c > 0n)
      fields.push(
        field(
          "distanceFromMaxLtvPercent",
          (ltv * SCALE) / 100n - (d * 100n * SCALE) / c,
          18,
          "% points",
        ),
      );
    if (c > d) fields.push(ratioField("grossExposureLeverage", c, c - d));
    else
      reasons.push(
        "Gross-exposure leverage is undefined when equity is zero or negative.",
      );
  } else if (input.mode === "adjust") {
    const ceiling = limits.ltv < limits.health ? limits.ltv : limits.health;
    const repayment = d > ceiling ? d - ceiling : 0n;
    add("minimumRepayment", repayment);
    ratioFields(fields, c, d - repayment, lt, "AfterRepayment");
    if (selected === null) {
      reasons.push(
        "Positive debt cannot meet zero maximum LTV by adding collateral alone.",
      );
    } else {
      const addition = selected > c ? selected - c : 0n;
      // Verify rounded candidates against both integer inequalities.
      const afterAdd = c + addition;
      if (
        d > debtCeilings(afterAdd, ltv, lt, h).ltv ||
        d > debtCeilings(afterAdd, ltv, lt, h).health
      )
        fail("Rounded collateral addition failed its constraints.");
      add("minimumCollateralAddition", addition);
      ratioFields(fields, afterAdd, d, lt, "AfterAddition");
      const withdrawal = c >= selected ? c - selected : 0n;
      const afterWithdraw = c - withdrawal;
      if (
        withdrawal > 0n &&
        (d > debtCeilings(afterWithdraw, ltv, lt, h).ltv ||
          d > debtCeilings(afterWithdraw, ltv, lt, h).health)
      )
        fail("Rounded collateral withdrawal failed its constraints.");
      add("maximumSafeWithdrawal", withdrawal);
      ratioFields(fields, afterWithdraw, d, lt, "AfterWithdrawal");
      if (d > limits.ltv || d > limits.health)
        reasons.push(
          "The current position already breaches a selected constraint; no withdrawal is safe.",
        );
    }
  } else if (input.mode === "shock") {
    const shock = signedRate(
      input.collateralShockBps,
      "Collateral-value shock",
    );
    const after = bounded((c * (BPS + shock)) / BPS, "Shocked collateral");
    add("shockedCollateralValue", after);
    ratioFields(fields, after, d, lt, "AfterShock");
    if (after === 0n)
      reasons.push("Post-shock LTV is undefined with zero collateral.");
    add("criticalCollateralAtHealthOne", critical);
    if (selected !== null) add("collateralNeededForTarget", selected);
    if (c > 0n) {
      fields.push(percentField("distanceToHealthOnePercent", c - critical, c));
      if (selected !== null)
        fields.push(percentField("distanceToTargetPercent", c - selected, c));
    }
    if (d > 0n && hf(after, d, lt)! <= SCALE)
      breaches.push(
        "The shocked position reaches or crosses the stated liquidation threshold.",
      );
  } else fail("Unsupported collateral mode.");
  return {
    calculationVersion: COLLATERAL_VERSION,
    mode: input.mode,
    status: reasons.length ? "incomplete" : "complete",
    reasons,
    breaches,
    input,
    currency: unit,
    decimals: places,
    fields,
    assumptions: [
      "One manually valued collateral and debt position in the same declared currency.",
      "Debt and liquidation threshold are fixed during a collateral shock; ratios are computed from supplied values.",
    ],
    limitations: [
      "No live protocol limit, oracle price, liquidation guarantee, actual borrow approval or token quantity.",
      "Fees, interest-index changes and transaction costs are excluded from these value-only constraints.",
    ],
  };
}
export const collateralReportJSON = (result: CollateralResult) =>
  JSON.stringify(
    {
      ...result,
      simulated: true,
      rounding:
        "Debt ceilings and withdrawal round down; required additions and threshold collateral round up; ratios use at most 18 decimal places.",
    },
    null,
    2,
  ) + "\n";
