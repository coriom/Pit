import { expect, it } from "vitest";
import { assertTradingChain, config } from "../src/lib/config";
import {
  approveBuilder,
  bpsToTenths,
  builderConfig,
  builderRate,
  capBuilderFee,
  hlTransport,
} from "../src/lib/hyperliquid";
import { partnerFee } from "../src/lib/cow";
it("audit: immutable fee-disabled release rejects every configured production chain", () => {
  expect(Object.isFrozen(config)).toBe(true);
  expect(config.FEES_ENABLED).toBe(false);
  expect(config.MAINNET_ENABLED).toBe(false);
  expect(config.feeRecipient).toBe("");
  expect(config.builderAddress).toBe("");
  expect(config.partnerFeeBps).toBe(20);
  expect(config.builderFeeTenthsBps).toBe(10);
  expect(partnerFee()).toBeUndefined();
  expect(builderConfig()).toBeUndefined();
  for (const id of [1, 8453, 42161, 999])
    expect(() => assertTradingChain(id)).toThrow();
  expect(() => assertTradingChain(11155111)).not.toThrow();
  expect(hlTransport.isTestnet).toBe(true);
});
it.each([
  ["perps", 100, "10", "10.1"],
  ["spot", 1000, "100", "100.1"],
] as const)(
  "audit: %s fee zero, nominal, cap and cap+1",
  (kind, cap, capBps, excess) => {
    expect(bpsToTenths("0", kind)).toBe(0);
    expect(bpsToTenths("1", kind)).toBe(10);
    expect(bpsToTenths(capBps, kind)).toBe(cap);
    expect(capBuilderFee(cap, kind)).toBe(cap);
    expect(() => capBuilderFee(cap + 1, kind)).toThrow();
    expect(() => bpsToTenths(excess, kind)).toThrow();
  },
);
it("audit: builder approval fails before wallet signing when fees disabled", async () => {
  await expect(approveBuilder({} as never)).rejects.toThrow(
    "Fees are disabled",
  );
  expect(builderRate(0)).toBe("0%");
  expect(builderRate(10)).toBe("0.01%");
  expect(builderRate(100)).toBe("0.1%");
});
