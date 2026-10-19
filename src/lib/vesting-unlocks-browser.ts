import { runAkTool } from "./ak-tool-contracts";
import {
  vestingReportJSON,
  type VestingInput,
  type VestingResult,
} from "./vesting-unlocks";
import { formatRaw } from "./swap-cost";

const root = document.querySelector<HTMLElement>("[data-ak-vesting]")!;
const form = root.querySelector<HTMLFormElement>("[data-ak-form]")!;
const mode = root.querySelector<HTMLSelectElement>("[data-mode]")!;
const rows = root.querySelector<HTMLElement>("[data-rows]")!;
const result = root.querySelector<HTMLElement>("[data-result]")!;
const error = root.querySelector<HTMLElement>("[data-error]")!;
let current: VestingResult | null = null;
const input = (area: ParentNode, name: string) =>
  area.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value;
const integer = (area: ParentNode, name: string) => {
  const text = input(area, name);
  if (!/^(?:0|[1-9]\d*)$/.test(text))
    throw Error(`${name} requires a whole number; blank is not zero.`);
  const value = Number(text);
  if (!Number.isSafeInteger(value))
    throw Error(`${name} exceeds the supported whole-number range.`);
  return value;
};
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
  root.querySelector<HTMLElement>("[data-linear]")!.hidden =
    mode.value === "tranches";
  root.querySelector<HTMLElement>("[data-initial]")!.hidden =
    mode.value !== "initial-linear";
  root.querySelector<HTMLElement>("[data-tranches]")!.hidden =
    mode.value !== "tranches";
  invalidate();
};
mode.addEventListener("change", showMode);
form.addEventListener("input", invalidate);
form.addEventListener("change", invalidate);
root
  .querySelector<HTMLButtonElement>("[data-add]")!
  .addEventListener("click", () => {
    const existing = allRows();
    if (existing.length >= 30) {
      error.textContent = "At most thirty tranches are supported.";
      error.hidden = false;
      return;
    }
    const copy = existing[existing.length - 1].cloneNode(
      true,
    ) as HTMLFieldSetElement;
    copy.querySelector("legend")!.textContent =
      `Tranche ${existing.length + 1}`;
    for (const item of copy.querySelectorAll<HTMLInputElement>("input"))
      item.value = "";
    rows.append(copy);
    invalidate();
  });
root
  .querySelector<HTMLButtonElement>("[data-remove]")!
  .addEventListener("click", () => {
    if (allRows().length > 1) rows.lastElementChild?.remove();
    invalidate();
  });
root
  .querySelector<HTMLButtonElement>("[data-sample]")!
  .addEventListener("click", () => {
    const common: Record<string, string> =
      mode.value === "tranches"
        ? {
            tokenLabel: "TOKEN",
            decimals: "6",
            totalAllocation: "1000",
            startDate: "2026-01-01",
            endDate: "2026-07-01",
            observationDate: "2026-05-01",
            previouslyReceived: "100",
          }
        : {
            tokenLabel: "TOKEN",
            decimals: "6",
            totalAllocation: "10000",
            startDate: "2026-01-01",
            endDate: "2027-01-01",
            observationDate: "2026-05-01",
            previouslyReceived: "0",
          };
    for (const [name, value] of Object.entries(common))
      form.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = value;
    form.querySelector<HTMLInputElement>('[name="cliffDate"]')!.value =
      "2026-04-01";
    form.querySelector<HTMLInputElement>('[name="initialBps"]')!.value = "1000";
    while (allRows().length < 3)
      root.querySelector<HTMLButtonElement>("[data-add]")!.click();
    for (const row of allRows().slice(3)) row.remove();
    const sample = [
      { date: "2026-01-01", amount: "100" },
      { date: "2026-04-01", amount: "300" },
      { date: "2026-07-01", amount: "600" },
    ];
    for (const [i, row] of allRows().entries()) {
      row.querySelector<HTMLInputElement>('[name="date"]')!.value =
        sample[i].date;
      row.querySelector<HTMLInputElement>('[name="amount"]')!.value =
        sample[i].amount;
    }
    showMode();
  });
