import "fake-indexeddb/auto";
import { beforeEach, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({
  post: vi.fn(async () => ({ orderId: "offline" })),
  approve: vi.fn(async () => "0x0"),
  allowance: vi.fn(async () => 10n ** 20n),
}));
vi.mock("@cowprotocol/cow-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cowprotocol/cow-sdk")>();
  return {
    ...actual,
    TradingSdk: class {
      getQuote = async () => ({
        quoteResults: { amountsAndCosts: { marker: "same-helper-result" } },
        postSwapOrderFromQuote: calls.post,
      });
      getCowProtocolAllowance = calls.allowance;
      approveCowProtocol = calls.approve;
    },
  };
});
import { quoteSwap, approveSwap, submitSwap } from "../src/lib/cow";
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
  vi.stubGlobal("location", new URL("http://localhost:4321"));
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
