import {describe,expect,it} from "vitest";
import {runBm} from "../../src/lib/bm-tokenomics";
import {BM_SPECS} from "../../src/lib/bm-tool-specs";
const example=(id:string)=>Object.fromEntries(BM_SPECS.find(s=>s.id===id)!.fields.map(f=>[f.name,f.example]));
describe("BM local tokenomics and EVM utilities",()=>{
  it("provides eight working bounded examples",()=>{
    expect(BM_SPECS).toHaveLength(8);
    for(const s of BM_SPECS)expect(runBm(s.id,example(s.id)).primary,s.id).toBeTruthy();
  });
  it("conserves supply across manual mints and burns",()=>{
    expect(runBm("token-supply-schedule",example("token-supply-schedule")).primary).toBe("1135000");
    expect(()=>runBm("token-supply-schedule",{initialSupply:"10",schedule:"year,minted,burned\n2026,0,11"})).toThrow();
  });
  it("keeps dilution and voting conventions explicit",()=>{
    const dilution=runBm("token-dilution-fdv",example("token-dilution-fdv"));
    expect(dilution.primary).toBe("4000000");
    expect(runBm("dao-voting-quorum",example("dao-voting-quorum")).primary).toContain("passes");
    expect(runBm("dao-voting-quorum",{...example("dao-voting-quorum"),abstainVotes:"0",forVotes:"200"}).primary).toContain("does not pass");
  });
  it("uses fixed monthly net burn and exact linear curve integration",()=>{
    expect(runBm("dao-treasury-runway",example("dao-treasury-runway")).primary).toBe("12");
    expect(runBm("bonding-curve",example("bonding-curve")).primary).toBe("4.2"); // integral 1*2 + .1*(12²-10²)/2
  });
  it("encodes ERC-20 transfer selector without execution",()=>{
    const calldata=runBm("abi-calldata-encode",example("abi-calldata-encode"));
    expect(calldata.fields["Function selector"]).toBe("0xa9059cbb");
    expect(calldata.fields["Byte length"]).toBe("68");
    expect(()=>runBm("abi-calldata-encode",{signature:"transfer(bytes)",values:"0x1234"})).toThrow();
  });
  it("decodes only bounded signed transaction data",()=>{
    const tx=runBm("signed-transaction-decode",example("signed-transaction-decode"));
    expect(tx.fields["To"]).toBe("0x0000000000000000000000000000000000000001");
    expect(()=>runBm("signed-transaction-decode",{rawTransaction:"0x123"})).toThrow();
  });
  it("verifies a supplied sorted-pair Merkle root without claiming source trust",()=>{
    expect(runBm("merkle-proof-verify",example("merkle-proof-verify")).primary).toBe("proof matches supplied root");
    expect(runBm("merkle-proof-verify",{...example("merkle-proof-verify"),root:"0x"+"2".repeat(64)}).primary).toContain("does not match");
  });
});
