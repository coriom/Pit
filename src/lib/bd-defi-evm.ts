/** Offline EVM inspection and manually assumed DeFi math. No RPC or wallet imports. */
import { decodeEventLog, hashTypedData, keccak256, stringToHex } from "viem/utils";
export type BdId="eip1559-fee-cap"|"calldata-gas"|"abi-event-log"|"eip712-typed-hash"|"erc4626-shares"|"v3-tick-sqrtprice"|"weighted-amm-il"|"amm-fee-revenue";
export type BdResult=Readonly<{primary:string;fields:Readonly<Record<string,string>>;notes:readonly string[]}>;
const Q=10n**12n;
function dec(text:string,label:string,places=12):bigint{if(typeof text!=="string"||text.length>48||!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text))throw Error(`${label}: enter a bounded nonnegative plain decimal.`);const [w,f=""]=text.split(".");if(f.length>places)throw Error(`${label}: excess decimal precision.`);const n=BigInt(w)*10n**BigInt(places)+BigInt(f.padEnd(places,"0"));if(n>10n**42n)throw Error(`${label}: value exceeds supported range.`);return n;}
function raw(text:string,label:string,max=10n**36n):bigint{if(!/^(?:0|[1-9]\d*)$/.test(text)||text.length>80)throw Error(`${label}: whole raw integer required.`);const n=BigInt(text);if(n>max)throw Error(`${label}: exceeds supported range.`);return n;}
function unit(text:string,label:string,places:number):bigint{if(typeof text!=="string"||text.length>80||!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text))throw Error(`${label}: enter a plain decimal.`);const [w,f=""]=text.split(".");if(f.length>places)throw Error(`${label}: excess token precision.`);const n=BigInt(w)*10n**BigInt(places)+BigInt(f.padEnd(places,"0"));if(n>10n**42n)throw Error(`${label}: value exceeds supported range.`);return n;}
function decimals(text:string,label:string):number{const n=Number(text);if(!/^(?:0|[1-9]\d*)$/.test(text)||!Number.isSafeInteger(n)||n>36)throw Error(`${label}: expected whole token decimals 0–36.`);return n;}
function fmt(n:bigint,places=12):string{const q=10n**BigInt(places),a=n<0n?-n:n;return (n<0n?"-":"")+String(a/q)+(a%q?"."+String(a%q).padStart(places,"0").replace(/0+$/,""):"");}
function positive(n:bigint,label:string){if(n<=0n)throw Error(`${label} must be positive.`);return n;}
function percent(text:string,label:string,low=0,high=100):number{if(!/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(text)||text.length>24)throw Error(`${label}: enter a bounded percentage.`);const n=Number(text);if(!Number.isFinite(n)||n<low||n>high)throw Error(`${label}: outside supported range.`);return n;}
function finite(n:number):string{if(!Number.isFinite(n))throw Error("Numerical result outside supported range.");return n.toFixed(8);}
function safeJson(text:string,label:string,max=8192):unknown{if(typeof text!=="string"||new TextEncoder().encode(text).length>max)throw Error(`${label}: JSON exceeds ${max} bytes.`);let data:unknown;try{data=JSON.parse(text);}catch{throw Error(`${label}: malformed JSON.`);}function walk(v:unknown,depth:number):void{if(depth>8)throw Error(`${label}: nesting exceeds limit.`);if(v&&typeof v==="object"){const entries=Object.entries(v);if(entries.length>32)throw Error(`${label}: too many fields.`);for(const [key,item] of entries){if(["__proto__","constructor","prototype"].includes(key)||key.length>64)throw Error(`${label}: unsafe key.`);walk(item,depth+1);}}}walk(data,0);return data;}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==="object"&&!Array.isArray(value);}
const identifier=/^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const safeIdentifier=(text:string)=>identifier.test(text)&&!["__proto__","constructor","prototype"].includes(text);
const staticType=/^(?:address|bool|u?int(?:8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)|bytes(?:[1-9]|[12][0-9]|3[0-2]))$/;
function eventAbi(text:string){const data=safeJson(text,"Event ABI",4096);if(!record(data)||Object.keys(data).some(k=>!["type","name","inputs","anonymous"].includes(k))||data.type!=="event"||typeof data.name!=="string"||!safeIdentifier(data.name)||(data.anonymous!==undefined&&data.anonymous!==false)||!Array.isArray(data.inputs)||data.inputs.length>8)throw Error("Provide one bounded non-anonymous static event ABI fragment.");
  const inputs=data.inputs.map((x:unknown)=>{if(!record(x)||Object.keys(x).some(k=>!["name","type","indexed"].includes(k))||typeof x.name!=="string"||!safeIdentifier(x.name)||typeof x.type!=="string"||!staticType.test(x.type)||typeof x.indexed!=="boolean")throw Error("Event inputs need static primitive type, name and indexed boolean.");return {name:x.name,type:x.type,indexed:x.indexed};});
  if(new Set(inputs.map(x=>x.name)).size!==inputs.length)throw Error("Event parameter names must be unique.");
  if(inputs.filter(x=>x.indexed).length>3)throw Error("At most three indexed event parameters are supported.");
  return {type:"event" as const,name:data.name,inputs};
}
function validateStaticWord(type:string,word:string):void{
  const bits=BigInt(word);
  if(type==="address"&&bits>>160n!==0n)throw Error("Address word has nonzero high padding.");
  if(type==="bool"&&bits!==0n&&bits!==1n)throw Error("Boolean word must be zero or one.");
  const integer=/^(u?int)(\d+)$/.exec(type);
  if(integer){const width=BigInt(integer[2]!);if(integer[1]==="uint"&&bits>>width!==0n)throw Error("Unsigned integer word has nonzero high padding.");
    if(integer[1]==="int"&&width<256n){const sign=(bits>>(width-1n))&1n,upper=bits>>width,expected=sign?((1n<<(256n-width))-1n):0n;if(upper!==expected)throw Error("Signed integer word has invalid sign extension.");}}
  const bytes=/^bytes(\d+)$/.exec(type);if(bytes){const tail=BigInt(32-Number(bytes[1]))*8n;if(tail>0n&&(bits&((1n<<tail)-1n))!==0n)throw Error("Fixed bytes word has nonzero low padding.");}
}
// Bounded mathematical tick->Q96 conversion via exact integer powers and integer square root.
// This is not a byte-for-byte implementation of Uniswap's optimized TickMath rounding.
function isqrt(n:bigint):bigint{if(n<0n)throw Error("Negative square root.");if(n<2n)return n;let x=1n<<BigInt(Math.ceil(n.toString(2).length/2));for(let j=0;j<64;j++){const y=(x+n/x)>>1n;if(y>=x)return x;x=y;}throw Error("Square-root iteration limit exceeded.");}
function tickSqrt(tick:number):bigint{const abs=Math.abs(tick),a=10001n**BigInt(abs),b=10000n**BigInt(abs),num=tick>=0?a:b,den=tick>=0?b:a;const scaled=(num<<192n)/den;const root=isqrt(scaled);return root*root*den===(num<<192n)?root:root+1n;}
export function runBd(id:BdId,input:Record<string,string>):BdResult{
  const out=(primary:string,fields:Record<string,string>,notes:string[]):BdResult=>({primary,fields,notes});
  switch(id){
    case "eip1559-fee-cap":{
      const base=dec(input.baseGwei??"","base fee",9),priority=dec(input.priorityGwei??"","priority fee",9),cap=dec(input.maxGwei??"","max fee",9),gas=raw(input.gasUnits??"","gas units",100000000n);
      if(cap<base)throw Error("Max fee is below the supplied base fee: transaction could not be included under these assumptions.");
      const effective=cap<base+priority?cap:base+priority,tip=effective-base;
      return out(fmt(effective,9),{"Effective price (gwei/gas)":fmt(effective,9),"Effective priority fee (gwei/gas)":fmt(tip,9),"Modeled fee (wei)":String(effective*gas),"Worst cap reservation (wei)":String(cap*gas)},["Effective gas price is min(max fee, base fee + max priority fee). No live base fee, gas usage or execution guarantee."]);
    }
    case "calldata-gas":{
      const hex=input.calldata??"";if(!/^0x(?:[0-9a-fA-F]{2})*$/.test(hex)||hex.length>16386)throw Error("Calldata must be even-length hex up to 8192 bytes.");
      const bytes=hex.slice(2).match(/../g)??[],zero=bytes.filter(b=>b==="00").length,nonzero=bytes.length-zero,gas=zero*4+nonzero*16;
      return out(String(gas),{"Data gas units":String(gas),"Zero bytes":String(zero),"Nonzero bytes":String(nonzero),"Bytes":String(bytes.length)},["EIP-2028 byte cost only. Excludes transaction intrinsic base, EVM execution, access lists, initcode and L2 data fees."]);
    }
    case "abi-event-log":{
      const abi=eventAbi(input.abi??""),topicsText=input.topics??"",data=input.data??"";
      if(topicsText.length>1024||data.length>4098)throw Error("Topics or data exceed supported bounds.");
      const topics=topicsText.split(/[\n,]+/).map(x=>x.trim());
      if(topics.some(x=>!/^0x[0-9a-fA-F]{64}$/.test(x)))throw Error("Every topic must be a 32-byte hex word.");
      const expectedTopics=1+abi.inputs.filter(x=>x.indexed).length;
      if(topics.length!==expectedTopics)throw Error("Topic count does not match indexed parameters.");
      if(!/^0x(?:[0-9a-fA-F]{2})*$/.test(data)||data.length!==2+abi.inputs.filter(x=>!x.indexed).length*64)throw Error("Data must contain exactly one 32-byte word per non-indexed static input.");
      const signature=`${abi.name}(${abi.inputs.map(x=>x.type).join(",")})`,topic0=keccak256(stringToHex(signature));
      if(topics[0]!.toLowerCase()!==topic0.toLowerCase())throw Error("topic0 does not match the supplied event ABI.");
      let topicIndex=1,dataIndex=0;
      for(const param of abi.inputs){const word=param.indexed?topics[topicIndex++]!: `0x${data.slice(2+dataIndex++*64,2+dataIndex*64)}`;validateStaticWord(param.type,word);}
      let decodedArgs:unknown;
      try{decodedArgs=decodeEventLog({abi:[abi] as never,topics:topics as never,data:data as `0x${string}`,strict:true}).args;}catch{throw Error("Event words are malformed or incompatible with the supplied ABI.");}
      if(!record(decodedArgs))throw Error("Event decoder did not return named static values.");
      const args=decodedArgs,fields:Record<string,string>={"Event":abi.name,"topic0":topic0};
      for(const param of abi.inputs)fields[param.name]=String(args[param.name]);
      return out(abi.name,fields,["Offline static event decode only. ABI, chain and log provenance are unverified; indexed dynamic types and anonymous events are unsupported."]);
    }
    case "eip712-typed-hash":{
      const data=safeJson(input.typedData??"","Typed data",4096);
      if(!record(data)||Object.keys(data).some(k=>!["domain","types","primaryType","message"].includes(k))||!record(data.domain)||!record(data.types)||!record(data.message)||typeof data.primaryType!=="string"||!safeIdentifier(data.primaryType))throw Error("Provide domain, one custom primary type, and message.");
      const types=data.types, primary=data.primaryType, names=Object.keys(types).filter(x=>x!=="EIP712Domain");
      const fields=types[primary];
      if(Object.hasOwn(types,"EIP712Domain")||names.length!==1||names[0]!==primary||!Array.isArray(fields)||fields.length>8)throw Error("Only one bounded primary struct of primitive fields is supported; omit EIP712Domain from types.");
      for(const item of fields)if(!record(item)||Object.keys(item).some(k=>!["name","type"].includes(k))||typeof item.name!=="string"||!safeIdentifier(item.name)||typeof item.type!=="string"||!/(?:^address$|^bool$|^uint256$|^string$|^bytes32$)/.test(item.type))throw Error("Only address, bool, uint256, string and bytes32 struct fields are supported.");
      const namesExpected=fields.map(item=>(item as Record<string,unknown>).name as string);
      if(new Set(namesExpected).size!==namesExpected.length||Object.keys(data.message).sort().join("|")!==namesExpected.slice().sort().join("|"))throw Error("Message keys must exactly match unique typed fields.");
      for(const item of fields){const {name,type}=item as {name:string;type:string},v=data.message[name];
        if(type==="string"&&(typeof v!=="string"||v.length>256)||type==="bool"&&typeof v!=="boolean"||type==="address"&&(typeof v!=="string"||!/^0x[0-9a-fA-F]{40}$/.test(v))||type==="bytes32"&&(typeof v!=="string"||!/^0x[0-9a-fA-F]{64}$/.test(v))||type==="uint256"&&!(typeof v==="string"&&/^(?:0|[1-9]\d{0,77})$/.test(v)||typeof v==="number"&&Number.isSafeInteger(v)&&v>=0))throw Error(`Invalid EIP-712 value for ${name}.`);
      }
      if(Object.keys(data.domain).some(k=>!["name","version","chainId","verifyingContract","salt"].includes(k)))throw Error("Unsupported EIP-712 domain field.");
      if(data.domain.chainId!==undefined&&!(typeof data.domain.chainId==="number"&&Number.isSafeInteger(data.domain.chainId)&&data.domain.chainId>0))throw Error("Domain chainId must be a positive safe JSON integer.");
      let digest:string;try{digest=hashTypedData(data as never);}catch{throw Error("Typed data failed validation or hashing.");}
      return out(digest,{"EIP-712 digest":digest,"Primary type":data.primaryType},["Offline hash only. No signing, domain authentication, contract validation or RPC. Review all typed fields before any separate signing workflow."]);
    }
    case "erc4626-shares":{
      const da=decimals(input.assetDecimals??"","asset decimals"),ds=decimals(input.shareDecimals??"","share decimals");
      const assets=unit(input.totalAssets??"","total assets",da),shares=unit(input.totalShares??"","total shares",ds);
      positive(assets,"Total assets");positive(shares,"Total shares");
      const amount=unit(input.amount??"","amount",input.direction==="assets-to-shares"?da:ds);
      if(amount===0n)throw Error("Conversion amount must be positive.");
      const mode=input.direction;if(mode!=="assets-to-shares"&&mode!=="shares-to-assets")throw Error("Choose conversion direction.");
      const converted=mode==="assets-to-shares"?amount*shares/assets:amount*assets/shares;
      const outputDecimals=mode==="assets-to-shares"?ds:da,pps=assets*10n**BigInt(ds)*Q/(shares*10n**BigInt(da));
      return out(fmt(converted,outputDecimals),{"Modeled received amount":fmt(converted,outputDecimals),"Exact received raw integer":String(converted),"Assets per share":fmt(pps),"Rounding":"down to one output raw unit"},["Manual totalAssets/totalSupply ratio; not a live ERC-4626 preview, caller-specific quote, or fee-aware redemption. Token identities and decimals are not verified."]);
    }
    case "v3-tick-sqrtprice":{
      const tickText=input.tick??"";if(!/^-?(?:0|[1-9]\d*)$/.test(tickText))throw Error("Tick must be a whole signed integer.");const tick=Number(tickText);
      if(!Number.isSafeInteger(tick)||Math.abs(tick)>200000)throw Error("Illustrative conversion supports ticks from -200000 to 200000.");
      const d0=decimals(input.decimals0??"","token0 decimals"),d1=decimals(input.decimals1??"","token1 decimals");
      const sqrt=tickSqrt(tick),priceNum=sqrt*sqrt*10n**BigInt(d0),den=(1n<<192n)*10n**BigInt(d1);
      const price=priceNum*Q/den;
      return out(String(sqrt),{"Mathematical sqrtPriceX96, rounded up":String(sqrt),"Token1 per token0 (12 decimals, floored)":fmt(price),"Tick":String(tick),"Token decimals":`${d0} / ${d1}`},["Mathematical 1.0001^tick Q64.96 conversion. This bounded implementation is not byte-for-byte Uniswap TickMath; on-chain tick spacing is excluded."]);
    }
    case "weighted-amm-il":{
      const weight=percent(input.token0WeightPct??"","token0 weight",0.000001,99.999999)/100,ratio=percent(input.priceRatio??"","future/initial price ratio",0.000001,1e6);
      const lp=Math.pow(ratio,weight),hodl=weight*ratio+1-weight,divergence=lp/hodl-1;
      return out(finite(divergence*100),{"LP vs HODL (%)":finite(divergence*100),"Normalized LP value":finite(lp),"Normalized HODL value":finite(hodl)},["Two-token constant-mean continuous model at fixed weights. Numerical power approximation; excludes fees, gas, rebalancing details and price prediction."]);
    }
    case "amm-fee-revenue":{
      const volume=dec(input.volume??"","volume"),poolFee=raw(input.poolFeeBps??"","pool fee",10000n),share=raw(input.shareBps??"","liquidity share",10000n);
      const gross=volume*poolFee*share/100000000n;
      const known=input.knownCosts??"";
      if(!known)return out(fmt(gross),{"Gross hypothetical fee allocation":fmt(gross),"Cost coverage":"incomplete"},["Enter known costs or 0 explicitly before interpreting a net result. Manual volume and liquidity share are not a forecast or user entitlement."]);
      const cost=dec(known,"known costs"),net=gross-cost;
      return out(fmt(net),{"Gross hypothetical fee allocation":fmt(gross),"Known modeled costs":fmt(cost),"Net of stated costs":fmt(net),"Cost coverage":"only entered costs"},["Volume, pool fee, share and costs are manual common-quote assumptions. No actual accrued LP fee or fee-growth accounting is inferred."]);
    }
  }
}
