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
  getOrderToSign,
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
    expect(display["Partner fee (buy token)"]).toBe("0.404");
    expect(display["Spot price (buy / sell)"]).toBe("202 / 101");
    expect(display["Protocol fee (buy token)"]).toBe("0");
    expect(amounts.afterSlippage.buyAmount).toBe(
      amounts.amountsToSign.buyAmount,
    );
    expect(display["Minimum receive (buy token)"]).toBe("198.59802");
  });
});

it.each([0, 20])(
  "audit: displayed minimum equals SDK execution helper with partner fee %i",
  async (bps) => {
    const fee = bps ? { volumeBps: bps, recipient } : undefined;
    const app = await cowAppData(bps > 0, recipient);
    const params = {
      kind: OrderKind.SELL,
      sellAmount: "100000000000000000000",
      buyAmount: "200000000000000000000",
      feeAmount: "1000000000000000000",
    };
    const amounts = getQuoteAmountsAndCosts({
      orderParams: params as any,
      slippagePercentBps: 50,
      partnerFeeBps: bps,
      protocolFeeBps: 15,
    });
    const order = getOrderToSign(
      {
        chainId: 11155111,
        from: recipient,
        networkCostsAmount: params.feeAmount,
        isEthFlow: false,
        protocolFeeBps: 15,
      },
      {
        ...params,
        sellToken: recipient,
        buyToken: "0x2222222222222222222222222222222222222222",
        slippageBps: 50,
        partnerFee: fee,
        validTo: 1900000000,
        sellTokenDecimals: 18,
        buyTokenDecimals: 18,
      },
      app.appDataKeccak256,
    );
    expect(BigInt(order.buyAmount)).toBe(amounts.afterSlippage.buyAmount);
    expect(BigInt(order.sellAmount)).toBe(amounts.beforeAllFees.sellAmount);
    expect(order.appData).toBe(app.appDataKeccak256);
    expect(costsDisplay(amounts, 18, 18)["Minimum receive (buy token)"]).toBe(
      (await import("viem")).formatUnits(BigInt(order.buyAmount), 18),
    );
    if (!bps)
      expect(JSON.parse(app.fullAppData).metadata.partnerFee).toBeUndefined();
  },
);
