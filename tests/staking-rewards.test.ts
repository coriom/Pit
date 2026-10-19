import { describe, expect, it } from "vitest";
import {
  calculateStaking,
  stakingReportJSON,
  type StakingInput,
} from "../src/lib/staking-rewards";
const projection: StakingInput = {
  mode: "projection",
  tokenLabel: "TOKEN",
  decimals: 6,
  stake: "1000",
  grossAprBps: "1200",
  elapsedDays: 365,
  commissionBps: "1000",
  otherFee: "0",
  otherFeeCoverage: "none",
};
const claim: StakingInput = {
  mode: "claim",
  tokenLabel: "TOKEN",
  decimals: 6,
  grossReward: "10",
  commissionBps: "1000",
  commissionCoverage: "not-deducted",
  claimFee: "0.5",
  feeDecimals: 6,
  feeAssetLabel: "TOKEN",
  feeAssetRelation: "same-confirmed",
  rewardPerFeeAsset: "",
  feeCoverage: "separate",
  dailyGrossAccrual: "0.25",
};
const restake: StakingInput = {
  mode: "restake",
  tokenLabel: "TOKEN",
  decimals: 6,
  stake: "1000",
  grossAprBps: "1200",
  commissionBps: "0",
  slashBps: "200",
  years: 1,
  periodsPerYear: 12,
  sameAssetConfirmed: true,
  restakeFeePerPeriod: "0",
  feeCoverage: "none",
};
const display = (result: ReturnType<typeof calculateStaking>, name: string) =>
  result.fields.find((item) => item.name === name)!.display;

describe("manual staking scenarios", () => {
  it("projects ACT/365 simple gross, commission and net without calling APR APY", () => {
    const result = calculateStaking(projection);
    expect(display(result, "grossRewards")).toBe("120");
    expect(display(result, "operatorCommission")).toBe("12");
    expect(display(result, "netRewardsBeforeOtherCosts")).toBe("108");
    expect(display(result, "netPeriodReturnPercent")).toBe("10.8");
    expect(JSON.parse(stakingReportJSON(result)).fields[1].raw).toBe(
      "120000000",
    );
  });
  it("separates other-fee coverage and leaves unknown cost incomplete", () => {
    expect(
      display(
        calculateStaking({
          ...projection,
          otherFee: "2",
          otherFeeCoverage: "separate",
        }),
        "netRewardsAfterKnownCosts",
      ),
    ).toBe("106");
    const unknown = calculateStaking({
      ...projection,
      otherFee: "",
      otherFeeCoverage: "unknown",
    });
    expect(unknown.status).toBe("incomplete");
    expect(
      unknown.fields.some((item) => item.name === "netRewardsAfterKnownCosts"),
    ).toBe(false);
    expect(calculateStaking({ ...projection, stake: "0" }).status).toBe(
      "incomplete",
    );
    expect(
      display(
        calculateStaking({ ...projection, commissionBps: "10000" }),
        "netRewardsBeforeOtherCosts",
      ),
    ).toBe("0");
  });
  it("nets claim commission and same-token cost exactly, with a bounded wait", () => {
    const result = calculateStaking(claim);
    expect(display(result, "netAfterClaimCost")).toBe("8.5");
    expect(result.assessment).toBe("profitable");
    expect(display(result, "minimumGrossForKnownCost")).toBe("0.555556");
    expect(display(result, "wholeDaysToBreakEven")).toBe("3");
    const minimum = calculateStaking({ ...claim, grossReward: "0.555556" });
    const short = calculateStaking({ ...claim, grossReward: "0.555555" });
    expect(minimum.assessment).toBe("break-even");
    expect(short.assessment).toBe("unprofitable");
    expect(
      display(
        calculateStaking({ ...claim, commissionCoverage: "already-deducted" }),
        "netAfterClaimCost",
      ),
    ).toBe("9.5");
    expect(
      display(
        calculateStaking({ ...claim, commissionCoverage: "already-deducted" }),
        "minimumGrossForKnownCost",
      ),
    ).toBe("0.555556");
    expect(
      display(
        calculateStaking({ ...claim, grossReward: "0.1" }),
        "netAfterClaimCost",
      ),
    ).toBe("-0.41");
  });
  it("requires an explicit conversion for a different fee asset", () => {
    const input: StakingInput = {
      ...claim,
      feeAssetRelation: "different",
      feeAssetLabel: "GAS",
      feeDecimals: 18,
      claimFee: "0.01",
      rewardPerFeeAsset: "",
    };
    expect(calculateStaking(input).status).toBe("incomplete");
    expect(
      display(
        calculateStaking({ ...input, rewardPerFeeAsset: "50" }),
        "netAfterClaimCost",
      ),
    ).toBe("8.5");
    expect(
      calculateStaking({ ...claim, commissionBps: "10000", claimFee: "1" })
        .status,
    ).toBe("incomplete");
    expect(calculateStaking({ ...claim, dailyGrossAccrual: "0" }).status).toBe(
      "incomplete",
    );
  });
  it("applies a principal slash separately from rewards and same-asset restaking", () => {
    const result = calculateStaking(restake);
    expect(display(result, "hypotheticalPrincipalSlash")).toBe("20");
    expect(display(result, "principalAfterSlash")).toBe("980");
    expect(display(result, "simpleNetRewardsBeforeRestakeCosts")).toBe("117.6");
    expect(
      BigInt(
        result.fields.find((item) => item.name === "restakedEndingValue")!.raw,
      ),
    ).toBeGreaterThan(1_097_600_000n);
    expect(() =>
      calculateStaking({ ...restake, sameAssetConfirmed: false }),
    ).toThrow(/same-asset/);
    expect(
      calculateStaking({
        ...restake,
        restakeFeePerPeriod: "100",
        feeCoverage: "separate",
      }).status,
    ).toBe("incomplete");
  });
  it("bounds rates, precision and schedule complexity", () => {
    expect(() =>
      calculateStaking({ ...projection, grossAprBps: "-1" }),
    ).toThrow();
    expect(() =>
      calculateStaking({ ...projection, elapsedDays: 36501 }),
    ).toThrow();
    expect(() =>
      calculateStaking({ ...projection, stake: "1.0000001" }),
    ).toThrow();
    expect(() =>
      calculateStaking({
        ...projection,
        otherFeeCoverage: "separate",
        otherFee: "-1",
      }),
    ).toThrow();
    expect(
      calculateStaking({ ...claim, grossReward: "0", claimFee: "0" })
        .assessment,
    ).toBe("break-even");
    expect(
      display(
        calculateStaking({ ...restake, slashBps: "10000" }),
        "principalAfterSlash",
      ),
    ).toBe("0");
  });
});
