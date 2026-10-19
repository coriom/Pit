import { runAiTool } from "./ai-tool-contracts";
import {
  tradeRiskReportJSON,
  type Fill,
  type TradeRiskInput,
  type TradeRiskResult,
} from "./trade-risk";

const root = document.querySelector<HTMLElement>("[data-ai-trade]")!;
const form = root.querySelector<HTMLFormElement>("[data-ai-form]")!;
const selector = root.querySelector<HTMLSelectElement>("[data-mode-select]")!;
const shared = root.querySelector<HTMLFieldSetElement>("[data-shared]")!;
const result = root.querySelector<HTMLElement>("[data-result]")!;
const error = root.querySelector<HTMLElement>("[data-error]")!;
const fills = root.querySelector<HTMLElement>("[data-fills]")!;
let current: TradeRiskResult | null = null;
const panel = () =>
  root.querySelector<HTMLFieldSetElement>(`[data-panel="${selector.value}"]`)!;
const value = (area: HTMLElement, name: string) =>
  area.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value;
const whole = (area: HTMLElement, name: string) => {
  const text = value(area, name);
  if (!/^(?:0|[1-9]\d*)$/.test(text) || !Number.isSafeInteger(Number(text)))
    throw Error(`${name} must be a safe whole number.`);
  return Number(text);
};
const invalidate = () => {
  current = null;
  result.hidden = true;
  error.hidden = true;
  error.textContent = "";
};
const show = () => {
  for (const item of root.querySelectorAll<HTMLFieldSetElement>("[data-panel]"))
    item.hidden = item.dataset.panel !== selector.value;
  root.querySelector<HTMLElement>("[data-risk-fees]")!.hidden =
    selector.value === "average";
  invalidate();
};
selector.addEventListener("change", show);
form.addEventListener("input", invalidate);
form.addEventListener("change", invalidate);
root
  .querySelector<HTMLButtonElement>("[data-add-fill]")!
  .addEventListener("click", () => {
    const rows = fills.querySelectorAll<HTMLFieldSetElement>("[data-fill]");
    if (rows.length >= 10) {
      error.textContent = "At most ten fills are supported.";
      error.hidden = false;
      return;
    }
    const copy = rows[rows.length - 1].cloneNode(true) as HTMLFieldSetElement;
    copy.querySelector("legend")!.textContent = `Fill ${rows.length + 1}`;
    for (const input of copy.querySelectorAll("input"))
      input.value = input.name === "feeQuote" ? "0" : "";
    fills.append(copy);
    invalidate();
  });
root
  .querySelector<HTMLButtonElement>("[data-remove-fill]")!
  .addEventListener("click", () => {
    if (fills.querySelectorAll("[data-fill]").length > 1)
      fills.lastElementChild?.remove();
    invalidate();
  });
root
  .querySelector<HTMLButtonElement>("[data-sample]")!
  .addEventListener("click", () => {
    const defaults: Record<string, string> =
      selector.value === "average"
        ? { exitFeeBps: "50", exitFixedFeeQuote: "1" }
        : selector.value === "risk"
          ? {
              entryPrice: "2000",
              stopPrice: "1900",
              quantity: "1",
              lossBudgetQuote: "100",
            }
          : {
              entryPrice: "100",
              stopPrice: "95",
              targetPrice: "110",
              quantity: "1",
            };
    for (const [name, item] of Object.entries(defaults))
      panel().querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = item;
    if (selector.value === "average") {
      const rows = fills.querySelectorAll<HTMLFieldSetElement>("[data-fill]");
      for (const row of [...rows].slice(2)) row.remove();
      const samples = [
        { quantity: "0.1", price: "2000", feeQuote: "1" },
        { quantity: "0.2", price: "2500", feeQuote: "2" },
      ];
      for (const [index, row] of [
        ...fills.querySelectorAll<HTMLFieldSetElement>("[data-fill]"),
      ].entries())
        for (const [name, item] of Object.entries(samples[index]))
          row.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = item;
    } else
      for (const name of [
        "entryFeeBps",
        "exitFeeBps",
        "entryFixedFeeQuote",
        "exitFixedFeeQuote",
      ])
        shared.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = "0";
    invalidate();
  });
