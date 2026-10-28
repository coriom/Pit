import { describe, expect, it } from "vitest";
import { encodeFunctionResult, parseAbi } from "viem";
import { parseBatchInput, runBatchBalances } from "../../src/lib/explorer-batch";
import type { RpcFetch } from "../../src/lib/explorer-bn";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const C = "0x3333333333333333333333333333333333333333";
const U = parseAbi(["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)", "function symbol() view returns (string)"]);
const U1155 = parseAbi(["function balanceOf(address,uint256) view returns (uint256)"]);

function fixture(opts: { wrongChain?: boolean; failNft?: boolean; rateLimitOnce?: boolean } = {}) {
  const log: { method: string; params: any[]; url: string }[] = [];
  let rateLimited = false;
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    log.push({ method: request.method, params: request.params, url: String(url) });
    if (opts.rateLimitOnce && !rateLimited && request.method === "eth_getBalance") { rateLimited = true; return new Response("busy", { status: 429 }); }
    let result = "0x0";
    if (request.method === "eth_chainId") result = opts.wrongChain ? "0x1" : "0x2105";
    if (request.method === "eth_blockNumber") result = "0x64";
    if (request.method === "eth_getBalance") result = "0xde0b6b3a7640000";
    if (request.method === "eth_call") {
      const selector = String(request.params[0].data).slice(0, 10);
      if (opts.failNft && request.params[0].to.toLowerCase() === C.toLowerCase()) return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32000, message: "execution reverted" } }));
      if (selector === "0x313ce567") result = encodeFunctionResult({ abi: U, functionName: "decimals", result: 6 });
      else if (selector === "0x95d89b41") result = encodeFunctionResult({ abi: U, functionName: "symbol", result: "TEST" });
      else if (selector === "0x70a08231") result = encodeFunctionResult({ abi: U, functionName: "balanceOf", result: 1234567n });
      else if (selector === "0x00fdd58e") result = encodeFunctionResult({ abi: U1155, functionName: "balanceOf", result: 2n });
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
  }) as RpcFetch;
  return { fetcher, log };
}

describe("bounded public batch balances", () => {
  it("validates addresses, duplicates, IDs and read budget before RPC", () => {
    expect(parseBatchInput({ accounts: `address\n${A}\n${B}`, erc20: C, erc721: "", erc1155: "" }).reads).toBe(4);
    expect(() => parseBatchInput({ accounts: `${A}\n${A}` })).toThrow(/duplicate/i);
    expect(() => parseBatchInput({ accounts: "bad" })).toThrow(/invalid/i);
    expect(() => parseBatchInput({ accounts: A, erc1155: `${C},-1` })).toThrow(/invalid/i);
    expect(() => parseBatchInput({ accounts: Array(26).fill(A).join("\n") })).toThrow(/1–25/i);
  });
  it("reads explicit native, ERC-20, ERC-721 and ERC-1155 balances at one block", async () => {
    const { fetcher, log } = fixture();
    const progress: number[] = [];
    const [result] = await runBatchBalances({ accounts: A, erc20: B, erc721: C, erc1155: `${C},7` }, "base", fetcher, (done) => progress.push(done));
    expect(result.chainId).toBe(8453);
    expect(result.block).toBe("100");
    expect(result.rows.map((row) => row.value)).toEqual([
      "1 ETH (1000000000000000000 wei)", "1.234567 TEST (1234567 raw units, 6 decimals)", "1234567 tokens; IDs not enumerated", "2 units",
    ]);
    expect(progress).toEqual([1, 2, 3, 4]);
    expect(log.filter((entry) => entry.method === "eth_call").every((entry) => entry.params[1] === "0x64")).toBe(true);
    expect(log.every((entry) => entry.url === "https://base.drpc.org/")).toBe(true);
  });
  it("retries rate limits and retains partial failures instead of zero", async () => {
    const { fetcher, log } = fixture({ failNft: true, rateLimitOnce: true });
    const [result] = await runBatchBalances({ accounts: A, erc721: C }, "base", fetcher);
    expect(result.rows[0].value).toContain("1 ETH");
    expect(result.rows[1].value).toMatch(/^UNAVAILABLE:/);
    expect(result.limitation).toContain("1 unavailable");
    expect(log.filter((entry) => entry.method === "eth_getBalance")).toHaveLength(2);
  });
  it("fails closed on RPC chain mismatch", async () => {
    const { fetcher, log } = fixture({ wrongChain: true });
    await expect(runBatchBalances({ accounts: A }, "base", fetcher)).rejects.toThrow(/wrong chain/i);
    expect(log.map((entry) => entry.method)).toEqual(["eth_chainId"]);
  });
  it("bounds a 200-read matrix to four concurrent requests", async () => {
    const accounts = Array.from({ length: 25 }, (_, i) => `0x${(i + 100).toString(16).padStart(40, "0")}`).join("\n");
    const { fetcher: underlying, log } = fixture();
    let active = 0, peak = 0;
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      active++; peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      try { return await underlying(url, init); } finally { active--; }
    }) as RpcFetch;
    const [result] = await runBatchBalances({ accounts, erc20: [A, B, C].join("\n"), erc721: [A, B].join("\n"), erc1155: `${A},1\n${B},2` }, "base", fetcher);
    expect(result.rows).toHaveLength(200);
    expect(result.limitation).toContain("200 explicit balance reads");
    expect(log.filter((entry) => entry.method === "eth_getBalance")).toHaveLength(25);
    expect(peak).toBeLessThanOrEqual(4);
  });
});
