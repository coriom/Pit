import { describe, expect, it } from "vitest";
import { runBj } from "../../src/lib/bj-derivatives";
import { BJ_SPECS } from "../../src/lib/bj-tool-specs";

const example = (id: string) => Object.fromEntries(BJ_SPECS.find(s=>s.id===id)!.fields.map(f=>[f.name,f.example]));

describe("BJ offline derivative and trading tasks", () => {
  it("delivers eight distinct bounded tasks with working examples", () => {
    expect(BJ_SPECS).toHaveLength(8);
    for (const spec of BJ_SPECS) expect(runBj(spec.id, example(spec.id)).primary).toBeTruthy();
  });
  it("combines option legs and locates spread breakeven", () => {
    const out=runBj("options-strategy",example("options-strategy"));
    expect(out.primary).toBe("7"); // long 100 call -5, short 120 call +2, price 110 => 7
    expect(out.fields["Modeled breakeven prices"]).toContain("103");
    expect(() => runBj("options-strategy",{legs:"kind,side,strike,premium,quantity\ncall,long,100,5,0",terminal:"110"})).toThrow();
  });
  it("aggregates Greeks only under an explicit common-unit assumption", () => {
    const out=runBj("portfolio-greeks",example("portfolio-greeks"));
    expect(out.primary).toBe("70"); // 2*100*.5 - 1*100*.3
    expect(out.fields["Aggregate gamma"]).toBe("3");
  });
  it("sorts strike/IV observations and rejects duplicate strikes", () => {
    const out=runBj("volatility-smile",example("volatility-smile"));
    expect(out.primary).toBe("20% at strike 100");
    expect(out.plot).toHaveLength(3);
    expect(() => runBj("volatility-smile",{observations:"strike,ivPercent\n80,30\n80,20\n120,27"})).toThrow();
  });
  it("computes hedge units, cost and conservative whole contracts", () => {
    const hedge=runBj("delta-hedge",example("delta-hedge"));
    expect(hedge.primary).toBe("-15");
    expect(hedge.fields["Modeled transaction fee"]).toBe("0.75");
    const futures=runBj("futures-hedge",{exposure:"10000",contractNotional:"1000",hedgeBps:"7500",beta:"1"});
    expect(futures.primary).toBe("short 7 contracts");
    expect(futures.fields["Uncovered target notional"]).toBe("500");
  });
  it("preserves signed funding observations, including receipts", () => {
    const out=runBj("funding-history",example("funding-history"));
    expect(out.primary).toBe("0.1");
    expect(out.fields["Total paid"]).toBe("0.1");
    expect(out.fields["Total received"]).toBe("0.2");
    expect(() => runBj("funding-history",{side:"long",observations:"date,rateBps,notional\n2026-02-30,1,100"})).toThrow();
  });
  it("reports journal net outcome without treating trades as tax records", () => {
    const out=runBj("trading-journal",example("trading-journal"));
    expect(out.primary).toBe("22"); // +19 -11 +14
    expect(out.fields["Profit factor"]).toBe("3");
    expect(() => runBj("trading-journal",{trades:"id,grossPnl,fees\nA,1,0\nA,2,0"})).toThrow();
  });
  it("walks a bounded static book and reports unfilled depth", () => {
    const out=runBj("order-book-depth",example("order-book-depth"));
    expect(out.fields["Modeled gross quote notional"]).toBe("251.5");
    expect(out.fields["Average execution price"]).toBe("100.6");
    const thin=runBj("order-book-depth",{...example("order-book-depth"),quantity:"4"});
    expect(thin.primary).toBe("Insufficient entered depth");
    expect(thin.fields["Unfilled quantity"]).toBe("1");
  });
  it("rejects malformed CSV and exponent notation", () => {
    expect(() => runBj("order-book-depth",{...example("order-book-depth"),quantity:"1e3"})).toThrow();
    expect(() => runBj("trading-journal",{trades:"id,grossPnl,fees\nA,\"1,2,0"})).toThrow();
  });
});
