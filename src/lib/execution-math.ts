/** Manual spread, slippage and EVM gas arithmetic; never a quote or transaction. */
import {
  BPS,
  SCALE,
  AiInputError,
  bounded,
  bps,
  ceilDiv,
  fail,
  field,
  floorDiv,
  label,
  parse,
  positive,
  precision,
  roundHalfUp,
  type AiField,
} from "./ai-math";

export const EXECUTION_MATH_VERSION = "pit.execution-math.local.v1" as const;
export type ExecutionMathInput =
  | {
      mode: "spread";
      quoteLabel: string;
      quoteDecimals: number;
      bid: string;
      ask: string;
      referencePrice: string;
      executionPrice: string;
    }
  | {
      mode: "slippage";
      tokenLabel: string;
      tokenDecimals: number;
      direction: "exact-input" | "exact-output";
      expectedAmount: string;
      toleranceBps: string;
    }
  | {
      mode: "gas";
      nativeLabel: string;
      transactionGasUnits: string;
      approvalRequired: "yes" | "no" | "unknown";
      approvalGasUnits: string;
      gasPriceGwei: string;
      budgetNative: string;
      notionalNative: string;
      coverage: "complete" | "unknown-extra";
    };
export type ExecutionMathResult = {
  calculationVersion: typeof EXECUTION_MATH_VERSION;
  mode: ExecutionMathInput["mode"];
  status: "complete" | "incomplete";
  reasons: string[];
  input: ExecutionMathInput;
  fields: AiField[];
  assumptions: string[];
  limitations: string[];
};
export { AiInputError as ExecutionMathInputError };

const outcome = (
  input: ExecutionMathInput,
  fields: AiField[],
  reasons: string[],
): ExecutionMathResult => ({
  calculationVersion: EXECUTION_MATH_VERSION,
  mode: input.mode,
  status: reasons.length ? "incomplete" : "complete",
  reasons,
  input,
  fields,
  assumptions: [
    "All prices, amounts, gas units and rates are manually supplied.",
    "Gas is modeled as EVM gas units times wei per gas unit, with an explicitly selected coverage state.",
  ],
  limitations: [
    "No live quote, gas estimate, RPC, L2 data fee, user-operation fee or transaction.",
    "Spread, execution deviation, price impact and realized slippage are different concepts.",
  ],
});
const signedRound = (a: bigint, b: bigint) => roundHalfUp(a, b);
const units = (value: string, name: string) => {
  const raw = positive(parse(value, 0, name), name);
  if (raw > 1_000_000_000n)
    fail(`${name} exceeds the supported one-billion-unit cap.`);
  return raw;
};

