import { runAkTool } from "./ak-tool-contracts";
import {
  stakingReportJSON,
  type StakingInput,
  type StakingResult,
} from "./staking-rewards";

const root = document.querySelector<HTMLElement>("[data-ak-staking]")!;
const form = root.querySelector<HTMLFormElement>("[data-ak-form]")!;
const mode = root.querySelector<HTMLSelectElement>("[data-mode]")!;
const result = root.querySelector<HTMLElement>("[data-result]")!;
const error = root.querySelector<HTMLElement>("[data-error]")!;
let current: StakingResult | null = null;
const panel = (name: string) =>
  root.querySelector<HTMLElement>(`[data-panel="${name}"]`)!;
const input = (area: ParentNode, name: string) =>
  area.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!
    .value;
const number = (area: ParentNode, name: string) => {
  const text = input(area, name);
  if (!/^(?:0|[1-9]\d*)$/.test(text))
    throw Error(`${name} requires a whole number; blank is not zero.`);
  const value = Number(text);
  if (!Number.isSafeInteger(value))
    throw Error(`${name} exceeds the supported whole-number range.`);
  return value;
};
const invalidate = () => {
  current = null;
  result.hidden = true;
  error.hidden = true;
  error.textContent = "";
};
const showMode = () => {
  for (const name of ["projection", "claim", "restake"])
    panel(name).hidden = mode.value !== name;
  const claim = panel("claim");
  claim.querySelector<HTMLElement>("[data-conversion]")!.hidden =
    mode.value !== "claim" || input(claim, "feeAssetRelation") !== "different";
  invalidate();
};
mode.addEventListener("change", showMode);
panel("claim")
  .querySelector<HTMLSelectElement>('[name="feeAssetRelation"]')!
  .addEventListener("change", showMode);
form.addEventListener("input", invalidate);
form.addEventListener("change", invalidate);
root
  .querySelector<HTMLButtonElement>("[data-sample]")!
  .addEventListener("click", () => {
    const common = { tokenLabel: "TOKEN", decimals: "6" };
    const examples: Record<string, Record<string, string>> = {
      projection: {
        stake: "1000",
        grossAprBps: "1200",
        elapsedDays: "365",
        commissionBps: "1000",
        otherFee: "0",
        otherFeeCoverage: "none",
      },
      claim: {
        grossReward: "10",
        commissionBps: "1000",
        commissionCoverage: "not-deducted",
        claimFee: "0.5",
        feeDecimals: "6",
        feeAssetLabel: "TOKEN",
        feeAssetRelation: "same-confirmed",
        rewardPerFeeAsset: "",
        feeCoverage: "separate",
        dailyGrossAccrual: "0.25",
      },
      restake: {
        stake: "1000",
        grossAprBps: "1200",
        commissionBps: "0",
        slashBps: "200",
        years: "1",
        periodsPerYear: "12",
        restakeFeePerPeriod: "0",
        feeCoverage: "none",
      },
    };
    for (const [name, value] of Object.entries(common))
      form.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = value;
    for (const [name, value] of Object.entries(examples[mode.value]))
      panel(mode.value).querySelector<HTMLInputElement | HTMLSelectElement>(
        `[name="${name}"]`,
      )!.value = value;
    panel("restake").querySelector<HTMLInputElement>(
      '[name="sameAssetConfirmed"]',
    )!.checked = true;
    showMode();
  });
