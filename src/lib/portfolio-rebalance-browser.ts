import { runAjTool } from "./aj-tool-contracts";
import {
  rebalanceReportJSON,
  type RebalanceInput,
  type RebalanceResult,
} from "./portfolio-rebalance";
import { formatRaw } from "./swap-cost";

const root = document.querySelector<HTMLElement>("[data-aj-rebalance]")!;
const form = root.querySelector<HTMLFormElement>("[data-aj-form]")!;
const mode = root.querySelector<HTMLSelectElement>("[data-mode]")!;
const rows = root.querySelector<HTMLElement>("[data-rows]")!;
const result = root.querySelector<HTMLElement>("[data-result]")!;
const error = root.querySelector<HTMLElement>("[data-error]")!;
let current: RebalanceResult | null = null;
let nextId = 3;
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
const showMode = () => {
  const shock = mode.value === "shock";
  root.querySelector<HTMLElement>("[data-target-panel]")!.hidden =
    mode.value !== "target";
  root.querySelector<HTMLElement>("[data-contribution-panel]")!.hidden =
    mode.value !== "contribution";
  root.querySelector<HTMLElement>("[data-shock-panel]")!.hidden = !shock;
  for (const row of allRows()) {
    row.querySelector<HTMLElement>("[data-target]")!.hidden = shock;
    row.querySelector<HTMLElement>("[data-shock]")!.hidden = !shock;
  }
  invalidate();
};
mode.addEventListener("change", showMode);
form.addEventListener("input", invalidate);
form.addEventListener("change", invalidate);
root
  .querySelector<HTMLButtonElement>("[data-add]")!
  .addEventListener("click", () => {
    const existing = allRows();
    if (existing.length >= 12) {
      error.textContent = "At most twelve included buckets are supported.";
      error.hidden = false;
      return;
    }
    const copy = existing[existing.length - 1].cloneNode(
      true,
    ) as HTMLFieldSetElement;
    copy.querySelector("legend")!.textContent = `Bucket ${existing.length + 1}`;
    for (const element of copy.querySelectorAll<HTMLInputElement>("input")) {
      element.value =
        element.name === "id"
          ? `bucket${nextId}`
          : element.name === "label"
            ? `Bucket ${nextId}`
            : element.name === "currentValue"
              ? ""
              : "0";
    }
    nextId++;
    rows.append(copy);
    showMode();
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
    for (const row of allRows().slice(2)) row.remove();
    const examples = [
      {
        id: "a",
        label: "Asset A",
        currentValue: "600",
        targetBps: "5000",
        shockBps: "-2000",
      },
      {
        id: "b",
        label: "Asset B",
        currentValue: "400",
        targetBps: "5000",
        shockBps: "1000",
      },
    ];
    for (const [index, row] of allRows().entries())
      for (const [name, value] of Object.entries(examples[index]))
        row.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = value;
    form.querySelector<HTMLInputElement>('[name="currencyLabel"]')!.value =
      "USD";
    form.querySelector<HTMLInputElement>('[name="feeBps"]')!.value = "0";
    form.querySelector<HTMLInputElement>('[name="contribution"]')!.value =
      "200";
    showMode();
  });
const read = (): RebalanceInput => {
  const currencyLabel = input(form, "currencyLabel");
  const base = allRows().map((row) => ({
    id: input(row, "id"),
    label: input(row, "label"),
    currentValue: input(row, "currentValue"),
  }));
  if (mode.value === "target")
    return {
      mode: "target",
      currencyLabel,
      feeBps: input(form, "feeBps"),
      rows: base.map((item, index) => ({
        ...item,
        targetBps: input(allRows()[index], "targetBps"),
      })),
    };
  if (mode.value === "contribution")
    return {
      mode: "contribution",
      currencyLabel,
      contribution: input(form, "contribution"),
      rows: base.map((item, index) => ({
        ...item,
        targetBps: input(allRows()[index], "targetBps"),
      })),
    };
  if (mode.value === "shock")
    return {
      mode: "shock",
      currencyLabel,
      rows: base.map((item, index) => ({
        ...item,
        shockBps: input(allRows()[index], "shockBps"),
      })),
    };
  throw Error("Unsupported mode.");
};
const labels: Record<string, string> = {
  knownSubtotal: "Known subtotal",
  currentTotal: "Included starting value",
  grossTurnover: "Gross ideal traded notional (not wealth lost)",
  oneWayTurnover: "One-way ideal turnover",
  oneWayTurnoverBps: "One-way turnover vs starting value",
  separateEstimatedFeeDrag:
    "Separate estimated fee drag; target remains pre-fee",
  contribution: "Stated new contribution",
  postContributionTotal: "Value after contribution",
  minimumContribution: "Minimum smallest-unit contribution without selling",
  projectedTotal: "Projected included value",
  portfolioChange: "Hypothetical value change",
  portfolioChangePercent: "Hypothetical percentage change",
  largestWeightBeforePpm: "Largest starting bucket weight",
  largestWeightAfterPpm: "Largest projected bucket weight",
};
const money = (raw: string | null, currency: string) =>
  raw === null ? "UNKNOWN" : `${formatRaw(BigInt(raw), 18)} ${currency}`;