export function calculateExecutionMath(
  input: ExecutionMathInput,
): ExecutionMathResult {
  switch (input.mode) {
    case "spread": {
      const quote = label(input.quoteLabel, "Quote unit");
      const places = precision(input.quoteDecimals, "Quote precision", 18);
      const bid = positive(parse(input.bid, places, "Bid"), "Bid");
      const ask = positive(parse(input.ask, places, "Ask"), "Ask");
      const reference = positive(
        parse(input.referencePrice, places, "Reference price"),
        "Reference price",
      );
      const execution = positive(
        parse(input.executionPrice, places, "Execution price"),
        "Execution price",
      );
      if (ask < bid)
        fail(
          "Ask must be at least bid; a crossed manual market is unsupported.",
        );
      const midpoint = bounded(
        roundHalfUp((bid + ask) * SCALE, 2n * 10n ** BigInt(places)),
        "Midpoint",
      );
      const spread = ask - bid;
      const spreadBps = bounded(
        roundHalfUp(spread * 2n * BPS * SCALE, bid + ask),
        "Spread bps",
      );
      const delta = execution - reference;
      const deviationBps = bounded(
        signedRound(delta * BPS * SCALE, reference),
        "Reference deviation bps",
      );
      return outcome(
        input,
        [
          field("midpoint", midpoint, 18, `${quote} per unit (manual)`),
          field("absoluteSpread", spread, places, `${quote} per unit (manual)`),
          field("midpointSpreadBps", spreadBps, 18, "bps of midpoint"),
          field(
            "executionDeviation",
            delta,
            places,
            `${quote} per unit vs reference`,
          ),
          field("executionDeviationBps", deviationBps, 18, "bps of reference"),
        ],
        [],
      );
    }
    case "slippage": {
      const token = label(input.tokenLabel, "Token");
      const places = precision(input.tokenDecimals, "Token decimals", 36);
      if (
        input.direction !== "exact-input" &&
        input.direction !== "exact-output"
      )
        fail("Choose an exact-input or exact-output bound.");
      const expected = positive(
        parse(input.expectedAmount, places, "Expected token amount"),
        "Expected token amount",
      );
      const tolerance = bps(input.toleranceBps, "Slippage tolerance");
      const bound =
        input.direction === "exact-input"
          ? floorDiv(expected * (BPS - tolerance), BPS)
          : ceilDiv(expected * (BPS + tolerance), BPS);
      const delta =
        input.direction === "exact-input" ? expected - bound : bound - expected;
      return outcome(
        input,
        [
          field(
            "expectedAmount",
            expected,
            places,
            `${token} base units (manual)`,
          ),
          field(
            input.direction === "exact-input"
              ? "minimumReceive"
              : "maximumSpend",
            bounded(bound, "Slippage bound"),
            places,
            `${token} base units (manual)`,
          ),
          field(
            "toleranceDelta",
            delta,
            places,
            `${token} base units (manual)`,
          ),
        ],
        [],
      );
    }
    case "gas": {
      const native = label(input.nativeLabel, "Native gas token");
      const transactionUnits = units(
        input.transactionGasUnits,
        "Transaction gas units",
      );
      if (!["yes", "no", "unknown"].includes(input.approvalRequired))
        fail("Invalid approval requirement.");
      if (!["complete", "unknown-extra"].includes(input.coverage))
        fail("Invalid gas coverage choice.");
      const reasons: string[] = [];
      let approvalUnits = 0n;
      if (input.approvalRequired === "yes") {
        if (input.approvalGasUnits.trim() === "")
          reasons.push("Approval gas units are unknown.");
        else
          approvalUnits = units(input.approvalGasUnits, "Approval gas units");
      } else if (input.approvalGasUnits.trim() !== "")
        fail(
          "Approval gas units must be blank unless approval is required; do not count gas twice.",
        );
      if (input.approvalRequired === "unknown")
        reasons.push("Approval requirement is unknown.");
      if (input.coverage === "unknown-extra")
        reasons.push("Other applicable gas or data-fee coverage is unknown.");
      const totalUnits = bounded(
        transactionUnits + approvalUnits,
        "Total planned gas units",
      );
      const approvalKnown =
        input.approvalRequired !== "unknown" &&
        !(
          input.approvalRequired === "yes" &&
          input.approvalGasUnits.trim() === ""
        );
      const fields = [
        field("transactionGasUnits", transactionUnits, 0, "gas units"),
      ];
      if (approvalKnown)
        fields.push(
          field("approvalGasUnits", approvalUnits, 0, "gas units"),
          field("knownGasUnits", totalUnits, 0, "gas units"),
        );
      const gasPriceWei =
        input.gasPriceGwei.trim() === ""
          ? null
          : parse(input.gasPriceGwei, 9, "Gas price in gwei");
      const budgetWei =
        input.budgetNative.trim() === ""
          ? null
          : parse(input.budgetNative, 18, "Native gas budget");
      const notional =
        input.notionalNative.trim() === ""
          ? null
          : positive(
              parse(input.notionalNative, 18, "Native notional"),
              "Native notional",
            );
      if (gasPriceWei === null) reasons.push("Gas price is unknown.");
      if (budgetWei === null) reasons.push("Native gas budget is unknown.");
      if (gasPriceWei !== null) {
        const transactionWei = bounded(
          transactionUnits * gasPriceWei,
          "Transaction gas wei",
        );
        fields.push(field("transactionGasWei", transactionWei, 0, "wei"));
        if (
          input.approvalRequired === "yes" &&
          input.approvalGasUnits.trim() !== ""
        )
          fields.push(
            field(
              "approvalGasWei",
              bounded(approvalUnits * gasPriceWei, "Approval gas wei"),
              0,
              "wei",
            ),
          );
        if (approvalKnown) {
          const totalWei = bounded(
            totalUnits * gasPriceWei,
            "Known total gas wei",
          );
          fields.push(
            field("knownTotalGasWei", totalWei, 0, "wei"),
            field(
              "knownTotalGasNative",
              totalWei,
              18,
              `${native} (manual EVM native unit)`,
            ),
          );
          if (notional !== null) {
            fields.push(
              field(
                "gasShareOfNativeNotionalBps",
                bounded(
                  roundHalfUp(totalWei * BPS * SCALE, notional),
                  "Gas/notional ratio",
                ),
                18,
                "bps of stated native notional",
              ),
            );
          }
        }
      }
      if (budgetWei !== null && approvalKnown) {
        const maxGasPriceWei = floorDiv(budgetWei, totalUnits);
        fields.push(
          field("maximumGasPriceWei", maxGasPriceWei, 0, "wei per gas"),
          field("maximumGasPriceGwei", maxGasPriceWei, 9, "gwei per gas"),
        );
      }
      return outcome(input, fields, reasons);
    }
    default:
      return fail("Unsupported execution-math mode.");
  }
}

export const executionMathReportJSON = (value: ExecutionMathResult) =>
  JSON.stringify(
    {
      ...value,
      simulated: true,
      disclaimer:
        "Manual execution mathematics, not a live quote, verified gas estimate or transaction.",
    },
    null,
    2,
  ) + "\n";
