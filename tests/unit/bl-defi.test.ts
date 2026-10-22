import {describe,expect,it} from "vitest";
import {runBl} from "../../src/lib/bl-defi";
import {BL_SPECS} from "../../src/lib/bl-tool-specs";
const example=(id:string)=>Object.fromEntries(BL_SPECS.find(s=>s.id===id)!.fields.map(f=>[f.name,f.example]));

describe("BL bounded manual DeFi models",()=>{
  it("runs eight distinct example tasks",()=>{
    expect(BL_SPECS).toHaveLength(8);
    for(const spec of BL_SPECS)expect(runBl(spec.id,example(spec.id)).primary,spec.id).toBeTruthy();
  });
  it("bounds the amplified two-coin invariant and rounds output conservatively",()=>{
    const v=runBl("stableswap-two-coin",example("stableswap-two-coin"));
    expect(Number(v.primary)).toBeGreaterThan(990);
    expect(Number(v.primary)).toBeLessThan(1000);
    expect(v.fields["D invariant, normalized 18-place units"]).toBe("2000000");
    expect(()=>runBl("stableswap-two-coin",{...example("stableswap-two-coin"),reserve0:"0"})).toThrow();
  });
  it("matches the independent constant-product limit at equal weights",()=>{
    const out=runBl("weighted-amm-swap",{reserveIn:"100",reserveOut:"10000",amountIn:"10",inputWeightBps:"5000",feeBps:"0",outputDecimals:"6"});
    expect(out.primary).toBe("909.090909"); // 10000*10/(100+10), floored to 6 decimals
  });
  it("reuses exact integer AMM hops and validates continuity",()=>{
    const out=runBl("multi-hop-amm",example("multi-hop-amm"));
    expect(Number(out.primary)).toBeGreaterThan(400);
    expect(Number(out.primary)).toBeLessThan(500);
    expect(()=>runBl("multi-hop-amm",{...example("multi-hop-amm"),hops:"tokenIn,tokenOut,decimalsIn,decimalsOut,reserveIn,reserveOut,feeBps\nA,B,6,6,100,10000,30\nD,C,6,6,10000,5000,30"})).toThrow();
  });
  it("separates fee reinvestment from a cash-out scenario",()=>{
    const out=runBl("lp-fee-compounding",{principal:"1000",grossFeeBps:"100",protocolCutBps:"0",reinvestCost:"0",periods:"2"});
    expect(out.primary).toBe("1020.1");
    expect(out.fields["Cash-out ending capital plus fees"]).toBe("1020");
  });
  it("applies a kinked curve and multiple collateral thresholds",()=>{
    const curve=runBl("lending-rate-curve",example("lending-rate-curve"));
    expect(curve.primary).toBe("10");expect(curve.fields["Supply-side gross APR before reserve factor (%)"]).toBe("8");
    expect(runBl("multi-collateral-stress",example("multi-collateral-stress")).primary).toBe("1.34");
  });
  it("charges management then performance fees, and reports claim shortfall",()=>{
    expect(runBl("vault-fee-impact",example("vault-fee-impact")).primary).toBe("1062.4");
    const fund=runBl("insurance-fund-stress",example("insurance-fund-stress"));
    expect(fund.primary).toBe("30");expect(fund.fields["First claim with shortfall"]).toBe("EventB");
  });
});
