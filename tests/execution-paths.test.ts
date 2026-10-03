import "fake-indexeddb/auto";
import { beforeEach, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({
  post: vi.fn(async () => ({ orderId: "offline" })),
  approve: vi.fn(async () => "0x0"),
  allowance: vi.fn(async () => 10n ** 20n),
  getQuote: vi.fn(async () => ({
    quoteResults: { amountsAndCosts: { marker: "same-helper-result" } },
    postSwapOrderFromQuote: calls.post,
  })),
}));
vi.mock("@cowprotocol/cow-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cowprotocol/cow-sdk")>();
  return {
    ...actual,
    TradingSdk: class {
      getQuote = calls.getQuote;
      getCowProtocolAllowance = calls.allowance;
      approveCowProtocol = calls.approve;
    },
  };
});
import {
  quoteSwap,
  approveSwap,
  submitSwap,
  invalidateSwapQuote,
} from "../src/lib/cow";
let chain = 11155111;
let balance = 10n ** 20n;
const owner = "0x1111111111111111111111111111111111111111";
const buy = "0x2222222222222222222222222222222222222222";
const wallet = {
  account: { address: owner },
  chain: { id: 11155111 },
  getAddresses: async () => [owner],
  getChainId: async () => chain,
  request: async ({ method, params }: any) => {
    if (method === "eth_getCode") return "0x6000";
    if (method === "eth_getBalance") return "0xde0b6b3a7640000";
    if (method === "eth_estimateGas") return "0x5208";
    if (method === "eth_gasPrice") return "0x3b9aca00";
    if (method === "eth_call")
      return (
        "0x" +
        (params[0].data.startsWith("0x313ce567") ? 18n : balance)
          .toString(16)
          .padStart(64, "0")
      );
    throw Error(`Unexpected fixture RPC ${method}`);
  },
} as never;
beforeEach(() => {
  chain = 11155111;
  balance = 10n ** 20n;
  vi.clearAllMocks();
  calls.getQuote.mockImplementation(async () => ({
    quoteResults: { amountsAndCosts: { marker: "same-helper-result" } },
    postSwapOrderFromQuote: calls.post,
  }));
  calls.allowance.mockResolvedValue(10n ** 20n);
  vi.stubGlobal("location", new URL("http://localhost:4321"));
});
it("rejects fresh comparison objects, copied CoW displays and forged fields at both real boundaries", async () => {
  const q = await quoteSwap(wallet, owner, buy, "1");
  const uniswap = {
    ...q,
    provider: "uniswap-v3",
    executableThroughPit: false,
    quotedAtMs: Date.now(),
    expiresAtMs: Date.now() + 30000,
  };
  const forged = {
    ...q,
    provider: "cow",
    executableThroughPit: true,
    calldata: "0xdeadbeef",
    orderToSign: { sellAmount: "1", buyAmount: "999999" },
    postSwapOrderFromQuote: calls.post,
  };
  const normalizedCowDisplay = {
    provider: "cow",
    availability: "available",
    executableThroughPit: true,
    chainId: q.chainId,
    sellToken: q.sellToken,
    buyToken: q.buyToken,
    sellAmount: q.units,
    buyAmount: 999999n,
    quotedAtMs: Date.now(),
    expiresAtMs: Date.now() + 30000,
  };
  for (const candidate of [
    uniswap,
    normalizedCowDisplay,
    { ...q },
    forged,
    { ...uniswap, obtainedAt: 0 },
  ]) {
    await expect(approveSwap(candidate as never)).rejects.toThrow(
      "INVALID_EXECUTION_QUOTE",
    );
    await expect(submitSwap(candidate as never)).rejects.toThrow(
      "INVALID_EXECUTION_QUOTE",
    );
  }
  expect(calls.allowance).not.toHaveBeenCalled();
  expect(calls.approve).not.toHaveBeenCalled();
  expect(calls.post).not.toHaveBeenCalled();
  // Positive controls use the exact internal CoW quote and reach each SDK boundary.
  calls.allowance.mockResolvedValue(0n);
  calls.approve.mockRejectedValueOnce(Error("APPROVAL_BOUNDARY_REACHED"));
  await expect(approveSwap(q)).rejects.toThrow("APPROVAL_BOUNDARY_REACHED");
  expect(calls.approve).toHaveBeenCalledTimes(1);
  expect(await submitSwap(q)).toEqual({ orderId: "offline" });
  expect(calls.post).toHaveBeenCalledTimes(1);
});
it("rejects mutated original quote context and superseded asynchronous responses", async () => {
  let resolveFirst!: (v: any) => void;
  let resolveSecond!: (v: any) => void;
  calls.getQuote
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveFirst = r;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveSecond = r;
        }),
    );
  const first = quoteSwap(wallet, owner, buy, "1");
  const second = quoteSwap(wallet, owner, buy, "2");
  await vi.waitFor(() => expect(calls.getQuote).toHaveBeenCalledTimes(2));
  resolveSecond({
    quoteResults: { amountsAndCosts: { marker: "second" } },
    postSwapOrderFromQuote: calls.post,
  });
  const current = await second;
  resolveFirst({
    quoteResults: { amountsAndCosts: { marker: "first" } },
    postSwapOrderFromQuote: calls.post,
  });
  const old = await first;
  await expect(submitSwap(old)).rejects.toThrow("INVALID_EXECUTION_QUOTE");
  current.buyToken = owner;
  await expect(submitSwap(current)).rejects.toThrow("INVALID_EXECUTION_QUOTE");
  current.buyToken = buy;
  (current.quoteResults.amountsAndCosts as any).marker = "tampered";
  await expect(approveSwap(current)).rejects.toThrow("INVALID_EXECUTION_QUOTE");
  expect(calls.approve).not.toHaveBeenCalled();
  expect(calls.post).not.toHaveBeenCalled();
});
it("Sepolia valid provider facts allow guarded quote and offline submission closure", async () => {
  const q = await quoteSwap(wallet, owner, buy, "1");
  expect("sdk" in q).toBe(false);
  expect("postSwapOrderFromQuote" in q).toBe(false);
  await approveSwap(q);
  expect(await submitSwap(q)).toEqual({ orderId: "offline" });
  expect(calls.post).toHaveBeenCalledTimes(1);
  expect(calls.approve).not.toHaveBeenCalled();
});
it("chain change after GREEN quote rejects approval and submission", async () => {
  const q = await quoteSwap(wallet, owner, buy, "1");
  chain = 84532;
  await expect(approveSwap(q)).rejects.toThrow("WRONG_CHAIN");
  await expect(submitSwap(q)).rejects.toThrow("WRONG_CHAIN");
  expect(calls.post).not.toHaveBeenCalled();
  expect(calls.approve).not.toHaveBeenCalled();
});
it("quote refresh and UI context invalidation revoke the prior CoW closure", async () => {
  const first = await quoteSwap(wallet, owner, buy, "1");
  const current = await quoteSwap(wallet, owner, buy, "2");
  await expect(submitSwap(first)).rejects.toThrow("INVALID_EXECUTION_QUOTE");
  invalidateSwapQuote(current);
  await expect(approveSwap(current)).rejects.toThrow("INVALID_EXECUTION_QUOTE");
  expect(calls.post).not.toHaveBeenCalled();
  expect(calls.approve).not.toHaveBeenCalled();
});
it("balance spent after quote is rechecked before submission", async () => {
  const q = await quoteSwap(wallet, owner, buy, "1");
  balance = 0n;
  await expect(submitSwap(q)).rejects.toThrow("INSUFFICIENT_BALANCE");
  expect(calls.post).not.toHaveBeenCalled();
});
it("expired quote and unsafe-origin execution cannot invoke a signing closure", async () => {
  const q = await quoteSwap(wallet, owner, buy, "1");
  vi.stubGlobal("location", new URL("https://gateway.example/ipfs/cid"));
  await expect(submitSwap(q)).rejects.toThrow("STORAGE_UNAVAILABLE");
  vi.stubGlobal("location", new URL("http://localhost:4321"));
  vi.spyOn(Date, "now").mockReturnValue(q.obtainedAt + 60001);
  await expect(submitSwap(q)).rejects.toThrow("QUOTE_EXPIRED");
  vi.restoreAllMocks();
  expect(calls.post).not.toHaveBeenCalled();
});
