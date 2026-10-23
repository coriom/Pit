import { describe, expect, it } from "vitest";
import { advancedTradingJournal, portfolioBatchRisk } from "../premium/reports";
import { journalExample, portfolioExample } from "../premium/examples.mjs";

describe("premium report references", () => {
  it("combines independently known allocation, stress, flow-neutral history and sample volatility", () => {
    const { report, csv } = portfolioBatchRisk(portfolioExample);
    const allocation = report.allocation as Record<string, unknown>, stress = report.stress as Record<string, unknown>, risk = report.risk as Record<string, unknown>;
    expect(allocation).toMatchObject({ total: "1000", largestWeightPct: "60", hhi: "5200" });
    expect(stress).toMatchObject({ projectedTotal: "920", change: "-80", changePct: "-8" });
    expect(risk.fixedWeightPortfolioReturnsPct).toEqual(["4", "-4", "3"]);
    expect(risk.annualizedVolatilityPct).toBe("4.35889894"); // sqrt((9+25+4)/2)
    const history = report.history as { fields: { name: string; display: string }[] };
    expect(history.fields.find(x => x.name === "timeWeightedReturnPercent")?.display).toBe("-1");
    expect(history.fields.find(x => x.name === "maximumDrawdownPercent")?.display).toBe("-10");
    expect(history.fields.find(x => x.name === "nominalGain")?.display).toBe("-60");
    expect(csv).toContain("Fictional A");
    expect(() => JSON.stringify(report)).not.toThrow();
  });
  it("reports undefined correlations, missing history and rejects incomplete observations", () => {
    const source = structuredClone(portfolioExample); delete (source as { snapshots?: unknown }).snapshots;
    source.assets[0]!.returnsPct = ["1", "1", "1"];
    const result = portfolioBatchRisk(source).report;
    expect(result.history).toBeNull();
    expect(JSON.stringify(result.warnings)).toContain("undefined for a constant return series");
    expect(() => portfolioBatchRisk({ ...source, assets: [{ ...source.assets[0], returnsPct: ["1"] }, source.assets[1]] })).toThrow(/returns/);
    expect(() => portfolioBatchRisk({ ...source, assets: [{ ...source.assets[0], shockPct: "-101" }, source.assets[1]] })).toThrow(/Shock/);
    expect(() => portfolioBatchRisk({ ...source, extra: "ignored" })).toThrow(/unsupported field/);
  });
  it("integrates fee-adjusted journal results, strategy grouping and equity drawdown", () => {
    const { report, csv } = advancedTradingJournal(journalExample);
    const summary = report.summary as Record<string, unknown>;
    expect(summary).toMatchObject({ grossPnl: "60", totalFees: "25", netPnl: "35", endingModeledEquity: "1035", wins: 2, losses: 2, winRatePct: "50" });
    expect(Number(summary.maximumDrawdownPct)).toBeCloseTo(-85 / 1110 * 100, 3);
    expect(Number(summary.meanRealizedR)).toBeCloseTo((2.2 - 2.125 + 55 / 30) / 3, 6);
    expect(report.byStrategy).toEqual([
      { strategy: "MeanRevert", trades: 2, wins: 0, netPnl: "-130", winRatePct: "0" },
      { strategy: "Momentum", trades: 2, wins: 2, netPnl: "165", winRatePct: "100" },
    ]);
    expect(csv).toContain("'-80"); // spreadsheet-safe, unlike exact JSON
    expect(JSON.stringify(report)).toContain("riskObservedTrades");
  });
  it("rejects malformed CSV, duplicate IDs, negative equity and protects missing risk", () => {
    expect(() => advancedTradingJournal({ ...journalExample, tradesCsv: journalExample.tradesCsv.replace("D,", "A,") })).toThrow(/unique/);
    expect(() => advancedTradingJournal({ ...journalExample, startingCapital: "10", tradesCsv: journalExample.tradesCsv.replace("Momentum,120,10,50", "Momentum,-120,10,50") })).toThrow(/below zero/);
    expect(() => advancedTradingJournal({ ...journalExample, tradesCsv: "id,date,strategy,grossPnl,fees,initialRisk\nA,2026-01-01,Momentum,1,0,0\nB,2026-01-02,Momentum,1,0,1" })).toThrow(/risk/);
    expect(() => advancedTradingJournal({ ...journalExample, tradesCsv: "id,date,strategy,grossPnl,fees,initialRisk\nA,2026-01-01,=SUM(1),1,0,1\nB,2026-01-02,Momentum,1,0,1" })).toThrow(/strategy/);
    const report = advancedTradingJournal(journalExample).report;
    expect(JSON.stringify(report.warnings)).toContain("lack stated initial risk");
  });
});
