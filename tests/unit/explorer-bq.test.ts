import { describe, expect, it } from "vitest";
import { encodeFunctionData, encodeFunctionResult, getAddress, namehash, parseAbi } from "viem";
import { BQ_IDS, runBqTool } from "../../src/lib/explorer-bq";
import type { RpcFetch } from "../../src/lib/explorer-bn";

const ZERO = "0x0000000000000000000000000000000000000000";
const POOL = getAddress("0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640");
const USDC = getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
const WETH = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const VAULT = getAddress("0x028ec7330ff87667b6dfb0d94b954c820195336c");
const ABI = parseAbi([
  "function token0() view returns (address)", "function token1() view returns (address)", "function fee() view returns (uint24)", "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function getPool(address,address,uint24) view returns (address)", "function decimals() view returns (uint8)",
  "function ownerOf(uint256) view returns (address)",
  "function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function getReservesList() view returns (address[])", "function getReserveNormalizedIncome(address) view returns (uint256)", "function getReserveNormalizedVariableDebt(address) view returns (uint256)",
  "function asset() view returns (address)", "function totalAssets() view returns (uint256)", "function totalSupply() view returns (uint256)", "function convertToAssets(uint256) view returns (uint256)",
  "function resolver(bytes32) view returns (address)", "function addr(bytes32) view returns (address)", "function description() view returns (string)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
]);
type Method = "token0" | "token1" | "fee" | "liquidity" | "slot0" | "getPool" | "decimals" | "ownerOf" | "positions" | "getReservesList" | "getReserveNormalizedIncome" | "getReserveNormalizedVariableDebt" | "asset" | "totalAssets" | "totalSupply" | "convertToAssets" | "resolver" | "addr" | "description" | "latestRoundData";
const selectors = new Map<string, Method>();
for (const [method, args] of [
  ["token0", []], ["token1", []], ["fee", []], ["liquidity", []], ["slot0", []], ["getPool", [USDC, WETH, 500]], ["decimals", []], ["ownerOf", [1n]], ["positions", [1n]],
  ["getReservesList", []], ["getReserveNormalizedIncome", [USDC]], ["getReserveNormalizedVariableDebt", [USDC]], ["asset", []], ["totalAssets", []], ["totalSupply", []], ["convertToAssets", [1n]], ["resolver", [namehash("eth-usd.data.eth")]], ["addr", [namehash("eth-usd.data.eth")]], ["description", []], ["latestRoundData", []],
] as [Method, unknown[]][]) selectors.set(encodeFunctionData({ abi: ABI, functionName: method, args } as any).slice(0, 10), method);

function mock(log: string[] = [], overrides: Partial<Record<Method, unknown>> = {}): RpcFetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    log.push(request.method);
    let result: unknown = "0x0";
    if (request.method === "eth_chainId") result = "0x1";
    if (request.method === "eth_blockNumber") result = "0x64";
    if (request.method === "eth_getBlockByNumber") result = { number: "0x64", timestamp: "0x3e8" };
    if (request.method === "eth_call") {
      const method = selectors.get(String(request.params[0].data).slice(0, 10));
      if (!method) throw Error("Unexpected ABI method in fixture.");
      const outputs: Record<Method, unknown> = {
        token0: USDC, token1: WETH, fee: 500, liquidity: 10000n, slot0: [1n << 96n, 0, 0, 0, 0, 0, true], getPool: POOL, decimals: request.params[0].to.toLowerCase() === USDC.toLowerCase() ? 6 : 18,
        ownerOf: ZERO, positions: [0n, ZERO, USDC, WETH, 500, -120, 120, 100n, 0n, 0n, 3n, 4n],
        getReservesList: [USDC], getReserveNormalizedIncome: 10n ** 27n, getReserveNormalizedVariableDebt: 11n * 10n ** 26n,
        asset: USDC, totalAssets: 1000n, totalSupply: 900n, convertToAssets: 111n,
        resolver: ZERO.replace(/0$/, "1"), addr: ZERO.replace(/0$/, "2"), description: "ETH / USD", latestRoundData: [5n, 200000000000n, 0n, 900n, 5n],
      };
      result = encodeFunctionResult({ abi: ABI, functionName: method, result: overrides[method] ?? outputs[method] } as any);
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
  }) as RpcFetch;
}

