/** Bounded pure helpers for manual token scenarios. Calendar Numbers are not financial values. */
import {
  BPS,
  SCALE,
  bounded,
  ceilDiv,
  fail,
  field,
  label,
  parse,
  roundHalfUp,
} from "./ai-math";
export { BPS, SCALE, bounded, ceilDiv, fail, field, label, parse, roundHalfUp };

export const AK_MAX_DAYS = 36500;
export const AK_MAX_PERIODS = 3650;
export type AkField = ReturnType<typeof field>;
export const decimals = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 36)
    fail("Token decimals must be a whole number from 0 to 36.");
  return value;
};
export const whole = (
  value: number,
  name: string,
  low: number,
  high: number,
) => {
  if (!Number.isSafeInteger(value) || value < low || value > high)
    fail(`${name} must be a whole number from ${low} to ${high}.`);
  return value;
};
export const bps = (value: string, name: string) => {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,4})$/.test(value))
    fail(`${name} must be whole basis points from 0 to 10000.`);
  const raw = BigInt(value);
  if (raw > BPS) fail(`${name} must be at most 10000 bps.`);
  return raw;
};
export const token = (value: string, places: number, name: string) =>
  parse(value, decimals(places), name);
export const tokenLabel = (value: string) => label(value, "Manual token label");
export const tokenField = (
  name: string,
  raw: bigint,
  places: number,
  tokenName: string,
) => field(name, bounded(raw, name), places, `${tokenName} (manual token)`);
export const pctField = (
  name: string,
  numerator: bigint,
  denominator: bigint,
) => {
  if (denominator <= 0n) fail(`${name} has no positive denominator.`);
  return field(
    name,
    roundHalfUp(numerator * 100n * SCALE, denominator),
    18,
    "% (modeled)",
  );
};
export const positiveRate = (value: string, name: string) => {
  const raw = parse(value, 18, name);
  if (raw <= 0n) fail(`${name} must be positive.`);
  return raw;
};
export const formatToken = (raw: bigint, places: number) =>
  tokenField("value", raw, places, "token").display;

/** Strict UTC calendar date, years 1900–2100. The day number is only for intervals. */
export const utcDay = (value: string): number => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail("Date must be YYYY-MM-DD in UTC.");
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1900 || year > 2100) fail("Date year must be 1900–2100.");
  const milliseconds = Date.UTC(year, month - 1, day);
  const date = new Date(milliseconds);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  )
    fail("Date is not a valid UTC calendar day.");
  return milliseconds / 86_400_000;
};