const read = (): TradeRiskInput => {
  const common = {
    baseLabel: value(shared, "baseLabel"),
    quoteLabel: value(shared, "quoteLabel"),
    baseDecimals: whole(shared, "baseDecimals"),
    quoteDecimals: whole(shared, "quoteDecimals"),
  };
  if (selector.value === "average") {
    const rows: Fill[] = [
      ...fills.querySelectorAll<HTMLFieldSetElement>("[data-fill]"),
    ].map((row) => ({
      quantity: value(row, "quantity"),
      price: value(row, "price"),
      feeQuote: value(row, "feeQuote"),
    }));
    return {
      ...common,
      mode: "average",
      fills: rows,
      exitFeeBps: value(panel(), "exitFeeBps"),
      exitFixedFeeQuote: value(panel(), "exitFixedFeeQuote"),
    };
  }
  const fees = {
    entryFeeBps: value(shared, "entryFeeBps"),
    exitFeeBps: value(shared, "exitFeeBps"),
    entryFixedFeeQuote: value(shared, "entryFixedFeeQuote"),
    exitFixedFeeQuote: value(shared, "exitFixedFeeQuote"),
  };
  const entry = {
    entryPrice: value(panel(), "entryPrice"),
    stopPrice: value(panel(), "stopPrice"),
    quantity: value(panel(), "quantity"),
  };
  if (selector.value === "risk")
    return {
      ...common,
      ...fees,
      ...entry,
      mode: "risk",
      lossBudgetQuote: value(panel(), "lossBudgetQuote"),
    };
  if (selector.value === "reward")
    return {
      ...common,
      ...fees,
      ...entry,
      mode: "reward",
      targetPrice: value(panel(), "targetPrice"),
    };
  throw Error("Unsupported mode.");
};
const labels: Record<string, string> = {
  grossQuantity: "Total purchase quantity",
  grossCost: "Gross acquisition cost",
  grossAveragePrice: "Weighted gross entry price",
  entryFees: "Acquisition fees",
  adjustedCost: "Fee-adjusted acquisition cost",
  adjustedAveragePrice: "Fee-adjusted average entry",
  breakEvenPrice: "Minimum break-even exit price",
  stopDistance: "Entry-to-stop distance",
  stopDistanceBps: "Entry-to-stop distance",
  positionQuantity: "Planned quantity",
  fixedFees: "Combined fixed fees",
  modeledStopLoss: "Modeled loss at stated stop",
  lossBudget: "Modeled loss budget",
  supportedQuantity: "Conservative supported quantity",
  modeledTargetReward: "Net payoff at stated target",
  rewardRiskRatio: "Target reward / stop loss",
};
form.addEventListener("submit", (event) => {
  event.preventDefault();
  invalidate();
  try {
    const response = runAiTool("trade-risk", read());
    if (response.status === "ERROR") throw Error(response.error.message);
    current = response.output;
    result.querySelector<HTMLElement>("[data-status]")!.textContent =
      response.status === "INCOMPLETE"
        ? "INCOMPLETE — unknown fee coverage"
        : "COMPLETE — illustrative calculation";
    const list = result.querySelector<HTMLElement>("[data-fields]")!;
    list.replaceChildren();
    for (const item of current.fields) {
      const row = document.createElement("div"),
        dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = labels[item.name] ?? item.name;
      dd.textContent = `${item.display} ${item.unit}`;
      row.append(dt, dd);
      list.append(row);
    }
    const reasons = result.querySelector<HTMLElement>("[data-reasons]")!;
    reasons.replaceChildren();
    for (const message of current.reasons) {
      const li = document.createElement("li");
      li.textContent = message;
      reasons.append(li);
    }
    result.hidden = false;
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
      new Blob([tradeRiskReportJSON(current)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "pit-trade-risk-simulation.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