describe("BQ protocol-state inspections", () => {
  it("registers five distinct chain-scoped read-only tasks", () => {
    expect(BQ_IDS).toEqual(["uniswap-v3-pool", "uniswap-v3-position", "aave-reserve-index", "erc4626-vault-state", "chainlink-feed"]);
  });
  it("normalizes a pool's token decimals and rejects an unregistered pool", async () => {
    const rows = (await runBqTool("uniswap-v3-pool", { pool: POOL }, "ethereum", mock()))[0].rows;
    expect(rows.find((row) => row.label.startsWith("Marginal token1"))?.value).toBe("0.000000000001000000");
    await expect(runBqTool("uniswap-v3-pool", { pool: POOL }, "ethereum", mock([], { getPool: ZERO }))).rejects.toThrow(/not registered/);
  });
  it("reads position state without calling owed tokens complete accrued fees", async () => {
    const output = (await runBqTool("uniswap-v3-position", { tokenId: "1" }, "ethereum", mock()))[0];
    expect(output.rows.find((row) => row.label === "Recorded tokensOwed0, raw")?.value).toBe("3");
    expect(output.limitation).toContain("excludes fees");
  });
  it("requires a listed Aave reserve", async () => {
    const output = (await runBqTool("aave-reserve-index", { asset: USDC }, "ethereum", mock()))[0];
    expect(output.rows.find((row) => row.label.startsWith("Normalized income"))?.value).toBe("1000000000000000000000000000");
    await expect(runBqTool("aave-reserve-index", { asset: WETH }, "ethereum", mock())).rejects.toThrow(/not a listed reserve/);
  });
  it("reports exact raw ERC-4626 conversion and rejects unsupported precision", async () => {
    const output = (await runBqTool("erc4626-vault-state", { vault: VAULT, shares: "1" }, "ethereum", mock()))[0];
    expect(output.rows.find((row) => row.label.startsWith("convertToAssets"))?.value).toBe("111");
    await expect(runBqTool("erc4626-vault-state", { vault: VAULT, shares: "1" }, "ethereum", mock([], { decimals: 37 }))).rejects.toThrow(/unsupported/);
  });
  it("compares Chainlink update time with sampled block time, not the local clock", async () => {
    const output = (await runBqTool("chainlink-feed", { feed: "eth-usd.data.eth", maxAge: "100" }, "ethereum", mock()))[0];
    expect(output.rows.find((row) => row.label === "Age at sampled block, seconds")?.value).toBe("100");
    expect(output.rows.find((row) => row.label.startsWith("Within user-selected"))?.value).toBe("true");
    const stale = (await runBqTool("chainlink-feed", { feed: "eth-usd.data.eth", maxAge: "99" }, "ethereum", mock()))[0];
    expect(stale.rows.find((row) => row.label.startsWith("Within user-selected"))?.value).toBe("false");
  });
  it("rejects malformed input and unsupported network before any public request", async () => {
    const calls: string[] = [];
    await expect(runBqTool("uniswap-v3-pool", { pool: "not-address" }, "ethereum", mock(calls))).rejects.toThrow(/address/i);
    await expect(runBqTool("chainlink-feed", { feed: "other.data.eth", maxAge: "100" }, "ethereum", mock(calls))).rejects.toThrow(/allowlist/);
    await expect(runBqTool("aave-reserve-index", { asset: USDC }, "base", mock(calls))).rejects.toThrow(/unsupported/);
    expect(calls).toEqual([]);
  });
});
