/** Server-only premium reports. No browser import, wallet, RPC or persistence. */
import { runBc } from "../src/lib/bc-statistics";
import { runBj } from "../src/lib/bj-derivatives";
import { calculatePerformance, type PerformanceSnapshotInput } from "../src/lib/performance-drawdown";
import { parseCsv, spreadsheetCell } from "../src/lib/crypto-data-workshop";

export const REPORT_VERSION = "pit.premium.local.v1";
const MONEY = 100_000_000n;
const PCT = 10_000n;
const MAX_AMOUNT = 10n ** 22n;
type JsonObject = Record<string, unknown>;
type ReportBundle = { report: JsonObject; csv: string };

function fail(message: string): never { throw new Error(message); }
function object(value: unknown, fields: readonly string[], name: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object.`);
  const out = value as JsonObject;
  if (Object.keys(out).some(key => !fields.includes(key))) fail(`${name} contains an unsupported field.`);
  return out;
}
function text(value: unknown, name: string, pattern: RegExp, max = 32): string {
  if (typeof value !== "string" || value.length > max || !pattern.test(value)) fail(`${name} is invalid.`);
  return value;
}
function list(value: unknown, name: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${name} needs ${min}–${max} entries.`);
  return value;
}
function date(value: unknown, name: string): string {
  const d = text(value, name, /^\d{4}-\d{2}-\d{2}$/, 10);
  const parsed = new Date(`${d}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== d) fail(`${name} is not a UTC calendar date.`);
  return d;
}
function raw(value: unknown, name: string, places = 8, signed = false): bigint {
  if (typeof value !== "string" || value.length > 40 || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || (!signed && value.startsWith("-"))) fail(`${name} must be a plain decimal string.`);
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  if (fraction.length > places) fail(`${name} exceeds ${places} decimal places.`);
  const result = BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, "0"));
  if (result > MAX_AMOUNT) fail(`${name} exceeds the supported bound.`);
  return negative ? -result : result;
}
function fmt(value: bigint, places = 8): string {
  const scale = 10n ** BigInt(places), abs = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${abs / scale}${abs % scale ? `.${String(abs % scale).padStart(places, "0").replace(/0+$/, "")}` : ""}`;
}
function round(n: bigint, d: bigint): bigint {
  if (d <= 0n) fail("Undefined division.");
  return n < 0n ? -((-n + d / 2n) / d) : (n + d / 2n) / d;
}
function csv(rows: readonly (readonly string[])[], spreadsheetSafe = true): string {
  return rows.map(row => row.map(cell => `"${(spreadsheetSafe ? spreadsheetCell(cell) : cell).replace(/"/g, '""')}"`).join(",")).join("\r\n") + "\r\n";
}
function integer(value: unknown, name: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) fail(`${name} must be an integer from ${min} to ${max}.`);
  return value as number;
}