const weight = (raw: string | null) =>
  raw === null ? "undefined" : `${formatRaw(BigInt(raw), 4)}%`;
form.addEventListener("submit", (event) => {
  event.preventDefault();
  invalidate();
  try {
    const response = runAjTool("portfolio-rebalance", read());
    if (response.status === "ERROR") throw Error(response.error.message);
    current = response.output;
    result.querySelector<HTMLElement>("[data-status]")!.textContent =
      response.status === "INCOMPLETE"
        ? "INCOMPLETE — missing or undefined valuation coverage"
        : current.feasibility === "infeasible"
          ? "INFEASIBLE — exact target needs a sale or more capital"
          : current.feasibility === "feasible"
            ? "FEASIBLE — exact target reached without selling under the stated contribution"
            : "COMPLETE — illustrative manual scenario";
    const primaryName =
      current.mode === "target"
        ? "oneWayTurnover"
        : current.mode === "contribution"
          ? "minimumContribution"
          : "portfolioChange";
    const primary = current.fields.find((item) => item.name === primaryName);
    result.querySelector<HTMLElement>("[data-primary]")!.textContent = primary
      ? `${labels[primaryName]}: ${primary.display} ${primary.unit}`
      : current.feasibility === "infeasible"
        ? "No finite contribution can remove a positive zero-target holding."
        : "No complete primary result.";
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
    const detail = result.querySelector<HTMLElement>("[data-detail]")!;
    detail.replaceChildren();
    for (const row of current.rows) {
      const line = document.createElement("p");
      const parts = [
        `${row.label} (${row.id}): current ${money(row.currentValueRaw, current.currencyLabel)}`,
      ];
      if (row.currentWeightPpm !== null)
        parts.push(`starting weight ${weight(row.currentWeightPpm)}`);
      if (row.targetBps !== null)
        parts.push(`target ${formatRaw(BigInt(row.targetBps), 2)}%`);
      if (row.allocationDriftPpm !== null)
        parts.push(
          `signed target minus current weight ${formatRaw(BigInt(row.allocationDriftPpm), 4)} percentage points`,
        );
      if (row.desiredValueRaw !== null)
        parts.push(
          `target value ${money(row.desiredValueRaw, current.currencyLabel)}`,
        );
      if (current.mode === "target" && row.idealTradeRaw !== null)
        parts.push(
          `ideal value change ${money(row.idealTradeRaw, current.currencyLabel)}`,
        );
      if (current.mode === "contribution") {
        if (row.contributionRaw !== null)
          parts.push(
            `contribution allocation ${money(row.contributionRaw, current.currencyLabel)}`,
          );
        if (row.blockingOverweightRaw !== null)
          parts.push(
            `blocking overweight ${money(row.blockingOverweightRaw, current.currencyLabel)}`,
          );
      }
      if (current.mode === "shock") {
        parts.push(
          `shock ${row.shockBps === null ? "UNKNOWN" : `${formatRaw(BigInt(row.shockBps), 2)}%`}`,
        );
        parts.push(
          `projected ${money(row.projectedValueRaw, current.currencyLabel)}`,
        );
        parts.push(`change ${money(row.changeRaw, current.currencyLabel)}`);
        parts.push(`projected weight ${weight(row.projectedWeightPpm)}`);
      }
      line.textContent = parts.join(" · ");
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
      cause instanceof Error ? cause.message : "Invalid manual inputs.";
    error.hidden = false;
  }
});
root
  .querySelector<HTMLButtonElement>("[data-download]")!
  .addEventListener("click", () => {
    if (!current) return;
    const url = URL.createObjectURL(
      new Blob([rebalanceReportJSON(current)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "pit-portfolio-rebalance-simulation.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
