/** Bounded, deterministic local portfolio illustrations. Statistical estimates use IEEE-754 doubles. */
import { parseCsv } from "./crypto-data-workshop";

export type BkId = "monte-carlo-portfolio" | "risk-parity-weights" | "minimum-variance-weights" |
  "correlation-matrix" | "performance-attribution" | "underwater-ulcer" |
  "fx-exposure-stress" | "inflation-adjusted-return";
export type BkResult = Readonly<{ primary: string; fields: Readonly<Record<string,string>>; notes: readonly string[] }>;
const S=10n**12n;
function exact(text:string,label:string,signed=false):bigint {
  if(typeof text!=="string"||text.length>45||!/^-?(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(text)||(!signed&&text.startsWith("-")))throw Error(`${label}: enter a plain decimal with at most 12 places.`);
  const neg=text.startsWith("-"),[a,b=""]=(neg?text.slice(1):text).split(".");
  const v=BigInt(a)*S+BigInt(b.padEnd(12,"0"));if(v>10n**30n)throw Error(`${label}: exceeds supported bounds.`);return neg?-v:v;
}
function fmtRaw(v:bigint):string {const n=v<0n?-v:v;return `${v<0n?"-":""}${n/S}${n%S?`.`+String(n%S).padStart(12,"0").replace(/0+$/,''):''}`;}
function num(text:string,label:string,low=-1e6,high=1e6):number {
  if(typeof text!=="string"||text.length>40||!/^-?(?:0|[1-9]\d*)(?:\.\d{1,10})?$/.test(text))throw Error(`${label}: enter a bounded plain decimal.`);
  const v=Number(text);if(!Number.isFinite(v)||v<low||v>high)throw Error(`${label}: outside supported range.`);return v;
}
function integer(text:string,label:string,low:number,high:number):number {const n=num(text,label,low,high);if(!Number.isSafeInteger(n))throw Error(`${label}: whole number required.`);return n;}
function fmt(v:number):string {if(!Number.isFinite(v))throw Error("Numerical result is not finite.");return v.toFixed(8);}
function csv(text:string,header:readonly string[],max=256):string[][] {
  if(typeof text!=="string"||text.length>20_000)throw Error("CSV exceeds the supported size.");
  const p=parseCsv(text,",",true);if(p.issues.length||p.rows.length<1||p.rows.length>max||JSON.stringify(p.header)!==JSON.stringify(header))
    throw Error(`Use header ${header.join(",")} and 1–${max} complete rows.`);
  return p.rows;
}
function covariance(raw:string):number[][] {
  const lines=raw.trim().split(/\n/);if(lines.length<2||lines.length>8)throw Error("Use a 2–8 asset covariance matrix.");
  const m=lines.map((line,i)=>{const cells=line.split(",").map(x=>x.trim());if(cells.length!==lines.length)throw Error("Covariance matrix must be square.");return cells.map((x,j)=>num(x,`Covariance ${i+1},${j+1}`,-1e4,1e4));});
  for(let i=0;i<m.length;i++){if(m[i][i]<=0)throw Error("Each asset needs positive variance.");for(let j=0;j<i;j++)if(Math.abs(m[i][j]-m[j][i])>1e-8)throw Error("Covariance must be symmetric.");}
  // Bounded Cholesky semidefinite check. A singular matrix remains permissible.
  const l=m.map(row=>row.map(()=>0));for(let i=0;i<m.length;i++)for(let j=0;j<=i;j++){
    let v=m[i][j];for(let k=0;k<j;k++)v-=l[i][k]*l[j][k];
    if(i===j){if(v<-1e-8)throw Error("Covariance is not positive semidefinite.");l[i][j]=Math.sqrt(Math.max(0,v));}
    else if(l[j][j]>1e-12)l[i][j]=v/l[j][j];else if(Math.abs(v)>1e-8)throw Error("Covariance is not positive semidefinite.");
  }
  return m;
}
const dot=(a:number[],b:number[])=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const mv=(m:number[][],w:number[])=>m.map(row=>dot(row,w));
function variance(m:number[][],w:number[]):number {return dot(w,mv(m,w));}
function simplex(v:number[]):number[] {
  const sorted=[...v].sort((a,b)=>b-a);let sum=0,rho=0;
  for(let i=0;i<sorted.length;i++){sum+=sorted[i];if(sorted[i]-(sum-1)/(i+1)>0)rho=i+1;}
  const theta=(sorted.slice(0,rho).reduce((a,b)=>a+b,0)-1)/rho;
  return v.map(x=>Math.max(0,x-theta));
}
function utc(text:string):number {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text))throw Error("Use YYYY-MM-DD UTC dates.");
  const d=new Date(`${text}T00:00:00Z`),ms=d.getTime();if(!Number.isFinite(ms)||d.toISOString().slice(0,10)!==text)throw Error("Invalid UTC calendar date.");return ms;
}
const out=(primary:string,fields:Record<string,string>,notes:string[]):BkResult=>({primary,fields,notes});
export function runBk(id:BkId,input:Record<string,string>):BkResult {
  const n=(key:string,lo?:number,hi?:number)=>num(input[key]??"",key,lo,hi);
  switch(id){
    case "monte-carlo-portfolio": {
      const start=n("initialValue",0.01,1e9), mean=n("annualMeanPct",-100,100)/100,
        vol=n("annualVolPct",0,300)/100, years=integer(input.years??"","years",1,40),
        paths=integer(input.paths??"","paths",100,2000),seed=integer(input.seed??"","seed",1,4294967295);
      let state=seed>>>0;const uniform=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return (state+0.5)/4294967296;};
      const terminal:number[]=[];for(let i=0;i<paths;i++){
        let v=start;for(let t=0;t<years;t++){const z=Math.sqrt(-2*Math.log(uniform()))*Math.cos(2*Math.PI*uniform());v*=Math.exp(mean-vol*vol/2+vol*z);}
        terminal.push(v);
      }
      terminal.sort((a,b)=>a-b);const q=(p:number)=>terminal[Math.floor((paths-1)*p)];
      return out(fmt(q(.5)),{"Median terminal value":fmt(q(.5)),"5th percentile":fmt(q(.05)),"95th percentile":fmt(q(.95)),
        "Paths":String(paths),"Seed":String(seed),"Years":String(years)},
        ["Seeded lognormal, independent annual returns with fixed mean and volatility. Pseudorandom samples are reproducible for this version.",
          "Monte Carlo output is a model distribution, not a prediction; floating-point statistical estimates are rounded for display."]);
    }
    case "risk-parity-weights": {
      const m=covariance(input.covariance??""),size=m.length;let w=Array(size).fill(1/size) as number[];
      let error=Infinity,iterations=0;
      for(let step=0;step<2000;step++){
        const marginal=mv(m,w),v=dot(w,marginal);if(v<=0)throw Error("Portfolio variance must be positive.");
        const contributions=w.map((x,i)=>x*marginal[i]);if(contributions.some(c=>c<=0))throw Error("This covariance produces nonpositive risk contributions; unsupported by this long-only solver.");
        error=Math.max(...contributions.map(c=>Math.abs(c/v-1/size)));iterations=step+1;if(error<1e-8)break;
        w=simplex(w.map((x,i)=>x*Math.sqrt((v/size)/contributions[i])));
      }
      if(error>=1e-8)throw Error("Risk-parity solver did not converge in 2000 bounded iterations.");
      return out(w.map(x=>fmt(x*100)).join(", "),{"Long-only weights (%)":w.map(x=>fmt(x*100)).join(", "),
        "Equal risk-contribution target (%)":fmt(100/size),"Maximum contribution-share error":fmt(error),"Iterations":String(iterations)},
        ["Manual symmetric PSD covariance, positive risk contributions, nonnegative weights summing to one.","Convergence is numerical; no realized-risk or return guarantee."]);
    }
    case "minimum-variance-weights": {
      const m=covariance(input.covariance??""),size=m.length;let w=Array(size).fill(1/size) as number[];
      const maxRow=Math.max(...m.map(row=>row.reduce((s,v)=>s+Math.abs(v),0)));
      const stepSize=1/(2*maxRow);let delta=Infinity,iterations=0;
      for(let step=0;step<5000;step++){
        const gradient=mv(m,w).map(v=>2*v),next=simplex(w.map((x,i)=>x-stepSize*gradient[i]));
        delta=Math.max(...next.map((x,i)=>Math.abs(x-w[i])));w=next;iterations=step+1;if(delta<1e-10)break;
      }
      if(delta>=1e-10)throw Error("Minimum-variance solver did not converge in 5000 bounded iterations.");
      return out(w.map(x=>fmt(x*100)).join(", "),{"Long-only weights (%)":w.map(x=>fmt(x*100)).join(", "),
        "Modeled variance (percentage-points squared)":fmt(variance(m,w)),"Last-step weight change":fmt(delta),"Iterations":String(iterations)},
        ["Numerical projected-gradient minimum variance for long-only weights summing to one.","Covariance is manual, period-specific and not a forecast; assets are indexed by input row order."]);
    }
    case "correlation-matrix": {
      const text=input.observations??"";if(text.length>16_000)throw Error("Observation table is too large.");
      const parsed=parseCsv(text,",",true),headers=parsed.header;
      if(parsed.issues.length||headers.length<2||headers.length>8||parsed.rows.length<3||parsed.rows.length>256||
         headers.some(h=>!h||h.length>24)||new Set(headers).size!==headers.length)throw Error("Use 2–8 unique asset headers and 3–256 synchronized rows.");
      const rows=parsed.rows.map((row,i)=>row.map((x,j)=>num(x,`row ${i+1}, ${headers[j]}`,-100,1000)));
      const cols=headers.map((_,j)=>rows.map(row=>row[j]));const means=cols.map(c=>c.reduce((a,b)=>a+b,0)/c.length);
      const cov=(a:number,b:number)=>cols[a].reduce((sum,x,i)=>sum+(x-means[a])*(cols[b][i]-means[b]),0)/(rows.length-1);
      const variances=headers.map((_,i)=>cov(i,i));if(variances.some(v=>v<=0))throw Error("Each series needs nonzero variation.");
      const matrix=headers.map((_,i)=>headers.map((_,j)=>fmt(cov(i,j)/Math.sqrt(variances[i]*variances[j]))));
      return out(`${headers.length} × ${headers.length} matrix`,{"Asset order":headers.join(", "),"Pearson correlation rows":matrix.map((row,i)=>`${headers[i]}: ${row.join(", ")}`).join("; "),"Aligned observations":String(rows.length)},
        ["All manual percentage-return rows must be synchronized. Pairwise sample Pearson correlation does not establish causation or future stability."]);
    }
    case "performance-attribution": {
      const entries=csv(input.assets??"",["bucket","weightBps","returnPct"],32);const names=new Set<string>();let weights=0n,total=0n;
      const detail:string[]=[];
      for(const [name,weightText,returnText] of entries){if(!name||name.length>32||names.has(name))throw Error("Bucket names must be nonempty and unique.");names.add(name);
        const w=exact(weightText,"weight bps"),r=exact(returnText,"return %",true);if(w<0n||w>10000n*S||r< -100n*S||r>10000n*S)throw Error("Weight or return outside bounds.");
        weights+=w;const contribution=w*r/(10000n*S);total+=contribution;detail.push(`${name}: ${fmtRaw(contribution)} percentage points`);
      }
      if(weights!==10000n*S)throw Error("Weights must sum to exactly 10000 bps.");
      const benchmark=exact(input.benchmarkPct??"","benchmark return",true);if(benchmark< -100n*S||benchmark>10000n*S)throw Error("Benchmark return outside bounds.");
      return out(fmtRaw(total-benchmark),{"Portfolio weighted return (%)":fmtRaw(total),"Benchmark return (%)":fmtRaw(benchmark),
        "Active return (percentage points)":fmtRaw(total-benchmark),"Bucket contributions":detail.join("; ")},
        ["Start-of-period weights and synchronized single-period manual returns; no intra-period rebalancing or cash flows.","Contribution is weight fraction times return percent. Active return is not causal Brinson attribution."]);
    }
    case "underwater-ulcer": {
      const entries=csv(input.returns??"",["date","returnPct"],256);let prior=-Infinity,peak=1,index=1,maxDays=0,start=0;
      const squares:number[]=[];let currentDays=0;
      for(const [at,r] of entries){const ms=utc(at);if(ms<=prior)throw Error("Dates must increase without duplicates.");prior=ms;
        const pct=num(r,"return %",-100,1000);index*=1+pct/100;if(!Number.isFinite(index)||index<0)throw Error("Index outside supported range.");
        if(index>=peak-1e-12){if(start)maxDays=Math.max(maxDays,(ms-start)/86400000);peak=index;start=0;currentDays=0;}
        else {if(!start)start=ms;currentDays=(ms-start)/86400000;maxDays=Math.max(maxDays,currentDays);}
        const dd=peak?100*(index/peak-1):-100;squares.push(dd*dd);
      }
      const ulcer=Math.sqrt(squares.reduce((a,b)=>a+b,0)/squares.length);
      return out(String(maxDays),{"Longest observed underwater span (days)":String(maxDays),"Current underwater span (days)":String(currentDays),
        "Ulcer index (percentage points)":fmt(ulcer),"Closing normalized index":fmt(index),"Snapshots":String(entries.length)},
        ["Each supplied return leads to its dated snapshot. The start of an underwater span is the first below-peak snapshot, so unobserved intraperiod time is unknown.","Ulcer index is the root mean square of observed percentage drawdowns; it differs from maximum drawdown."]);
    }
    case "fx-exposure-stress": {
      const entries=csv(input.exposures??"",["currency","valueBase","shockPct"],32),names=new Set<string>();let initial=0n,after=0n;
      const details:string[]=[];
      for(const [currency,valueText,shockText] of entries){if(!/^[A-Z]{3}$/.test(currency)||names.has(currency))throw Error("Use unique three-letter currency labels.");names.add(currency);
        const value=exact(valueText,"base-currency value"),shock=exact(shockText,"shock %",true);if(shock< -100n*S||shock>1000n*S)throw Error("Shock outside -100% to +1000%.");
        const change=value*shock/(100n*S);initial+=value;after+=value+change;details.push(`${currency}: ${fmtRaw(change)} base-currency change`);
      }
      return out(fmtRaw(after-initial),{"Starting manual base value":fmtRaw(initial),"Shocked manual base value":fmtRaw(after),
        "Total hypothetical change":fmtRaw(after-initial),"Currency contributions":details.join("; ")},
        ["All starting values are manually converted to one named base currency. Shock is the value change of each currency versus that base.","No live FX rate, hedge payoff or joint-market behavior is inferred."]);
    }
    case "inflation-adjusted-return": {
      const nominal=exact(input.nominalPct??"","nominal annual return",true),inflation=exact(input.inflationPct??"","annual inflation",true),
        years=integer(input.years??"","years",1,100),principal=exact(input.principal??"","principal");
      if(nominal<= -100n*S||nominal>1000n*S||inflation<= -100n*S||inflation>1000n*S)throw Error("Annual factors must stay positive and within bounds.");
      let nominalFactor=S,inflationFactor=S;for(let i=0;i<years;i++){
        nominalFactor=nominalFactor*(100n*S+nominal)/(100n*S);
        inflationFactor=inflationFactor*(100n*S+inflation)/(100n*S);
        if(nominalFactor>10n**30n||inflationFactor>10n**30n)throw Error("Growth exceeds supported bounds.");
      }
      if(!inflationFactor)throw Error("Inflation denominator rounded to zero at this horizon.");
      const nominalValue=principal*nominalFactor/S,realValue=principal*nominalFactor/inflationFactor;
      const realPct=((100n*S+nominal)*100n*S/(100n*S+inflation)-100n*S);
      return out(fmtRaw(realValue),{"Nominal future value":fmtRaw(nominalValue),"Inflation-adjusted future value in starting purchasing power":fmtRaw(realValue),
        "Annual exact-ratio real return (%)":fmtRaw(realPct),"Years":String(years)},
        ["Constant manual nominal and inflation rates, annual compounding, no taxes or fees.","Fixed-point factors round down to 12 decimals each year; future purchasing power is illustrative."]);
    }
  }
}
