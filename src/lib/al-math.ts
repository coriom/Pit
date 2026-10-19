/** Shared bounded manual-currency arithmetic; no implicit rates or browser state. */
import {
  BPS,
  SCALE,
  bounded,
  ceilDiv,
  fail,
  field,
  label,
  parse,
  precision,
} from "./ai-math";
export { BPS, SCALE, bounded, ceilDiv, fail, field, label, parse, precision };

export const MAX_DAYS = 36_500;
export const MAX_PERIODS = 600;
export const whole = (
  value: number,
  name: string,
  min: number,
  max: number,
) => {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail(`${name} must be a whole number from ${min} to ${max}.`);
  return value;
};
export const rate = (value: string, name: string, max = 10_000n) => {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,4})$/.test(value))
    fail(`${name} must be bounded whole basis points.`);
  const raw = BigInt(value);
  if (raw > max) fail(`${name} exceeds its supported basis-point range.`);
  return raw;
};
export const signedRate = (value: string, name: string) => {
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d{0,4})$/.test(value))
    fail(`${name} must be bounded signed whole basis points.`);
  const raw = BigInt(value);
  if (raw < -BPS || raw > BPS) fail(`${name} must be between -100% and +100%.`);
  return raw;
};
export const money = (value: string, places: number, name: string) => {
  const raw = parse(value, precision(places, "Currency precision"), name);
  if (raw < 0n) fail(`${name} must be nonnegative.`);
  return raw;
};
export const currency = (value: string) =>
  label(value, "Manual currency label");
export const moneyField = (
  name: string,
  raw: bigint,
  places: number,
  unit: string,
) => field(name, bounded(raw, name), places, `${unit} (manual)`);
export const ratioField = (
  name: string,
  numerator: bigint,
  denominator: bigint,
) => {
  if (denominator <= 0n) fail(`${name} has no positive denominator.`);
  return field(
    name,
    bounded((numerator * SCALE) / denominator, name),
    18,
    "dimensionless ratio",
  );
};
export const percentField = (
  name: string,
  numerator: bigint,
  denominator: bigint,
) => {
  if (denominator <= 0n) fail(`${name} has no positive denominator.`);
  return field(
    name,
    bounded((numerator * 100n * SCALE) / denominator, name),
    18,
    "% (manual scenario)",
  );
};
export const getField = (
  fields: readonly ReturnType<typeof field>[],
  name: string,
) => fields.find((item) => item.name === name)?.raw;

/** Floor for a signed rational, so adverse monetary returns never round upward. */
export const signedFloor = (numerator: bigint, denominator: bigint) => {
  if (denominator <= 0n) fail("Invalid signed division denominator.");
  return numerator >= 0n
    ? numerator / denominator
    : -ceilDiv(-numerator, denominator);
};
