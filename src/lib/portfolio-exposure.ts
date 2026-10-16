/** Browser-local, manually priced long-only spot holdings. No wallet or price feed. */
import { formatRaw, parseExactAmount } from "./swap-cost";

export const PORTFOLIO_VERSION = "pit.portfolio-exposure.manual.v1";
export const USD_DECIMALS = 18;
export const MAX_POSITIONS = 200;
export const MAX_CSV_BYTES = 262_144;
export const CSV_HEADER =
  "accountLabel,chainId,assetType,tokenAddress,symbol,decimals,quantity,unitPriceUsd,priceObservedAt,exposureGroup";
export const CHAIN_LABELS: Record<number, string> = {
  1: "Ethereum",
  8453: "Base",
  42161: "Arbitrum",
  11155111: "Ethereum Sepolia",
  84532: "Base Sepolia",
  421614: "Arbitrum Sepolia",
};
export type PositionInput = {
  accountLabel: string;
  chainId: number;
  assetType: "native" | "erc20";
  tokenAddress: string;
  symbol: string;
  decimals: number;
  quantity: string;
  unitPriceUsd: string;
  priceObservedAt: string;
  exposureGroup: string;
};
export type PositionResult = {
  input: PositionInput;
  assetIdentity: string;
  quantityRaw: string;
  unitPriceUsdRaw: string | null;
  valueUsdRaw: string | null;
  stale: boolean;
  weightPpm: string | null;
};
export type Allocation = {
  identity: string;
  valueUsdRaw: string;
  weightPpm: string | null;
};
export type PortfolioResult = {
  calculationVersion: typeof PORTFOLIO_VERSION;
  disclaimer: string;
  usdDecimals: 18;
  observedAt: string;
  staleAfterDays: number;
  status: "COMPLETE" | "INCOMPLETE" | "EMPTY";
  knownSubtotalUsdRaw: string;
  pricedCount: number;
  unpricedCount: number;
  staleCount: number;
  positions: PositionResult[];
  byAsset: Allocation[];
  byChain: Allocation[];
  byAccount: Allocation[];
  byGroup: Allocation[];
  largestPositionWeightPpm: string | null;
  topThreeWeightPpm: string | null;
  /** HHI on the conventional 0..10,000 scale, multiplied by 10^6. */
  hhiMicro: string | null;
};
export class PortfolioInputError extends Error {
  readonly name = "PortfolioInputError";
}
const fail = (message: string): never => {
  throw new PortfolioInputError(message);
};
const MAX_UINT256 = (1n << 256n) - 1n;
const pctScale = 1_000_000n;
const safeText = (value: string, label: string, max = 64, required = true) => {
  const text = value.trim();
  if ((required && !text) || text.length > max || /[\x00-\x1f\x7f]/.test(text))
    fail(
      `${label} must be ${required ? "nonempty and " : ""}at most ${max} printable characters.`,
    );
  return text;
};
const add = (map: Map<string, bigint>, key: string, value: bigint) =>
  map.set(key, (map.get(key) ?? 0n) + value);
const roundDiv = (n: bigint, d: bigint) => (n + d / 2n) / d;
const weight = (n: bigint, total: bigint) =>
  total ? roundDiv(n * pctScale, total).toString() : null;
const allocations = (
  map: Map<string, bigint>,
  total: bigint,
  complete: boolean,
): Allocation[] =>
  [...map]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([identity, value]) => ({
      identity,
      valueUsdRaw: value.toString(),
      weightPpm: complete ? weight(value, total) : null,
    }));