const read = (): StakingInput => {
  const tokenLabel = input(form, "tokenLabel"),
    decimals = number(form, "decimals");
  if (mode.value === "projection") {
    const area = panel("projection");
    return {
      mode: "projection",
      tokenLabel,
      decimals,
      stake: input(area, "stake"),
      grossAprBps: input(area, "grossAprBps"),
      elapsedDays: number(area, "elapsedDays"),
      commissionBps: input(area, "commissionBps"),
      otherFee: input(area, "otherFee"),
      otherFeeCoverage: input(area, "otherFeeCoverage") as
        "none" | "separate" | "unknown",
    };
  }
  if (mode.value === "claim") {
    const area = panel("claim");
    return {
      mode: "claim",
      tokenLabel,
      decimals,
      grossReward: input(area, "grossReward"),
      commissionBps: input(area, "commissionBps"),
      commissionCoverage: input(area, "commissionCoverage") as
        "not-deducted" | "already-deducted" | "unknown",
      claimFee: input(area, "claimFee"),
      feeDecimals: number(area, "feeDecimals"),
      feeAssetLabel: input(area, "feeAssetLabel"),
      feeAssetRelation: input(area, "feeAssetRelation") as
        "same-confirmed" | "different" | "unknown",
      rewardPerFeeAsset: input(area, "rewardPerFeeAsset"),
      feeCoverage: input(area, "feeCoverage") as
        "separate" | "already-deducted" | "unknown",
      dailyGrossAccrual: input(area, "dailyGrossAccrual"),
    };
  }
  if (mode.value === "restake") {
    const area = panel("restake");
    return {
      mode: "restake",
      tokenLabel,
      decimals,
      stake: input(area, "stake"),
      grossAprBps: input(area, "grossAprBps"),
      commissionBps: input(area, "commissionBps"),
      slashBps: input(area, "slashBps"),
      years: number(area, "years"),
      periodsPerYear: number(area, "periodsPerYear"),
      sameAssetConfirmed: area.querySelector<HTMLInputElement>(
        '[name="sameAssetConfirmed"]',
      )!.checked,
      restakeFeePerPeriod: input(area, "restakeFeePerPeriod"),
      feeCoverage: input(area, "feeCoverage") as
        "none" | "separate" | "already-reflected-in-apr" | "unknown",
    };
  }
  throw Error("Unsupported mode.");
};
const names: Record<string, string> = {
  stake: "Staked amount",
  grossRewards: "Gross modeled rewards",
  operatorCommission: "Validator commission",
  netRewardsBeforeOtherCosts: "Net rewards before other costs",
  netPeriodReturnPercent: "Net period return",
  netRewardsAfterKnownCosts: "Net after known costs",
  statedReward: "Stated reward balance",
  commissionDeductedNow: "Commission deducted now",
  afterCommission: "After commission",
  separateClaimCostInRewardToken: "Separate claim cost in reward-token units",
  netAfterClaimCost: "Net after claim cost",
  minimumGrossForKnownCost: "Minimum gross to cover known cost",
  wholeDaysToBreakEven: "Whole days to cover known cost",
  startingPrincipal: "Starting principal",
  hypotheticalPrincipalSlash: "Hypothetical principal slash",
  principalAfterSlash: "Principal after slash",
  simpleNetRewardsBeforeRestakeCosts:
    "Simple net rewards before restaking costs",
  simpleEndingBeforeRestakeCosts: "Simple ending before restaking costs",
  restakedRewardsBeforeCosts: "Restaked rewards before costs",
  separateRestakingCosts: "Separately paid restaking costs",
  restakedEndingValue: "Restaked ending value",
  restakedGrowthAfterCosts: "Restaked growth after costs",
};
form.addEventListener("submit", (event) => {
  event.preventDefault();
  invalidate();
  try {
    const response = runAkTool("staking-rewards", read());
    if (response.status === "ERROR") throw Error(response.error.message);
    current = response.output;
    result.querySelector<HTMLElement>("[data-status]")!.textContent =
      `${response.status} — illustrative manual scenario${current.assessment === "unprofitable" ? "; modeled claim cost exceeds reward" : current.assessment === "break-even" ? "; modeled claim exactly covers known cost" : ""}`;
    const primaryName =
      current.mode === "projection"
        ? "netRewardsAfterKnownCosts"
        : current.mode === "claim"
          ? "netAfterClaimCost"
          : "restakedEndingValue";
    const primary = current.fields.find((item) => item.name === primaryName);
    result.querySelector<HTMLElement>("[data-primary]")!.textContent = primary
      ? `${names[primaryName]}: ${primary.display} ${primary.unit}`
      : "Final outcome unavailable under the stated coverage.";
    const list = result.querySelector<HTMLElement>("[data-fields]")!;
    list.replaceChildren();
    for (const item of current.fields) {
      const line = document.createElement("div"),
        dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = names[item.name] ?? item.name;
      dd.textContent = `${item.display} ${item.unit}`;
      line.append(dt, dd);
      list.append(line);
    }
    const reasons = result.querySelector<HTMLElement>("[data-reasons]")!;
    reasons.replaceChildren();
    for (const reason of current.reasons) {
      const li = document.createElement("li");
      li.textContent = reason;
      reasons.append(li);
    }
    result.hidden = false;
  } catch (cause) {
    error.textContent =
      cause instanceof Error ? cause.message : "Invalid manual inputs.";
    error.hidden = false;
  }
});
root
  .querySelector<HTMLButtonElement>("[data-download]")!
  .addEventListener("click", () => {
    if (!current) return;
    const url = URL.createObjectURL(
      new Blob([stakingReportJSON(current)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "pit-staking-rewards-manual.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
