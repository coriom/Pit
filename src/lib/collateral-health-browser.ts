import { runAlTool } from "./al-tool-contracts";
import {
  collateralReportJSON,
  type CollateralInput,
  type CollateralResult,
} from "./collateral-health";
import {
  download,
  field,
  input,
  number,
  render,
  setSample,
} from "./al-browser";

const root = document.querySelector<HTMLElement>("[data-al-collateral]")!;
const form = root.querySelector<HTMLFormElement>("[data-al-form]")!;
const mode = root.querySelector<HTMLSelectElement>("[data-mode]")!;
const error = root.querySelector<HTMLElement>("[data-error]")!;
let current: CollateralResult | null = null;
const panel = (name: string) =>
  root.querySelector<HTMLElement>(`[data-panel="${name}"]`)!;
const invalidate = () => {
  current = null;
  root.querySelector<HTMLElement>("[data-result]")!.hidden = true;
  error.hidden = true;
  error.textContent = "";
};
const showMode = () => {
  for (const name of ["health", "adjust", "shock"])
    panel(name).hidden = mode.value !== name;
  invalidate();
};
mode.addEventListener("change", showMode);
form.addEventListener("input", invalidate);
form.addEventListener("change", invalidate);
root
  .querySelector<HTMLButtonElement>("[data-sample]")!
  .addEventListener("click", () => {
    const examples: Record<string, Record<string, string>> = {
      health: { collateral: "2000", debt: "1000", targetHealthFactor: "1.3" },
      adjust: { collateral: "1500", debt: "1000", targetHealthFactor: "1.5" },
      shock: { collateral: "2000", debt: "1000", targetHealthFactor: "1.3" },
    };
    setSample(form, {
      currency: "USDmanual",
      decimals: "2",
      maxLtvBps: "7500",
      liquidationThresholdBps: "8000",
      ...examples[mode.value],
    });
    setSample(panel("shock"), { collateralShockBps: "-4000" });
    showMode();
  });
const read = (): CollateralInput => {
  const common = {
    currency: input(form, "currency"),
    decimals: number(form, "decimals"),
    collateral: input(form, "collateral"),
    debt: input(form, "debt"),
    maxLtvBps: input(form, "maxLtvBps"),
    liquidationThresholdBps: input(form, "liquidationThresholdBps"),
    targetHealthFactor: input(form, "targetHealthFactor"),
  };
  if (mode.value === "health" || mode.value === "adjust")
    return { ...common, mode: mode.value };
  if (mode.value === "shock")
    return {
      ...common,
      mode: "shock",
      collateralShockBps: input(panel("shock"), "collateralShockBps"),
    };
  throw Error("Unsupported collateral mode.");
};
const labels: Record<string, string> = {
  collateralValue: "Current collateral value",
  debtValue: "Current debt value",
  ltv: "Current LTV",
  healthFactor: "Current health factor",
  maxLtvDebtCeiling: "Maximum LTV debt ceiling",
  targetHealthDebtCeiling: "Target-HF debt ceiling",
  selectedDebtCeiling: "Stricter modeled debt ceiling",
  additionalBorrowHeadroom: "Theoretical additional borrow headroom",
  equity: "Collateral equity",
  distanceFromMaxLtvPercent: "Distance from maximum LTV",
  grossExposureLeverage: "Gross exposure / equity",
  minimumRepayment: "Minimum debt repayment",
  ltvAfterRepayment: "LTV after repayment",
  healthFactorAfterRepayment: "HF after repayment",
  minimumCollateralAddition: "Minimum collateral value addition",
  ltvAfterAddition: "LTV after addition",
  healthFactorAfterAddition: "HF after addition",
  maximumSafeWithdrawal: "Maximum safe collateral-value withdrawal",
  ltvAfterWithdrawal: "LTV after withdrawal",
  healthFactorAfterWithdrawal: "HF after withdrawal",
  shockedCollateralValue: "Collateral value after shock",
  ltvAfterShock: "LTV after shock",
  healthFactorAfterShock: "HF after shock",
  criticalCollateralAtHealthOne: "Collateral needed for HF = 1",
  collateralNeededForTarget: "Collateral needed for target HF and max LTV",
  distanceToHealthOnePercent: "Current collateral-value drop to HF = 1",
  distanceToTargetPercent: "Current distance to selected target",
};
form.addEventListener("submit", (event) => {
  event.preventDefault();
  invalidate();
  try {
    const result = runAlTool("collateral-health", read());
    if (result.status === "ERROR") throw Error(result.error.message);
    current = result.output;
    render(
      root,
      current,
      mode.value === "health"
        ? "additionalBorrowHeadroom"
        : mode.value === "adjust"
          ? "minimumRepayment"
          : "healthFactorAfterShock",
      labels,
    );
    const breachList = root.querySelector<HTMLElement>("[data-breaches]")!;
    breachList.replaceChildren();
    for (const message of current.breaches) {
      const item = document.createElement("li");
      item.textContent = `MODELED BREACH — ${message}`;
      breachList.append(item);
    }
    // A missing HF for zero debt or zero LT remains explicitly not applicable.
    if (mode.value === "shock" && !field(current, "healthFactorAfterShock"))
      root.querySelector<HTMLElement>("[data-primary]")!.textContent =
        "Health factor not applicable with zero debt.";
  } catch (cause) {
    error.textContent =
      cause instanceof Error ? cause.message : "Invalid manual scenario.";
    error.hidden = false;
  }
});
root
  .querySelector<HTMLButtonElement>("[data-download]")!
  .addEventListener("click", () => {
    if (current)
      download("pit-collateral-health.json", collateralReportJSON(current));
  });
