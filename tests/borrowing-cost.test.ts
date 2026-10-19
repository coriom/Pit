import { describe, expect, it } from "vitest";
import {
  borrowingReportJSON,
  calculateBorrowing,
} from "../src/lib/borrowing-cost";
const common = {
  currency: "USDmanual",
  decimals: 2,
  principal: "1000",
  borrowAprBps: "1200",
};
const field = (result: ReturnType<typeof calculateBorrowing>, name: string) =>
  result.fields.find((item) => item.name === name)?.raw;
describe("manual borrowing economics", () => {
  it("separates ACT/365 simple interest and exact rational monthly compounding", () => {
    const r = calculateBorrowing({
      ...common,
      mode: "growth",
      elapsedDays: 365,
      periodsPerYear: 12,
      elapsedPeriods: 12,
    });
    expect(field(r, "simpleInterest")).toBe("12000");
    expect(field(r, "simpleEndingDebt")).toBe("112000");
    expect(field(r, "compoundedEndingDebt")).toBe("112683");
    expect(field(r, "compoundedFinancingCost")).toBe("12683");
    expect(field(r, "additionalCompoundingCostVersusSimple")).toBe("683");
    expect(borrowingReportJSON(r)).toContain('"compoundedEndingDebt"');
  });
  it("allocates end-period payments and caps the final payment", () => {
    const r = calculateBorrowing({
      ...common,
      mode: "repayment",
      periodsPerYear: 12,
      horizonPeriods: 20,
      fixedPayment: "100",
    });
    expect(r.schedule[0]).toMatchObject({
      interestRaw: "1000",
      principalPaidRaw: "9000",
      endingDebtRaw: "91000",
    });
    expect(r.schedule[1]).toMatchObject({
      interestRaw: "910",
      principalPaidRaw: "9090",
      endingDebtRaw: "81910",
    });
    expect(r.assessment).toBe("paid-off");
    expect(r.payoffPeriod).toBe(11);
    expect(BigInt(field(r, "endingDebt")!)).toBe(0n);
    expect(field(r, "paymentConservation")).toBe("0");
    expect(BigInt(r.schedule.at(-1)!.paymentRaw)).toBeLessThan(10000n);
  });
  it("identifies negative amortization and no payoff", () => {
    const r = calculateBorrowing({
      ...common,
      mode: "repayment",
      periodsPerYear: 12,
      horizonPeriods: 2,
      fixedPayment: "5",
    });
    expect(r.status).toBe("incomplete");
    expect(r.assessment).toBe("negative-amortization");
    expect(r.payoffPeriod).toBeNull();
    expect(BigInt(field(r, "endingDebt")!)).toBeGreaterThan(100000n);
  });
  it("keeps known, unknown and embedded carry costs distinct", () => {
    const input = {
      currency: "USDmanual",
      decimals: 2,
      principal: "500",
      borrowAprBps: "800",
      mode: "carry" as const,
      elapsedDays: 365,
      investmentYieldBps: "1200",
      otherCosts: "0",
      costCoverage: "none" as const,
    };
    const r = calculateBorrowing(input);
    expect(field(r, "investmentReturn")).toBe("6000");
    expect(field(r, "borrowingCost")).toBe("4000");
    expect(field(r, "netCarryAfterKnownCosts")).toBe("2000");
    expect(field(r, "minimumWholeYieldBpsForBreakEven")).toBe("800");
    const unknown = calculateBorrowing({
      ...input,
      otherCosts: "",
      costCoverage: "unknown",
    });
    expect(unknown.status).toBe("incomplete");
    expect(field(unknown, "netCarryAfterKnownCosts")).toBeUndefined();
    const embedded = calculateBorrowing({
      ...input,
      otherCosts: "10",
      costCoverage: "embedded",
    });
    expect(field(embedded, "netCarryAfterKnownCosts")).toBe("2000");
    const negative = calculateBorrowing({
      ...input,
      investmentYieldBps: "-1000",
    });
    expect(negative.assessment).toBe("negative-carry");
    expect(field(negative, "investmentReturn")).toBe("-5000");
  });
  it("rejects malformed or impossible inputs", () => {
    expect(() =>
      calculateBorrowing({
        ...common,
        mode: "growth",
        elapsedDays: 1,
        periodsPerYear: 12,
        elapsedPeriods: 601,
      }),
    ).toThrow(/600/);
    expect(() =>
      calculateBorrowing({
        ...common,
        mode: "growth",
        elapsedDays: 1,
        periodsPerYear: 12,
        elapsedPeriods: 1,
        principal: "1e3",
      }),
    ).toThrow();
    expect(() =>
      calculateBorrowing({
        ...common,
        mode: "carry",
        elapsedDays: 365,
        investmentYieldBps: "1",
        otherCosts: "5",
        costCoverage: "none",
      }),
    ).toThrow(/nonzero cost/);
    const zero = calculateBorrowing({
      ...common,
      mode: "carry",
      elapsedDays: 0,
      investmentYieldBps: "1200",
      otherCosts: "0",
      costCoverage: "none",
    });
    expect(zero.status).toBe("incomplete");
  });
  it("conserves debt across bounded payment and rate examples", () => {
    for (const apr of ["0", "100", "800", "1200", "10000"]) {
      for (const payment of ["0", "5", "100", "1000"]) {
        const r = calculateBorrowing({
          ...common,
          mode: "repayment",
          borrowAprBps: apr,
          periodsPerYear: 12,
          horizonPeriods: 8,
          fixedPayment: payment,
        });
        let expectedOpening = 100000n;
        let interest = 0n,
          paid = 0n;
        for (const row of r.schedule) {
          const opening = BigInt(row.openingDebtRaw),
            cost = BigInt(row.interestRaw),
            actualPayment = BigInt(row.paymentRaw),
            ending = BigInt(row.endingDebtRaw);
          expect(opening).toBe(expectedOpening);
          expect(ending).toBeGreaterThanOrEqual(0n);
          expect(ending).toBe(opening + cost - actualPayment);
          expect(actualPayment).toBeLessThanOrEqual(opening + cost);
          expectedOpening = ending;
          interest += cost;
          paid += actualPayment;
        }
        expect(BigInt(field(r, "endingDebt")!)).toBe(100000n + interest - paid);
      }
    }
  });
});
