import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { decodeFunctionData, encodeEventTopics, erc20Abi, toHex } from "viem";
import { listEvents } from "../src/lib/events";
import {
  assertUniswapApprovalScope,
  inspectUniswapExecution,
  quoteUniswapExecution,
  swapRouter02Abi,
  uniswapSwapData,
  UNISWAP_SEPOLIA,
  type UniswapExecutionQuote,
} from "../src/lib/uniswap-execution";
import { recordUniswapFill } from "../src/lib/uniswap-fill";

const owner = "0x29d0B5939dcC4D0492D72ABd1210dEbd6c90cC96" as const;
const pool = "0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1" as const;
const hash = "0x" + "a".repeat(64);
const buyAmount = 219143458402497n;
const quote = {
  owner, chainId: 11155111, router: UNISWAP_SEPOLIA.router, pool,
  sellToken: UNISWAP_SEPOLIA.usdc, buyToken: UNISWAP_SEPOLIA.weth,
  sellAmount: 10_000_000n, expectedBuy: buyAmount,
  minimumBuy: buyAmount * 9950n / 10000n,
  obtainedAt: Date.now(), expiresAt: Date.now() + 30000,
  normalized: { sellDecimals: 6, buyDecimals: 18 },
} as unknown as UniswapExecutionQuote;
const transfer = (token: `0x${string}`, from: `0x${string}`, to: `0x${string}`, amount: bigint) => ({
  address: token,
  topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from, to } }),
  data: toHex(amount, { size: 32 }),
});
const receipt = (status: "success" | "reverted" = "success", output = buyAmount) => ({
  status, transactionHash: hash, blockNumber: 123n, gasUsed: 150000n,
  effectiveGasPrice: 1000000000n,
  logs: [
    transfer(UNISWAP_SEPOLIA.usdc, owner, pool, 10_000_000n),
    transfer(UNISWAP_SEPOLIA.weth, pool, owner, output),
  ],
});
const provider = {
  getChainId: async () => 11155111,
  readContract: async ({ address }: { address: string }) =>
    address.toLowerCase() === UNISWAP_SEPOLIA.usdc.toLowerCase() ? 6 : 18,
  getBlock: async () => ({ timestamp: 1790000000n }),
};

describe("Uniswap Sepolia execution boundary", () => {
  it("keeps the unaccepted venue disabled before wallet or RPC use", async () => {
    const wallet = { request: () => { throw Error("wallet method reached"); } };
    await expect(quoteUniswapExecution(wallet as never, UNISWAP_SEPOLIA.usdc,
      UNISWAP_SEPOLIA.weth, "10")).rejects.toThrow("UNISWAP_NOT_ACCEPTED");
  });
  it("encodes only the reviewed exact-input 500-tier intent with an integer minimum", () => {
    const data = uniswapSwapData(quote);
    const decoded = decodeFunctionData({ abi: swapRouter02Abi, data });
    expect(decoded.functionName).toBe("exactInputSingle");
    if (decoded.functionName !== "exactInputSingle") throw new Error("Wrong router function");
    expect(decoded.args[0]).toMatchObject({
      tokenIn: UNISWAP_SEPOLIA.usdc,
      fee: 500, recipient: owner, amountIn: 10_000_000n,
      amountOutMinimum: quote.minimumBuy, sqrtPriceLimitX96: 0n,
    });
    expect(decoded.args[0].tokenOut.toLowerCase()).toBe(UNISWAP_SEPOLIA.weth.toLowerCase());
  });
  it("keeps exact approval scope independent of quote expiry while rejecting other intents", () => {
    expect(() => assertUniswapApprovalScope({ ...quote, expiresAt: Date.now() - 1 })).not.toThrow();
    for (const altered of [
      { ...quote, chainId: 1 },
      { ...quote, router: owner },
      { ...quote, sellToken: UNISWAP_SEPOLIA.weth },
      { ...quote, buyToken: UNISWAP_SEPOLIA.usdc },
      { ...quote, sellAmount: 10_000_001n },
      { ...quote, sellAmount: (1n << 256n) - 1n },
    ]) expect(() => assertUniswapApprovalScope(altered as UniswapExecutionQuote))
      .toThrow("INVALID_EXECUTION_QUOTE");
  });
  it("rejects forged display quotes before any wallet or network call", async () => {
    await expect(inspectUniswapExecution(quote)).rejects.toThrow("INVALID_EXECUTION_QUOTE");
    await expect(inspectUniswapExecution({ ...quote, router: owner })).rejects.toThrow("INVALID_EXECUTION_QUOTE");
  });
  it("records exact confirmed transfers once as a schema-valid trade and CSV", async () => {
    const first = await recordUniswapFill(quote, receipt() as never, provider as never);
    const second = await recordUniswapFill(quote, receipt() as never, provider as never);
    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(first.event.type).toBe("trade");
    expect(first.event.quantity).toBe("10");
    expect(first.event.counter_quantity).toBe("0.000219143458402497");
    expect(first.gasWei).toBe(150000000000000n);
    expect(first.csv).toContain('"trade"');
    expect(first.csv).toContain('"0.000219143458402497"');
    expect(await listEvents(owner)).toHaveLength(1);
  });
  it("does not record a reverted or economically mismatched receipt", async () => {
    const other = { ...quote, owner: "0x1111111111111111111111111111111111111111" as const };
    await expect(recordUniswapFill(other, receipt("reverted") as never, provider as never))
      .rejects.toThrow("not confirmed");
    await expect(recordUniswapFill(other, receipt("success", 1n) as never, provider as never))
      .rejects.toThrow("economics mismatch");
    expect(await listEvents(other.owner)).toEqual([]);
  });
});
