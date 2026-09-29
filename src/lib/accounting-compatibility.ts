export const DERIVATIVE_TAXLOT_STATUS = "unsupported_derivative_v1" as const;
export const DERIVATIVE_ACCOUNTING_BLOCKED =
  "Hyperliquid derivative accounting is BLOCKED: unsupported_derivative_v1. Raw evidence is not a Taxlot event or derivative CSV.";
// Runtime refusal, not a tax interpretation. These fields do not belong to CoW Trade.
export function hasDerivativeSource(
  value: unknown,
  seen = new WeakSet<object>(),
): boolean {
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value))
    return value.some((item) => hasDerivativeSource(item, seen));
  const raw = value as Record<string, unknown>;
  return (
    [
      "tid",
      "coin",
      "sz",
      "px",
      "closedPnl",
      "startPosition",
      "liquidation",
      "delta",
      "taxlot_status",
    ].some((k) => k in raw) ||
    [raw.protocol, raw.kind, raw.source].some(
      (v) => typeof v === "string" && v.toLowerCase().includes("hyperliquid"),
    ) ||
    hasDerivativeSource(raw.payload, seen)
  );
}
export function assertNotDerivativeSource(value: unknown) {
  if (hasDerivativeSource(value))
    throw new Error(DERIVATIVE_ACCOUNTING_BLOCKED);
}
