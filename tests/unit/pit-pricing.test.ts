import { describe, expect, it } from "vitest";
import { feeQuote, indicativeServiceFee, PIT_PRICES } from "../../src/lib/pit-pricing";

describe("inactive pay-per-operation pricing contract", () => {
  it("calculates exact bounded micro-USDC without floating point", () => {
    expect(indicativeServiceFee(PIT_PRICES["erc20-bulk-distribution"], 1)).toBe(3_100_000n);
    expect(indicativeServiceFee(PIT_PRICES["erc20-bulk-distribution"], 1000)).toBe(49_000_000n);
    expect(indicativeServiceFee(PIT_PRICES["erc1155-creator"])).toBe(79_000_000n);
    expect(() => indicativeServiceFee(PIT_PRICES["erc20-bulk-distribution"], -1)).not.toThrow();
    expect(indicativeServiceFee(PIT_PRICES["erc20-bulk-distribution"], -1)).toBeUndefined();
  });
  it("keeps USDC service price and ETH gas as separate assets", () => {
    const quote = feeQuote(PIT_PRICES["erc1155-multisender"], { units: 2, network: "Anvil 31337", gasUnits: 100_000n, gasPriceWei: 1_000_000_000n, now: 123 });
    expect(quote.service).toEqual({ asset: "USDC", amountMicro: "3200000" });
    expect(quote.gas).toEqual({ asset: "ETH", amountWei: "100000000000000", units: "100000" });
    expect(quote.total).toBeNull();
    expect(quote.status).toBe("INDICATIVE_INACTIVE");
  });
});
