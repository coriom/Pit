import { runAhTool } from "./ah-tool-contracts";
import {
  yieldGrowthReportJSON,
  type YieldInput,
  type YieldResult,
} from "./yield-growth";

const root = document.querySelector<HTMLElement>("[data-ah-yield]")!;
const form = root.querySelector<HTMLFormElement>("[data-ah-form]")!;
const selector = root.querySelector<HTMLSelectElement>("[data-mode-select]")!;
const report = root.querySelector<HTMLElement>("[data-report]")!;
const error = root.querySelector<HTMLElement>("[data-error]")!;
let current: YieldResult | null = null;
const panel = () =>
  root.querySelector<HTMLFieldSetElement>(
    `[data-mode-panel="${selector.value}"]`,
  )!;
const invalidate = () => {
  current = null;
  report.hidden = true;
  error.hidden = true;
  error.textContent = "";
};
selector.addEventListener("change", () => {
  for (const item of root.querySelectorAll<HTMLFieldSetElement>(
    "[data-mode-panel]",
  ))
    item.hidden = item.dataset.modePanel !== selector.value;
  invalidate();
});
form.addEventListener("input", invalidate);
form.addEventListener("change", invalidate);
root
  .querySelector<HTMLButtonElement>("[data-load-sample]")!
  .addEventListener("click", () => {
    for (const control of panel().querySelectorAll<
      HTMLInputElement | HTMLSelectElement
    >("[data-sample]"))
      control.value = control.dataset.sample!;
    invalidate();
  });
const read = (): YieldInput => {
  const input: Record<string, string | number> = { mode: selector.value };
  for (const control of panel().querySelectorAll<
    HTMLInputElement | HTMLSelectElement
  >("[name]")) {
    if (["periodsPerYear", "years"].includes(control.name)) {
      if (
        !/^[1-9]\d*$/.test(control.value) ||
        !Number.isSafeInteger(Number(control.value))
      )
        throw Error(`${control.name} must be a safe positive whole number.`);
      input[control.name] = Number(control.value);
    } else input[control.name] = control.value;
  }
  return input as unknown as YieldInput;
};
const label = (name: string) =>
  ({
    nominalApr: "Nominal APR",
    effectiveApy: "Effective APY",
    periodicRate: "Periodic return",
    effectiveAnnualReturn: "Annualized return",
    principal: "Starting principal",
    contributions: "Total contributions",
    growth: "Modeled growth / earnings",
    endingValue: "Ending value",
    periods: "Compounding periods",
    annualIncome: "Annual income target",
    requiredPrincipal: "Required principal",
    loss: "Loss",
    requiredGain: "Required recovery gain",
  })[name as "nominalApr"] ?? name;
form.addEventListener("submit", (event) => {
  event.preventDefault();
  invalidate();
  try {
    const response = runAhTool("yield-growth", read());
    if (response.status === "ERROR") throw Error(response.error.message);
    current = response.output;
    const list = report.querySelector<HTMLElement>("[data-values]")!;
    list.replaceChildren();
    for (const item of current.fields) {
      const row = document.createElement("div"),
        dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = label(item.name);
      dd.textContent =
        item.unit === "money"
          ? `${item.display} ${current.currency}`
          : item.display;
      row.append(dt, dd);
      list.append(row);
    }
    report.hidden = false;
  } catch (cause) {
    error.textContent =
      cause instanceof Error ? cause.message : "Invalid input.";
    error.hidden = false;
  }
});
root
  .querySelector<HTMLButtonElement>("[data-download]")!
  .addEventListener("click", () => {
    if (!current) return;
    const url = URL.createObjectURL(
      new Blob([yieldGrowthReportJSON(current)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "pit-yield-growth-simulation.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
