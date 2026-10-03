import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import {
  COW_RELEASE,
  HL_RELEASE,
  executionPreflight,
  type ReleaseFacts,
  verifyAccountingStorage,
} from "../src/lib/execution-preflight";
import { inspectCow, quoteSwap, approveSwap, submitSwap } from "../src/lib/cow";
import { inspectPerp, placePerp, hlTransport } from "../src/lib/hyperliquid";
const facts: ReleaseFacts = {
  connected: true,
  feesEnabled: false,
  mainnetEnabled: false,
  storage: true,
  protocol: "cow",
  chainId: 11155111,
  cow: COW_RELEASE,
};
const address = "0x1111111111111111111111111111111111111111";
afterEach(() => {
  vi.stubGlobal("location", new URL("http://localhost:4321/"));
  vi.restoreAllMocks();
});
it("Ethereum Sepolia release facts accepted; Hyperliquid has its own exact transport gate", () => {
  expect(executionPreflight(facts)).toBe("GREEN");
  expect(
    executionPreflight({
      ...facts,
      protocol: "hyperliquid",
      chainId: 84532,
      hl: HL_RELEASE,
    }),
  ).toBe("GREEN");
});
it.each([84532, 1, 8453, 42161, 999, 0])("CoW chain %s rejected", (chainId) => {
  expect(() => executionPreflight({ ...facts, chainId })).toThrow(
    "WRONG_CHAIN",
  );
});
it.each([
  [{ connected: false }, "DISCONNECTED"],
  [{ feesEnabled: true }, "FEES_ENABLED"],
  [{ mainnetEnabled: true }, "MAINNET_ENABLED"],
  [{ storage: false }, "STORAGE_UNAVAILABLE"],
  [
    { cow: { ...COW_RELEASE, api: "https://api.cow.fi/mainnet" } },
    "COW_CONFIGURATION",
  ],
  [{ cow: { ...COW_RELEASE, settlement: address } }, "COW_CONFIGURATION"],
  [{ cow: { ...COW_RELEASE, relayer: address } }, "COW_CONFIGURATION"],
] as const)("release predicate %j rejected as %s", (change, code) => {
  expect(() => executionPreflight({ ...facts, ...change })).toThrow(code);
});
it.each([
  { ...HL_RELEASE, isTestnet: false },
  { ...HL_RELEASE, apiUrl: "https://api.hyperliquid.xyz" },
  { ...HL_RELEASE, rpcUrl: "https://rpc.hyperliquid.xyz" },
  { ...HL_RELEASE, apiUrl: "https://api.hyperliquid-testnet.xyz.evil.example" },
])("Hyperliquid wrong environment rejected (%j)", (hl) => {
  expect(() =>
    executionPreflight({ ...facts, protocol: "hyperliquid", hl }),
  ).toThrow("HL_CONFIGURATION");
});
it("direct execution with wrong chain or disconnected wallet never invokes provider/signing", async () => {
  const request = vi.fn();
  const wallet = {
    account: { address },
    chain: { id: 84532 },
    request,
  } as never;
  await expect(quoteSwap(wallet, address, address, "1")).rejects.toThrow(
    "WRONG_CHAIN",
  );
  await expect(
    placePerp({} as never, 0, true, "2000", "1", false),
  ).rejects.toThrow("DISCONNECTED");
  await expect(approveSwap({} as never)).rejects.toThrow(
    "INVALID_EXECUTION_QUOTE",
  );
  await expect(submitSwap({} as never)).rejects.toThrow(
    "INVALID_EXECUTION_QUOTE",
  );
  expect(request).not.toHaveBeenCalled();
});
it("actual wallet chain takes precedence over cached Sepolia chain", async () => {
  const wallet = {
    account: { address },
    chain: { id: 11155111 },
    getAddresses: async () => [address],
    getChainId: async () => 84532,
  } as never;
  await expect(inspectCow(wallet, address, address, "1")).rejects.toThrow(
    "WRONG_CHAIN",
  );
});
it("unsafe accounting origin blocks both protocol execution paths", async () => {
  vi.stubGlobal("location", new URL("https://gateway.example/ipfs/cid"));
  const wallet = { account: { address }, chain: { id: 11155111 } } as never;
  await expect(inspectCow(wallet, address, address, "1")).rejects.toThrow(
    "STORAGE_UNAVAILABLE",
  );
  await expect(
    inspectPerp(wallet, 0, true, "2000", "1", false),
  ).rejects.toThrow("STORAGE_UNAVAILABLE");
});
it("storage probe leaves no accounting records; unavailable IndexedDB fails closed", async () => {
  await expect(verifyAccountingStorage()).resolves.toBeUndefined();
  const unavailable = vi
    .spyOn(IDBDatabase.prototype, "transaction")
    .mockImplementation(() => {
      throw new DOMException("Storage unavailable", "QuotaExceededError");
    });
  await expect(verifyAccountingStorage()).rejects.toThrow(
    "STORAGE_UNAVAILABLE",
  );
  unavailable.mockRestore();
  vi.stubGlobal("location", new URL("https://unknown.example"));
  await expect(verifyAccountingStorage()).rejects.toThrow(
    "STORAGE_UNAVAILABLE",
  );
});
it("Hyperliquid runtime mainnet transport is refused before reading wallet or signing", async () => {
  const old = hlTransport.apiUrl;
  hlTransport.apiUrl = "https://api.hyperliquid.xyz";
  try {
    await expect(
      placePerp({ account: { address } } as never, 0, true, "2000", "1", false),
    ).rejects.toThrow("HL_CONFIGURATION");
  } finally {
    hlTransport.apiUrl = old;
  }
});
it("Sepolia provider ERC20 checks reject insufficient funds", async () => {
  const wallet = {
    account: { address },
    chain: { id: 11155111 },
    getAddresses: async () => [address],
    getChainId: async () => 11155111,
    request: vi.fn(async ({ method, params }: any) => {
      if (method === "eth_getCode") return "0x6000";
      if (method === "eth_getBalance") return "0x1";
      if (method === "eth_call")
        return (
          "0x" +
          (params[0].data.startsWith("0x313ce567") ? "12" : "00").padStart(
            64,
            "0",
          )
        );
      throw Error(method);
    }),
  } as never;
  await expect(
    inspectCow(
      wallet,
      address,
      "0x2222222222222222222222222222222222222222",
      "1",
    ),
  ).rejects.toThrow("INSUFFICIENT_BALANCE");
});
