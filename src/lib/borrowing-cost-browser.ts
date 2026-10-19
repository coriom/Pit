import { runAlTool } from "./al-tool-contracts";
import {
  borrowingReportJSON,
  type BorrowingInput,
  type BorrowingResult,
} from "./borrowing-cost";
import { download, input, number, render, setSample } from "./al-browser";
import { formatRaw } from "./swap-cost";

const root = document.querySelector<HTMLElement>("[data-al-borrowing]")!;
const form = root.querySelector<HTMLFormElement>("[data-al-form]")!;
const mode = root.querySelector<HTMLSelectElement>("[data-mode]")!;
const error = root.querySelector<HTMLElement>("[data-error]")!;
let current: BorrowingResult | null = null;
const panel = (name: string) =>
  root.querySelector<HTMLElement>(`[data-panel="${name}"]`)!;
const invalidate = () => {
  current = null;
  root.querySelector<HTMLElement>("[data-result]")!.hidden = true;
  error.hidden = true;
  error.textContent = "";
};
const showMode = () => {
  for (const name of ["growth", "repayment", "carry"])
    panel(name).hidden = mode.value !== name;
  invalidate();
};
mode.addEventListener("change", showMode);
form.addEventListener("input", invalidate);
form.addEventListener("change", invalidate);
root
  .querySelector<HTMLButtonElement>("[data-sample]")!
  .addEventListener("click", () => {
    const common =
      mode.value === "carry"
        ? {
            currency: "USDmanual",
            decimals: "2",
            principal: "500",
            borrowAprBps: "800",
          }
        : {
            currency: "USDmanual",
            decimals: "2",
            principal: "1000",
            borrowAprBps: "1200",
          };
    setSample(form, common);
    if (mode.value === "growth")
      setSample(panel("growth"), {
        elapsedDays: "365",
        periodsPerYear: "12",
        elapsedPeriods: "12",
      });
    if (mode.value === "repayment")
      setSample(panel("repayment"), {
        periodsPerYear: "12",
        horizonPeriods: "20",
        fixedPayment: "100",
      });
    if (mode.value === "carry")
      setSample(panel("carry"), {
        elapsedDays: "365",
        investmentYieldBps: "1200",
        otherCosts: "0",
        costCoverage: "none",
      });
    showMode();
  });
const read = (): BorrowingInput => {
  const common = {
    currency: input(form, "currency"),
    decimals: number(form, "decimals"),
    principal: input(form, "principal"),
    borrowAprBps: input(form, "borrowAprBps"),
  };
  if (mode.value === "growth") {
    const area = panel("growth");
    return {
      ...common,
      mode: "growth",
      elapsedDays: number(area, "elapsedDays"),
      periodsPerYear: number(area, "periodsPerYear"),
      elapsedPeriods: number(area, "elapsedPeriods"),
    };
  }
  if (mode.value === "repayment") {
    const area = panel("repayment");
    return {
      ...common,
      mode: "repayment",
      periodsPerYear: number(area, "periodsPerYear"),
      horizonPeriods: number(area, "horizonPeriods"),
      fixedPayment: input(area, "fixedPayment"),
    };
  }
  if (mode.value === "carry") {
    const area = panel("carry");
    return {
      ...common,
      mode: "carry",
      elapsedDays: number(area, "elapsedDays"),
      investmentYieldBps: input(area, "investmentYieldBps"),
      otherCosts: input(area, "otherCosts"),
      costCoverage: input(area, "costCoverage") as
        "none" | "separate" | "embedded" | "unknown",
    };
  }
  throw Error("Unsupported borrowing mode.");
};
const labels: Record<string, string> = {
  borrowedPrincipal: "Borrowed principal",
  simpleInterest: "Simple interest, ACT/365",
  simpleEndingDebt: "Debt after simple interest",
  compoundedEndingDebt: "Debt after scheduled compounding",
  compoundedFinancingCost: "Compounded financing cost",
  additionalCompoundingCostVersusSimple: "Compounding cost minus simple cost",
  endingDebt: "Remaining modeled debt",
  cumulativeInterest: "Cumulative modeled interest",
  totalPayments: "Total payments",
  paymentConservation: "Debt conservation check",
  grossBorrowedExposure: "Gross borrowed capital exposed",
  investmentReturn: "Hypothetical investment return",
  borrowingCost: "Financing cost",
  grossCarryBeforeOtherCosts: "Carry before other costs",
  separateKnownCosts: "Separately paid known costs",
  netCarryAfterKnownCosts: "Net carry after known costs",
  minimumWholeYieldBpsForBreakEven:
    "Minimum whole-bps simple yield to cover known costs",
};
form.addEventListener("submit", (event) => {
  event.preventDefault();
  invalidate();
  try {
    const result = runAlTool("borrowing-cost", read());
    if (result.status === "ERROR") throw Error(result.error.message);
    current = result.output;
    render(
      root,
      current,
      mode.value === "growth"
        ? "compoundedEndingDebt"
        : mode.value === "repayment"
          ? "endingDebt"
          : "netCarryAfterKnownCosts",
      labels,
    );
    const detail = root.querySelector<HTMLDetailsElement>("[data-schedule]")!;
    detail.hidden = current.schedule.length === 0;
    const rows = root.querySelector<HTMLElement>("[data-rows]")!;
    rows.replaceChildren();
    for (const entry of current.schedule) {
      const row = document.createElement("tr");
      for (const text of [
        String(entry.period),
        ...[
          entry.openingDebtRaw,
          entry.interestRaw,
          entry.paymentRaw,
          entry.principalPaidRaw,
          entry.endingDebtRaw,
        ].map((raw) => formatRaw(BigInt(raw), current!.decimals)),
      ]) {
        const cell = document.createElement("td");
        cell.textContent = text;
        row.append(cell);
      }
      rows.append(row);
    }
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
      download("pit-borrowing-cost.json", borrowingReportJSON(current));
  });
