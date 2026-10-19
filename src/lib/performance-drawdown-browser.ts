import { runAjTool } from "./aj-tool-contracts";
import {
  performanceReportJSON,
  type PerformanceInput,
  type PerformanceResult,
} from "./performance-drawdown";
import { formatRaw } from "./swap-cost";

const root = document.querySelector<HTMLElement>("[data-aj-performance]")!;
const form = root.querySelector<HTMLFormElement>("[data-aj-form]")!;
const mode = root.querySelector<HTMLSelectElement>("[data-mode]")!;
const rows = root.querySelector<HTMLElement>("[data-rows]")!;
const result = root.querySelector<HTMLElement>("[data-result]")!;
const error = root.querySelector<HTMLElement>("[data-error]")!;
let current: PerformanceResult | null = null;
const input = (area: ParentNode, name: string) =>
  area.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value;
const allRows = () => [
  ...rows.querySelectorAll<HTMLFieldSetElement>("[data-row]"),
];
const invalidate = () => {
  current = null;
  result.hidden = true;
  error.hidden = true;
  error.textContent = "";
};
form.addEventListener("input", invalidate);
form.addEventListener("change", invalidate);
root
  .querySelector<HTMLButtonElement>("[data-add]")!
  .addEventListener("click", () => {
    const existing = allRows();
    if (existing.length >= 30) {
      error.textContent =
        "At most thirty chronological snapshots are supported.";
      error.hidden = false;
      return;
    }
    const copy = existing[existing.length - 1].cloneNode(
      true,
    ) as HTMLFieldSetElement;
    copy.querySelector("legend")!.textContent =
      `Snapshot ${existing.length + 1}`;
    for (const element of copy.querySelectorAll<HTMLInputElement>("input"))
      element.value = element.name === "externalFlow" ? "0" : "";
    rows.append(copy);
    invalidate();
  });
root
  .querySelector<HTMLButtonElement>("[data-remove]")!
  .addEventListener("click", () => {
    if (allRows().length > 2) rows.lastElementChild?.remove();
    invalidate();
  });
root
  .querySelector<HTMLButtonElement>("[data-sample]")!
  .addEventListener("click", () => {
    for (const row of allRows().slice(3)) row.remove();
    while (allRows().length < 3)
      root.querySelector<HTMLButtonElement>("[data-add]")!.click();
    const examples = [
      { date: "2026-01-01", endingValue: "100", externalFlow: "0" },
      { date: "2026-01-02", endingValue: "160", externalFlow: "50" },
      { date: "2026-01-03", endingValue: "144", externalFlow: "0" },
    ];
    for (const [index, row] of allRows().entries())
      for (const [name, value] of Object.entries(examples[index]))
        row.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = value;
    form.querySelector<HTMLInputElement>('[name="currencyLabel"]')!.value =
      "USD";
    invalidate();
  });
const read = (): PerformanceInput => {
  if (mode.value !== "performance" && mode.value !== "drawdown")
    throw Error("Unsupported historical mode.");
  return {
    mode: mode.value,
    currencyLabel: input(form, "currencyLabel"),
    snapshots: allRows().map((row) => ({
      date: input(row, "date"),
      endingValue: input(row, "endingValue"),
      externalFlow: input(row, "externalFlow"),
    })),
  };
};
const labels: Record<string, string> = {
  openingValue: "Opening value",
  closingValue: "Closing value",
  netExternalFlows: "Net external deposits minus withdrawals",
  nominalGain: "Monetary gain/loss excluding external flows",
  bestPeriodReturnPercent: "Highest observed period return",
  worstPeriodReturnPercent: "Lowest observed period return",
  timeWeightedReturnPercent: "Chained time-weighted return",
  closingNormalizedIndex: "Flow-neutral closing index (opening = 1)",
  maximumDrawdownPercent: "Maximum historical drawdown",
  currentDrawdownPercent: "Current drawdown",
  maxDrawdownRecoveryDays: "Peak-to-recovery duration",
  currentUnderwaterDays: "Current time below last high",
};
const money = (raw: string, currency: string) =>
  `${formatRaw(BigInt(raw), 18)} ${currency}`;
const percent = (raw: string | null) =>
  raw === null ? "UNDEFINED" : `${formatRaw(BigInt(raw), 18)}%`;
form.addEventListener("submit", (event) => {
  event.preventDefault();
  invalidate();
  try {
    const response = runAjTool("performance-drawdown", read());
    if (response.status === "ERROR") throw Error(response.error.message);
    current = response.output;
    result.querySelector<HTMLElement>("[data-status]")!.textContent =
      response.status === "INCOMPLETE"
        ? "INCOMPLETE — a zero previous value makes chained returns undefined"
        : "COMPLETE — manual historical series";
    const primaryName =
      current.mode === "drawdown"
        ? "maximumDrawdownPercent"
        : "timeWeightedReturnPercent";
    const primary = current.fields.find((item) => item.name === primaryName);
    result.querySelector<HTMLElement>("[data-primary]")!.textContent = primary
      ? `${labels[primaryName]}: ${primary.display} ${primary.unit}`
      : "Chained percentage result is undefined for this series.";
    const fieldList = result.querySelector<HTMLElement>("[data-fields]")!;
    fieldList.replaceChildren();
    for (const item of current.fields) {
      const line = document.createElement("div"),
        dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = labels[item.name] ?? item.name;
      dd.textContent = `${item.display} ${item.unit}`;
      line.append(dt, dd);
      fieldList.append(line);
    }
    const recovery = result.querySelector<HTMLElement>("[data-recovery]")!;
    recovery.textContent =
      current.status === "incomplete"
        ? "Drawdown and recovery across the full series are undefined."
        : current.maxDrawdownTroughDate === null
          ? "No below-peak interval was observed in these snapshots."
          : `Maximum drawdown: peak ${current.maxDrawdownPeakDate}, trough ${current.maxDrawdownTroughDate}; ${current.recovered ? `recovered on ${current.recoveryDate}` : "not recovered in the supplied series"}.`;
    const detail = result.querySelector<HTMLElement>("[data-detail]")!;
    detail.replaceChildren();
    for (const row of current.rows) {
      const line = document.createElement("p");
      line.textContent = [
        row.date,
        `ending ${money(row.endingValueRaw, current.currencyLabel)}`,
        `external flow ${money(row.externalFlowRaw, current.currencyLabel)}`,
        row.preFlowEndingValueRaw === null
          ? "opening snapshot"
          : `before flow ${money(row.preFlowEndingValueRaw, current.currencyLabel)}`,
        `period return ${percent(row.periodReturnPercentRaw)}`,
        `flow-neutral index ${row.normalizedIndexRaw === null ? "UNDEFINED" : formatRaw(BigInt(row.normalizedIndexRaw), 18)}`,
        `drawdown ${percent(row.drawdownPercentRaw)}`,
      ].join(" · ");
      detail.append(line);
    }
    const reasonList = result.querySelector<HTMLElement>("[data-reasons]")!;
    reasonList.replaceChildren();
    for (const reason of current.reasons) {
      const li = document.createElement("li");
      li.textContent = reason;
      reasonList.append(li);
    }
    result.hidden = false;
  } catch (cause) {
    error.textContent =
      cause instanceof Error ? cause.message : "Invalid historical inputs.";
    error.hidden = false;
  }
});
root
  .querySelector<HTMLButtonElement>("[data-download]")!
  .addEventListener("click", () => {
    if (!current) return;
    const url = URL.createObjectURL(
      new Blob([performanceReportJSON(current)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "pit-performance-drawdown-manual.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
