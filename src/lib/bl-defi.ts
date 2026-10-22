/** Bounded local DeFi models. These are mathematical illustrations, not protocol quotes. */
import { calculateAmm } from "./amm-pool-math";
import { parseCsv } from "./crypto-data-workshop";

export type BlId = "stableswap-two-coin" | "weighted-amm-swap" | "multi-hop-amm" |
  "lp-fee-compounding" | "lending-rate-curve" | "multi-collateral-stress" |
  "vault-fee-impact" | "insurance-fund-stress";
export type BlResult=Readonly<{primary:string;fields:Readonly<Record<string,string>>;notes:readonly string[]}>;
const Q=10n**12n, BPS=10000n;
function raw(text:string,name:string,places=12):bigint {
  if(typeof text!=="string"||text.length>48||!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text))throw Error(`${name}: plain nonnegative decimal required.`);
  const [a,b=""]=text.split(".");if(b.length>places)throw Error(`${name}: excess precision.`);
  const n=BigInt(a)*10n**BigInt(places)+BigInt(b.padEnd(places,"0"));
  if(n>10n**30n)throw Error(`${name}: exceeds supported range.`);return n;
}
function signed(text:string,name:string):bigint {if(text.startsWith("-"))return -raw(text.slice(1),name);return raw(text,name);}
function fmt(n:bigint,places=12):string {const base=10n**BigInt(places),a=n<0n?-n:n;return `${n<0n?"-":""}${a/base}${a%base?`.`+String(a%base).padStart(places,"0").replace(/0+$/,""):""}`;}
function integer(text:string,name:string,low:number,high:number):number {
  if(!/^(?:0|[1-9]\d*)$/.test(text)||text.length>10)throw Error(`${name}: whole number required.`);
  const n=Number(text);if(!Number.isSafeInteger(n)||n<low||n>high)throw Error(`${name}: outside ${low}–${high}.`);return n;
}
function bps(text:string,name:string):bigint {return BigInt(integer(text,name,0,10000));}
const positive=(n:bigint,name:string)=>{if(n<=0n)throw Error(`${name} must be positive.`);return n;};
function table(text:string,header:readonly string[],max:number):string[][] {
  if(typeof text!=="string"||text.length>20_000)throw Error("CSV is too large.");
  const p=parseCsv(text,",",true);if(p.issues.length||p.rows.length<1||p.rows.length>max||JSON.stringify(p.header)!==JSON.stringify(header))
    throw Error(`Use ${header.join(",")} header and at most ${max} complete rows.`);
  return p.rows;
}
const out=(primary:string,fields:Record<string,string>,notes:string[]):BlResult=>({primary,fields,notes});
// Two-coin continuous StableSwap invariant from Curve's published equation.
// All values are common-peg 18-place integer units, not exact contract xp or A_PRECISION.
function invariant(x:bigint,y:bigint,a:bigint):bigint {
  let lo=0n,hi=x+y;const product=4n*x*y;
  const f=(d:bigint)=>product*(4n*a*(x+y)+d-4n*a*d)-d*d*d;
  if(f(hi)===0n)return hi;
  for(let i=0;i<128&&lo+1n<hi;i++){const mid=(lo+hi)/2n;if(f(mid)>=0n)lo=mid;else hi=mid;}
  if(lo+1n<hi)throw Error("Invariant search did not converge within 128 steps.");return lo;
}
function stableY(x:bigint,y:bigint,a:bigint,d:bigint):bigint {
  let lo=1n,hi=y;const f=(v:bigint)=>4n*x*v*(4n*a*(x+v)+d-4n*a*d)-d*d*d;
  if(f(hi)<0n)throw Error("No supported output-reserve solution.");
  for(let i=0;i<128&&lo<hi;i++){const mid=(lo+hi)/2n;if(f(mid)>=0n)hi=mid;else lo=mid+1n;}
  if(lo!==hi)throw Error("Output reserve search did not converge.");return hi;
}
export function runBl(id:BlId,input:Record<string,string>):BlResult {
  const d=(key:string)=>raw(input[key]??"",key);
  switch(id){
    case "stableswap-two-coin": {
      const d0=integer(input.decimals0??"","Token0 decimals",0,18),d1=integer(input.decimals1??"","Token1 decimals",0,18);
      const x=positive(raw(input.reserve0??"","Token0 reserve",d0),"Token0 reserve")*10n**BigInt(18-d0);
      const y=positive(raw(input.reserve1??"","Token1 reserve",d1),"Token1 reserve")*10n**BigInt(18-d1);
      const supplied=positive(raw(input.amountIn??"","Input amount",d0),"Input amount")*10n**BigInt(18-d0);
      const amp=BigInt(integer(input.amplification??"","Amplification",1,1000)),fee=bps(input.feeBps??"","Pool fee");
      const effective=supplied*(BPS-fee)/BPS;if(!effective)throw Error("Fee-adjusted input rounds to zero.");
      const D=invariant(x,y,amp),required=stableY(x+effective,y,amp,D),normalized=y-required;
      const scale=10n**BigInt(18-d1),outputRaw=normalized/scale;
      if(outputRaw<=0n||outputRaw>=y/scale)throw Error("Output rounds to zero or consumes the reserve.");
      const retained=supplied-effective;
      return out(fmt(outputRaw,d1),{"Modeled token1 output":fmt(outputRaw,d1),"D invariant, normalized 18-place units":fmt(D,18),
        "Input fee retained, token0":fmt(retained,18),"Post input reserve, token0":fmt(x+supplied,18),
        "Post output reserve, token1":fmt(y-outputRaw*scale,18)},
        ["Two-coin common-peg StableSwap invariant with whole amplification A. Both token units are assumed to target the same peg.",
          "Binary-search integer model; output rounded down to token1 base units. This does not reproduce Curve contract fee, A precision, rates or deployment state."]);
    }
    case "weighted-amm-swap": {
      const x=Number(positive(d("reserveIn"),"Input reserve"))/Number(Q),y=Number(positive(d("reserveOut"),"Output reserve"))/Number(Q),
        amount=Number(positive(d("amountIn"),"Input amount"))/Number(Q),weight=Number(bps(input.inputWeightBps??"","Input weight")),
        fee=Number(bps(input.feeBps??"","Fee")),decimals=integer(input.outputDecimals??"","Output decimals",0,12);
      if(weight<=0||weight>=10000)throw Error("Weights must be strictly between zero and 100%.");
      const effective=amount*(1-fee/10000),continuous=y*(-Math.expm1(Math.log(x/(x+effective))*weight/(10000-weight)));
      const factor=10**decimals,output=Math.floor(Math.max(0,continuous)*factor)/factor;
      if(!Number.isFinite(continuous)||output<=0||output>=y)throw Error("Modeled output is outside supported precision or reserve.");
      return out(output.toFixed(decimals),{"Rounded-down output":output.toFixed(decimals),"Continuous output estimate":continuous.toFixed(10),
        "Effective input":effective.toFixed(10),"Input weight (%)":(weight/100).toFixed(2)},
        ["Continuous two-asset constant-mean model, output rounded down to selected decimal places.","Uses bounded floating-point exponentiation; not Balancer contract-exact. Excludes gas, protocol-specific fees and live reserves."]);
    }
    case "multi-hop-amm": {
      const hops=table(input.hops??"",["tokenIn","tokenOut","decimalsIn","decimalsOut","reserveIn","reserveOut","feeBps"],4);
      if(hops.length<2)throw Error("A multi-hop route needs at least two pools.");
      let amount=input.amountIn??"",previous="",previousDecimals=-1;const detail:string[]=[];
      for(const [i,row] of hops.entries()){
        const [tokenIn,tokenOut,di,dj,x,y,fee]=row;
        if(!/^[A-Za-z][A-Za-z0-9._:-]{0,23}$/.test(tokenIn)||!/^[A-Za-z][A-Za-z0-9._:-]{0,23}$/.test(tokenOut)||tokenIn===tokenOut)
          throw Error("Use distinct short manual token labels.");
        const decimalsIn=integer(di,"Input decimals",0,18),decimalsOut=integer(dj,"Output decimals",0,18);
        if(i&&(tokenIn!==previous||decimalsIn!==previousDecimals))throw Error("Adjacent hop label and decimals must match exactly; labels do not prove identity.");
        const result=calculateAmm({mode:"swap",token0:tokenIn,token1:tokenOut,decimals0:decimalsIn,decimals1:decimalsOut,
          reserve0:x,reserve1:y,direction:"zero-to-one",amountIn:amount,feeBps:fee});
        const output=result.fields.find(field=>field.name==="hypotheticalOutput");if(!output)throw Error("Hop output missing.");
        amount=output.display;detail.push(`${tokenIn}→${tokenOut}: ${amount}`);previous=tokenOut;previousDecimals=decimalsOut;
      }
      return out(amount,{"Final modeled output":amount,"Hop outputs":detail.join("; "),"Pool count":String(hops.length)},
        ["Each hop reuses the existing exact constant-product engine and floors output to destination base units.","Manual labels must match at adjacent hops but do not verify chain-scoped asset identity; no live liquidity or executable route."]);
    }
    case "lp-fee-compounding": {
      const principal=positive(d("principal"),"Principal"),fee=bps(input.grossFeeBps??"","Gross fee"),cut=bps(input.protocolCutBps??"","Protocol cut"),
        cost=d("reinvestCost"),periods=integer(input.periods??"","Periods",1,365);
      let compounded=principal,cashOut=0n,paidCosts=0n;
      for(let i=0;i<periods;i++){
        const earned=compounded*fee*(BPS-cut)/(BPS*BPS);
        if(earned<cost)throw Error("Known reinvestment cost exceeds this period's fee; compounding unavailable.");
        compounded+=earned-cost;paidCosts+=cost;
        cashOut+=principal*fee*(BPS-cut)/(BPS*BPS);
        if(compounded>10n**30n)throw Error("Compounding exceeds supported bound.");
      }
      return out(fmt(compounded),{"Compounded ending capital":fmt(compounded),"Cash-out ending capital plus fees":fmt(principal+cashOut),
        "Extra modeled value from compounding after known costs":fmt(compounded-principal-cashOut),"Known reinvestment costs paid":fmt(paidCosts)},
        ["Manual gross LP fee as bps of current capital each period, then protocol cut on that fee. The same asset and quote value are assumed.","Fee opportunity is held constant by assumption; no token-price drift, IL, gas mismatch or realized volume is modeled."]);
    }
    case "lending-rate-curve": {
      const u=bps(input.utilizationBps??"","Utilization"),k=bps(input.kinkBps??"","Kink"),base=bps(input.baseAprBps??"","Base APR"),
        low=bps(input.slope1Bps??"","Low slope"),high=bps(input.slope2Bps??"","High slope");
      if(k<=0n||k>=BPS)throw Error("Kink must be strictly between zero and 100% utilization.");
      const rate=u<=k?base+low*u/k:base+low+high*(u-k)/(BPS-k);
      const supply=rate*u/BPS;
      return out(fmt(rate,2),{"Modeled borrow APR (%)":fmt(rate,2),"Supply-side gross APR before reserve factor (%)":fmt(supply,2),
        "Utilization (bps)":String(u),"Above kink":u>k?"yes":"no"},
        ["Piecewise two-slope nominal APR curve with manual parameters; bps are rounded down in each segment.","No live protocol, variable-rate index, reserve factor, utilization forecast or promised supply yield."]);
    }
    case "multi-collateral-stress": {
      const positions=table(input.collateral??"",["label","valueQuote","thresholdBps","shockBps"],16),names=new Set<string>();
      let before=0n,after=0n,valueAfter=0n;
      for(const [label,valueText,thresholdText,shockText] of positions){
        if(!label||label.length>32||names.has(label))throw Error("Collateral labels must be short and unique.");names.add(label);
        const value=raw(valueText,"Collateral value"),threshold=bps(thresholdText,"Threshold"),shock=signed(shockText,"Shock bps");
        if(shock< -10000n*Q||shock>100000n*Q)throw Error("Shock outside supported bounds.");
        const projected=value*(10000n*Q+shock)/(10000n*Q);
        before+=value*threshold/BPS;after+=projected*threshold/BPS;valueAfter+=projected;
      }
      const debt=positive(d("debtQuote"),"Debt"),hfBefore=before*Q/debt,hfAfter=after*Q/debt;
      return out(fmt(hfAfter),{"Modeled HF before shock":fmt(hfBefore),"Modeled HF after shock":fmt(hfAfter),
        "Weighted liquidation value after shock":fmt(after),"Total collateral value after shock":fmt(valueAfter),"Debt, fixed quote value":fmt(debt)},
        ["Each collateral has a manually supplied quote value, threshold and value shock; all share one quote currency.","A sum of threshold-adjusted values divided by fixed debt is illustrative, not a protocol eMode, oracle or liquidation engine."]);
    }
    case "vault-fee-impact": {
      const principal=positive(d("principal"),"Principal"),returnBps=signed(input.grossReturnBps??"","Gross return bps"),
        management=bps(input.managementBps??"","Management fee"),performance=bps(input.performanceBps??"","Performance fee"),
        days=integer(input.days??"","Days",1,3650);
      if(returnBps< -10000n*Q||returnBps>100000n*Q)throw Error("Gross return outside supported bounds.");
      const gross=principal*(10000n*Q+returnBps)/(10000n*Q),managementFee=gross*management*BigInt(days)/(BPS*365n);
      if(managementFee>gross)throw Error("Management fee exceeds gross assets.");
      const afterManagement=gross-managementFee,profit=afterManagement>principal?afterManagement-principal:0n,performanceFee=profit*performance/BPS;
      const ending=afterManagement-performanceFee;
      return out(fmt(ending),{"Gross ending assets":fmt(gross),"Management fee on gross assets":fmt(managementFee),
        "Performance fee on remaining gain above starting principal":fmt(performanceFee),"Net ending assets":fmt(ending),"Net gain or loss":fmt(ending-principal)},
        ["One-period gross return; management fee accrues ACT/365 on gross ending assets and performance fee follows only on positive post-management gain.","No high-water-mark history, hurdle, share-price dilution, actual vault accounting or on-chain preview."]);
    }
    case "insurance-fund-stress": {
      const reserve=d("fundReserve"),claims=table(input.claims??"",["scenario","claimQuote"],100),names=new Set<string>();let remaining=reserve,total=0n,shortfall=0n,first="none";
      for(const [name,valueText] of claims){if(!name||name.length>48||names.has(name))throw Error("Scenario labels must be short and unique.");names.add(name);
        const claim=raw(valueText,"Claim"),covered=remaining<claim?remaining:claim;remaining-=covered;total+=claim;shortfall+=claim-covered;
        if(shortfall>0n&&first==="none")first=name;
      }
      return out(fmt(shortfall),{"Starting manual fund reserve":fmt(reserve),"Total modeled claims":fmt(total),
        "Claims covered":fmt(total-shortfall),"Uncovered modeled shortfall":fmt(shortfall),"Remaining fund":fmt(remaining),
        "First claim with shortfall":first},
        ["Sequential deterministic manual claim scenario; not a probability model, underwriting result or insurance guarantee.","No replenishment, priority rules, token conversions or claims adjudication."]);
    }
  }
}
