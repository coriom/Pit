import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  order: vi.fn(async (_: unknown) => ({
    response: { data: { statuses: [] } },
  })),
  approve: vi.fn(async (_: unknown) => ({ status: "ok" })),
  max: vi.fn(async (_: unknown) => 10),
}));
// Isolated test module only. The shipped frozen config and rates are unchanged.
vi.mock("../src/lib/config", () => ({
  config: {
    FEES_ENABLED: true,
    builderAddress: "0x1111111111111111111111111111111111111111",
    builderFeeTenthsBps: 10,
  },
}));
vi.mock("@nktkas/hyperliquid", () => ({
  HttpTransport: class {
    isTestnet = true;
  },
  InfoClient: class {
    meta = async () => ({ universe: [{ szDecimals: 4 }] });
    maxBuilderFee = mocks.max;
  },
  ExchangeClient: class {
    order = mocks.order;
    approveBuilderFee = mocks.approve;
  },
}));
import { approveBuilder, placePerp } from "../src/lib/hyperliquid";
const wallet = {
  account: { address: "0x2222222222222222222222222222222222222222" },
} as never;
it("audit: isolated enabled branch passes identical builder rate to approval and order; no SDK or network invoked", async () => {
  await approveBuilder(wallet);
  expect(mocks.approve).toHaveBeenCalledWith({
    builder: "0x1111111111111111111111111111111111111111",
    maxFeeRate: "0.01%",
  });
  await placePerp(wallet, 0, true, "2000", "0.01", false);
  expect(mocks.order).toHaveBeenCalledWith({
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
    builder: { b: "0x1111111111111111111111111111111111111111", f: 10 },
  });
  mocks.max.mockResolvedValueOnce(9);
  await expect(
    placePerp(wallet, 0, true, "2000", "0.01", false),
  ).rejects.toThrow("Approve builder fee first");
  expect(mocks.order).toHaveBeenCalledTimes(1);
});
