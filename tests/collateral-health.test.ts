import { describe, expect, it } from "vitest";
import {
  calculateCollateral,
  collateralReportJSON,
} from "../src/lib/collateral-health";
const common = {
  currency: "USDmanual",
  decimals: 2,
  collateral: "2000",
  debt: "1000",
  maxLtvBps: "7500",
  liquidationThresholdBps: "8000",
  targetHealthFactor: "1.3",
};
const field = (result: ReturnType<typeof calculateCollateral>, name: string) =>
  result.fields.find((item) => item.name === name)?.raw;
describe("single-position collateral constraints", () => {
  it("matches independent LTV, HF and dual-ceiling reference", () => {
    const r = calculateCollateral({ ...common, mode: "health" });
    expect(field(r, "ltv")).toBe("50000000000000000000");
    expect(field(r, "healthFactor")).toBe("1600000000000000000");
    expect(field(r, "maxLtvDebtCeiling")).toBe("150000");
    expect(field(r, "targetHealthDebtCeiling")).toBe("123076");
    expect(field(r, "additionalBorrowHeadroom")).toBe("23076");
    expect(field(r, "equity")).toBe("100000");
    expect(field(r, "grossExposureLeverage")).toBe("2000000000000000000");
    expect(collateralReportJSON(r)).toContain('"raw": "23076"');
  });
  it("rounds changes conservatively and checks one raw unit beyond", () => {
    const r = calculateCollateral({
      ...common,
      mode: "adjust",
      collateral: "1500",
      targetHealthFactor: "1.5",
    });
    expect(field(r, "minimumRepayment")).toBe("20000");
    expect(field(r, "minimumCollateralAddition")).toBe("37500");
    expect(field(r, "maximumSafeWithdrawal")).toBe("0");
    const w = calculateCollateral({
      ...common,
      mode: "adjust",
      targetHealthFactor: "1.2",
    });
    expect(field(w, "maximumSafeWithdrawal")).toBe("50000");
    const afterOneMore = calculateCollateral({
      ...common,
      mode: "health",
      collateral: "1499.99",
      targetHealthFactor: "1.2",
    });
    expect(afterOneMore.breaches).toContain(
      "Current debt breaches the selected target health factor.",
    );
    for (const cents of [10001, 15000, 19999, 20000, 25000]) {
      const model = calculateCollateral({
        ...common,
        mode: "adjust",
        collateral: String(cents / 100),
        debt: "50",
        targetHealthFactor: "1.2",
      });
      const withdrawal = BigInt(field(model, "maximumSafeWithdrawal")!);
      const remaining = BigInt(cents) - withdrawal;
      expect(remaining * 7500n).toBeGreaterThanOrEqual(5000n * 10000n);
      expect(remaining * 8000n * 10n ** 18n).toBeGreaterThanOrEqual(
        5000n * 10000n * 12n * 10n ** 17n,
      );
    }
  });
  it("shows shock and critical drop without promising liquidation", () => {
    const r = calculateCollateral({
      ...common,
      mode: "shock",
      collateralShockBps: "-4000",
    });
    expect(field(r, "shockedCollateralValue")).toBe("120000");
    expect(field(r, "healthFactorAfterShock")).toBe("960000000000000000");
    expect(field(r, "criticalCollateralAtHealthOne")).toBe("125000");
    expect(field(r, "distanceToHealthOnePercent")).toBe("37500000000000000000");
    expect(r.breaches).toHaveLength(1);
    expect(
      calculateCollateral({
        ...common,
        mode: "shock",
        collateralShockBps: "-10000",
      }).fields.some((f) => f.name === "ltvAfterShock"),
    ).toBe(false);
  });
  it("rejects invalid thresholds and preserves undefined states", () => {
    expect(() =>
      calculateCollateral({ ...common, mode: "health", maxLtvBps: "9000" }),
    ).toThrow(/exceed/);
    const zero = calculateCollateral({
      ...common,
      mode: "health",
      collateral: "0",
      debt: "0",
      maxLtvBps: "0",
      liquidationThresholdBps: "0",
    });
    expect(zero.status).toBe("incomplete");
    expect(field(zero, "healthFactor")).toBeUndefined();
    const breached = calculateCollateral({
      ...common,
      mode: "health",
      collateral: "0",
    });
    expect(field(breached, "healthFactor")).toBe("0");
    expect(breached.breaches.length).toBeGreaterThan(0);
    const impossible = calculateCollateral({
      ...common,
      mode: "adjust",
      maxLtvBps: "0",
    });
    expect(impossible.status).toBe("incomplete");
    expect(field(impossible, "minimumRepayment")).toBe("100000");
    expect(() =>
      calculateCollateral({
        ...common,
        mode: "health",
        liquidationThresholdBps: "0",
        maxLtvBps: "0",
      }),
    ).toThrow(/positive liquidation threshold/);
    expect(() =>
      calculateCollateral({
        ...common,
        mode: "health",
        targetHealthFactor: "0.9",
      }),
    ).toThrow(/from 1 through 10/);
    const exactlyCritical = calculateCollateral({
      ...common,
      mode: "health",
      collateral: "1250",
      targetHealthFactor: "1",
    });
    expect(field(exactlyCritical, "healthFactor")).toBe("1000000000000000000");
    const overDebt = calculateCollateral({
      ...common,
      mode: "health",
      collateral: "500",
    });
    expect(field(overDebt, "additionalBorrowHeadroom")).toBe("0");
    expect(field(overDebt, "equity")).toBe("-50000");
  });
  it("preserves monotone headroom and the withdrawal inequality over bounded raw inputs", () => {
    let previous = -1n;
    for (let whole = 1000; whole <= 3000; whole += 37) {
      const c = calculateCollateral({
        ...common,
        mode: "health",
        collateral: String(whole),
        debt: "500",
        targetHealthFactor: "1.2",
      });
      const headroom = BigInt(field(c, "additionalBorrowHeadroom")!);
      expect(headroom).toBeGreaterThanOrEqual(previous);
      previous = headroom;
      const plan = calculateCollateral({
        ...common,
        mode: "adjust",
        collateral: String(whole),
        debt: "500",
        targetHealthFactor: "1.2",
      });
      const remaining =
        BigInt(whole * 100) - BigInt(field(plan, "maximumSafeWithdrawal")!);
      expect(remaining * 7500n).toBeGreaterThanOrEqual(50000n * 10000n);
      expect(remaining * 8000n * 10n ** 18n).toBeGreaterThanOrEqual(
        50000n * 10000n * 12n * 10n ** 17n,
      );
      if (BigInt(field(plan, "maximumSafeWithdrawal")!) > 0n) {
        const oneLess = remaining - 1n;
        expect(
          oneLess * 7500n < 50000n * 10000n ||
            oneLess * 8000n * 10n ** 18n < 50000n * 10000n * 12n * 10n ** 17n,
        ).toBe(true);
      }
    }
  });
});
