/** Offline, illustrative derivative mathematics. No prices, positions or orders are fetched. */
export type BbId = "perpetual-pnl" | "perpetual-funding" | "perpetual-margin" |
  "futures-basis" | "european-option-payoff" | "black-scholes-greeks" |
  "implied-volatility" | "trade-expectancy";
export type BbResult = Readonly<{ primary: string; fields: Readonly<Record<string, string>>; notes: readonly string[] }>;
const SCALE = 10n ** 12n;
const MAX = 10n ** 30n;
function dec(text: string, name: string, signed = false): bigint {
  if (typeof text !== "string" || text.length > 48 || !/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(signed && text.startsWith("-") ? text.slice(1) : text)) throw Error(`${name}: enter a plain decimal with at most 12 places.`);
  const negative = signed && text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const value = BigInt(whole) * SCALE + BigInt(fraction.padEnd(12, "0"));
  if (value > MAX) throw Error(`${name}: amount exceeds supported bounds.`);
  return negative ? -value : value;
}
function pos(v: bigint, name: string) { if (v <= 0n) throw Error(`${name} must be positive.`); return v; }
function nonneg(v: bigint, name: string) { if (v < 0n) throw Error(`${name} must be nonnegative.`); return v; }
function div(a: bigint, b: bigint) { if (!b) throw Error("Undefined ratio: denominator is zero."); return a * SCALE / b; }
function mul(a: bigint, b: bigint) { return a * b / SCALE; }
function fmt(v: bigint): string {
  const sign = v < 0n ? "-" : ""; const abs = v < 0n ? -v : v;
  return `${sign}${abs / SCALE}${abs % SCALE ? `.${String(abs % SCALE).padStart(12, "0").replace(/0+$/, "")}` : ""}`;
}
function num(text: string, name: string, min: number, max: number): number {
  const value = Number(text);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(text) || !Number.isFinite(value) || value < min || value > max) throw Error(`${name} must be between ${min} and ${max}.`);
  return value;
}
function normalCdf(x: number): number {
  // Abramowitz-Stegun 7.1.26, absolute error < 7.5e-8.
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const density = Math.exp(-x*x/2) / Math.sqrt(2*Math.PI);
  const tail = density*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  return x >= 0 ? 1-tail : tail;
}
function bs(spot: number, strike: number, rate: number, vol: number, years: number, kind: "call"|"put") {
  const root = Math.sqrt(years), d1 = (Math.log(spot/strike)+(rate+vol*vol/2)*years)/(vol*root), d2=d1-vol*root;
  const discounted = strike*Math.exp(-rate*years), pdf = Math.exp(-d1*d1/2)/Math.sqrt(2*Math.PI);
  const call = spot*normalCdf(d1)-discounted*normalCdf(d2);
  const put = call-spot+discounted;
  return { price: kind === "call" ? call : put, delta: kind === "call" ? normalCdf(d1) : normalCdf(d1)-1,
    gamma: pdf/(spot*vol*root), vega: spot*pdf*root, theta: -(spot*pdf*vol)/(2*root) + (kind === "call" ? -rate*discounted*normalCdf(d2) : rate*discounted*normalCdf(-d2)),
    rho: (kind === "call" ? 1 : -1)*strike*years*Math.exp(-rate*years)*normalCdf(kind === "call" ? d2 : -d2) };
}
function fixed(value: number) { if (!Number.isFinite(value)) throw Error("Numerical result is outside supported bounds."); return value.toFixed(8); }
export function runBb(id: BbId, input: Record<string, string>): BbResult {
  const d = (key: string, signed=false) => dec(input[key] ?? "", key, signed);
  const n = (key: string, min=0, max=1_000_000) => num(input[key] ?? "", key, min, max);
  const result = (primary: string, fields: Record<string,string>, notes: string[]): BbResult => ({primary, fields, notes});
  switch(id) {
    case "perpetual-pnl": {
      const entry=pos(d("entry"),"Entry"), exit=pos(d("exit"),"Exit"), quantity=pos(d("quantity"),"Quantity"), leverage=pos(d("leverage"),"Leverage");
      const entryFee=nonneg(d("entryFeeBps"),"Entry fee"), exitFee=nonneg(d("exitFeeBps"),"Exit fee");
      if(entryFee>10000n*SCALE || exitFee>10000n*SCALE || leverage>100n*SCALE) throw Error("Fee or leverage exceeds supported bounds.");
      const side=input.side === "long" ? 1n : input.side === "short" ? -1n : 0n;
      if(!side) throw Error("Choose long or short.");
      const gross=mul(mul(exit-entry,quantity),side*SCALE), fees=(mul(entry,quantity)*entryFee+mul(exit,quantity)*exitFee)/(10000n*SCALE);
      const margin=div(mul(entry,quantity),leverage), net=gross-fees;
      return result(fmt(net), {"Gross PnL":fmt(gross),"Entry and exit fees":fmt(fees),"Net PnL":fmt(net),"Illustrative initial margin":fmt(margin),"Return on initial margin (%)":fmt(div(net,margin)*100n)}, ["No funding, liquidation, price gaps or exchange-specific margin rules."]);
    }
    case "perpetual-funding": {
      const notional=pos(d("notional"),"Notional"), rate=d("fundingBps",true), periods=BigInt(n("periods",1,10000));
      if(rate < -10000n*SCALE || rate > 10000n*SCALE) throw Error("Funding rate is outside ±10000 bps.");
      const signed=notional*rate*periods/(10000n*SCALE), side=input.side === "long" ? 1n : input.side === "short" ? -1n : 0n;
      if(!side) throw Error("Choose long or short.");
      return result(fmt(-side*signed),{"Signed funding to position":fmt(-side*signed),"Absolute modeled transfer":fmt(signed<0n?-signed:signed),"Periods":String(periods)},["Positive funding means longs pay shorts. Notional and rate are held constant; no exchange settlement is modeled."]);
    }
    case "perpetual-margin": {
      const notional=pos(d("notional"),"Notional"), posted=nonneg(d("postedMargin"),"Posted margin"), initial=d("initialBps"), maintenance=d("maintenanceBps");
      if(initial>10000n*SCALE || maintenance>initial) throw Error("Require 0 ≤ maintenance margin ≤ initial margin ≤ 100%.");
      const i=notional*initial/(10000n*SCALE), m=notional*maintenance/(10000n*SCALE), buffer=posted-m;
      return result(fmt(buffer),{"Initial requirement":fmt(i),"Maintenance requirement":fmt(m),"Buffer above maintenance":fmt(buffer),"Initial requirement met":posted>=i?"yes":"no"},["Static notional and manually entered thresholds; this is not a liquidation price or guarantee."]);
    }
    case "futures-basis": {
      const spot=pos(d("spot"),"Spot"), future=pos(d("future"),"Futures"), days=BigInt(n("days",1,3650));
      const absolute=future-spot, pct=div(absolute,spot)*100n, annual=pct*365n/days;
      return result(fmt(annual),{"Absolute basis":fmt(absolute),"Basis versus spot (%)":fmt(pct),"Simple annualized basis (%)":fmt(annual)},["ACT/365 simple annualization; not realized carry, funding or arbitrage profit."]);
    }
    case "european-option-payoff": {
      const strike=pos(d("strike"),"Strike"), terminal=nonneg(d("terminal"),"Terminal price"), premium=nonneg(d("premium"),"Premium");
      const kind=input.kind;
      if(kind!=="call" && kind!=="put") throw Error("Choose call or put.");
      const intrinsic=kind==="call" ? (terminal>strike?terminal-strike:0n) : (strike>terminal?strike-terminal:0n);
      return result(fmt(intrinsic-premium),{"Intrinsic payoff per option":fmt(intrinsic),"Net payoff after premium":fmt(intrinsic-premium),"Premium paid":fmt(premium),"Breakeven terminal price":kind==="call"?fmt(strike+premium):premium>strike?"none at a nonnegative price":fmt(strike-premium)},["European expiry payoff per unit; ignores exercise fees and contract multipliers."]);
    }
    case "black-scholes-greeks": {
      const spot=n("spot",0.00000001,1e8), strike=n("strike",0.00000001,1e8), rate=n("ratePct",0,100)/100, vol=n("volPct",0.000001,1000)/100, years=n("years",0.000001,100);
      const kind=input.kind === "call" ? "call" : input.kind === "put" ? "put" : null; if(!kind) throw Error("Choose call or put.");
      const v=bs(spot,strike,rate,vol,years,kind);
      return result(fixed(v.price),{"Model price":fixed(v.price),"Delta":fixed(v.delta),"Gamma":fixed(v.gamma),"Vega per 1.00 volatility":fixed(v.vega),"Theta per year":fixed(v.theta),"Rho per 1.00 rate":fixed(v.rho)},["European vanilla, constant volatility and risk-free rate, no dividends; CDF approximation error < 7.5e-8. Price/Greeks are numerical illustrations, not executable quotes."]);
    }
    case "implied-volatility": {
      const spot=n("spot",0.00000001,1e8), strike=n("strike",0.00000001,1e8), rate=n("ratePct",0,100)/100, years=n("years",0.000001,100), market=n("optionPrice",0,1e8);
      const kind=input.kind === "call" ? "call" : input.kind === "put" ? "put" : null; if(!kind) throw Error("Choose call or put.");
      const discounted=strike*Math.exp(-rate*years), lower=kind==="call"?Math.max(0,spot-discounted):Math.max(0,discounted-spot), upper=kind==="call"?spot:discounted;
      if(market<=lower+1e-8 || market>=upper-1e-8) throw Error("Price is at or outside the strict no-arbitrage bounds; finite IV is not identifiable.");
      let low=0.000001, high=10;
      if(bs(spot,strike,rate,high,years,kind).price<market) throw Error("Implied volatility exceeds the supported 1000% bound.");
      for(let i=0;i<80;i++){const mid=(low+high)/2;if(bs(spot,strike,rate,mid,years,kind).price<market)low=mid;else high=mid;}
      const vol=(low+high)/2, residual=bs(spot,strike,rate,vol,years,kind).price-market;
      return result(fixed(vol*100),{"Implied volatility (%)":fixed(vol*100),"Repricing residual":fixed(residual),"Lower price bound":fixed(lower),"Upper price bound":fixed(upper)},["Bounded 80-step bisection; same no-dividend European model and CDF approximation as pricing. Multiple models can imply different volatilities."]);
    }
    case "trade-expectancy": {
      const win=d("winBps"), gain=nonneg(d("gain"),"Gain"), loss=nonneg(d("loss"),"Loss");
      if(win>10000n*SCALE || gain+loss===0n) throw Error("Probability must be at most 100%, and a payoff must be nonzero.");
      const exp=(gain*win-loss*(10000n*SCALE-win))/(10000n*SCALE), breakeven=loss*10000n/(gain+loss);
      return result(fmt(exp),{"Expected payoff per trade":fmt(exp),"Breakeven win probability (bps)":String(breakeven),"Loss probability (bps)":fmt(10000n*SCALE-win)},["Independent identical hypothetical outcomes; no distribution tails, fees or trading recommendation."]);
    }
  }
}
