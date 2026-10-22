import { describe, expect, it } from "vitest";
import { runBb } from "../../src/lib/bb-derivatives";

describe("new derivative mathematics", () => {
  it("uses distinct long/short fee-adjusted PnL and explicit leverage", () => {
    const input={side:"long",entry:"2000",exit:"2200",quantity:"1",leverage:"5",entryFeeBps:"5",exitFeeBps:"5"};
    expect(runBb("perpetual-pnl",input).fields["Net PnL"]).toBe("197.9");
    expect(runBb("perpetual-pnl",{...input,side:"short"}).fields["Net PnL"]).toBe("-202.1");
    expect(runBb("perpetual-pnl",input).fields["Illustrative initial margin"]).toBe("400");
  });
  it("treats signed funding as a transfer, not position profit", () => {
    expect(runBb("perpetual-funding",{side:"long",notional:"1000",fundingBps:"1",periods:"8"}).primary).toBe("-0.8");
    expect(runBb("perpetual-funding",{side:"short",notional:"1000",fundingBps:"-1",periods:"8"}).primary).toBe("-0.8");
  });
  it("separates initial and maintenance requirements", () => {
    const out=runBb("perpetual-margin",{notional:"10000",postedMargin:"2000",initialBps:"1000",maintenanceBps:"500"});
    expect(out.fields["Initial requirement"]).toBe("1000"); expect(out.primary).toBe("1500");
    expect(() => runBb("perpetual-margin",{notional:"10000",postedMargin:"2000",initialBps:"500",maintenanceBps:"1000"})).toThrow();
  });
  it("annualizes a quoted futures basis with ACT/365", () => {
    const out=runBb("futures-basis",{spot:"100",future:"103",days:"365"});
    expect(out.fields["Basis versus spot (%)"]).toBe("3"); expect(out.primary).toBe("3");
  });
  it("distinguishes option intrinsic value from net payoff", () => {
    expect(runBb("european-option-payoff",{kind:"call",strike:"100",terminal:"120",premium:"5"}).primary).toBe("15");
    expect(runBb("european-option-payoff",{kind:"put",strike:"100",terminal:"80",premium:"5"}).primary).toBe("15");
    expect(runBb("european-option-payoff",{kind:"put",strike:"100",terminal:"0",premium:"120"}).fields["Breakeven terminal price"]).toBe("none at a nonnegative price");
  });
  it("prices an at-the-money European call and recovers its IV", () => {
    const input={kind:"call",spot:"100",strike:"100",ratePct:"5",volPct:"20",years:"1"};
    const price=Number(runBb("black-scholes-greeks",input).primary);
    // Independent textbook benchmark: 10.450583572185565, computed with a high-precision normal CDF.
    expect(Math.abs(price-10.45058357)).toBeLessThan(0.00003);
    const iv=Number(runBb("implied-volatility",{kind:"call",spot:"100",strike:"100",ratePct:"5",years:"1",optionPrice:"10.45058357"}).primary);
    expect(Math.abs(iv-20)).toBeLessThan(0.0001);
  });
  it("rejects arbitrage prices, exponent notation and unbounded inputs", () => {
    expect(() => runBb("implied-volatility",{kind:"call",spot:"100",strike:"100",ratePct:"5",years:"1",optionPrice:"101"})).toThrow();
    expect(() => runBb("trade-expectancy",{winBps:"1e3",gain:"150",loss:"100"})).toThrow();
    expect(() => runBb("perpetual-funding",{side:"long",notional:"1000",fundingBps:"1",periods:"10001"})).toThrow();
  });
  it("computes two-outcome expectancy and breakeven win rate", () => {
    const out=runBb("trade-expectancy",{winBps:"4000",gain:"150",loss:"100"});
    expect(out.primary).toBe("0"); expect(out.fields["Breakeven win probability (bps)"]).toBe("4000");
  });
});
