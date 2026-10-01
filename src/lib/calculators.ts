export type PositionSide = "long" | "short";

export class CalculationInputError extends Error {
  readonly name = "CalculationInputError";
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value))
    throw new CalculationInputError(`${label} must be finite.`);
  return value;
}

function positive(value: number, label: string): number {
  if (finite(value, label) <= 0)
    throw new CalculationInputError(`${label} must be greater than zero.`);
  return value;
}

function nonNegative(value: number, label: string): number {
  if (finite(value, label) < 0)
    throw new CalculationInputError(`${label} cannot be negative.`);
  return value;
}

export function parseDecimal(raw: string, label: string): number {
  const trimmed = raw.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed))
    throw new CalculationInputError(`${label} must be a decimal number.`);
  return finite(Number(trimmed), label);
}

export function calculatePnL(input: {
  side: PositionSide;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  totalFees: number;
}) {
  const { side } = input;
  if (side !== "long" && side !== "short")
    throw new CalculationInputError("Position side must be long or short.");
  const entry = positive(input.entryPrice, "Entry price");
  const exit = positive(input.exitPrice, "Exit price");
  const quantity = positive(input.quantity, "Quantity");
  const fees = nonNegative(input.totalFees, "Total fees");
  const entryNotional = positive(
    finite(entry * quantity, "Entry notional"),
    "Entry notional",
  );
  const grossPnL = finite(
    (exit - entry) * quantity * (side === "long" ? 1 : -1),
    "Gross PnL",
  );
  const netPnL = finite(grossPnL - fees, "Net PnL");
  const returnPct = finite((netPnL / entryNotional) * 100, "Return");
  return { entryNotional, grossPnL, netPnL, returnPct };
}

export function calculateLiquidation(input: {
  side: PositionSide;
  entryPrice: number;
  quantity: number;
  collateral: number;
  maintenanceRatePct: number;
}) {
  const { side } = input;
  if (side !== "long" && side !== "short")
    throw new CalculationInputError("Position side must be long or short.");
  const entry = positive(input.entryPrice, "Entry price");
  const quantity = positive(input.quantity, "Quantity");
  const collateral = positive(input.collateral, "Collateral");
  const ratePct = nonNegative(input.maintenanceRatePct, "Maintenance rate");
  if (ratePct >= 100)
    throw new CalculationInputError("Maintenance rate must be below 100%.");
  const rate = ratePct / 100;
  const entryNotional = positive(
    finite(entry * quantity, "Entry notional"),
    "Entry notional",
  );
  const maintenanceAtEntry = finite(
    entryNotional * rate,
    "Maintenance at entry",
  );
  if (collateral <= maintenanceAtEntry)
    throw new CalculationInputError(
      "Collateral must exceed maintenance at entry.",
    );
  // Equity = collateral +/- quantity * (mark - entry).
  // Maintenance = rate * quantity * mark. Solve equality for mark.
  const price =
    side === "long"
      ? (entry - collateral / quantity) / (1 - rate)
      : (entry + collateral / quantity) / (1 + rate);
  finite(price, "Threshold price");
  return {
    thresholdPrice: price > 0 ? price : null,
    maintenanceAtEntry,
    entryNotional,
  };
}

export function calculateImpermanentLoss(input: {
  initialPrice: number;
  finalPrice: number;
  initialPoolValue: number;
}) {
  const initial = positive(input.initialPrice, "Initial price");
  const final = positive(input.finalPrice, "Final price");
  const value = positive(input.initialPoolValue, "Initial pool value");
  const priceRatio = positive(
    finite(final / initial, "Price ratio"),
    "Price ratio",
  );
  const holdValue = finite((value / 2) * (1 + priceRatio), "Hold value");
  const poolValue = finite(value * Math.sqrt(priceRatio), "Pool value");
  const difference = finite(poolValue - holdValue, "Value difference");
  const lossPct = finite((difference / holdValue) * 100, "Impermanent loss");
  return { priceRatio, holdValue, poolValue, difference, lossPct };
}
