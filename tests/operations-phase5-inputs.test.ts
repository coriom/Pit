import { describe, expect, it } from "vitest";
import { addresses, metadataUri, nativeRecipients, nftRecipients, tokenAddresses, unsignedInteger } from "../src/operations/lib/phase5-inputs";

const alice = "0x00000000000000000000000000000000000000a1";
const bob = "0x00000000000000000000000000000000000000b2";
const carol = "0x00000000000000000000000000000000000000c3";

describe("Phase 5 bounded local inputs", () => {
  it("converts native amounts exactly and rejects duplicate or self recipients", () => {
    const batch = nativeRecipients(`address,amount\n${bob},0.1\n${carol},0.000000000000000001`, alice);
    expect(batch.total).toBe(100000000000000001n);
    expect(batch.entries.map((entry) => entry.amount)).toEqual([100000000000000000n, 1n]);
    expect(() => nativeRecipients(`${bob},1\n${bob},1`, alice)).toThrow(/Duplicate/);
    expect(() => nativeRecipients(`${alice},1`, alice)).toThrow(/self/);
    expect(() => nativeRecipients(`${bob},0`, alice)).toThrow();
  });
  it("bounds NFT IDs, rows, collection URIs and address sets", () => {
    expect(nftRecipients(`tokenId,address\n1,${bob}\n2,${carol}`).map((entry) => entry.id)).toEqual([1n, 2n]);
    expect(() => nftRecipients(`1,${bob}\n1,${carol}`)).toThrow(/Duplicate/);
    expect(() => nftRecipients(`-1,${bob}`)).toThrow();
    expect(metadataUri("ipfs://cid/example.json")).toContain("ipfs://");
    expect(() => metadataUri("http://example.test/token")).toThrow();
    expect(addresses(`address\n${bob}\n${carol}`)).toHaveLength(2);
    expect(() => addresses(`${bob}\n${bob}`)).toThrow(/Duplicate/);
    expect(tokenAddresses(`${bob}\n${carol}`)).toHaveLength(2);
    expect(unsignedInteger("1000000", 1n, 1_000_000n)).toBe(1_000_000n);
    expect(() => unsignedInteger("1000001", 1n, 1_000_000n)).toThrow();
  });
});
