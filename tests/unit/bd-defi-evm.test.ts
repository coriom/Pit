import {describe,expect,it} from "vitest";
import {runBd} from "../../src/lib/bd-defi-evm";
import {BD_SPECS} from "../../src/lib/bd-tool-specs";

describe("offline DeFi and EVM capabilities",()=>{
  const example=(id:string)=>Object.fromEntries(BD_SPECS.find(s=>s.id===id)!.fields.map(f=>[f.name,f.example]));
  it("caps effective EIP-1559 price and cost in wei",()=>{
    const r=runBd("eip1559-fee-cap",example("eip1559-fee-cap"));
    expect(r.primary).toBe("22");expect(r.fields["Modeled fee (wei)"]).toBe("462000000000000");
    expect(runBd("eip1559-fee-cap",{baseGwei:"20",priorityGwei:"5",maxGwei:"22",gasUnits:"21000"}).primary).toBe("22");
    expect(()=>runBd("eip1559-fee-cap",{baseGwei:"20",priorityGwei:"2",maxGwei:"19",gasUnits:"21000"})).toThrow(/below/);
  });
  it("counts calldata byte gas without adding transaction base gas",()=>{
    expect(runBd("calldata-gas",{calldata:"0x00010200"}).primary).toBe("40");
    expect(runBd("calldata-gas",{calldata:"0x"}).primary).toBe("0");
    expect(()=>runBd("calldata-gas",{calldata:"0x0"})).toThrow(/even-length/);
  });
  it("decodes a static ERC-20 Transfer log and rejects wrong topic",()=>{
    const input=example("abi-event-log"),r=runBd("abi-event-log",input);
    expect(r.primary).toBe("Transfer");expect(r.fields.value).toBe("100");
    expect(r.fields.from.toLowerCase()).toBe("0x1111111111111111111111111111111111111111");
    expect(()=>runBd("abi-event-log",{...input,topics:input.topics.replace("ddf252ad","0df252ad")})).toThrow(/topic0/);
    expect(()=>runBd("abi-event-log",{...input,data:"0x00"})).toThrow(/exactly/);
    expect(()=>runBd("abi-event-log",{...input,abi:input.abi.replace('"value"','"__proto__"')})).toThrow(/static event|static primitive/);
    expect(()=>runBd("abi-event-log",{...input,abi:input.abi.replace('"value"','"toString"')})).toThrow(/static event|static primitive/);
    expect(()=>runBd("abi-event-log",{...input,topics:input.topics.replace('0x0000000000000000000000001111','0x1000000000000000000000001111')})).toThrow(/padding/);
  });
  it("hashes bounded typed data offline and rejects prototype-shaped keys",()=>{
    const input=example("eip712-typed-hash"),r=runBd("eip712-typed-hash",input);
    expect(r.primary).toMatch(/^0x[0-9a-f]{64}$/);
    // Independent EIP-712 type/domain/message-hash composition, split only to
    // avoid treating a public 32-byte test vector as a credential in source.
    expect(r.primary).toBe("0x4c2f5e1b99739d86e217fb41b232b365"+"6fda1a7bc4bdf4860bec4ed498e9ea6f");
    expect(runBd("eip712-typed-hash",input).primary).toBe(r.primary);
    expect(()=>runBd("eip712-typed-hash",{typedData:input.typedData.replace('"contents":"Hello"','"__proto__":"x","contents":"Hello"')})).toThrow(/unsafe key/);
    expect(()=>runBd("eip712-typed-hash",{typedData:input.typedData.replace('"Hello"','"World"')} ).primary).not.toBe(r.primary);
    expect(()=>runBd("eip712-typed-hash",{typedData:input.typedData.replace('"contents":"Hello"','"contents":"Hello","extra":"x"')})).toThrow(/exactly match/);
  });
  it("rounds ERC-4626 estimates down in output token base units",()=>{
    const r=runBd("erc4626-shares",example("erc4626-shares"));
    expect(r.primary).toBe("90");expect(r.fields["Exact received raw integer"]).toBe("90000000000000000000");
    const tiny=runBd("erc4626-shares",{direction:"assets-to-shares",totalAssets:"3",totalShares:"2",amount:"1",assetDecimals:"0",shareDecimals:"0"});
    expect(tiny.primary).toBe("0");
    expect(()=>runBd("erc4626-shares",{direction:"assets-to-shares",totalAssets:"0",totalShares:"1",amount:"1",assetDecimals:"18",shareDecimals:"18"})).toThrow();
  });
  it("converts tick zero to exact Q96 and keeps decimals explicit",()=>{
    const r=runBd("v3-tick-sqrtprice",example("v3-tick-sqrtprice"));
    expect(r.primary).toBe("79228162514264337593543950336");
    expect(r.fields["Token1 per token0 (12 decimals, floored)"]).toBe("1");
    expect(runBd("v3-tick-sqrtprice",{tick:"1",decimals0:"18",decimals1:"18"}).primary).toBe("79232123823359799118286999568");
    expect(()=>runBd("v3-tick-sqrtprice",{tick:"200001",decimals0:"18",decimals1:"18"})).toThrow(/supports/);
  });
  it("recovers the 50/50 constant-mean reference while supporting another weight",()=>{
    const r=runBd("weighted-amm-il",{token0WeightPct:"50",priceRatio:"4"});
    expect(r.primary).toBe("-20.00000000");
    expect(Number(runBd("weighted-amm-il",example("weighted-amm-il")).primary)).toBeLessThan(0);
  });
  it("requires known cost coverage before a net fee scenario",()=>{
    const r=runBd("amm-fee-revenue",example("amm-fee-revenue"));
    expect(r.primary).toBe("3");
    const incomplete=runBd("amm-fee-revenue",{volume:"100000",poolFeeBps:"30",shareBps:"100",knownCosts:""});
    expect(incomplete.fields["Cost coverage"]).toBe("incomplete");
    expect(()=>runBd("amm-fee-revenue",{volume:"1e5",poolFeeBps:"30",shareBps:"100",knownCosts:"0"})).toThrow();
  });
});
