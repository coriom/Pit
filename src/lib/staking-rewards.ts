/** Manual staking economics only: no provider, clock, wallet or transaction. */
import {
  AK_MAX_DAYS,
  AK_MAX_PERIODS,
  BPS,
  SCALE,
  bounded,
  bps,
  ceilDiv,
  decimals,
  fail,
  field,
  pctField,
  positiveRate,
  token,
  tokenField,
  tokenLabel,
  whole,
  type AkField,
} from "./ak-math";

export const STAKING_VERSION = "pit.staking-rewards.local.v1" as const;
export type StakingInput =
  | {
      mode: "projection";
      tokenLabel: string;
      decimals: number;
      stake: string;
      grossAprBps: string;
      elapsedDays: number;
      commissionBps: string;
      otherFee: string;
      otherFeeCoverage: "none" | "separate" | "unknown";
    }
  | {
      mode: "claim";
      tokenLabel: string;
      decimals: number;
      grossReward: string;
      commissionBps: string;
      commissionCoverage: "not-deducted" | "already-deducted" | "unknown";
      claimFee: string;
      feeDecimals: number;
      feeAssetLabel: string;
      feeAssetRelation: "same-confirmed" | "different" | "unknown";
      rewardPerFeeAsset: string;
      feeCoverage: "separate" | "already-deducted" | "unknown";
      dailyGrossAccrual: string;
    }
  | {
      mode: "restake";
      tokenLabel: string;
      decimals: number;
      stake: string;
      grossAprBps: string;
      commissionBps: string;
      slashBps: string;
      years: number;
      periodsPerYear: number;
      sameAssetConfirmed: boolean;
      restakeFeePerPeriod: string;
      feeCoverage: "none" | "separate" | "already-reflected-in-apr" | "unknown";
    };
export type StakingResult = {
  calculationVersion: typeof STAKING_VERSION;
  mode: StakingInput["mode"];
  status: "complete" | "incomplete";
  reasons: string[];
  input: StakingInput;
  tokenLabel: string;
  decimals: number;
  fields: AkField[];
  assessment: "profitable" | "break-even" | "unprofitable" | "not-evaluated";
  assumptions: string[];
  limitations: string[];
};
const result = (
  input: StakingInput,
  name: string,
  places: number,
  fields: AkField[],
  reasons: string[],
  assessment: StakingResult["assessment"] = "not-evaluated",
): StakingResult => ({
  calculationVersion: STAKING_VERSION,
  mode: input.mode,
  status: reasons.length ? "incomplete" : "complete",
  reasons,
  input,
  tokenLabel: name,
  decimals: places,
  fields,
  assessment,
  assumptions: [
    "All token balances, rates, identities and costs are manually supplied.",
    "Simple reward accrual uses ACT/365 fixed; nominal APR is not effective APY.",
  ],
  limitations: [
    "No current protocol rate, actual claimability, validator risk, tax conclusion or staking transaction.",
    "Manual token labels do not establish asset identity or an exchange rate.",
  ],
});
const reward = (principal: bigint, rateBps: bigint, days: number) =>
  bounded(
    (principal * rateBps * BigInt(days)) / (BPS * 365n),
    "Gross modeled reward",
  );
const commission = (gross: bigint, commissionBps: bigint) =>
  ceilDiv(gross * commissionBps, BPS);
const money = (name: string, raw: bigint, places: number, tokenName: string) =>
  tokenField(name, raw, places, tokenName);