export function portfolioBatchRisk(input: unknown): ReportBundle {
  const root = object(input, ["currency", "periodsPerYear", "dates", "assets", "snapshots"], "Portfolio report input");
  const currency = text(root.currency, "Manual quote currency", /^[A-Z]{3}$/, 3);
  const frequency = integer(root.periodsPerYear, "Periods per year", 1, 365);
  const dates = list(root.dates, "Aligned observation dates", 3, 60).map((v, i) => date(v, `Date ${i + 1}`));
  if (dates.some((d, i) => i && d <= dates[i - 1]!)) fail("Observation dates must increase without duplicates.");
  const ids = new Set<string>();
  const assets = list(root.assets, "Assets", 2, 8).map((item, i) => {
    const a = object(item, ["id", "label", "value", "returnsPct", "shockPct"], `Asset ${i + 1}`);
    const id = text(a.id, "Asset ID", /^[A-Za-z][A-Za-z0-9_-]*$/, 24);
    const label = text(a.label, "Asset label", /^[A-Za-z][A-Za-z0-9 ._-]*$/, 40);
    if (ids.has(id)) fail("Asset IDs must be unique and do not establish on-chain identity."); ids.add(id);
    const value = raw(a.value, `Value of ${id}`);
    if (value <= 0n) fail("Every included asset needs a positive manual valuation.");
    const returns = list(a.returnsPct, `${id} returns`, dates.length, dates.length).map((v, j) => {
      const r = raw(v, `${id} return ${j + 1}`, 4, true);
      if (r < -100n * PCT || r > 1000n * PCT) fail("Asset return is outside -100% to +1000%.");
      return r;
    });
    const shock = raw(a.shockPct, `${id} shock`, 4, true);
    if (shock < -100n * PCT || shock > 1000n * PCT) fail("Shock is outside -100% to +1000%.");
    return { id, label, value, returns, shock };
  });
  const total = assets.reduce((sum, a) => sum + a.value, 0n);
  if (total > MAX_AMOUNT) fail("Portfolio total exceeds the supported bound.");
  const shocked = assets.map(a => ({ ...a, projected: round(a.value * (100n * PCT + a.shock), 100n * PCT) }));
  const projectedTotal = shocked.reduce((sum, a) => sum + a.projected, 0n);
  if (projectedTotal > MAX_AMOUNT) fail("Shocked portfolio exceeds the supported bound.");
  const rows = shocked.map(a => ({ id: a.id, label: a.label, value: fmt(a.value), weightPct: fmt(round(a.value * 100n * PCT, total), 4), shockPct: fmt(a.shock, 4), projectedValue: fmt(a.projected), projectedWeightPct: projectedTotal ? fmt(round(a.projected * 100n * PCT, projectedTotal), 4) : null }));
  const top = assets.reduce((a, b) => b.value > a.value ? b : a);
  const hhi = round(assets.reduce((sum, a) => sum + a.value * a.value, 0n) * 10000n, total * total);
  const portfolioReturns = dates.map((_, j) => fmt(round(assets.reduce((sum, a) => sum + a.value * a.returns[j]!, 0n), total), 4));
  const volatility = runBc("realized-volatility", { returns: portfolioReturns.join(","), periodsPerYear: String(frequency), method: "simple" });
  const warnings: string[] = ["All values, return observations and shocks are manually supplied; labels are not verified asset identities."];
  const correlations: { left: string; right: string; correlation: string | null }[] = [];
  for (let i = 0; i < assets.length; i++) for (let j = i + 1; j < assets.length; j++) {
    let correlation: string | null = null;
    try {
      const result = runBc("correlation-beta", { assetReturns: assets[i]!.returns.map(r => fmt(r, 4)).join(","), benchmarkReturns: assets[j]!.returns.map(r => fmt(r, 4)).join(",") });
      correlation = result.fields["Pearson correlation"] ?? null;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("constant series")) throw error;
      warnings.push(`Correlation ${assets[i]!.id}/${assets[j]!.id} is undefined for a constant return series.`);
    }
    correlations.push({ left: assets[i]!.id, right: assets[j]!.id, correlation });
  }
  let history: JsonObject | null = null;
  if (root.snapshots !== undefined) {
    const snapshots = list(root.snapshots, "Historical snapshots", 2, 30).map((v, i) => {
      const s = object(v, ["date", "endingValue", "externalFlow"], `Snapshot ${i + 1}`);
      return { date: date(s.date, `Snapshot ${i + 1} date`), endingValue: text(s.endingValue, "Ending value", /^(?:0|[1-9]\d*)(?:\.\d+)?$/, 40), externalFlow: text(s.externalFlow, "External flow", /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/, 40) } satisfies PerformanceSnapshotInput;
    });
    const result = calculatePerformance({ mode: "drawdown", currencyLabel: currency, snapshots });
    history = { status: result.status, fields: result.fields, maxDrawdownPeakDate: result.maxDrawdownPeakDate, maxDrawdownTroughDate: result.maxDrawdownTroughDate, recoveryDate: result.recoveryDate, recovered: result.recovered, reasons: result.reasons };
    if (result.status !== "complete") warnings.push(...result.reasons);
    warnings.push("Historical balances and per-asset returns are separate supplied series; consistency is not inferred.");
  } else warnings.push("No dated portfolio balances: cash-flow-adjusted TWR and drawdown are unavailable.");
  if (dates.length < 30) warnings.push("Short return sample: volatility and correlations are unstable.");
  const report = { version: REPORT_VERSION, operation: "portfolio-batch-risk", currency, coverage: { assets: assets.length, alignedPeriods: dates.length, historicalSnapshots: root.snapshots ? (root.snapshots as unknown[]).length : 0 }, allocation: { total: fmt(total), largestAssetId: top.id, largestWeightPct: fmt(round(top.value * 100n * PCT, total), 4), hhi: hhi.toString(), assets: rows }, risk: { annualizedVolatilityPct: volatility.fields["Annualized realized volatility (%)"], periodVolatilityPct: volatility.fields["Sample period volatility (%)"], fixedWeightPortfolioReturnsPct: portfolioReturns, correlations }, stress: { projectedTotal: fmt(projectedTotal), change: fmt(projectedTotal - total), changePct: fmt(round((projectedTotal - total) * 100n * PCT, total), 4) }, history, warnings, assumptions: ["One manual quote currency; valuations are not verified prices.", "Fixed starting weights combine synchronized simple period returns; no rebalancing or compounding of holdings is inferred.", "Shocks apply independently to each starting value; no probability, fee or trade recommendation.", "Sample volatility uses the existing statistical estimator and square-root-of-time annualization."] } satisfies JsonObject;
  return { report, csv: csv([["assetId", "label", `value_${currency}`, "weightPct", "shockPct", `projectedValue_${currency}`, "projectedWeightPct"], ...rows.map(r => [r.id, r.label, r.value, r.weightPct, r.shockPct, r.projectedValue, r.projectedWeightPct ?? "undefined"])]) };
}

