import {describe,expect,it} from "vitest";
import {runBc} from "../../src/lib/bc-statistics";

describe("offline statistical and allocation capabilities",()=>{
  it("compares equal total DCA and first-date lump capital",()=>{
    const r=runBc("dca-vs-lump-sum",{prices:"10,8,12,15",installment:"100"});
    expect(Number(r.fields["Equal total planned spend"])).toBe(400);
    expect(Number(r.fields["Lump-sum terminal value including unspent dust"])).toBe(600);
    expect(Math.abs(Number(r.primary)+37.5)).toBeLessThan(1e-8);
    expect(runBc("dca-vs-lump-sum",{prices:"0.00000001,0.00000002",installment:"1"}).fields["Equal total planned spend"]).toBe("2");
  });
  it("solves one-year dated XIRR and rejects multiple roots",()=>{
    const r=runBc("money-weighted-return",{flows:"2025-01-01,-1000\n2026-01-01,1100"});
    expect(Math.abs(Number(r.primary)-10)).toBeLessThan(1e-6);
    expect(()=>runBc("money-weighted-return",{flows:"2025-01-01,-100\n2026-01-01,230\n2027-01-01,-132"})).toThrow(/Multiple XIRR roots/);
    expect(()=>runBc("money-weighted-return",{flows:"2025-02-30,-100\n2026-01-01,110"})).toThrow(/calendar/);
  });
  it("makes zero downside deviation explicit",()=>{
    expect(()=>runBc("sharpe-sortino",{returns:"1,2,3",riskFreePct:"0",periodsPerYear:"12"})).toThrow(/denominator/);
    const r=runBc("sharpe-sortino",{returns:"4,-2,3,1,-1",riskFreePct:"0",periodsPerYear:"12"});
    expect(Number(r.fields["Annualized Sharpe"])).toBeGreaterThan(0);
    expect(Number(r.fields["Annualized Sortino"])).toBeGreaterThan(0);
  });
  it("uses nearest-rank historical quantile and a separately defined worst tail",()=>{
    const r=runBc("historical-var-es",{returns:"2,-1,3,-4,1,-2,0,2,-6,1",confidencePct:"90"});
    expect(r.fields["Empirical VaR loss (%)"]).toBe("4.00000000");
    expect(r.fields["Expected shortfall of worst observations (%)"]).toBe("6.00000000");
    expect(r.fields["Tail observations"]).toBe("1");
  });
  it("computes beta from synchronized paired returns",()=>{
    const r=runBc("correlation-beta",{assetReturns:"2,4,6,8",benchmarkReturns:"1,2,3,4"});
    expect(r.primary).toBe("2.00000000");expect(r.fields["Pearson correlation"]).toBe("1.00000000");
    expect(()=>runBc("correlation-beta",{assetReturns:"2,4,6",benchmarkReturns:"1,2"})).toThrow();
  });
  it("reports historical simple volatility and rejects log of total loss",()=>{
    const r=runBc("realized-volatility",{returns:"1,-1,1,-1",periodsPerYear:"1",method:"simple"});
    expect(Math.abs(Number(r.primary)-1.154700538)).toBeLessThan(1e-7);
    expect(()=>runBc("realized-volatility",{returns:"1,-100,2",periodsPerYear:"12",method:"log"})).toThrow(/undefined/);
  });
  it("requires symmetric positive-semidefinite covariance",()=>{
    const r=runBc("portfolio-covariance-risk",{weights:"50,50",covariance:"4,1\n1,9",periodsPerYear:"1"});
    expect(Math.abs(Number(r.primary)-Math.sqrt(3.75))).toBeLessThan(1e-8);
    expect(()=>runBc("portfolio-covariance-risk",{weights:"50,50",covariance:"1,2\n2,1",periodsPerYear:"1"})).toThrow(/semidefinite/);
  });
  it("buys only whole lots and conserves cash",()=>{
    const r=runBc("lot-constrained-allocation",{cash:"1000",assets:"A,60,6000,1\nB,40,4000,1"});
    expect(r.primary).toBe("0");expect(r.fields["Lots by manual label"]).toContain("A: 10 lots");
    const residual=runBc("lot-constrained-allocation",{cash:"100",assets:"A,60,5000,1\nB,40,5000,1"});
    expect(residual.primary).toBe("60");
    expect(()=>runBc("lot-constrained-allocation",{cash:"100",assets:"A,60,6000,1\nB,40,3000,1"})).toThrow(/sum/);
  });
});
