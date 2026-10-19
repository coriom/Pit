/** Shared bounded integer arithmetic for the two Phase AI local tools. */
import { formatRaw, parseExactAmount, SwapCostInputError } from "./swap-cost";

export class AiInputError extends Error {
  readonly name = "AiInputError";
}
export const MAX_RAW = (1n << 256n) - 1n;
export const BPS = 10_000n;
export const SCALE = 10n ** 18n;
export const pow10 = (places: number) => 10n ** BigInt(places);
export const fail = (message: string): never => {
  throw new AiInputError(message);
};
export const bounded = (value: bigint, label: string) => {
  if (value < -MAX_RAW || value > MAX_RAW)
    fail(`${label} exceeds the bounded raw-integer range.`);
  return value;
};
export const floorDiv = (a: bigint, b: bigint) => {
  if (b <= 0n || a < 0n) fail("Invalid nonnegative division.");
  return a / b;
};
export const ceilDiv = (a: bigint, b: bigint) => {
  if (b <= 0n || a < 0n) fail("Invalid nonnegative division.");
  return (a + b - 1n) / b;
};
export const roundHalfUp = (a: bigint, b: bigint) => {
  if (b <= 0n) fail("Invalid rounding denominator.");
  return a < 0n ? -((-a + b / 2n) / b) : (a + b / 2n) / b;
};
export const parse = (value: string, places: number, label: string) => {
  if (typeof value !== "string" || value.length > 100)
    fail(`${label} must be a bounded decimal string.`);
  try {
    return bounded(parseExactAmount(value, places, label), label);
  } catch (error) {
    if (error instanceof SwapCostInputError) fail(error.message);
    throw error;
  }
};
export const precision = (value: number, label: string, max = 18) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > max)
    fail(`${label} must be a whole number from 0 to ${max}.`);
  return value;
};
export const label = (value: string, name: string) => {
  const text = value.trim();
  if (!/^[A-Za-z][A-Za-z0-9._:-]{0,31}$/.test(text))
    fail(`${name} needs a short manual label; it is not verified identity.`);
  return text;
};
export const bps = (value: string, name: string) => {
  if (typeof value !== "string" || value.length > 8)
    fail(`${name} must be bounded whole basis points.`);
  if (!/^(?:0|[1-9]\d*)$/.test(value))
    fail(`${name} must be whole basis points.`);
  const raw = BigInt(value);
  if (raw > BPS) fail(`${name} must be at most 10000 bps.`);
  return raw;
};
export const positive = (value: bigint, name: string) => {
  if (value <= 0n) fail(`${name} must be positive.`);
  return value;
};
export const field = (
  name: string,
  raw: bigint,
  decimals: number,
  unit: string,
) => ({
  name,
  raw: bounded(raw, name).toString(),
  decimals,
  unit,
  display: formatRaw(raw, decimals),
});
export type AiField = ReturnType<typeof field>;
