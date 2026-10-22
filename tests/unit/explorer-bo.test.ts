import { describe, expect, it } from "vitest";
import { encodeFunctionResult, parseAbi } from "viem";
import { BO_IDS, BO_TOOLS, runBoTool } from "../../src/lib/explorer-bo";
import { EXPLORER_CHAINS, type RpcFetch } from "../../src/lib/explorer-bn";

const ZERO = "0x0000000000000000000000000000000000000000";
const HASH = "0x" + "a".repeat(64);
const TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MULTICALL = parseAbi(["function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns ((bool success,bytes returnData)[] returnData)"]);
const ERC20 = parseAbi(["function decimals() view returns (uint8)"]);
function rpc(log: { method: string; params: unknown[] }[] = []): RpcFetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    log.push({ method: request.method, params: request.params });
    let result: unknown = "0x0";
    if (request.method === "eth_chainId") result = String(url).includes("base") ? "0x2105" : "0x1";
    if (request.method === "eth_blockNumber") result = "0x64";
    if (request.method === "eth_gasPrice") result = "0x4a817c800";
    if (request.method === "eth_maxPriorityFeePerGas") result = "0x3b9aca00";
    if (request.method === "eth_getBlockByNumber") result = { number: "0x64", baseFeePerGas: "0x2540be400", gasUsed: "0x989680", gasLimit: "0x1312d00", blobGasUsed: "0x40000", excessBlobGas: "0x80000" };
    if (request.method === "eth_getTransactionByHash") result = { hash: HASH, blockNumber: "0x50", from: ZERO, to: ZERO, value: "0x0", nonce: "0x2", gas: "0x5208", input: "0x" };
    if (request.method === "eth_getTransactionReceipt") result = { transactionHash: HASH, blockNumber: "0x50", status: "0x1", gasUsed: "0x5208", effectiveGasPrice: "0x4a817c800", l1Fee: "0x3e8", logs: [{ address: ZERO, topics: [TOPIC, `0x${"0".repeat(64)}`, `0x${"0".repeat(64)}`], data: `0x${"0".repeat(63)}a` }] };
    if (request.method === "eth_call") result = encodeFunctionResult({ abi: MULTICALL, functionName: "aggregate3", result: [{ success: true, returnData: encodeFunctionResult({ abi: ERC20, functionName: "decimals", result: 6 }) }] });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
  }) as RpcFetch;
}
describe("BO bounded transaction and network inspections", () => {
  it("registers six distinct read-only questions", () => {
    expect(BO_IDS).toHaveLength(6);
    expect(new Set(BO_IDS).size).toBe(6);
    expect(BO_TOOLS.every((tool) => tool.question && tool.limitation)).toBe(true);
  });
  it("decodes transaction and receipt at their actual historical block", async () => {
    const result = (await runBoTool("transaction-detail", { hash: HASH }, "ethereum", rpc()))[0];
    expect(result.block).toBe("80");
    expect(result.rows.find((entry) => entry.label === "Receipt status")?.value).toBe("Success");
    expect(result.rows.find((entry) => entry.label === "Gas used, units")?.value).toBe("21000");
  });
  it("keeps block fee, provider suggestions and blob activity distinct", async () => {
    const gas = (await runBoTool("network-gas", {}, "ethereum", rpc()))[0];
    expect(gas.rows.find((entry) => entry.label === "Block base fee, wei per gas")?.value).toBe("10000000000");
    expect(gas.rows.find((entry) => entry.label.includes("Provider gas-price"))?.value).toBe("20000000000");
    const blob = (await runBoTool("blob-activity", {}, "ethereum", rpc()))[0];
    expect(blob.rows[0].value).toBe("262144");
    expect(blob.limitation).toContain("does not quote");
  });
  it("decodes one receipt's Transfer-like log without claiming an ERC-20 amount", async () => {
    const result = (await runBoTool("tx-transfer-events", { hash: HASH }, "ethereum", rpc()))[0];
    expect(result.rows[0].value).toBe("1");
    expect(result.rows.find((entry) => entry.label.includes("raw value"))?.value).toBe("10");
    expect(result.limitation).toContain("ERC-721");
  });
  it("separates Base execution and L1 data fees and retains incomplete coverage", async () => {
    const result = (await runBoTool("base-transaction-cost", { hash: HASH }, "base", rpc()))[0];
    expect(result.rows.find((entry) => entry.label === "L2 execution component, wei")?.value).toBe("420000000000000");
    expect(result.rows.find((entry) => entry.label.startsWith("Subtotal"))?.value).toBe("420000000001000");
    expect(result.rows.at(-1)?.value).toContain("UNVERIFIED");
  });
  it("uses one pinned-block Multicall3 read for a bounded static method", async () => {
    const log: { method: string; params: unknown[] }[] = [];
    const result = (await runBoTool("multicall-static-reads", { calls: `${ZERO}|decimals` }, "base", rpc(log)))[0];
    expect(result.rows[0].value).toBe("6");
    expect(log.filter((entry) => entry.method === "eth_call")).toHaveLength(1);
    expect(log.find((entry) => entry.method === "eth_call")?.params[1]).toBe("0x64");
  });
  it("rejects malformed hashes, unreviewed calls and unsupported networks before a request", async () => {
    const log: { method: string; params: unknown[] }[] = [];
    await expect(runBoTool("transaction-detail", { hash: "bad" }, "ethereum", rpc(log))).rejects.toThrow(/32 hex bytes/i);
    await expect(runBoTool("multicall-static-reads", { calls: `${ZERO}|transfer` }, "ethereum", rpc(log))).rejects.toThrow(/contract\|/i);
    await expect(runBoTool("blob-activity", {}, "base", rpc(log))).rejects.toThrow(/unsupported/i);
    await expect(runBoTool("transaction-revert", { hash: HASH }, "ethereum", rpc(log))).rejects.toThrow(/unsupported/i);
    expect(log).toHaveLength(0);
    expect(EXPLORER_CHAINS.ethereum.rpc).toBe("https://eth.drpc.org/");
  });
});
