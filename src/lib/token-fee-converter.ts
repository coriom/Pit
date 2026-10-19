/** Exact local unit and fee arithmetic. No token identity, price or network lookup. */
import { formatRaw, parseExactAmount, SwapCostInputError } from "./swap-cost";

export const TOKEN_FEE_VERSION = "pit.token-fee.local.v1" as const;
export type RateUnit = "percent" | "bps" | "ppm";
export type ConverterInput =
  | { mode: "native"; amount: string; unit: "wei" | "gwei" | "eth" }
  | {
      mode: "token";
      amount: string;
      direction: "human-to-raw" | "raw-to-human";
      decimals: number;
      tokenLabel: string;
    }
  | { mode: "rate"; amount: string; unit: RateUnit }
  | {
      mode: "fee";
      amount: string;
      decimals: number;
      tokenLabel: string;
      rate: string;
      rateUnit: RateUnit;
    };
export type ConverterResult = {
  calculationVersion: typeof TOKEN_FEE_VERSION;
  mode: ConverterInput["mode"];
  input: ConverterInput;
  /** All integer strings are exact raw quantities in the units named by the key. */
  raw: Record<string, string>;
  display: Record<string, string>;
  limitations: string;
};
export class ConverterInputError extends Error {
  readonly name = "ConverterInputError";
}
const SCALE = 10n ** 18n;
const roundDiv = (n: bigint, d: bigint) => (n + d / 2n) / d;
const fail = (message: string): never => {
  throw new ConverterInputError(message);
};
const parse = (amount: string, decimals: number, label: string) => {
  try {
    return parseExactAmount(amount, decimals, label);
  } catch (error) {
    if (error instanceof SwapCostInputError) fail(error.message);
    throw error;
  }
};
const validDecimals = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 36)
    fail("Token decimals must be an integer from 0 to 36.");
};
const tokenLabel = (value: string) => {
  const label = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(label))
    fail("Enter a manual token label; it is not a verified asset identity.");
  return label;
};
export function rateRatioRaw(value: string, unit: RateUnit): bigint {
  const places = { percent: 16, bps: 14, ppm: 12 }[unit];
  if (places === undefined) fail("Unsupported rate denomination.");
  return parse(value, places, `${unit} rate`);
}
const result = (
  input: ConverterInput,
  raw: Record<string, string>,
  display: Record<string, string>,
): ConverterResult => ({
  calculationVersion: TOKEN_FEE_VERSION,
  mode: input.mode,
  input,
  raw,
  display,
  limitations:
    "Manual arithmetic only; token labels are unverified, and no exchange rate or transaction is supplied.",
});

export function calculateTokenFee(input: ConverterInput): ConverterResult {
  switch (input.mode) {
    case "native": {
      if (!["wei", "gwei", "eth"].includes(input.unit))
        fail("Unsupported native unit.");
      const wei = parse(
        input.amount,
        { wei: 0, gwei: 9, eth: 18 }[input.unit],
        "Native amount",
      );
      return result(
        input,
        { wei: wei.toString() },
        {
          wei: wei.toString(),
          gwei: formatRaw(wei, 9),
          eth: formatRaw(wei, 18),
        },
      );
    }
    case "token": {
      validDecimals(input.decimals);
      tokenLabel(input.tokenLabel);
      if (!["human-to-raw", "raw-to-human"].includes(input.direction))
        fail("Unsupported token conversion direction.");
      const raw = parse(
        input.amount,
        input.direction === "human-to-raw" ? input.decimals : 0,
        "Token amount",
      );
      return result(
        input,
        { tokenBaseUnits: raw.toString() },
        {
          tokenBaseUnits: raw.toString(),
          humanAmount: formatRaw(raw, input.decimals),
        },
      );
    }
    case "rate": {
      const ratio = rateRatioRaw(input.amount, input.unit);
      return result(
        input,
        { ratio1e18: ratio.toString() },
        {
          percent: formatRaw(ratio, 16),
          bps: formatRaw(ratio, 14),
          ppm: formatRaw(ratio, 12),
        },
      );
    }
    case "fee": {
      validDecimals(input.decimals);
      tokenLabel(input.tokenLabel);
      const amount = parse(input.amount, input.decimals, "Amount before fee");
      const rate = rateRatioRaw(input.rate, input.rateUnit);
      if (rate > SCALE) fail("Fee rate cannot exceed 100%.");
      const fee = roundDiv(amount * rate, SCALE);
      const after = amount - fee;
      return result(
        input,
        {
          amountBaseUnits: amount.toString(),
          feeBaseUnits: fee.toString(),
          afterFeeBaseUnits: after.toString(),
          feeRatio1e18: rate.toString(),
        },
        {
          amount: formatRaw(amount, input.decimals),
          fee: formatRaw(fee, input.decimals),
          afterFee: formatRaw(after, input.decimals),
          feePercent: formatRaw(rate, 16),
        },
      );
    }
    default:
      return fail("Unsupported converter mode.");
  }
}

export const tokenFeeReportJSON = (value: ConverterResult) =>
  JSON.stringify(
    {
      ...value,
      rawUnits: Object.fromEntries(
        Object.keys(value.raw).map((key) => [
          key,
          key === "wei"
            ? { unit: "wei", decimals: 0 }
            : key === "ratio1e18" || key === "feeRatio1e18"
              ? { unit: "ratio", decimals: 18 }
              : {
                  unit: "manual-token-base-units",
                  decimals:
                    "decimals" in value.input ? value.input.decimals : null,
                },
        ]),
      ),
      assumptions: [
        "All values, decimals and rate denominations are manually supplied.",
      ],
      simulated: true,
      disclaimer:
        "Local arithmetic, not a quote, verified token identity or transaction.",
    },
    null,
    2,
  ) + "\n";