export function normalizePosition(
  input: PositionInput,
  nowMs: number,
  staleAfterDays: number,
): PositionResult {
  const accountLabel = safeText(input.accountLabel, "Account label");
  const symbol = safeText(input.symbol, "Symbol metadata", 32);
  const exposureGroup = safeText(
    input.exposureGroup,
    "Exposure group",
    64,
    false,
  );
  if (!Object.hasOwn(CHAIN_LABELS, input.chainId))
    fail("Unsupported descriptive chain ID.");
  if (input.assetType !== "native" && input.assetType !== "erc20")
    fail("Only native or ERC-20 spot assets are supported.");
  if (
    !Number.isSafeInteger(input.decimals) ||
    input.decimals < 0 ||
    input.decimals > 36
  )
    fail("Token decimals must be 0–36.");
  let address = input.tokenAddress.trim().toLowerCase();
  if (input.assetType === "native") {
    if (address) fail("Native assets must have an empty token address.");
    if (input.decimals !== 18)
      fail("Supported EVM native assets use 18 decimals.");
    address = "native";
  } else if (!/^0x[0-9a-f]{40}$/.test(address) || /^0x0{40}$/.test(address)) {
    fail("ERC-20 token address must be a nonzero 20-byte hex address.");
  }
  const quantityRaw = parseExactAmount(
    input.quantity,
    input.decimals,
    "Quantity",
  );
  if (!quantityRaw) fail("Long-only spot quantity must be positive.");
  const hasPrice = input.unitPriceUsd.trim() !== "";
  const unitPriceUsdRaw = hasPrice
    ? parseExactAmount(input.unitPriceUsd, USD_DECIMALS, "Manual USD price")
    : null;
  const timestamp = input.priceObservedAt.trim();
  if (hasPrice !== Boolean(timestamp))
    fail("Price and its observation timestamp must be supplied together.");
  let stale = false;
  if (hasPrice) {
    if (
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(
        timestamp,
      )
    )
      fail("Price timestamp must be an ISO 8601 date-time with timezone.");
    const at = Date.parse(timestamp);
    if (!Number.isFinite(at) || at > nowMs)
      fail("Price timestamp is invalid or in the future.");
    stale = nowMs - at > staleAfterDays * 86_400_000;
  }
  const value =
    unitPriceUsdRaw === null
      ? null
      : roundDiv(quantityRaw * unitPriceUsdRaw, 10n ** BigInt(input.decimals));
  if (value !== null && value > MAX_UINT256)
    fail("USD valuation exceeds supported range.");
  return {
    input: {
      ...input,
      accountLabel,
      symbol,
      exposureGroup,
      tokenAddress: input.assetType === "native" ? "" : address,
    },
    assetIdentity: `${input.chainId}:${input.assetType}:${address}`,
    quantityRaw: quantityRaw.toString(),
    unitPriceUsdRaw: unitPriceUsdRaw?.toString() ?? null,
    valueUsdRaw: value?.toString() ?? null,
    stale,
    weightPpm: null,
  };
}

export function calculatePortfolio(
  inputs: PositionInput[],
  options: { nowIso: string; staleAfterDays: number },
): PortfolioResult {
  if (!Array.isArray(inputs) || inputs.length > MAX_POSITIONS)
    fail(`At most ${MAX_POSITIONS} positions are supported.`);
  const nowMs = Date.parse(options.nowIso);
  if (
    !Number.isFinite(nowMs) ||
    !Number.isSafeInteger(options.staleAfterDays) ||
    options.staleAfterDays < 0 ||
    options.staleAfterDays > 3650
  )
    fail("Observation time or stale-price threshold is invalid.");
  const positions = inputs.map((input, index) => {
    try {
      return normalizePosition(input, nowMs, options.staleAfterDays);
    } catch (error) {
      return fail(
        `Row ${index + 1}: ${error instanceof Error ? error.message : "Invalid position"}`,
      );
    }
  });
  const seen = new Set<string>();
  const prices = new Map<string, string>();
  const assetDecimals = new Map<string, number>();
  for (const [index, position] of positions.entries()) {
    const key = `${position.input.accountLabel.toLowerCase()}:${position.assetIdentity}`;
    if (seen.has(key))
      fail(
        `Row ${index + 1}: duplicate account/chain/asset holding; consolidate it explicitly.`,
      );
    seen.add(key);
    const priorDecimals = assetDecimals.get(position.assetIdentity);
    if (
      priorDecimals !== undefined &&
      priorDecimals !== position.input.decimals
    )
      fail(
        `Row ${index + 1}: conflicting decimals for the same chain-scoped asset.`,
      );
    assetDecimals.set(position.assetIdentity, position.input.decimals);
    const prior = prices.get(position.assetIdentity);
    if (
      prior !== undefined &&
      position.unitPriceUsdRaw !== null &&
      prior !== position.unitPriceUsdRaw
    )
      fail(
        `Row ${index + 1}: conflicting manual prices for the same chain-scoped asset.`,
      );
    if (position.unitPriceUsdRaw !== null)
      prices.set(position.assetIdentity, position.unitPriceUsdRaw);
  }
  const known = positions.filter((position) => position.valueUsdRaw !== null);
  const total = known.reduce(
    (sum, position) => sum + BigInt(position.valueUsdRaw!),
    0n,
  );
  if (total > MAX_UINT256)
    fail("Known portfolio value exceeds supported range.");
  const complete = positions.length > 0 && known.length === positions.length;
  const denominatorsValid = complete && total > 0n;
  const byAsset = new Map<string, bigint>(),
    byChain = new Map<string, bigint>();
  const byAccount = new Map<string, bigint>(),
    byGroup = new Map<string, bigint>();
  for (const position of known) {
    const value = BigInt(position.valueUsdRaw!);
    add(byAsset, position.assetIdentity, value);
    add(
      byChain,
      `${position.input.chainId} — ${CHAIN_LABELS[position.input.chainId]}`,
      value,
    );
    add(byAccount, position.input.accountLabel, value);
    add(byGroup, position.input.exposureGroup || "Ungrouped", value);
    if (denominatorsValid) position.weightPpm = weight(value, total);
  }
  const sorted = known
    .map((p) => BigInt(p.valueUsdRaw!))
    .sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  const hhi = denominatorsValid
    ? roundDiv(
        sorted.reduce((sum, value) => sum + value * value, 0n) *
          10_000_000_000n,
        total * total,
      )
    : null;
  return {
    calculationVersion: PORTFOLIO_VERSION,
    disclaimer:
      "Manual spot holdings and prices only; no live data, complete-wallet discovery, risk score or investment advice.",
    usdDecimals: USD_DECIMALS,
    observedAt: new Date(nowMs).toISOString(),
    staleAfterDays: options.staleAfterDays,
    status:
      positions.length === 0 ? "EMPTY" : complete ? "COMPLETE" : "INCOMPLETE",
    knownSubtotalUsdRaw: total.toString(),
    pricedCount: known.length,
    unpricedCount: positions.length - known.length,
    staleCount: positions.filter((p) => p.stale).length,
    positions,
    byAsset: allocations(byAsset, total, denominatorsValid),
    byChain: allocations(byChain, total, denominatorsValid),
    byAccount: allocations(byAccount, total, denominatorsValid),
    byGroup: allocations(byGroup, total, denominatorsValid),
    largestPositionWeightPpm: denominatorsValid
      ? weight(sorted[0] ?? 0n, total)
      : null,
    topThreeWeightPpm: denominatorsValid
      ? weight(
          sorted.slice(0, 3).reduce((a, b) => a + b, 0n),
          total,
        )
      : null,
    hhiMicro: hhi?.toString() ?? null,
  };
}

