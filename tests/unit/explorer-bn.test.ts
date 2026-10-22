import { describe, expect, it } from "vitest";
import { encodeFunctionResult, parseAbi } from "viem";
import { BN_IDS, BN_TOOLS, EXPLORER_CHAINS, runBnTool, type RpcFetch } from "../../src/lib/explorer-bn";

const ZERO = "0x0000000000000000000000000000000000000000";
const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)", "function allowance(address,address) view returns (uint256)"]);
const ERC721 = parseAbi(["function getApproved(uint256) view returns (address)", "function isApprovedForAll(address,address) view returns (bool)", "function ownerOf(uint256) view returns (address)"]);
const ERC1155 = parseAbi(["function balanceOf(address,uint256) view returns (uint256)"]);
const REGISTRY = parseAbi(["function resolver(bytes32) view returns (address)"]);
const RESOLVER = parseAbi(["function addr(bytes32) view returns (address)"]);
function mockedRpc(log: { url: string; method: string; params: unknown[] }[] = []): RpcFetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    log.push({ url: String(url), method: request.method, params: request.params });
    let value: unknown = "0x0";
    if (request.method === "eth_chainId") value = String(url).includes("base") ? "0x2105" : "0x1";
    if (request.method === "eth_blockNumber") value = "0x64";
    if (request.method === "eth_getBalance") value = "0xde0b6b3a7640000";
    if (request.method === "eth_getTransactionCount") value = "0x7";
    if (request.method === "eth_getCode") value = "0x1234";
    if (request.method === "eth_getStorageAt") value = "0x" + "0".repeat(64);
    if (request.method === "eth_call") {
      const selector = String(request.params[0].data).slice(0, 10);
      if (selector === "0x70a08231") value = encodeFunctionResult({ abi: ERC20, functionName: "balanceOf", result: 1234567n });
      else if (selector === "0x313ce567") value = encodeFunctionResult({ abi: ERC20, functionName: "decimals", result: 6 });
      else if (selector === "0xdd62ed3e") value = encodeFunctionResult({ abi: ERC20, functionName: "allowance", result: 42n });
      else if (selector === "0x081812fc") value = encodeFunctionResult({ abi: ERC721, functionName: "getApproved", result: ZERO });
      else if (selector === "0xe985e9c5") value = encodeFunctionResult({ abi: ERC721, functionName: "isApprovedForAll", result: true });
      else if (selector === "0x6352211e") value = encodeFunctionResult({ abi: ERC721, functionName: "ownerOf", result: ZERO });
      else if (selector === "0x00fdd58e") value = encodeFunctionResult({ abi: ERC1155, functionName: "balanceOf", result: 2n });
      else if (selector === "0x0178b8bf") value = encodeFunctionResult({ abi: REGISTRY, functionName: "resolver", result: ZERO });
      else if (selector === "0x3b3b57de") value = encodeFunctionResult({ abi: RESOLVER, functionName: "addr", result: ZERO });
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: value }), { headers: { "content-type": "application/json" } });
  }) as RpcFetch;
}
describe("bounded read-only Explorer BN", () => {
  it("has eight unique reviewed routes and two fixed HTTPS endpoints", () => {
    expect(new Set(BN_IDS).size).toBe(8);
    expect(BN_TOOLS).toHaveLength(8);
    expect(Object.values(EXPLORER_CHAINS).map((chain) => chain.rpc)).toEqual(["https://eth.drpc.org/", "https://base.drpc.org/"]);
  });
  it("uses explicit user action and distinct sampled blocks for native balances", async () => {
    const log: { url: string; method: string; params: unknown[] }[] = [];
    const results = await runBnTool("native-balance", { account: ZERO }, "ethereum", mockedRpc(log));
    expect(results.map((result) => [result.chainId, result.block, result.rows[0].value])).toEqual([[1, "100", "1000000000000000000"], [8453, "100", "1000000000000000000"]]);
    expect(log.filter((entry) => entry.method === "eth_getBalance").map((entry) => entry.params[1])).toEqual(["0x64", "0x64"]);
    expect(log.every((entry) => entry.url === EXPLORER_CHAINS.ethereum.rpc || entry.url === EXPLORER_CHAINS.base.rpc)).toBe(true);
  });
  it("reads only named ERC-20 balances and token/spender allowances", async () => {
    const balance = await runBnTool("selected-erc20-balances", { account: ZERO, tokens: ZERO }, "ethereum", mockedRpc());
    expect(balance[0].rows[0].value).toBe("1234567");
    const approval = await runBnTool("selected-erc20-allowances", { account: ZERO, token: ZERO, spender: ZERO }, "base", mockedRpc());
    expect(approval[0].rows.at(-1)?.value).toBe("42");
    expect(approval[0].limitation).toContain("not universal");
  });
  it("reports confirmed nonce and code without inferring smart-account safety", async () => {
    expect((await runBnTool("wallet-nonce", { account: ZERO }, "base", mockedRpc()))[0].rows[0].value).toBe("7");
    const result = (await runBnTool("account-code", { account: ZERO }, "ethereum", mockedRpc()))[0];
    expect(result.rows[0].value).toBe("true");
    expect(result.limitation).toContain("do not prove");
  });
  it("scopes NFT approvals, ERC-721 ownership, ERC-1155 balances and ENS resolver reads", async () => {
    const nft = await runBnTool("nft-approval", { owner: ZERO, collection: ZERO, operator: ZERO, tokenId: "1" }, "ethereum", mockedRpc());
    expect(nft[0].rows[1].value).toBe("true");
    const erc721 = await runBnTool("nft-ownership", { account: ZERO, collection: ZERO, tokenId: "1", standard: "ERC-721" }, "base", mockedRpc());
    expect(erc721[0].rows[0].value).toBe(ZERO);
    const erc1155 = await runBnTool("nft-ownership", { account: ZERO, collection: ZERO, tokenId: "1", standard: "ERC-1155" }, "base", mockedRpc());
    expect(erc1155[0].rows[0].value).toBe("2");
    const ens = await runBnTool("ens-resolver", { name: "example.eth" }, "ethereum", mockedRpc());
    expect(ens[0].rows[1].value).toBe(ZERO);
    expect(ens[0].chainId).toBe(1);
  });
  it("rejects invalid input before transmitting a user address", async () => {
    const log: { url: string; method: string; params: unknown[] }[] = [];
    await expect(runBnTool("selected-erc20-balances", { account: "bad", tokens: ZERO }, "ethereum", mockedRpc(log))).rejects.toThrow(/address/i);
    await expect(runBnTool("selected-erc20-balances", { account: ZERO, tokens: Array(6).fill(ZERO).join("\n") }, "ethereum", mockedRpc(log))).rejects.toThrow(/one to five/i);
    await expect(runBnTool("nft-ownership", { account: ZERO, collection: ZERO, tokenId: "-1", standard: "ERC-721" }, "ethereum", mockedRpc(log))).rejects.toThrow(/Token ID/i);
    await expect(runBnTool("ens-resolver", { name: "bad.example" }, "ethereum", mockedRpc(log))).rejects.toThrow(/ASCII/i);
    await expect(runBnTool("swap", {}, "ethereum", mockedRpc(log))).rejects.toThrow(/unsupported/i);
    expect(log).toHaveLength(0);
  });
  it("fails closed on wrong RPC chain and oversized payload", async () => {
    const wrong = (async (_url: unknown, init?: RequestInit) => { const request = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: "0x2" })); }) as RpcFetch;
    await expect(runBnTool("wallet-nonce", { account: ZERO }, "ethereum", wrong)).rejects.toThrow(/wrong chain/i);
    const huge = (async (_url: unknown) => new Response("x".repeat(70000))) as RpcFetch;
    await expect(runBnTool("wallet-nonce", { account: ZERO }, "ethereum", huge)).rejects.toThrow(/64 KiB/i);
  });
});
