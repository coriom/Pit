/** Pure manual-currency allocation scenarios. No holdings discovery or order path. */
import {
  BPS,
  SCALE,
  AiInputError,
  bounded,
  ceilDiv,
  fail,
  field,
  floorDiv,
  label,
  parse,
  roundHalfUp,
  type AiField,
} from "./ai-math";

export const REBALANCE_VERSION = "pit.portfolio-rebalance.local.v1" as const;
export const REBALANCE_DECIMALS = 18;
export const MAX_REBALANCE_ROWS = 12;
type BaseRow = { id: string; label: string; currentValue: string };
type TargetRow = BaseRow & { targetBps: string };
type ShockRow = BaseRow & { shockBps: string };
export type RebalanceInput =
  | { mode: "target"; currencyLabel: string; rows: TargetRow[]; feeBps: string }
  | {
      mode: "contribution";
      currencyLabel: string;
      rows: TargetRow[];
      contribution: string;
    }
  | { mode: "shock"; currencyLabel: string; rows: ShockRow[] };
export type RebalanceRow = {
  id: string;
  label: string;
  currentValueRaw: string | null;
  currentWeightPpm: string | null;
  targetBps: string | null;
  allocationDriftPpm: string | null;
  desiredValueRaw: string | null;
  idealTradeRaw: string | null;
  contributionRaw: string | null;
  blockingOverweightRaw: string | null;
  shockBps: string | null;
  projectedValueRaw: string | null;
  projectedWeightPpm: string | null;
  changeRaw: string | null;
};
export type RebalanceResult = {
  calculationVersion: typeof REBALANCE_VERSION;
  mode: RebalanceInput["mode"];
  status: "complete" | "incomplete";
  feasibility: "feasible" | "infeasible" | "not-evaluated";
  reasons: string[];
  input: RebalanceInput;
  currencyLabel: string;
  fields: AiField[];
  rows: RebalanceRow[];
  assumptions: string[];
  limitations: string[];
};
export { AiInputError as RebalanceInputError };

const MILLION = 1_000_000n;
const text = (value: string, name: string) => {
  if (typeof value !== "string") fail(`${name} must be text.`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 40 || /[\x00-\x1f\x7f]/.test(trimmed))
    fail(`${name} must be 1–40 printable characters.`);
  return trimmed;
};
const rowId = (value: string) => {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(value)
  )
    fail("Each bucket needs a stable short local row ID.");
  return value;
};
const wholeBps = (value: string, name: string) => {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,4})$/.test(value))
    fail(`${name} must be whole basis points.`);
  const raw = BigInt(value);
  if (raw > BPS) fail(`${name} must be at most 10000 bps.`);
  return raw;
};
const shockBps = (value: string) => {
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d{0,5})$/.test(value))
    fail("Shock must be bounded signed whole basis points.");
  const raw = BigInt(value);
  if (raw < -BPS || raw > 100_000n)
    fail("Shock must be between -100% and +1000%.");
  return raw;
};
const money = (name: string, raw: bigint, currency: string) =>
  field(name, raw, REBALANCE_DECIMALS, `${currency} (manual)`);
const ppm = (value: bigint, total: bigint) =>
  total > 0n
    ? bounded(roundHalfUp(value * MILLION, total), "Portfolio weight")
    : null;