export function calculateStaking(input: StakingInput): StakingResult {
  const name = tokenLabel(input.tokenLabel),
    places = decimals(input.decimals);
  if (input.mode === "projection") {
    const stake = token(input.stake, places, "Staked amount");
    const apr = bps(input.grossAprBps, "Gross nominal APR");
    const days = whole(input.elapsedDays, "Elapsed days", 0, AK_MAX_DAYS);
    const cut = bps(input.commissionBps, "Commission");
    if (!["none", "separate", "unknown"].includes(input.otherFeeCoverage))
      fail("Unsupported other-fee coverage.");
    const otherFee =
      input.otherFeeCoverage === "none"
        ? 0n
        : input.otherFee.trim()
          ? token(input.otherFee, places, "Other same-token fee")
          : null;
    if (
      input.otherFeeCoverage === "none" &&
      input.otherFee.trim() &&
      token(input.otherFee, places, "Other fee") !== 0n
    )
      fail("A nonzero other fee cannot have none coverage.");
    const gross = reward(stake, apr, days);
    const operator = commission(gross, cut);
    const net = gross - operator;
    const fields = [
      money("stake", stake, places, name),
      money("grossRewards", gross, places, name),
      money("operatorCommission", operator, places, name),
      money("netRewardsBeforeOtherCosts", net, places, name),
    ];
    const reasons: string[] = [];
    if (stake > 0n) fields.push(pctField("netPeriodReturnPercent", net, stake));
    else reasons.push("A zero stake has no defined percentage reward rate.");
    if (input.otherFeeCoverage === "unknown" || otherFee === null)
      reasons.push(
        "Additional fee coverage or amount is unknown; final net reward is unavailable.",
      );
    else
      fields.push(
        money("netRewardsAfterKnownCosts", net - otherFee, places, name),
      );
    return result(input, name, places, fields, reasons);
  }
  if (input.mode === "claim") {
    const gross = token(input.grossReward, places, "Gross modeled reward");
    const cut = bps(input.commissionBps, "Commission");
    if (
      !["not-deducted", "already-deducted", "unknown"].includes(
        input.commissionCoverage,
      ) ||
      !["separate", "already-deducted", "unknown"].includes(
        input.feeCoverage,
      ) ||
      !["same-confirmed", "different", "unknown"].includes(
        input.feeAssetRelation,
      )
    )
      fail("Unsupported claim coverage or asset relation.");
    decimals(input.feeDecimals);
    tokenLabel(input.feeAssetLabel);
    const fee = token(input.claimFee, input.feeDecimals, "Claim fee");
    const fields = [money("statedReward", gross, places, name)];
    const reasons: string[] = [];
    let postCommission: bigint | null = null;
    if (input.commissionCoverage === "unknown")
      reasons.push("Commission coverage is unknown.");
    else {
      const cutAmount =
        input.commissionCoverage === "not-deducted"
          ? commission(gross, cut)
          : 0n;
      postCommission = gross - cutAmount;
      fields.push(
        money("commissionDeductedNow", cutAmount, places, name),
        money("afterCommission", postCommission, places, name),
      );
    }
    let cost: bigint | null = null;
    if (input.feeCoverage === "unknown")
      reasons.push("Claim-fee coverage is unknown.");
    else if (input.feeCoverage === "already-deducted" || fee === 0n) cost = 0n;
    else if (input.feeAssetRelation === "same-confirmed") {
      if (input.feeDecimals !== places)
        fail("A confirmed same asset must use the same decimals.");
      cost = fee;
    } else if (
      input.feeAssetRelation === "different" &&
      input.rewardPerFeeAsset.trim()
    ) {
      const rate = positiveRate(
        input.rewardPerFeeAsset,
        "Reward tokens per fee token",
      );
      cost = bounded(
        ceilDiv(
          fee * rate * 10n ** BigInt(places),
          10n ** BigInt(input.feeDecimals) * SCALE,
        ),
        "Converted claim fee",
      );
    } else
      reasons.push(
        "A separate different-token claim fee needs an explicit positive conversion rate and asset relation.",
      );
    if (cost !== null)
      fields.push(money("separateClaimCostInRewardToken", cost, places, name));
    let assessment: StakingResult["assessment"] = "not-evaluated";
    if (postCommission !== null && cost !== null) {
      const net = postCommission - cost;
      fields.push(money("netAfterClaimCost", net, places, name));
      assessment =
        net > 0n ? "profitable" : net < 0n ? "unprofitable" : "break-even";
      // The threshold is explicitly *gross before commission*, even when the
      // user's currently stated balance already has commission deducted.
      const keptBps = BPS - cut;
      if (keptBps === 0n && cost > 0n)
        reasons.push(
          "100% commission makes claim-cost break-even unreachable.",
        );
      else {
        const minimum = keptBps === 0n ? 0n : ceilDiv(cost * BPS, keptBps);
        fields.push(money("minimumGrossForKnownCost", minimum, places, name));
        if (input.dailyGrossAccrual.trim()) {
          const daily = token(
            input.dailyGrossAccrual,
            places,
            "Gross reward per day",
          );
          if (daily === 0n && minimum > 0n)
            reasons.push(
              "Zero daily accrual cannot reach a positive claim-cost break-even.",
            );
          else
            fields.push(
              field(
                "wholeDaysToBreakEven",
                daily === 0n ? 0n : ceilDiv(minimum, daily),
                0,
                "whole ACT/365 days under constant manual accrual",
              ),
            );
        }
      }
    }
    return result(input, name, places, fields, reasons, assessment);
  }
  if (input.mode === "restake") {
    if (input.sameAssetConfirmed !== true)
      fail("Restaking requires explicit same-asset confirmation.");
    const stake = token(input.stake, places, "Starting stake");
    const apr = bps(input.grossAprBps, "Gross nominal APR");
    const cut = bps(input.commissionBps, "Commission");
    const slash = bps(input.slashBps, "Hypothetical principal slash");
    const years = whole(input.years, "Whole years", 1, 10);
    const frequency = whole(input.periodsPerYear, "Periods per year", 1, 365);
    const periods = years * frequency;
    if (periods > AK_MAX_PERIODS)
      fail("Restaking schedule exceeds the period limit.");
    if (
      !["none", "separate", "already-reflected-in-apr", "unknown"].includes(
        input.feeCoverage,
      )
    )
      fail("Unsupported restaking fee coverage.");
    const fee = token(
      input.restakeFeePerPeriod,
      places,
      "Restaking fee per period",
    );
    if (input.feeCoverage === "none" && fee !== 0n)
      fail("Nonzero cost cannot have none coverage.");
    const slashAmount = ceilDiv(stake * slash, BPS);
    const base = stake - slashAmount;
    const simpleGross = bounded(
      (base * apr * BigInt(years)) / BPS,
      "Simple gross rewards",
    );
    const simpleCommission = commission(simpleGross, cut);
    const fields = [
      money("startingPrincipal", stake, places, name),
      money("hypotheticalPrincipalSlash", slashAmount, places, name),
      money("principalAfterSlash", base, places, name),
      money(
        "simpleNetRewardsBeforeRestakeCosts",
        simpleGross - simpleCommission,
        places,
        name,
      ),
      money(
        "simpleEndingBeforeRestakeCosts",
        base + simpleGross - simpleCommission,
        places,
        name,
      ),
    ];
    const reasons: string[] = [];
    if (input.feeCoverage === "unknown")
      reasons.push("Per-period restaking cost coverage is unknown.");
    else {
      let current = base,
        earned = 0n,
        costs = 0n;
      for (let i = 0; i < periods; i++) {
        const gross = bounded(
          (current * apr) / (BPS * BigInt(frequency)),
          "Periodic gross rewards",
        );
        const net = gross - commission(gross, cut);
        const separateFee = input.feeCoverage === "separate" ? fee : 0n;
        if (separateFee > net) {
          reasons.push(
            `Period ${i + 1}: separate restaking cost exceeds the earned same-token reward; principal funding is not assumed.`,
          );
          break;
        }
        earned = bounded(earned + net, "Accumulated rewards");
        costs = bounded(costs + separateFee, "Accumulated restaking costs");
        current = bounded(current + net - separateFee, "Restaked principal");
      }
      if (!reasons.length)
        fields.push(
          money("restakedRewardsBeforeCosts", earned, places, name),
          money("separateRestakingCosts", costs, places, name),
          money("restakedEndingValue", current, places, name),
          money("restakedGrowthAfterCosts", current - base, places, name),
        );
    }
    return result(input, name, places, fields, reasons);
  }
  return fail("Unsupported staking mode.");
}

export const stakingReportJSON = (value: StakingResult) =>
  JSON.stringify(
    {
      ...value,
      simulated: true,
      disclaimer:
        "Manual reward scenario only; no actual APR, claimability, slash probability or staking transaction is verified.",
    },
    null,
    2,
  ) + "\n";
