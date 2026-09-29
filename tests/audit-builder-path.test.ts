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
it("release: even the formerly enabled builder branch cannot approve or order", async () => {
  await expect(approveBuilder(wallet)).rejects.toThrow("FEES_ENABLED");
  await expect(
    placePerp(wallet, 0, true, "2000", "0.01", false),
  ).rejects.toThrow("FEES_ENABLED");
  expect(mocks.approve).not.toHaveBeenCalled();
  expect(mocks.order).not.toHaveBeenCalled();
});
