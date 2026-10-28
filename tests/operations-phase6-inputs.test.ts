import { describe, expect, it } from "vitest";
import { composeAirdrop, erc1155Transfers, fetchNftMetadata, metadataCsv, metadataTar, validateNftMetadata } from "../src/operations/lib/phase6-inputs";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const C = "0x3333333333333333333333333333333333333333";

describe("Phase 6 exact local imports", () => {
  it("distributes integer dust deterministically and conserves the total", () => {
    const result = composeAirdrop({ mode: "equal", recipients: `address\n${A}\n${B}\n${C}`, total: "0.000005", decimals: 6 });
    expect(result.allocated.map((r) => r.amount)).toEqual([2n, 2n, 1n]);
    expect(result.batches).toHaveLength(1);
    expect(result.total).toBe(5n);
  });
  it("supports percentage weights and rejects missing or excess value", () => {
    const result = composeAirdrop({ mode: "percentage", recipients: `address,weight\n${A},6000\n${B},4000`, total: "1", decimals: 6 });
    expect(result.allocated.map((r) => r.amount)).toEqual([600000n, 400000n]);
    expect(() => composeAirdrop({ mode: "percentage", recipients: `${A},6000\n${B},5000`, total: "1", decimals: 6 })).toThrow(/10000/);
    expect(() => composeAirdrop({ mode: "explicit", recipients: `${A},2\n${B},2`, total: "5", decimals: 0 })).toThrow(/sum exactly/);
    expect(() => composeAirdrop({ mode: "equal", recipients: `${A}\n${B}`, total: "1", decimals: 0 })).toThrow(/zero/);
  });
  it("rejects duplicate or malformed ERC-1155 transfers", () => {
    expect(erc1155Transfers(`tokenId,amount,recipient\n7,2,${A}\n8,3,${B}`)).toMatchObject([{ id: 7n, amount: 2n }, { id: 8n, amount: 3n }]);
    expect(() => erc1155Transfers(`7,2,${A}\n7,1,${A}`)).toThrow(/Duplicate/);
    expect(() => erc1155Transfers(`7,0,${A}`)).toThrow();
  });
  it("validates portable NFT metadata without interpreting executable content", () => {
    expect(validateNftMetadata('{"name":"Sample","image":"ipfs://bafy12345/image.png","attributes":[{"trait_type":"Color","value":"Blue"}]}').name).toBe("Sample");
    expect(() => validateNftMetadata('{"name":"Bad","image":"javascript:alert(1)"}')).toThrow();
    expect(() => validateNftMetadata('{"name":"Bad","image":{"url":"https://example.com/image.png"}}')).toThrow(/URI string/);
    expect(() => validateNftMetadata('{"name":"Bad","attributes":[{"trait_type":"X","value":{}}]}')).toThrow();
    expect(metadataCsv(`tokenId,name,description,image\n1,One,First,ipfs://bafy12345/one.png`, "erc1155")[0].filename).toBe(`${"0".repeat(63)}1.json`);
    const archive = metadataTar(metadataCsv(`1,One,First,ipfs://bafy12345/one.png`, "erc721"));
    expect(new TextDecoder().decode(archive.subarray(0, 6))).toBe("1.json");
    expect(new TextDecoder().decode(archive.subarray(257, 262))).toBe("ustar");
    expect(new TextDecoder().decode(archive.subarray(512, 530))).toContain('"name": "One"');
    expect(() => metadataCsv(`1,One,First,ipfs://bafy12345/one.png\n1,Two,Second,ipfs://bafy12345/two.png`, "erc721")).toThrow(/Duplicate/);
  });
  it("fetches metadata only from an explicit HTTPS or IPFS URI with a bounded JSON response", async () => {
    const calls: string[] = [];
    const fetcher = (async (url: URL) => { calls.push(String(url)); return new Response('{"name":"A"}', { headers: { "content-type": "application/json" } }); }) as typeof fetch;
    expect((await fetchNftMetadata("ipfs://bafy12345/1.json", fetcher)).name).toBe("A");
    expect(calls).toEqual(["https://ipfs.io/ipfs/bafy12345/1.json"]);
    await expect(fetchNftMetadata("http://example.com/a.json", fetcher)).rejects.toThrow(/HTTPS/);
    await expect(fetchNftMetadata("https://127.0.0.1/a.json", fetcher)).rejects.toThrow(/Private/);
    const huge = (async () => new Response(JSON.stringify({ name: "A", description: "x".repeat(70_000) }), { headers: { "content-type": "application/json" } })) as typeof fetch;
    await expect(fetchNftMetadata("https://example.com/a.json", huge)).rejects.toThrow(/64 KiB/);
  });
});