export function advancedTradingJournal(input: unknown): ReportBundle {
  const root = object(input, ["currency", "startingCapital", "tradesCsv"], "Trading journal input");
  const currency = text(root.currency, "Manual quote currency", /^[A-Z]{3}$/, 3);
  const startingCapital = raw(root.startingCapital, "Starting capital");
  if (startingCapital <= 0n) fail("Starting capital must be positive for drawdown.");
  const source = text(root.tradesCsv, "Trade CSV", /^[\s\S]+$/, 65536);
  const parsed = parseCsv(source, ",", true);
  if (parsed.issues.length || parsed.rows.length < 2 || parsed.rows.length > 500 || parsed.header.join(",") !== "id,date,strategy,grossPnl,fees,initialRisk") fail("Use 2–500 complete rows with header id,date,strategy,grossPnl,fees,initialRisk.");
  const ids = new Set<string>(); let previous = "", equity = startingCapital, peak = startingCapital, maxDrawdown = 0n;
  let gross = 0n, fees = 0n, net = 0n, wins = 0, losses = 0, breakeven = 0;
  let riskCount = 0, sumR = 0n, grossWins = 0n, grossLosses = 0n;
  const strategies = new Map<string, { count: number; wins: number; net: bigint }>();
  const prepared: { id: string; date: string; strategy: string; gross: bigint; fee: bigint; risk: bigint | null; net: bigint; equity: bigint }[] = [];
  for (const [i, row] of parsed.rows.entries()) {
    const [idText, dateText, strategyText, grossText, feeText, riskText] = row;
    const id = text(idText, `Trade ${i + 1} ID`, /^[A-Za-z][A-Za-z0-9_-]*$/, 32);
    const at = date(dateText, `Trade ${i + 1} date`);
    const strategy = text(strategyText, `Trade ${i + 1} strategy`, /^[A-Za-z][A-Za-z0-9 _-]*$/, 32);
    if (ids.has(id)) fail("Trade IDs must be unique."); ids.add(id);
    if (at < previous) fail("Trades must be ordered by UTC date."); previous = at;
    const gain = raw(grossText, `Trade ${i + 1} gross PnL`, 8, true);
    const fee = raw(feeText, `Trade ${i + 1} fee`);
    const risk = riskText === "" ? null : raw(riskText, `Trade ${i + 1} initial risk`);
    if (risk !== null && risk <= 0n) fail("Stated initial risk must be positive.");
    const outcome = gain - fee; equity += outcome;
    if (equity < 0n) fail("Modeled equity fell below zero; this simple closed-trade model is unsupported.");
    if (equity > peak) peak = equity;
    const drawdown = round((equity - peak) * 100n * PCT, peak);
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
    gross += gain; fees += fee; net += outcome;
    if (outcome > 0n) { wins++; grossWins += outcome; } else if (outcome < 0n) { losses++; grossLosses -= outcome; } else breakeven++;
    if (risk !== null) { riskCount++; sumR += round(outcome * MONEY, risk); }
    const group = strategies.get(strategy) ?? { count: 0, wins: 0, net: 0n };
    group.count++; if (outcome > 0n) group.wins++; group.net += outcome; strategies.set(strategy, group);
    prepared.push({ id, date: at, strategy, gross: gain, fee, risk, net: outcome, equity });
  }
  if (gross > MAX_AMOUNT || gross < -MAX_AMOUNT || fees > MAX_AMOUNT || net > MAX_AMOUNT || net < -MAX_AMOUNT) fail("Journal totals exceed the supported bound.");
  const freeCsv = csv([["id", "grossPnl", "fees"], ...prepared.map(t => [t.id, fmt(t.gross), fmt(t.fee)])], false);
  const free = runBj("trading-journal", { trades: freeCsv });
  if (free.fields["Net PnL"] !== fmt(net)) fail("Existing journal engine parity check failed.");
  const warnings = ["Closed trades only; no deposits, open positions, tax lots or causality inference."];
  if (riskCount < prepared.length) warnings.push(`${prepared.length - riskCount} trade(s) lack stated initial risk; R-multiple coverage is partial.`);
  if (prepared.length < 30) warnings.push("Small journal sample: outcome frequencies are unstable.");
  const byStrategy = [...strategies.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([strategy, s]) => ({ strategy, trades: s.count, wins: s.wins, netPnl: fmt(s.net), winRatePct: fmt(round(BigInt(s.wins) * 100n * PCT, BigInt(s.count)), 4) }));
  const report = { version: REPORT_VERSION, operation: "trading-journal-advanced", currency, coverage: { trades: prepared.length, riskObservedTrades: riskCount, strategies: strategies.size }, summary: { startingCapital: fmt(startingCapital), endingModeledEquity: fmt(equity), grossPnl: fmt(gross), totalFees: fmt(fees), netPnl: fmt(net), wins, losses, breakeven, winRatePct: fmt(round(BigInt(wins) * 100n * PCT, BigInt(prepared.length)), 4), profitFactor: free.fields["Profit factor"], maximumDrawdownPct: fmt(maxDrawdown, 4), meanRealizedR: riskCount ? fmt(round(sumR, BigInt(riskCount))) : null, averageWin: wins ? fmt(round(grossWins, BigInt(wins))) : null, averageLoss: losses ? fmt(round(grossLosses, BigInt(losses))) : null }, byStrategy, warnings, assumptions: ["Rows are ordered closed trades in one manual quote currency.", "Equity starts at the supplied capital, changes only by net closed-trade PnL and excludes external cash flows.", "Drawdown is relative to the running modeled equity peak; fees are deducted once.", "Realized R uses supplied initial risk; missing risk is not replaced with zero."] } satisfies JsonObject;
  return { report, csv: csv([["tradeId", "date", "strategy", `grossPnl_${currency}`, `fee_${currency}`, `netPnl_${currency}`, `initialRisk_${currency}`, `modeledEquity_${currency}`], ...prepared.map(t => [t.id, t.date, t.strategy, fmt(t.gross), fmt(t.fee), fmt(t.net), t.risk === null ? "" : fmt(t.risk), fmt(t.equity)])]) };
}