const emptyRow = (id: string, name: string): RebalanceRow => ({
  id,
  label: name,
  currentValueRaw: null,
  currentWeightPpm: null,
  targetBps: null,
  allocationDriftPpm: null,
  desiredValueRaw: null,
  idealTradeRaw: null,
  contributionRaw: null,
  blockingOverweightRaw: null,
  shockBps: null,
  projectedValueRaw: null,
  projectedWeightPpm: null,
  changeRaw: null,
});
const result = (
  input: RebalanceInput,
  currency: string,
  fields: AiField[],
  rows: RebalanceRow[],
  reasons: string[],
  feasibility: RebalanceResult["feasibility"] = "not-evaluated",
): RebalanceResult => ({
  calculationVersion: REBALANCE_VERSION,
  mode: input.mode,
  status: reasons.length ? "incomplete" : "complete",
  feasibility,
  reasons,
  input,
  currencyLabel: currency,
  fields,
  rows,
  assumptions: [
    "Only explicitly entered buckets are included; every value uses one manually named currency.",
    "Targets and shocks are scenarios, not live prices or orders.",
  ],
  limitations: [
    "No token identity, wallet coverage, taxes, liquidity, venue or execution modeling.",
    "Fee drag, when supplied, is separate from the fee-free ideal allocation.",
  ],
});

/** Largest-remainder apportionment conserves every raw currency unit. Ties use stable IDs. */
export function apportionTarget(
  total: bigint,
  rows: readonly { id: string; targetBps: bigint }[],
): bigint[] {
  if (
    total < 0n ||
    rows.some((row) => row.targetBps < 0n || row.targetBps > BPS) ||
    rows.reduce((s, row) => s + row.targetBps, 0n) !== BPS
  )
    fail("Target weights must sum to exactly 10000 bps.");
  const parts = rows.map((row, index) => ({
    index,
    id: row.id,
    floor: floorDiv(total * row.targetBps, BPS),
    remainder: (total * row.targetBps) % BPS,
  }));
  let residual = total - parts.reduce((sum, item) => sum + item.floor, 0n);
  for (const item of [...parts].sort((a, b) =>
    a.remainder === b.remainder
      ? a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0
      : a.remainder > b.remainder
        ? -1
        : 1,
  )) {
    if (residual === 0n) break;
    item.floor += 1n;
    residual -= 1n;
  }
  if (residual !== 0n) fail("Allocation residual exceeds bucket count.");
  return parts.sort((a, b) => a.index - b.index).map((item) => item.floor);
}

/** Exhaustive bounded smallest-unit search avoids non-monotone apportionment ties. */
function minimumContribution(
  current: readonly bigint[],
  targets: readonly { id: string; targetBps: bigint }[],
  total: bigint,
): bigint | null {
  if (current.some((value, i) => value > 0n && targets[i].targetBps === 0n))
    return null;
  // A zero-value portfolio has no defined allocation until at least one
  // smallest currency unit is contributed.
  let lowerTotal = total === 0n ? 1n : total;
  let upperTotal = lowerTotal;
  for (let i = 0; i < current.length; i++) {
    const weight = targets[i].targetBps;
    if (weight === 0n || current[i] === 0n) continue;
    const lower = ceilDiv(current[i] * BPS, weight);
    const upper = ceilDiv((current[i] + 1n) * BPS, weight);
    if (lower > lowerTotal) lowerTotal = lower;
    if (upper > upperTotal) upperTotal = upper;
  }
  // For each positive target, its largest-remainder allocation is at least
  // floor(T*w/10000). At upperTotal every such floor exceeds current.
  if (upperTotal - lowerTotal > BPS)
    fail("Minimum contribution search exceeded its bounded unit window.");
  for (let candidate = lowerTotal; candidate <= upperTotal; candidate++) {
    const desired = apportionTarget(candidate, targets);
    if (desired.every((value, i) => value >= current[i]))
      return candidate - total;
  }
  return fail(
    "Minimum contribution could not be resolved within the bounded window.",
  );
}

