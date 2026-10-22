/** Bounded, browser-local scenario mathematics. Inputs are manual, never quotes or orders. */
import { parseCsv } from "./crypto-data-workshop";

export type BjId = "options-strategy" | "portfolio-greeks" | "volatility-smile" |
  "delta-hedge" | "futures-hedge" | "funding-history" | "trading-journal" | "order-book-depth";
export type BjResult = Readonly<{ primary: string; fields: Readonly<Record<string, string>>; notes: readonly string[];
  plot?: readonly Readonly<{ x: string; y: string }>[] }>;
const S = 10n ** 8n;
const MAX = 10n ** 25n;
function decimal(text: string, name: string, signed = false): bigint {
  if (typeof text !== "string" || text.length > 48 || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(text) || (!signed && text.startsWith("-")))
    throw Error(`${name}: enter a plain decimal with at most eight places.`);
  const neg = text.startsWith("-");
  const [whole, fraction = ""] = (neg ? text.slice(1) : text).split(".");
  const raw = BigInt(whole) * S + BigInt(fraction.padEnd(8, "0"));
  if (raw > MAX) throw Error(`${name}: value exceeds the supported bound.`);
  return neg ? -raw : raw;
}
const abs = (v: bigint) => v < 0n ? -v : v;
const mul = (a: bigint, b: bigint) => a * b / S;
function ratio(a: bigint, b: bigint): bigint { if (!b) throw Error("The denominator must be nonzero."); return a * S / b; }
function fmt(v: bigint): string {
  const a = abs(v); return `${v < 0n ? "-" : ""}${a / S}${a % S ? `.${String(a % S).padStart(8, "0").replace(/0+$/, "")}` : ""}`;
}
function positive(v: bigint, name: string): bigint { if (v <= 0n) throw Error(`${name} must be positive.`); return v; }
function nonnegative(v: bigint, name: string): bigint { if (v < 0n) throw Error(`${name} must be nonnegative.`); return v; }
function rows(text: string, header: readonly string[], max = 100): string[][] {
  if (typeof text !== "string" || text.length > 32_000) throw Error("The imported table is too large.");
  const parsed = parseCsv(text, ",", true);
  if (parsed.issues.length || parsed.rows.length === 0 || parsed.rows.length > max ||
      JSON.stringify(parsed.header) !== JSON.stringify(header))
    throw Error(`Use a CSV header of ${header.join(",")} and at most ${max} complete rows.`);
  return parsed.rows;
}
function date(text: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`)) ||
      new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text) throw Error("Use valid YYYY-MM-DD UTC dates.");
  return text;
}
const result = (primary: string, fields: Record<string, string>, notes: string[], plot?: BjResult["plot"]): BjResult =>
  ({ primary, fields, notes, ...(plot ? { plot } : {}) });

export function runBj(id: BjId, input: Record<string, string>): BjResult {
  const d = (key: string, signed = false) => decimal(input[key] ?? "", key, signed);
  switch (id) {
    case "options-strategy": {
      const legs = rows(input.legs ?? "", ["kind", "side", "strike", "premium", "quantity"], 12).map(([kind, side, strike, premium, quantity]) => {
        if (kind !== "call" && kind !== "put" || side !== "long" && side !== "short") throw Error("Each leg needs call/put and long/short.");
        return { kind, side: side === "long" ? 1n : -1n, strike: positive(decimal(strike, "strike"), "Strike"),
          premium: nonnegative(decimal(premium, "premium"), "Premium"), quantity: positive(decimal(quantity, "quantity"), "Quantity") };
      });
      const terminal = nonnegative(d("terminal"), "Terminal price");
      const netPremium = legs.reduce((sum, leg) => sum - mul(leg.premium, leg.quantity) * leg.side, 0n);
      const payoff = (price: bigint) => legs.reduce((sum, leg) => {
        const intrinsic = leg.kind === "call" ? (price > leg.strike ? price - leg.strike : 0n) : (leg.strike > price ? leg.strike - price : 0n);
        return sum + mul(intrinsic, leg.quantity) * leg.side;
      }, netPremium);
      const knots = [...new Set([0n, ...legs.map(leg => leg.strike)].map(String))].map(BigInt).sort((a,b) => a < b ? -1 : a > b ? 1 : 0);
      const roots = new Set<string>();
      for (let i = 0; i < knots.length; i++) {
        const left = knots[i], right = knots[i+1] ?? left + S;
        const fl = payoff(left), fr = payoff(right), slope = ratio(fr-fl, right-left);
        if (fl === 0n) roots.add(fmt(left));
        if (slope) {
          const root = left - fl * S / slope;
          if (root >= left && (i === knots.length-1 || root <= right)) roots.add(fmt(root));
        }
      }
      return result(fmt(payoff(terminal)), { "Net premium received (+) or paid (-)": fmt(netPremium),
        "Net expiry payoff": fmt(payoff(terminal)), "Modeled breakeven prices": [...roots].join(", ") || "none in nonnegative price domain",
        "Leg count": String(legs.length) }, ["European expiry payoff only; exercise style, assignment, contract multiplier and fees are excluded."]);
    }
    case "portfolio-greeks": {
      const legs = rows(input.legs ?? "", ["quantity", "multiplier", "delta", "gamma", "vega", "theta", "rho"], 40);
      const names = ["delta", "gamma", "vega", "theta", "rho"] as const;
      const totals = Object.fromEntries(names.map(name => [name, 0n])) as Record<typeof names[number], bigint>;
      for (const [i, row] of legs.entries()) {
        const q = decimal(row[0], `quantity row ${i+1}`, true), m = positive(decimal(row[1], `multiplier row ${i+1}`), "Multiplier");
        names.forEach((name,j) => { totals[name] += mul(mul(q,m),decimal(row[j+2],`${name} row ${i+1}`,true)); });
      }
      return result(fmt(totals.delta), Object.fromEntries(names.map(name => [`Aggregate ${name}`,fmt(totals[name])])),
        ["Inputs must share one underlying, quote currency, observation time and Greek unit convention.", "Vega and rho are per 1.00 absolute volatility/rate; theta is per year. No cross-asset aggregation."]);
    }
    case "volatility-smile": {
      const observations = rows(input.observations ?? "", ["strike", "ivPercent"], 100).map(([strike,iv]) =>
        ({ strike: positive(decimal(strike,"strike"),"Strike"), iv: positive(decimal(iv,"IV"),"IV") }));
      observations.sort((a,b) => a.strike < b.strike ? -1 : a.strike > b.strike ? 1 : 0);
      if (observations.length < 3 || observations.some((v,i) => i && v.strike === observations[i-1].strike))
        throw Error("Supply at least three unique positive strikes.");
      const lowest = observations.reduce((a,b) => b.iv < a.iv ? b : a);
      return result(`${fmt(lowest.iv)}% at strike ${fmt(lowest.strike)}`,
        { "Lowest entered IV (%)": fmt(lowest.iv), "Lowest-IV strike": fmt(lowest.strike),
          "Left wing IV (%)": fmt(observations[0].iv), "Right wing IV (%)": fmt(observations.at(-1)!.iv),
          "Right-minus-left wing (percentage points)": fmt(observations.at(-1)!.iv-observations[0].iv), "Observations": String(observations.length) },
        ["Manual strike/annualized-IV observations at one expiry and snapshot. The plot connects observations only; no smoothing or market interpolation."],
        observations.map(v=>({x:fmt(v.strike),y:fmt(v.iv)})));
    }
    case "delta-hedge": {
      const optionDelta = d("optionDelta",true), existingHedge = d("existingHedge",true), target = d("targetDelta",true);
      const price = positive(d("hedgePrice"),"Hedge price"), fee = nonnegative(d("feeBps"),"Fee bps");
      if (fee > 10000n*S) throw Error("Fee cannot exceed 10000 bps.");
      const trade = target - optionDelta - existingHedge;
      const notional = mul(abs(trade),price), cost = notional * fee / (10000n*S);
      return result(fmt(trade), { "Underlying units to buy (+) or sell (-)":fmt(trade), "Gross hedge notional":fmt(notional),
        "Modeled transaction fee":fmt(cost), "Delta after hypothetical hedge":fmt(optionDelta+existingHedge+trade) },
        ["Delta is in underlying units and all positions must refer to one verified underlying.", "Continuous delta hedge is not possible here; market movement, shorting constraints, spread and funding are excluded."]);
    }
    case "futures-hedge": {
      const exposure = d("exposure",true), contract = positive(d("contractNotional"),"Contract notional"),
        fraction = nonnegative(d("hedgeBps"),"Hedge fraction"), beta = positive(d("beta"),"Beta");
      if (fraction > 10000n*S || beta > 100n*S) throw Error("Hedge fraction or beta exceeds supported bounds.");
      const target = mul(mul(abs(exposure),beta),fraction) / 10000n;
      const contracts = target / contract;
      if (contracts > 1_000_000n) throw Error("Contract count exceeds supported bounds.");
      const covered = contracts * contract, residual = target-covered;
      return result(`${exposure >= 0n ? "short" : "long"} ${contracts} contracts`, {
        "Target hedge notional":fmt(target), "Whole contracts (rounded down)":String(contracts),
        "Covered notional":fmt(covered), "Uncovered target notional":fmt(residual) },
        ["Contract notional and exposure use one manual quote unit. Rounding down avoids exceeding target notional.", "Beta and prices are assumed fixed; margin, basis, fees and exchange rules are excluded."]);
    }
    case "funding-history": {
      const side = input.side === "long" ? 1n : input.side === "short" ? -1n : 0n;
      if (!side) throw Error("Choose long or short.");
      const samples = rows(input.observations ?? "", ["date", "rateBps", "notional"], 200);
      let previous = "", total = 0n, paid = 0n, received = 0n;
      for (const [at, rateText, notionalText] of samples) {
        const current = date(at); if (current <= previous) throw Error("Dates must be unique and increasing."); previous = current;
        const rate = decimal(rateText,"funding rate",true), notional = positive(decimal(notionalText,"notional"),"Notional");
        if (abs(rate)>10000n*S) throw Error("Funding rate exceeds ±10000 bps.");
        const transfer = -side * notional * rate / (10000n*S);
        total += transfer; if (transfer < 0n) paid -= transfer; else received += transfer;
      }
      return result(fmt(total), { "Net signed funding to position":fmt(total), "Total paid":fmt(paid),
        "Total received":fmt(received), "Observations":String(samples.length) },
        ["Each row is one supplied funding settlement; positive rate means longs pay.", "Missing settlements, changing exposure between samples and exchange-specific rules are not reconstructed."]);
    }
    case "trading-journal": {
      const trades = rows(input.trades ?? "", ["id", "grossPnl", "fees"], 500);
      const ids = new Set<string>(); let net=0n, gains=0n, losses=0n, wins=0, streak=0, maxStreak=0;
      for (const [idText,pnlText,feeText] of trades) {
        if (!idText || idText.length > 64 || ids.has(idText)) throw Error("Trade IDs must be nonempty and unique."); ids.add(idText);
        const pnl=decimal(pnlText,"gross PnL",true), fee=nonnegative(decimal(feeText,"fees"),"Fees");
        const outcome=pnl-fee; net+=outcome;
        if (outcome>0n) { gains+=outcome; wins++; streak=0; } else if (outcome<0n) { losses-=outcome; streak++; maxStreak=Math.max(maxStreak,streak); } else streak=0;
      }
      return result(fmt(net), { "Net PnL":fmt(net), "Win rate (%)":fmt(BigInt(wins)*100n*S/BigInt(trades.length)),
        "Gross gains":fmt(gains), "Gross losses":fmt(losses), "Profit factor":losses ? fmt(ratio(gains,losses)) : "undefined without losses",
        "Longest losing streak (row order)":String(maxStreak), "Trades":String(trades.length) },
        ["Rows are manually ordered trades in one quote currency; no deposits, open positions, tax lots or missing-trade reconstruction."]);
    }
    case "order-book-depth": {
      const side = input.side;
      if (side!=="buy" && side!=="sell") throw Error("Choose buy or sell.");
      const levels = rows(input.levels ?? "", ["price", "quantity"], 200).map(([p,q])=>
        ({price:positive(decimal(p,"price"),"Price"),quantity:positive(decimal(q,"quantity"),"Quantity")}));
      for (let i=1;i<levels.length;i++) if (side==="buy" ? levels[i].price<levels[i-1].price : levels[i].price>levels[i-1].price)
        throw Error("Book levels must be ordered best-to-worst for the selected side.");
      let remaining=positive(d("quantity"),"Requested quantity"), filled=0n, notional=0n;
      for (const level of levels) { const take=remaining<level.quantity?remaining:level.quantity; remaining-=take;filled+=take;notional+=mul(take,level.price);if(!remaining)break; }
      const avg=filled?ratio(notional,filled):0n, best=levels[0].price;
      const deviation=filled ? (side==="buy" ? avg-best : best-avg)*10000n*S/best : 0n;
      return result(remaining ? "Insufficient entered depth" : fmt(avg), { "Filled quantity":fmt(filled), "Unfilled quantity":fmt(remaining),
        "Modeled gross quote notional":fmt(notional), "Average execution price":filled?fmt(avg):"undefined", "Deviation from best level (bps)":fmt(deviation) },
        ["Only supplied levels are counted; missing depth remains unfilled.", "Static book illustration excludes queue priority, hidden liquidity, fees, latency and market movement."]);
    }
  }
}
