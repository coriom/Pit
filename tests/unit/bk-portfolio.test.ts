import {describe,expect,it} from "vitest";
import {runBk} from "../../src/lib/bk-portfolio";
import {BK_SPECS} from "../../src/lib/bk-tool-specs";
const example=(id:string)=>Object.fromEntries(BK_SPECS.find(s=>s.id===id)!.fields.map(f=>[f.name,f.example]));

describe("BK local portfolio scenarios",()=>{
  it("provides eight bounded, executable examples",()=>{
    expect(BK_SPECS).toHaveLength(8);
    for(const spec of BK_SPECS)expect(runBk(spec.id,example(spec.id)).primary,spec.id).toBeTruthy();
  });
  it("repeats a seeded model identically and rejects invalid bounds",()=>{
    const input=example("monte-carlo-portfolio");
    expect(runBk("monte-carlo-portfolio",input)).toEqual(runBk("monte-carlo-portfolio",input));
    expect(()=>runBk("monte-carlo-portfolio",{...input,paths:"2001"})).toThrow();
  });
  it("finds independently derived two-asset risk parity and minimum variance weights",()=>{
    const rp=runBk("risk-parity-weights",{covariance:"4,0\n0,9"});
    expect(Number(rp.primary.split(", ")[0])).toBeCloseTo(60,5); // inverse volatility 1/2 vs 1/3
    const mv=runBk("minimum-variance-weights",{covariance:"4,0\n0,9"});
    expect(Number(mv.primary.split(", ")[0])).toBeCloseTo(900/13,4); // 9/(4+9)
    expect(()=>runBk("minimum-variance-weights",{covariance:"1,2\n2,1"})).toThrow();
  });
  it("produces a symmetric correlation matrix with unit diagonal",()=>{
    const out=runBk("correlation-matrix",example("correlation-matrix"));
    expect(out.fields["Pearson correlation rows"]).toContain("A: 1.00000000, 1.00000000, 1.00000000");
    expect(()=>runBk("correlation-matrix",{observations:"A,B\n1,2\n1,3\n1,4"})).toThrow();
  });
  it("conserves weighted return contributions and computes active return",()=>{
    const out=runBk("performance-attribution",example("performance-attribution"));
    expect(out.fields["Portfolio weighted return (%)"]).toBe("4");
    expect(out.primary).toBe("2");
  });
  it("distinguishes underwater duration and ulcer index from maximum drawdown",()=>{
    const out=runBk("underwater-ulcer",example("underwater-ulcer"));
    expect(out.fields["Longest observed underwater span (days)"]).toBe("10");
    expect(Number(out.fields["Ulcer index (percentage points)"])).toBeGreaterThan(0);
  });
  it("keeps manual FX shocks in one base currency and inflation as an exact ratio",()=>{
    expect(runBk("fx-exposure-stress",example("fx-exposure-stress")).primary).toBe("-40");
    const out=runBk("inflation-adjusted-return",example("inflation-adjusted-return"));
    expect(out.fields["Nominal future value"]).toBe("1050");
    expect(Math.abs(Number(out.primary)-1029.4117647058824)).toBeLessThan(1e-8);
    expect(()=>runBk("inflation-adjusted-return",{...example("inflation-adjusted-return"),inflationPct:"-100"})).toThrow();
  });
});
