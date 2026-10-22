/** Bounded offline tokenomics and EVM data inspection. No calls, signing or broadcasts. */
import { concatHex, encodeFunctionData, keccak256, parseAbiItem, parseTransaction } from "viem/utils";
import { parseCsv } from "./crypto-data-workshop";
export type BmId="token-supply-schedule"|"token-dilution-fdv"|"dao-voting-quorum"|"dao-treasury-runway"|
  "bonding-curve"|"abi-calldata-encode"|"signed-transaction-decode"|"merkle-proof-verify";
export type BmResult=Readonly<{primary:string;fields:Readonly<Record<string,string>>;notes:readonly string[]}>;
const Q=10n**12n,BPS=10000n;
function dec(text:string,label:string,signed=false):bigint {
  if(typeof text!=="string"||text.length>48||!/^-?(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(text)||(!signed&&text.startsWith("-")))throw Error(`${label}: enter a bounded plain decimal.`);
  const neg=text.startsWith("-"),[a,b=""]=(neg?text.slice(1):text).split(".");const n=BigInt(a)*Q+BigInt(b.padEnd(12,"0"));
  if(n>10n**30n)throw Error(`${label}: exceeds supported range.`);return neg?-n:n;
}
function fmt(v:bigint):string {const n=v<0n?-v:v;return `${v<0n?"-":""}${n/Q}${n%Q?`.`+String(n%Q).padStart(12,"0").replace(/0+$/,''):''}`;}
function whole(text:string,label:string,min:number,max:number):number {
  if(!/^(?:0|[1-9]\d*)$/.test(text)||text.length>12)throw Error(`${label}: whole number required.`);
  const n=Number(text);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(`${label}: outside supported range.`);return n;
}
function table(text:string,header:readonly string[],max:number):string[][] {
  if(typeof text!=="string"||text.length>16_000)throw Error("Table exceeds the supported size.");
  const p=parseCsv(text,",",true);if(p.issues.length||p.rows.length<1||p.rows.length>max||JSON.stringify(p.header)!==JSON.stringify(header))
    throw Error(`Use header ${header.join(",")} and at most ${max} complete rows.`);return p.rows;
}
const out=(primary:string,fields:Record<string,string>,notes:string[]):BmResult=>({primary,fields,notes});
const hex32=(s:string,label:string):`0x${string}`=>{if(!/^0x[0-9a-fA-F]{64}$/.test(s))throw Error(`${label}: expected a 32-byte hex digest.`);return s.toLowerCase() as `0x${string}`;};
export function runBm(id:BmId,input:Record<string,string>):BmResult {
  const d=(key:string,signed=false)=>dec(input[key]??"",key,signed);
  switch(id){
    case "token-supply-schedule": {
      const initial=d("initialSupply"),schedule=table(input.schedule??"",["year","minted","burned"],100);let supply=initial,previous=-1,totalMinted=0n,totalBurned=0n;
      const summary:string[]=[];
      for(const [at,mintText,burnText] of schedule){const year=whole(at,"Year",0,2100);if(year<=previous)throw Error("Years must be unique and increasing.");previous=year;
        const minted=dec(mintText,"minted"),burned=dec(burnText,"burned");if(burned>supply+minted)throw Error("Burns cannot exceed supply available in that year.");
        supply+=minted-burned;totalMinted+=minted;totalBurned+=burned;summary.push(`${year}: ${fmt(supply)}`);
      }
      return out(fmt(supply),{"Ending modeled supply":fmt(supply),"Cumulative minted":fmt(totalMinted),"Cumulative burned":fmt(totalBurned),
        "Year-end supply path":summary.join("; ")},["Manual calendar-year issuance and burns, processed in listed order. No on-chain supply lookup or claim that emissions will occur."]);
    }
    case "token-dilution-fdv": {
      const circulating=d("circulating"),max=d("maxSupply"),newTokens=d("newIssuance"),price=d("manualPrice");
      if(circulating<=0n||price<=0n||circulating>max||circulating+newTokens>max)throw Error("Require positive circulating supply and price, with issuance within manual max supply.");
      const cap=circulating*price/Q,fdv=max*price/Q,dilution=newTokens*BPS/circulating;
      const oldShare=circulating*Q/(circulating+newTokens);
      return out(fmt(fdv),{"Current manual market value":fmt(cap),"Fully diluted value at constant manual price":fmt(fdv),
        "New issuance versus current supply (bps)":String(dilution),"Existing-token share after issuance":fmt(oldShare),
        "Unissued amount after scenario":fmt(max-circulating-newTokens)},
        ["Price is entered manually and held constant. Max supply is a user assumption, not a verified token cap.","Issuance dilution changes ownership fraction; FDV does not forecast future price or liquidity."]);
    }
    case "dao-voting-quorum": {
      const eligible=d("eligibleVotes"),forVotes=d("forVotes"),against=d("againstVotes"),abstain=d("abstainVotes"),
        quorum=BigInt(whole(input.quorumBps??"","Quorum bps",0,10000)),pass=BigInt(whole(input.passBps??"","Pass threshold bps",0,10000));
      const turnout=forVotes+against+abstain,decision=forVotes+against;
      if(eligible<=0n||turnout>eligible)throw Error("Eligible voting power must be positive and not exceeded by cast votes.");
      const required=(eligible*quorum+BPS-1n)/BPS,quorumMet=turnout>=required,passMet=decision>0n&&forVotes*BPS>decision*pass;
      return out(quorumMet&&passMet?"passes this manual rule":"does not pass this manual rule",{
        "Votes cast including abstain":fmt(turnout),"Minimum quorum votes":fmt(required),"Quorum met":quorumMet?"yes":"no",
        "For share of decisive votes (bps)":decision?String(forVotes*BPS/decision):"undefined","Strict pass threshold met":passMet?"yes":"no"},
        ["Abstain counts toward quorum but not decisive votes; for share must strictly exceed the chosen pass threshold.","Real DAOs can use snapshot, delegation, timelocks and different rules. No proposal or vote is submitted."]);
    }
    case "dao-treasury-runway": {
      const treasury=d("treasury"),obligations=d("oneTimeObligations"),burn=d("monthlyBurn"),revenue=d("monthlyRevenue");
      if(obligations>treasury)throw Error("Known obligations exceed liquid treasury.");
      const available=treasury-obligations,netBurn=burn-revenue;
      const wholeMonths=netBurn>0n?available/netBurn:null;
      return out(wholeMonths===null?"no depletion under fixed monthly inputs":String(wholeMonths),{
        "Available liquid treasury after known obligations":fmt(available),"Net monthly burn":fmt(netBurn),
        "Whole funded months":wholeMonths===null?"not bounded under stated recurring inputs":String(wholeMonths),
        "Residual after funded whole months":wholeMonths===null?"not applicable":fmt(available-wholeMonths*netBurn)},
        ["One manual quote currency, fixed recurring burn and revenue, with obligations paid first.","No token-price volatility, vesting, credit line or future spending changes are modeled."]);
    }
    case "bonding-curve": {
      const base=d("basePrice"),slope=d("slopePerToken"),supply=d("currentSupply"),amount=d("amount"),side=input.side;
      if(base<=0n||amount<=0n||!(["buy","sell"] as string[]).includes(side))throw Error("Choose a positive price/amount and buy or sell.");
      if(side==="sell"&&amount>supply)throw Error("Sale amount exceeds supplied circulating curve quantity.");
      const start=side==="buy"?supply:supply-amount,end=start+amount;
      const integral=base*amount/Q+slope*(end*end-start*start)/(2n*Q*Q);
      const priceBefore=base+slope*start/Q,priceAfter=base+slope*end/Q;
      return out(fmt(integral),{"Gross curve payment (buy) or receipt (sell)":fmt(integral),"Marginal price at interval start":fmt(priceBefore),
        "Marginal price at interval end":fmt(priceAfter),"Average price over quantity":fmt(integral*Q/amount)},
        ["Continuous linear marginal price p(q)=base+slope×q, integrated over stated quantity and floored to 12 quote decimals.","No contract reserve, token decimals, tax, fee, slippage or executable transaction is implied."]);
    }
    case "abi-calldata-encode": {
      const signature=input.signature??"",valuesText=input.values??"";
      const match=/^([A-Za-z_][A-Za-z0-9_]{0,31})\(((?:address|bool|uint(?:8|16|32|64|128|256)|bytes32)(?:,(?:address|bool|uint(?:8|16|32|64|128|256)|bytes32))*)?\)$/.exec(signature);
      if(!match)throw Error("Use a canonical function signature with up to eight supported static primitive arguments.");
      const types=match[2]?match[2].split(","):[];if(types.length>8||valuesText.length>1024)throw Error("At most eight bounded static arguments are supported.");
      const values=types.length?valuesText.split(",").map(x=>x.trim()):[];if(values.length!==types.length)throw Error("Argument count does not match signature.");
      const args=types.map((type,i)=>{const v=values[i];if(type==="address"){
        if(!/^0x[0-9a-fA-F]{40}$/.test(v))throw Error(`Argument ${i+1}: 20-byte address required.`);return v as `0x${string}`;
      }if(type==="bool"){if(v!=="true"&&v!=="false")throw Error(`Argument ${i+1}: true or false required.`);return v==="true";}
      if(type==="bytes32")return hex32(v,`Argument ${i+1}`);
      if(!/^(?:0|[1-9]\d*)$/.test(v)||v.length>78)throw Error(`Argument ${i+1}: unsigned whole integer required.`);
      const num=BigInt(v),bits=BigInt(type.slice(4));if(num>=1n<<bits)throw Error(`Argument ${i+1}: exceeds ${type}.`);return num;
      });
      const fragment=parseAbiItem(`function ${signature}`),encoded=encodeFunctionData({abi:[fragment],functionName:match[1],args:args as any});
      return out(encoded,{"Function selector":encoded.slice(0,10),"Encoded calldata":encoded,"Byte length":String((encoded.length-2)/2)},
        ["Local ABI encoding of a bounded static function signature. The address and function source are unverified; no call, simulation or transaction occurs."]);
    }
    case "signed-transaction-decode": {
      const text=input.rawTransaction??"";if(!/^0x(?:[0-9a-fA-F]{2})+$/.test(text)||text.length>16386)throw Error("Use even-length hex up to 8192 bytes.");
      let tx:ReturnType<typeof parseTransaction>;try{tx=parseTransaction(text as `0x${string}`);}catch{throw Error("Malformed or unsupported serialized transaction.");}
      if(!tx.r||!tx.s)throw Error("Serialized transaction has no signature fields; a signed payload is required.");
      const data=tx.data??"0x";
      return out(tx.type??"legacy",{"Transaction type":tx.type??"legacy","Chain ID":tx.chainId?.toString()??"not encoded",
        "Nonce":tx.nonce?.toString()??"not encoded","To":tx.to??"contract creation or not encoded",
        "Value (wei)":tx.value?.toString()??"0","Gas limit":tx.gas?.toString()??"not encoded",
        "Data selector":data.length>=10?data.slice(0,10):"none","Data bytes":String((data.length-2)/2)},
        ["Pure local serialized transaction decoding. A decodable payload is not valid, authentic, confirmed or safe.","No signature recovery, broadcast, wallet connection or RPC lookup is performed."]);
    }
    case "merkle-proof-verify": {
      let node=hex32(input.leaf??"","Leaf"),root=hex32(input.root??"","Root");
      const proof=(input.proof??"").trim();if(proof.length>2200)throw Error("Proof is too long.");
      const siblings=proof?proof.split(/[\n,]+/).map(x=>hex32(x.trim(),"Proof sibling")):[];
      if(siblings.length>32)throw Error("Proof exceeds 32 siblings.");
      for(const sibling of siblings){const pair=node.toLowerCase()<sibling.toLowerCase()?[node,sibling]:[sibling,node];node=keccak256(concatHex(pair));}
      const verified=node.toLowerCase()===root.toLowerCase();
      return out(verified?"proof matches supplied root":"proof does not match supplied root",{
        "Computed root":node,"Supplied root":root,"Proof siblings":String(siblings.length),"Hash rule":"Keccak-256(sorted 32-byte pair)"},
        ["Leaf and root are already hashed 32-byte values. Sorted-pair Keccak tree convention only.","Matching a manually supplied root does not authenticate the tree or prove on-chain membership."]);
    }
  }
}
