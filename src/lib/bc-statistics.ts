/** Bounded offline portfolio statistics. Numeric statistical estimators are illustrative. */
export type BcId = "dca-vs-lump-sum" | "money-weighted-return" | "sharpe-sortino" |
  "historical-var-es" | "correlation-beta" | "realized-volatility" |
  "portfolio-covariance-risk" | "lot-constrained-allocation";
export type BcResult = Readonly<{ primary: string; fields: Readonly<Record<string,string>>; notes: readonly string[] }>;
const Q=10n**12n;
const numberPattern=/^-?(?:0|[1-9]\d*)(?:\.\d{1,10})?$/;
function value(text:string, label:string, low=-1e9, high=1e9):number {
  if(typeof text!=="string" || text.length>32 || !numberPattern.test(text)) throw Error(`${label}: enter a bounded plain decimal.`);
  const n=Number(text); if(!Number.isFinite(n)||n<low||n>high) throw Error(`${label}: outside supported range.`); return n;
}
function integer(text:string,label:string,low:number,high:number):number {
  const n=value(text,label,low,high); if(!Number.isSafeInteger(n)) throw Error(`${label}: whole number required.`); return n;
}
function exact(text:string,label:string):bigint {
  if(!/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(text)||text.length>40) throw Error(`${label}: enter a nonnegative decimal with at most 12 places.`);
  const [w,f=""]=text.split("."); const out=BigInt(w)*Q+BigInt(f.padEnd(12,"0"));
  if(out>10n**30n) throw Error(`${label}: value exceeds supported bounds.`); return out;
}
function fmtRaw(v:bigint):string {const s=v<0n?"-":"",a=v<0n?-v:v;return s+String(a/Q)+(a%Q?"."+String(a%Q).padStart(12,"0").replace(/0+$/,""):"");}
function fmt(v:number):string {if(!Number.isFinite(v)) throw Error("Numerical result is undefined.");return v.toFixed(8);}
function series(text:string,label:string,min=2,max=256):number[] {
  if(typeof text!=="string"||text.length>8192) throw Error(`${label}: series is too large.`);
  const items=text.split(/[\n,]+/).map(x=>x.trim());
  if(items.length<min||items.length>max||items.some(x=>!x)) throw Error(`${label}: supply ${min}–${max} complete values.`);
  return items.map((x,i)=>value(x,`${label} ${i+1}`,-100,1e6));
}
function mean(xs:number[]) {return xs.reduce((a,b)=>a+b,0)/xs.length;}
function sampleVariance(xs:number[]):number {if(xs.length<2)throw Error("At least two observations are required.");const m=mean(xs);return xs.reduce((a,b)=>a+(b-m)**2,0)/(xs.length-1);}
function utcDate(text:string):number {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw Error("Dates must be YYYY-MM-DD in UTC.");
  const date=new Date(`${text}T00:00:00Z`), ms=date.getTime();
  if(!Number.isFinite(ms)||date.toISOString().slice(0,10)!==text) throw Error("Invalid calendar date.");
  return ms;
}
export function runBc(id:BcId,input:Record<string,string>):BcResult {
  const v=(key:string,low?:number,high?:number)=>value(input[key]??"",key,low,high);
  const i=(key:string,low:number,high:number)=>integer(input[key]??"",key,low,high);
  const list=(key:string,min?:number,max?:number)=>series(input[key]??"",key,min,max);
  const out=(primary:string,fields:Record<string,string>,notes:string[]):BcResult=>({primary,fields,notes});
  switch(id){
    case "dca-vs-lump-sum": {
      const priceText=input.prices??"";if(priceText.length>8192)throw Error("Price series is too large.");
      const priceItems=priceText.split(/[\n,]+/).map(x=>x.trim());
      if(priceItems.length<2||priceItems.length>128||priceItems.some(x=>!x))throw Error("Supply 2–128 complete ordered prices.");
      const prices=priceItems.map((p,j)=>{const raw=exact(p,`Price ${j+1}`);if(raw<=0n)throw Error(`Price ${j+1} must be positive.`);return raw;});
      const installment=exact(input.installment??"","installment"); if(installment<=0n)throw Error("Installment must be positive.");
      const n=BigInt(prices.length),total=installment*n,first=prices[0]!,last=prices.at(-1)!;
      const dcaQty=prices.reduce((a,p)=>a+installment*Q/p,0n),lumpQty=total*Q/first;
      const dcaSpent=prices.reduce((a,p)=>a+(installment*Q/p)*p/Q,0n),lumpSpent=lumpQty*first/Q;
      const dcaValue=dcaQty*last/Q+(total-dcaSpent),lumpValue=lumpQty*last/Q+(total-lumpSpent);
      return out(fmtRaw(dcaValue-lumpValue),{"DCA terminal value including unspent dust":fmtRaw(dcaValue),"Lump-sum terminal value including unspent dust":fmtRaw(lumpValue),"DCA acquired quantity":fmtRaw(dcaQty),"Lump acquired quantity":fmtRaw(lumpQty),"Equal total planned spend":fmtRaw(total)},["One equal installment per listed price; lump sum buys at the first price. No fees, distributions or price prediction. Quantity is floored to 12 decimal places."]);
    }
    case "money-weighted-return": {
      const text=input.flows??"";if(text.length>8192)throw Error("Flow series is too large.");
      const rows=text.trim().split(/\n/).map((line)=>line.trim().split(","));
      if(rows.length<2||rows.length>64||rows.some(row=>row.length!==2))throw Error("Enter 2–64 date,flow rows.");
      const parsed=rows.map(([date,amount])=>({date:utcDate(date!.trim()),amount:value(amount!.trim(),"flow",-1e9,1e9)}));
      if(parsed.some((row,j)=>j>0&&row.date<=parsed[j-1]!.date))throw Error("Flow dates must strictly increase.");
      if(!parsed.some(row=>row.amount<0)||!parsed.some(row=>row.amount>0))throw Error("At least one investment outflow and one return inflow are required.");
      const t0=parsed[0]!.date, npv=(rate:number)=>parsed.reduce((a,row)=>a+row.amount/Math.pow(1+rate,(row.date-t0)/86400000/365),0);
      const signs:number[]=[];const rates:number[]=[];
      for(let j=0;j<=2048;j++){const r=Math.expm1(Math.log(0.000001)+(Math.log(1001)-Math.log(0.000001))*j/2048);rates.push(r);const y=npv(r);signs.push(Math.sign(y));}
      const intervals:number[]=[];for(let j=1;j<rates.length;j++)if(signs[j]!==0&&signs[j-1]!==0&&signs[j]!==signs[j-1])intervals.push(j);
      if(intervals.length!==1)throw Error(intervals.length?"Multiple XIRR roots found in supported range; no unique result.":"No XIRR root found in supported range.");
      let lo=rates[intervals[0]!-1]!,hi=rates[intervals[0]!]!,left=npv(lo);
      for(let j=0;j<100;j++){const mid=(lo+hi)/2,y=npv(mid);if(Math.sign(y)===Math.sign(left)){lo=mid;left=y;}else hi=mid;}
      const root=(lo+hi)/2;
      return out(fmt(root*100),{"Annual money-weighted return (%)":fmt(root*100),"Observed whole days":String((parsed.at(-1)!.date-t0)/86400000),"Cash-flow rows":String(parsed.length)},["Actual/365 date exponents; supplied flows include terminal value as a positive closing inflow. Scan detects sampled sign changes, not tangential roots. Multiple/undetected roots remain possible for nonconventional flows."]);
    }
    case "sharpe-sortino": {
      const returns=list("returns",3,256).map(x=>x/100),rf=v("riskFreePct",-100,100)/100,frequency=i("periodsPerYear",1,365);
      const excess=returns.map(r=>r-rf),sd=Math.sqrt(sampleVariance(excess)),down=Math.sqrt(mean(excess.map(x=>Math.min(x,0)**2)));
      if(sd===0||down===0)throw Error("Sharpe or Sortino denominator is zero for this series.");
      return out(fmt(mean(excess)/sd*Math.sqrt(frequency)),{"Annualized Sharpe":fmt(mean(excess)/sd*Math.sqrt(frequency)),"Annualized Sortino":fmt(mean(excess)/down*Math.sqrt(frequency)),"Sample period volatility (%)":fmt(sd*100),"Observations":String(returns.length)},["Returns and risk-free rate are per listed period. Sharpe uses sample standard deviation; Sortino uses downside deviation about the risk-free threshold with all periods in denominator."]);
    }
    case "historical-var-es": {
      const xs=list("returns",5,512),confidence=v("confidencePct",50,99.9)/100,losses=xs.map(x=>-x).sort((a,b)=>a-b),n=losses.length;
      const index=Math.ceil(confidence*n)-1,tail=Math.max(1,Math.ceil((1-confidence)*n));
      const varPct=losses[index]!,es=mean(losses.slice(n-tail));
      return out(fmt(varPct),{"Empirical VaR loss (%)":fmt(varPct),"Expected shortfall of worst observations (%)":fmt(es),"Tail observations":String(tail),"Sample size":String(n)},[n<30?"Small sample: quantile and tail mean are particularly unstable.":"Empirical sample only; no future-loss guarantee.","Loss is negative return. VaR uses nearest-rank confidence quantile; ES averages the worst ceil((1-confidence)×N) losses. A negative loss means a gain."]);
    }
    case "correlation-beta": {
      const asset=list("assetReturns",3,256),benchmark=list("benchmarkReturns",3,256);
      if(asset.length!==benchmark.length)throw Error("Asset and benchmark series must have the same synchronized length.");
      const am=mean(asset),bm=mean(benchmark),cov=asset.reduce((a,x,j)=>a+(x-am)*(benchmark[j]!-bm),0)/(asset.length-1),av=sampleVariance(asset),bv=sampleVariance(benchmark);
      if(av===0||bv===0)throw Error("Correlation or beta is undefined for a constant series.");
      return out(fmt(cov/bv),{"Beta versus benchmark":fmt(cov/bv),"Pearson correlation":fmt(cov/Math.sqrt(av*bv)),"Sample covariance (percentage-points squared)":fmt(cov),"Aligned periods":String(asset.length)},["Pair observations in the supplied order and frequency; no automatic date alignment or causal claim."]);
    }
    case "realized-volatility": {
      const returns=list("returns",3,512),frequency=i("periodsPerYear",1,365),method=input.method;
      if(method!=="simple"&&method!=="log")throw Error("Choose simple or log returns.");
      const xs=returns.map(x=>{if(method==="log"&&x<=-100)throw Error("Log return is undefined at a complete loss.");return method==="log"?Math.log1p(x/100):x/100;});
      const period=Math.sqrt(sampleVariance(xs)),annual=period*Math.sqrt(frequency);
      return out(fmt(annual*100),{"Annualized realized volatility (%)":fmt(annual*100),"Sample period volatility (%)":fmt(period*100),"Method":method,"Observations":String(xs.length)},["Sample standard deviation and square-root-of-time annualization. Log mode transforms supplied simple returns. Volatility is historical dispersion, not a loss limit."]);
    }
    case "portfolio-covariance-risk": {
      const weights=list("weights",2,8); if(weights.some(w=>w<0||w>100)||Math.abs(weights.reduce((a,b)=>a+b,0)-100)>1e-8)throw Error("Nonnegative weights must sum to exactly 100% within 1e-8 percentage points.");
      const rows=(input.covariance??"").trim().split(/\n/).map(row=>series(row,"covariance row",weights.length,weights.length));
      if(rows.length!==weights.length)throw Error("Covariance matrix must be square and match the weight count.");
      for(let a=0;a<rows.length;a++){if(rows[a]![a]!<0)throw Error("Covariance diagonal cannot be negative.");for(let b=0;b<a;b++)if(Math.abs(rows[a]![b]!-rows[b]![a]!)>1e-8)throw Error("Covariance matrix must be symmetric.");}
      // Cholesky-style PSD test; singular matrices are accepted.
      const l=rows.map(row=>row.map(()=>0));for(let a=0;a<rows.length;a++)for(let b=0;b<=a;b++){let s=rows[a]![b]!;for(let k=0;k<b;k++)s-=l[a]![k]!*l[b]![k]!;if(a===b){if(s<-1e-8)throw Error("Covariance matrix is not positive semidefinite.");l[a]![b]=Math.sqrt(Math.max(0,s));}else if(l[b]![b]!>1e-12)l[a]![b]=s/l[b]![b]!;else if(Math.abs(s)>1e-8)throw Error("Covariance matrix is not positive semidefinite.");}
      let variance=0;for(let a=0;a<weights.length;a++)for(let b=0;b<weights.length;b++)variance+=weights[a]!/100*rows[a]![b]!*weights[b]!/100;
      const frequency=i("periodsPerYear",1,365),period=Math.sqrt(Math.max(0,variance));
      return out(fmt(period*Math.sqrt(frequency)),{"Annualized portfolio volatility (percentage points)":fmt(period*Math.sqrt(frequency)),"Period variance (percentage-points squared)":fmt(variance),"Period volatility (percentage points)":fmt(period)},["Manual symmetric PSD covariance of synchronized percentage-point returns. No expected return, forecast or diversification guarantee."]);
    }
    case "lot-constrained-allocation": {
      const cash=exact(input.cash??"","cash"),text=input.assets??"";if(text.length>4096)throw Error("Asset rows are too large.");
      const rows=text.trim().split(/\n/);if(rows.length<2||rows.length>12)throw Error("Enter 2–12 asset rows: label,price,targetBps,lotSize.");
      const names=new Set<string>();let totalBps=0n,spent=0n;const summary:string[]=[];
      for(const row of rows){const parts=row.split(",").map(x=>x.trim());if(parts.length!==4)throw Error("Each asset row needs label,price,targetBps,lotSize.");const [name,p,b,l]=parts as [string,string,string,string];if(!/^[A-Za-z][A-Za-z0-9._-]{0,23}$/.test(name)||names.has(name))throw Error("Asset labels must be short and unique; they are not verified identities.");names.add(name);
        const price=exact(p,"price"),lot=exact(l,"lot size"),bps=BigInt(integer(b,"target bps",0,10000));if(price<=0n||lot<=0n)throw Error("Price and lot size must be positive.");totalBps+=bps;const budget=cash*bps/10000n,perLot=(price*lot+Q-1n)/Q;const count=budget/perLot,cost=count*perLot;spent+=cost;summary.push(`${name}: ${count} lots, ${fmtRaw(count*lot)} units, ${fmtRaw(cost)} spent`);
      }
      if(totalBps!==10000n)throw Error("Target weights must sum to exactly 10000 bps.");
      return out(fmtRaw(cash-spent),{"Unspent cash":fmtRaw(cash-spent),"Conservative modeled spending":fmtRaw(spent),"Lots by manual label":summary.join("; ")},["Each asset receives only its target budget; residual is not redistributed. Fractional per-lot quote cost is rounded up to the smallest supported unit. Prices, lot sizes and labels are manual; no orders or token identity verification."]);
    }
  }
}