const read = (): VestingInput => {
  const common = {
    tokenLabel: input(form, "tokenLabel"),
    decimals: integer(form, "decimals"),
    totalAllocation: input(form, "totalAllocation"),
    startDate: input(form, "startDate"),
    endDate: input(form, "endDate"),
    observationDate: input(form, "observationDate"),
    previouslyReceived: input(form, "previouslyReceived"),
  };
  if (mode.value === "linear")
    return { mode: "linear", ...common, cliffDate: input(form, "cliffDate") };
  if (mode.value === "initial-linear")
    return {
      mode: "initial-linear",
      ...common,
      cliffDate: input(form, "cliffDate"),
      initialBps: input(form, "initialBps"),
    };
  if (mode.value === "tranches")
    return {
      mode: "tranches",
      ...common,
      tranches: allRows().map((row) => ({
        date: input(row, "date"),
        amount: input(row, "amount"),
      })),
    };
  throw Error("Unsupported mode.");
};
const names: Record<string, string> = {
  totalAllocation: "Total allocation",
  vestedAllocation: "Modeled vested allocation",
  lockedAllocation: "Still locked",
  initialUnlockAllocation: "Initial unlock scheduled at start",
  remainingLinearAllocation: "Remainder under linear schedule",
  vestedPercent: "Modeled vested share",
  previouslyReceived: "Manually stated previously received",
  vestedButNotReceived: "Vested but not yet received under manual inputs",
};
form.addEventListener("submit", (event) => {
  event.preventDefault();
  invalidate();
  try {
    const response = runAkTool("vesting-unlocks", read());
    if (response.status === "ERROR") throw Error(response.error.message);
    current = response.output;
    result.querySelector<HTMLElement>("[data-status]")!.textContent =
      `${response.status} — fictional manual schedule`;
    const primary = current.fields.find(
      (item) => item.name === "vestedAllocation",
    )!;
    result.querySelector<HTMLElement>("[data-primary]")!.textContent =
      `Modeled vested: ${primary.display} ${primary.unit} (not verified claimable)`;
    const fields = result.querySelector<HTMLElement>("[data-fields]")!;
    fields.replaceChildren();
    for (const item of current.fields) {
      const line = document.createElement("div"),
        dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = names[item.name] ?? item.name;
      dd.textContent = `${item.display} ${item.unit}`;
      line.append(dt, dd);
      fields.append(line);
    }
    result.querySelector<HTMLElement>("[data-next]")!.textContent =
      current.mode === "tranches" && current.nextUnlockDate
        ? `Next listed unlock: ${current.nextUnlockDate}, ${formatRaw(BigInt(current.nextUnlockAmountRaw!), current.decimals)} ${current.tokenLabel}`
        : current.mode === "tranches"
          ? "No future listed tranche."
          : "Continuous/cliff schedule; no on-chain event is verified.";
    const schedule = result.querySelector<HTMLElement>("[data-schedule]")!;
    schedule.replaceChildren();
    for (const item of current.schedule) {
      const line = document.createElement("p");
      line.textContent = `${item.date}: ${formatRaw(BigInt(item.amountRaw), current.decimals)} ${current.tokenLabel} · ${item.amountPercentRaw === null ? "undefined share" : `${formatRaw(BigInt(item.amountPercentRaw), 18)}% of allocation`} · ${item.status}`;
      schedule.append(line);
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
      cause instanceof Error ? cause.message : "Invalid manual schedule.";
    error.hidden = false;
  }
});
root
  .querySelector<HTMLButtonElement>("[data-download]")!
  .addEventListener("click", () => {
    if (!current) return;
    const url = URL.createObjectURL(
      new Blob([vestingReportJSON(current)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "pit-vesting-unlocks-manual.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