export function calculateRebalance(input: RebalanceInput): RebalanceResult {
  const currency = label(input.currencyLabel, "Manual valuation currency");
  if (
    !Array.isArray(input.rows) ||
    input.rows.length < 2 ||
    input.rows.length > MAX_REBALANCE_ROWS
  )
    fail(`Enter 2–${MAX_REBALANCE_ROWS} explicitly included buckets.`);
  const seen = new Set<string>();
  const rows: RebalanceRow[] = [];
  const values: (bigint | null)[] = [];
  const targets: (bigint | null)[] = [];
  const shocks: (bigint | null)[] = [];
  const reasons: string[] = [];
  for (const [index, row] of input.rows.entries()) {
    const id = rowId(row.id),
      name = text(row.label, `Bucket ${index + 1} label`);
    if (seen.has(id)) fail(`Duplicate local row ID ${id}.`);
    seen.add(id);
    const value =
      row.currentValue.trim() === ""
        ? null
        : parse(
            row.currentValue,
            REBALANCE_DECIMALS,
            `Bucket ${index + 1} value`,
          );
    if (value === null) reasons.push(`${name}: current valuation is missing.`);
    const targetText = "targetBps" in row ? row.targetBps : null;
    const shockText = "shockBps" in row ? row.shockBps : null;
    const target =
      targetText === null || targetText.trim() === ""
        ? null
        : wholeBps(targetText, `${name} target`);
    const shock =
      shockText === null || shockText.trim() === ""
        ? null
        : shockBps(shockText);
    if (input.mode !== "shock" && target === null)
      reasons.push(`${name}: target weight is missing.`);
    if (input.mode === "shock" && shock === null)
      reasons.push(`${name}: scenario shock is missing.`);
    values.push(value);
    targets.push(target);
    shocks.push(shock);
    rows.push({
      ...emptyRow(id, name),
      currentValueRaw: value?.toString() ?? null,
      targetBps: target?.toString() ?? null,
      shockBps: shock?.toString() ?? null,
    });
  }
  const knownTotal = bounded(
    values.reduce<bigint>((s, v) => s + (v ?? 0n), 0n),
    "Known subtotal",
  );
  const fields: AiField[] = [money("knownSubtotal", knownTotal, currency)];
  if (input.mode === "target" && input.feeBps.trim() !== "")
    wholeBps(input.feeBps, "Estimated notional fee");
  const deposit =
    input.mode === "contribution"
      ? parse(input.contribution, REBALANCE_DECIMALS, "Contribution")
      : null;
  if (
    input.mode !== "shock" &&
    targets.every((target) => target !== null) &&
    targets.reduce<bigint>((sum, target) => sum + target!, 0n) !== BPS
  )
    fail("Target weights must sum to exactly 10000 bps.");
  if (reasons.length) return result(input, currency, fields, rows, reasons);
  const current = values as bigint[];
  const total = knownTotal;
  if (input.mode !== "contribution" && total === 0n)
    return result(input, currency, fields, rows, [
      "Included portfolio value is zero; allocation weights are undefined.",
    ]);
  if (input.mode !== "shock") {
    const targetRows = rows.map((row, i) => ({
      id: row.id,
      targetBps: targets[i]!,
    }));
    if (targetRows.reduce((s, row) => s + row.targetBps, 0n) !== BPS)
      fail("Target weights must sum to exactly 10000 bps.");
    const postTotal = bounded(
      total + (deposit ?? 0n),
      "Post-contribution value",
    );
    if (postTotal === 0n)
      return result(input, currency, fields, rows, [
        "A zero-value portfolio needs a positive contribution before allocation weights exist.",
      ]);
    const desired = apportionTarget(postTotal, targetRows);
    for (let i = 0; i < rows.length; i++) {
      rows[i].currentWeightPpm = ppm(current[i], total)?.toString() ?? null;
      rows[i].allocationDriftPpm =
        total > 0n
          ? (
              targetRows[i].targetBps * 100n -
              BigInt(rows[i].currentWeightPpm!)
            ).toString()
          : null;
      rows[i].desiredValueRaw = desired[i].toString();
      rows[i].idealTradeRaw = (desired[i] - current[i]).toString();
    }
    fields.push(money("currentTotal", total, currency));
    if (input.mode === "target") {
      const gross = bounded(
        desired.reduce(
          (s, d, i) => s + (d > current[i] ? d - current[i] : current[i] - d),
          0n,
        ),
        "Gross turnover",
      );
      if (gross % 2n !== 0n) fail("Ideal plan did not conserve capital.");
      fields.push(
        money("grossTurnover", gross, currency),
        money("oneWayTurnover", gross / 2n, currency),
        field(
          "oneWayTurnoverBps",
          roundHalfUp((gross / 2n) * BPS * SCALE, total),
          18,
          "bps of starting value",
        ),
      );
      if (input.feeBps.trim() !== "") {
        const fee = wholeBps(input.feeBps, "Estimated notional fee");
        fields.push(
          money(
            "separateEstimatedFeeDrag",
            ceilDiv(gross * fee, BPS),
            currency,
          ),
        );
      }
      return result(input, currency, fields, rows, []);
    }
    fields.push(
      money("contribution", deposit!, currency),
      money("postContributionTotal", postTotal, currency),
    );
    const minimum = minimumContribution(current, targetRows, total);
    if (minimum !== null)
      fields.push(money("minimumContribution", minimum, currency));
    const feasible = desired.every((d, i) => d >= current[i]);
    if (feasible) {
      for (let i = 0; i < rows.length; i++)
        rows[i].contributionRaw = (desired[i] - current[i]).toString();
      if (
        rows.reduce((s, row) => s + BigInt(row.contributionRaw!), 0n) !==
        deposit
      )
        fail("Contribution allocation failed capital conservation.");
    } else {
      for (let i = 0; i < rows.length; i++)
        rows[i].blockingOverweightRaw =
          current[i] > desired[i] ? (current[i] - desired[i]).toString() : null;
    }
    return result(
      input,
      currency,
      fields,
      rows,
      [],
      feasible ? "feasible" : "infeasible",
    );
  }
  let projectedTotal = 0n;
  for (let i = 0; i < rows.length; i++) {
    rows[i].currentWeightPpm = ppm(current[i], total)?.toString() ?? null;
    const projected = bounded(
      roundHalfUp(current[i] * (BPS + shocks[i]!), BPS),
      "Projected bucket value",
    );
    rows[i].projectedValueRaw = projected.toString();
    rows[i].changeRaw = (projected - current[i]).toString();
    projectedTotal = bounded(projectedTotal + projected, "Projected total");
  }
  fields.push(
    money("currentTotal", total, currency),
    money("projectedTotal", projectedTotal, currency),
    money("portfolioChange", projectedTotal - total, currency),
    field(
      "portfolioChangePercent",
      roundHalfUp((projectedTotal - total) * 100n * SCALE, total),
      18,
      "% of included starting value",
    ),
  );
  if (projectedTotal === 0n)
    return result(input, currency, fields, rows, [
      "All projected value was lost; post-shock allocation weights are undefined.",
    ]);
  for (let i = 0; i < rows.length; i++)
    rows[i].projectedWeightPpm =
      ppm(BigInt(rows[i].projectedValueRaw!), projectedTotal)?.toString() ??
      null;
  const largestBefore = rows.reduce((m, row) => {
    const raw = BigInt(row.currentWeightPpm!);
    return raw > m ? raw : m;
  }, 0n);
  const largestAfter = rows.reduce((m, row) => {
    const raw = BigInt(row.projectedWeightPpm!);
    return raw > m ? raw : m;
  }, 0n);
  fields.push(
    field("largestWeightBeforePpm", largestBefore, 0, "ppm of included value"),
    field("largestWeightAfterPpm", largestAfter, 0, "ppm of projected value"),
  );
  return result(input, currency, fields, rows, []);
}

export const rebalanceReportJSON = (value: RebalanceResult) =>
  JSON.stringify(
    {
      ...value,
      simulated: true,
      disclaimer:
        "Manual allocation scenario; not a trade plan or comprehensive portfolio.",
    },
    null,
    2,
  ) + "\n";
