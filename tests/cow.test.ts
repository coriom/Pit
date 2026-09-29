import { ViemAdapter } from "@cowprotocol/sdk-viem-adapter";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { setGlobalAdapter } from "@cowprotocol/cow-sdk";
setGlobalAdapter(
  new ViemAdapter({
    provider: createPublicClient({ chain: sepolia, transport: http() }),
  }),
);
import { describe, it, expect } from "vitest";
import {
  buildAppData,
  getQuoteAmountsAndCosts,
  OrderKind,
} from "@cowprotocol/cow-sdk";
import { cowAppData, costsDisplay, partnerFee } from "../src/lib/cow";
import { assertTradingChain, config } from "../src/lib/config";
const recipient = "0x1111111111111111111111111111111111111111";
describe("CoW appData and SDK math", () => {
  it("fees remain off and mainnet is gated", () => {
    expect(config.FEES_ENABLED).toBe(false);
    expect(partnerFee()).toBeUndefined();
    expect(() => assertTradingChain(1)).toThrow();
    expect(() => assertTradingChain(11155111)).not.toThrow();
  });
  it("matches the SDK appData including fee recipient", async () => {
    const actual = await cowAppData(true, recipient);
    const reference = await buildAppData({
      appCode: "PIT",
      slippageBps: 50,
      orderClass: "market",
      partnerFee: { volumeBps: 20, recipient },
    });
    expect(actual).toEqual(reference);
    expect(JSON.parse(actual.fullAppData).metadata.partnerFee).toEqual({
      volumeBps: 20,
      recipient,
    });
  });
  it("rejects unset recipients and excessive fees", () => {
    expect(() => partnerFee(true, "")).toThrow();
    expect(() => partnerFee(true, recipient, 101)).toThrow();
  });
  it("renders every SDK cost exactly, preserving bigint precision", () => {
    const amounts = getQuoteAmountsAndCosts({
      orderParams: {
        kind: OrderKind.SELL,
        sellAmount: "100000000000000000000",
        buyAmount: "200000000000000000000",
        feeAmount: "1000000000000000000",
      } as any,
      slippagePercentBps: 50,
      partnerFeeBps: 20,
      protocolFeeBps: 0,
    });
    const display = costsDisplay(amounts, 18, 18);
    expect(display["Network cost (sell token)"]).toBe("1");
    expect(display["Protocol fee (buy token)"]).toBe("0");
    expect(amounts.afterSlippage.buyAmount).toBe(
      amounts.amountsToSign.buyAmount,
    );
    expect(display["Minimum receive (buy token)"]).toBe(
      (Number(amounts.afterSlippage.buyAmount) / 1e18).toString(),
    );
  });
});
