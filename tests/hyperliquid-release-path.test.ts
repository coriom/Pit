import "fake-indexeddb/auto";
import { it, expect, vi, beforeEach } from "vitest";
const calls = vi.hoisted(() => ({
  order: vi.fn(async (_input: unknown) => ({
    response: { data: { statuses: [] } },
  })),
}));
vi.mock("@nktkas/hyperliquid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nktkas/hyperliquid")>();
  return {
    ...actual,
    ExchangeClient: class {
      order = calls.order;
    },
  };
});
import { hlInfo, placePerp } from "../src/lib/hyperliquid";
const owner = "0x1111111111111111111111111111111111111111";
const wallet = {
  account: { address: owner },
  getAddresses: async () => [owner],
} as never;
beforeEach(() => {
  vi.restoreAllMocks();
  calls.order.mockClear();
  vi.spyOn(hlInfo, "meta").mockResolvedValue({
    universe: [{ name: "ETH", szDecimals: 4 }],
  } as never);
  vi.spyOn(hlInfo, "clearinghouseState").mockResolvedValue({
    withdrawable: "100",
    assetPositions: [],
  } as never);
});
it("testnet release submits exact order with no PIT builder fields after shared preflight", async () => {
  await placePerp(wallet, 0, true, "2000", "0.01", false);
  expect(calls.order).toHaveBeenCalledWith({
    orders: [
      {
        a: 0,
        b: true,
        p: "2000",
        s: "0.01",
        r: false,
        t: { limit: { tif: "Gtc" } },
      },
    ],
    grouping: "na",
  });
});
it("insufficient testnet collateral fails before order or signature", async () => {
  vi.mocked(hlInfo.clearinghouseState).mockResolvedValue({
    withdrawable: "0",
    assetPositions: [],
  } as never);
  await expect(
    placePerp(wallet, 0, true, "2000", "0.01", false),
  ).rejects.toThrow("INSUFFICIENT_BALANCE");
  expect(calls.order).not.toHaveBeenCalled();
});
it("reduce-only cannot create or enlarge a nonexistent position", async () => {
  await expect(
    placePerp(wallet, 0, true, "2000", "0.01", true),
  ).rejects.toThrow("MARKET_UNAVAILABLE");
  expect(calls.order).not.toHaveBeenCalled();
});
