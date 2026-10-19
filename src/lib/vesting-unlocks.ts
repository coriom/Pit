/** Pure UTC schedule arithmetic. These are modeled unlocks, never on-chain claims. */
import {
  AK_MAX_DAYS,
  BPS,
  bounded,
  bps,
  decimals,
  fail,
  pctField,
  token,
  tokenField,
  tokenLabel,
  utcDay,
  type AkField,
} from "./ak-math";

export const VESTING_VERSION = "pit.vesting-unlocks.local.v1" as const;
type Common = {
  tokenLabel: string;
  decimals: number;
  totalAllocation: string;
  startDate: string;
  endDate: string;
  observationDate: string;
  previouslyReceived: string;
};
export type VestingInput =
  | (Common & { mode: "linear"; cliffDate: string })
  | (Common & { mode: "initial-linear"; cliffDate: string; initialBps: string })
  | (Common & {
      mode: "tranches";
      tranches: { date: string; amount: string }[];
    });
export type VestingTranche = {
  date: string;
  amountRaw: string;
  amountPercentRaw: string | null;
  status: "unlocked" | "future";
};
export type VestingResult = {
  calculationVersion: typeof VESTING_VERSION;
  mode: VestingInput["mode"];
  status: "complete" | "incomplete";
  reasons: string[];
  input: VestingInput;
  tokenLabel: string;
  decimals: number;
  fields: AkField[];
  nextUnlockDate: string | null;
  nextUnlockAmountRaw: string | null;
  schedule: VestingTranche[];
  assumptions: string[];
  limitations: string[];
};
const result = (
  input: VestingInput,
  name: string,
  places: number,
  fields: AkField[],
  reasons: string[],
  schedule: VestingTranche[],
  nextDate: string | null,
  nextAmount: string | null,
): VestingResult => ({
  calculationVersion: VESTING_VERSION,
  mode: input.mode,
  status: reasons.length ? "incomplete" : "complete",
  reasons,
  input,
  tokenLabel: name,
  decimals: places,
  fields,
  nextUnlockDate: nextDate,
  nextUnlockAmountRaw: nextAmount,
  schedule,
  assumptions: [
    "All allocation, dates, receipt history and token identity are user supplied.",
    "Dates are UTC calendar days; linear accrual starts at start, while a cliff gates access to accrued tokens.",
  ],
  limitations: [
    "A modeled unlock is not verified on-chain claimability, custody or receipt.",
    "No price, tax, signature, transaction or token-distributor state is fetched.",
  ],
});
const linearAccrued = (
  raw: bigint,
  start: number,
  end: number,
  observation: number,
  cliff: number | null,
) => {
  if (observation < start || (cliff !== null && observation < cliff)) return 0n;
  if (observation >= end) return raw;
  return bounded(
    (raw * BigInt(observation - start)) / BigInt(end - start),
    "Linear unlocked amount",
  );
};
const money = (name: string, raw: bigint, places: number, tokenName: string) =>
  tokenField(name, raw, places, tokenName);

export function calculateVesting(input: VestingInput): VestingResult {
  const name = tokenLabel(input.tokenLabel),
    places = decimals(input.decimals);
  const total = token(input.totalAllocation, places, "Total allocation");
  const start = utcDay(input.startDate),
    end = utcDay(input.endDate);
  const observation = utcDay(input.observationDate);
  if (end <= start || end - start > AK_MAX_DAYS)
    fail("Vesting end must follow start within 100 fixed 365-day years.");
  let vested = 0n,
    initial = 0n;
  let nextDate: string | null = null,
    nextAmount: string | null = null;
  const schedule: VestingTranche[] = [];
  if (input.mode === "linear" || input.mode === "initial-linear") {
    const cliff = input.cliffDate.trim() ? utcDay(input.cliffDate) : null;
    if (cliff !== null && (cliff < start || cliff > end))
      fail("Cliff must be between vesting start and end, inclusive.");
    if (input.mode === "initial-linear") {
      const weight = bps(input.initialBps, "Initial unlock");
      initial = (total * weight) / BPS;
    }
    if (observation >= start)
      vested = bounded(
        initial +
          linearAccrued(total - initial, start, end, observation, cliff),
        "Modeled vested allocation",
      );
  } else if (input.mode === "tranches") {
    if (
      !Array.isArray(input.tranches) ||
      input.tranches.length < 1 ||
      input.tranches.length > 30
    )
      fail("Enter 1–30 dated tranches.");
    let previous = -Infinity,
      scheduled = 0n;
    for (const [index, item] of input.tranches.entries()) {
      if (!item || typeof item !== "object")
        fail(`Tranche ${index + 1} is invalid.`);
      const day = utcDay(item.date);
      if (day < start || day > end)
        fail(`Tranche ${index + 1} must occur within the stated schedule.`);
      if (day <= previous)
        fail("Tranche dates must be unique and strictly increasing.");
      previous = day;
      const amount = token(item.amount, places, `Tranche ${index + 1} amount`);
      scheduled = bounded(scheduled + amount, "Scheduled allocation");
      if (day <= observation)
        vested = bounded(vested + amount, "Unlocked tranches");
      else if (nextDate === null) {
        nextDate = item.date;
        nextAmount = amount.toString();
      }
      schedule.push({
        date: item.date,
        amountRaw: amount.toString(),
        amountPercentRaw:
          total > 0n ? pctField("tranchePercent", amount, total).raw : null,
        status: day <= observation ? "unlocked" : "future",
      });
    }
    if (scheduled !== total)
      fail(
        "Scheduled tranche quantities must exactly equal the total allocation.",
      );
  } else return fail("Unsupported vesting mode.");
  const locked = total - vested;
  const fields = [
    money("totalAllocation", total, places, name),
    money("vestedAllocation", vested, places, name),
    money("lockedAllocation", locked, places, name),
  ];
  if (input.mode === "initial-linear")
    fields.push(
      money("initialUnlockAllocation", initial, places, name),
      money("remainingLinearAllocation", total - initial, places, name),
    );
  if (total > 0n) fields.push(pctField("vestedPercent", vested, total));
  const reasons: string[] =
    total === 0n ? ["A zero total has no defined unlock percentage."] : [];
  if (input.previouslyReceived.trim()) {
    const received = token(
      input.previouslyReceived,
      places,
      "Previously received amount",
    );
    if (received > vested)
      fail(
        "Previously received amount cannot exceed modeled vested allocation.",
      );
    fields.push(
      money("previouslyReceived", received, places, name),
      money("vestedButNotReceived", vested - received, places, name),
    );
  }
  return result(
    input,
    name,
    places,
    fields,
    reasons,
    schedule,
    nextDate,
    nextAmount,
  );
}

export const vestingReportJSON = (value: VestingResult) =>
  JSON.stringify(
    {
      ...value,
      simulated: true,
      disclaimer:
        "Manual token schedule only; modeled unlocks are not verified on-chain claimable balances.",
    },
    null,
    2,
  ) + "\n";
