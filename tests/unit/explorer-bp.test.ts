import { describe, expect, it } from "vitest";
import { encodeFunctionData, encodeFunctionResult, parseAbi } from "viem";
import { BP_IDS, BP_TOOLS, runBpTool } from "../../src/lib/explorer-bp";
import type { RpcFetch } from "../../src/lib/explorer-bn";

const ZERO = "0x0000000000000000000000000000000000000000";
const ONE = "0x1111111111111111111111111111111111111111";
const ABI = parseAbi([
  "function owner() view returns (address)", "function hasRole(bytes32,address) view returns (bool)", "function getRoleAdmin(bytes32) view returns (bytes32)",
  "function name() view returns (string)", "function symbol() view returns (string)", "function decimals() view returns (uint8)", "function totalSupply() view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)", "function nonces(address) view returns (uint256)", "function supportsInterface(bytes4) view returns (bool)",
  "function getMinDelay() view returns (uint256)", "function PROPOSER_ROLE() view returns (bytes32)", "function EXECUTOR_ROLE() view returns (bytes32)",
  "function getOwners() view returns (address[])", "function getThreshold() view returns (uint256)", "function nonce() view returns (uint256)",
]);
const methods = ["owner", "hasRole", "getRoleAdmin", "name", "symbol", "decimals", "totalSupply", "DOMAIN_SEPARATOR", "nonces", "supportsInterface", "getMinDelay", "PROPOSER_ROLE", "EXECUTOR_ROLE", "getOwners", "getThreshold", "nonce"] as const;
const selectors = new Map(methods.map((method) => [encodeFunctionData({ abi: ABI, functionName: method as any, args: method === "hasRole" ? ["0x" + "0".repeat(64), ZERO] : method === "getRoleAdmin" ? ["0x" + "0".repeat(64)] : method === "nonces" ? [ZERO] : method === "supportsInterface" ? ["0x80ac58cd"] : [] } as any).slice(0, 10), method]));
const outputs: Record<(typeof methods)[number], unknown> = {
  owner: ZERO, hasRole: false, getRoleAdmin: "0x" + "0".repeat(64), name: "Mock Token", symbol: "MOCK", decimals: 6, totalSupply: 1234567n,
  DOMAIN_SEPARATOR: "0x" + "1".repeat(64), nonces: 3n, supportsInterface: true, getMinDelay: 172800n,
  PROPOSER_ROLE: "0x" + "2".repeat(64), EXECUTOR_ROLE: "0x" + "3".repeat(64), getOwners: [ZERO, ONE], getThreshold: 2n, nonce: 7n,
};
function mock(log: { method: string; params: unknown[] }[] = []): RpcFetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    log.push({ method: request.method, params: request.params });
    let result: unknown = "0x0";
    if (request.method === "eth_chainId") result = String(url).includes("base") ? "0x2105" : "0x1";
    if (request.method === "eth_blockNumber") result = "0x64";
    if (request.method === "eth_getCode") result = "0x6000";
    if (request.method === "eth_getStorageAt") result = request.params[1] === "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" ? "0x" + "0".repeat(24) + "1".repeat(40) : "0x" + "0".repeat(64);
    if (request.method === "eth_call") {
      const method = selectors.get(String(request.params[0].data).slice(0, 10));
      if (!method) throw Error("Unexpected ABI selector in mock");
      result = encodeFunctionResult({ abi: ABI, functionName: method as any, result: outputs[method] } as any);
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
  }) as RpcFetch;
}
describe("BP contract inspections", () => {
  it("registers eight distinct bounded routes", () => {
    expect(BP_IDS).toHaveLength(8);
    expect(new Set(BP_IDS).size).toBe(8);
    expect(BP_TOOLS.every((tool) => tool.limitation && tool.question)).toBe(true);
  });
  it("reads official EIP-1967 slots without asserting proxy safety", async () => {
    const result = (await runBpTool("proxy-storage", { contract: ZERO }, "ethereum", mock()))[0];
    expect(result.rows.find((entry) => entry.label.includes("implementation slot"))?.value).toBe(ONE);
    expect(result.rows.find((entry) => entry.label.includes("admin slot"))?.value).toBe(ZERO);
    expect(result.limitation).toContain("not proof");
  });
  it("compares runtime code across explicit chains and blocks", async () => {
    const result = (await runBpTool("bytecode-compare", { contract: ZERO, otherContract: ZERO, otherChain: "base" }, "ethereum", mock()))[0];
    expect(result.rows.find((entry) => entry.label === "Runtime bytecode identical")?.value).toBe("true");
    expect(result.rows.find((entry) => entry.label === "Second chain and block")?.value).toContain("Base mainnet · 100");
  });
  it("reports owner, selected role, token metadata and permit evidence without overclaiming", async () => {
    const role = "0x" + "0".repeat(64);
    const owner = (await runBpTool("ownership-role", { contract: ZERO, account: ZERO, role }, "ethereum", mock()))[0];
    expect(owner.rows.find((entry) => entry.label === "Owner()")?.value).toBe(ZERO);
    const token = (await runBpTool("erc20-contract", { contract: ZERO }, "base", mock()))[0];
    expect(token.rows.find((entry) => entry.label === "Total supply, raw base units")?.value).toBe("1234567");
    const permit = (await runBpTool("permit-signals", { contract: ZERO, account: ZERO }, "ethereum", mock()))[0];
    expect(permit.rows.at(-1)?.value).toContain("CANDIDATE ONLY");
  });
  it("reads ERC-165, timelock and bounded Safe owner results", async () => {
    const interfaceResult = (await runBpTool("erc165-interface", { contract: ZERO, interfaceId: "0x80ac58cd" }, "ethereum", mock()))[0];
    expect(interfaceResult.rows.at(-1)?.value).toBe("true");
    const timelock = (await runBpTool("timelock-standard", { contract: ZERO, account: ZERO }, "ethereum", mock()))[0];
    expect(timelock.rows.find((entry) => entry.label === "Minimum delay, seconds")?.value).toBe("172800");
    const safe = (await runBpTool("safe-multisig", { contract: ZERO }, "ethereum", mock()))[0];
    expect(safe.rows.find((entry) => entry.label === "Signature threshold")?.value).toBe("2");
    expect(safe.rows.filter((entry) => entry.label.startsWith("Owner "))).toHaveLength(3);
  });
  it("rejects unsupported IDs and malformed inputs before network access", async () => {
    const log: { method: string; params: unknown[] }[] = [];
    await expect(runBpTool("proxy-storage", { contract: "bad" }, "ethereum", mock(log))).rejects.toThrow(/address/i);
    await expect(runBpTool("erc165-interface", { contract: ZERO, interfaceId: "0x123" }, "ethereum", mock(log))).rejects.toThrow(/4 hex bytes/i);
    await expect(runBpTool("mint-burn-global", { contract: ZERO }, "ethereum", mock(log))).rejects.toThrow(/unsupported/i);
    expect(log).toHaveLength(0);
  });
});
