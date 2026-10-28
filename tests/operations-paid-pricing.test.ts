import { describe, expect, it } from "vitest";
import { formatLocalQuote, priceForPaidOperation } from "../src/operations/lib/paid-local";

describe("local paid quote arithmetic", () => {
  it("uses exact six-decimal fixed and recipient-based prices", () => {
    expect(priceForPaidOperation("token-creator", 0)).toBe(49_000_000n);
    expect(priceForPaidOperation("token-creator", 0, true)).toBe(149_000_000n);
    expect(priceForPaidOperation("multisender", 1)).toBe(3_100_000n);
    expect(priceForPaidOperation("multisender", 100)).toBe(13_000_000n);
    expect(priceForPaidOperation("token-locker", 0)).toBe(39_000_000n);
    expect(priceForPaidOperation("token-vesting", 0)).toBe(79_000_000n);
  });
  it("keeps USDC and native gas denominations separate", () => {
    const text = formatLocalQuote({
      operation: "multisender", network: "Anvil 31337", paymentAsset: "LOCAL MOCK USDC",
      paymentToken: "0x0000000000000000000000000000000000000001",
      payer: "0x0000000000000000000000000000000000000002",
      feeRecipient: "0x0000000000000000000000000000000000000003",
      destination: "0x0000000000000000000000000000000000000004",
      expectedSpender: "0x0000000000000000000000000000000000000004",
      amountMicro: 3_100_000n, maxAuthorizedServiceFeeMicro: 3_100_000n, gasUnits: 100_000n, gasWei: 1_000_000n,
      units: 1, intentId: `0x${"12".repeat(32)}`, version: 1n, createdAt: 1_700_000_000n, expiresAt: 1_700_000_900n,
    });
    expect(text).toContain("3.1 LOCAL MOCK USDC");
    expect(text).toContain("100000 gas");
    expect(text).not.toMatch(/total.{0,30}(?:USDC|ETH)/i);
  });
});