/** RFC 4180-style quoted cells, commas and CRLF; no formulas are evaluated. */
export function parsePortfolioCSV(
  text: string,
  nowMs = Date.now(),
): { rows: PositionInput[]; errors: string[] } {
  if (new TextEncoder().encode(text).byteLength > MAX_CSV_BYTES)
    fail("CSV exceeds 256 KiB.");
  const source = text.replace(/^\uFEFF/, "");
  if (source.includes("\0")) fail("CSV contains a NUL character.");
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
        afterQuote = true;
      } else field += ch;
    } else if (afterQuote) {
      if (ch === "," || ch === "\n" || ch === "\r") {
        afterQuote = false;
        i--;
      } else fail("Unexpected character after a quoted CSV field.");
    } else if (ch === '"') {
      if (field) fail("Quote inside unquoted CSV field.");
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      records.push(row);
      row = [];
      if (records.length > MAX_POSITIONS + 1) fail("CSV has too many rows.");
    } else field += ch;
    if (field.length > 1024) fail("CSV field exceeds 1024 characters.");
  }
  if (quoted) fail("Unclosed quoted CSV field.");
  if (field || row.length) {
    row.push(field);
    records.push(row);
  }
  if (records[0]?.join(",") !== CSV_HEADER)
    fail(`CSV header must be exactly: ${CSV_HEADER}`);
  if (records.length - 1 > MAX_POSITIONS) fail("CSV has too many positions.");
  const rows: PositionInput[] = [],
    errors: string[] = [];
  for (let i = 1; i < records.length; i++) {
    const cells = records[i];
    if (cells.length === 1 && !cells[0]) continue;
    if (cells.length !== 10) {
      errors.push(`Row ${i}: expected 10 columns.`);
      continue;
    }
    if (
      !/^(?:0|[1-9]\d*)$/.test(cells[1]) ||
      !/^(?:0|[1-9]\d*)$/.test(cells[5])
    ) {
      errors.push(
        `Row ${i}: chain ID and decimals must be explicit whole numbers.`,
      );
      continue;
    }
    const chainId = Number(cells[1]),
      decimals = Number(cells[5]);
    const rowInput: PositionInput = {
      accountLabel: cells[0],
      chainId,
      assetType: cells[2] as PositionInput["assetType"],
      tokenAddress: cells[3],
      symbol: cells[4],
      decimals,
      quantity: cells[6],
      unitPriceUsd: cells[7],
      priceObservedAt: cells[8],
      exposureGroup: cells[9],
    };
    try {
      normalizePosition(rowInput, nowMs, 3650);
      rows.push(rowInput);
    } catch (error) {
      errors.push(
        `Row ${i}: ${error instanceof Error ? error.message : "Invalid position"}`,
      );
    }
  }
  return { rows, errors };
}

export const portfolioReportJSON = (result: PortfolioResult) =>
  JSON.stringify(result, null, 2) + "\n";
export const formatUsd = (raw: string) => `$${formatRaw(raw, USD_DECIMALS)}`;
export const formatPercent = (ppm: string | null) =>
  ppm === null ? "UNKNOWN" : `${formatRaw(ppm, 4)}%`;
export const formatHhi = (micro: string | null) =>
  micro === null ? "UNKNOWN" : formatRaw(micro, 6);
