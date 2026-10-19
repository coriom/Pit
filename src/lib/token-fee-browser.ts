import { runAhTool } from "./ah-tool-contracts";
import {
  tokenFeeReportJSON,
  type ConverterInput,
  type ConverterResult,
} from "./token-fee-converter";

const root = document.querySelector<HTMLElement>("[data-ah-converter]")!;
const form = root.querySelector<HTMLFormElement>("[data-ah-form]")!;
const modeSelect = root.querySelector<HTMLSelectElement>("[data-mode-select]")!;
const report = root.querySelector<HTMLElement>("[data-report]")!;
const error = root.querySelector<HTMLElement>("[data-error]")!;
let current: ConverterResult | null = null;
const panel = () =>
  root.querySelector<HTMLFieldSetElement>(
    `[data-mode-panel="${modeSelect.value}"]`,
  )!;
const value = (key: string) =>
  (panel().elements.namedItem(key) as HTMLInputElement | HTMLSelectElement)
    .value;
const integer = (key: string) => {
  const text = value(key);
  if (!/^(?:0|[1-9]\d*)$/.test(text) || !Number.isSafeInteger(Number(text)))
    throw Error(`${key} must be a safe whole number.`);
  return Number(text);
};
const invalidate = () => {
  current = null;
  report.hidden = true;
  error.hidden = true;
  error.textContent = "";
};
const reveal = () => {
  for (const item of root.querySelectorAll<HTMLFieldSetElement>(
    "[data-mode-panel]",
  ))
    item.hidden = item.dataset.modePanel !== modeSelect.value;
  invalidate();
};
modeSelect.addEventListener("change", reveal);
form.addEventListener("input", invalidate);
form.addEventListener("change", invalidate);
root
  .querySelector<HTMLButtonElement>("[data-sample]")!
  .addEventListener("click", () => {
    const samples: Record<string, Record<string, string>> = {
      native: { amount: "1", unit: "eth" },
      token: {
        tokenLabel: "TEST",
        decimals: "6",
        direction: "human-to-raw",
        amount: "1.234567",
      },
      rate: { amount: "50", unit: "bps" },
      fee: {
        tokenLabel: "TEST",
        decimals: "6",
        amount: "100",
        rate: "50",
        rateUnit: "bps",
      },
    };
    for (const [key, item] of Object.entries(samples[modeSelect.value]))
      (
        panel().elements.namedItem(key) as HTMLInputElement | HTMLSelectElement
      ).value = item;
    invalidate();
  });
const read = (): ConverterInput => {
  switch (modeSelect.value) {
    case "native":
      return {
        mode: "native",
        amount: value("amount"),
        unit: value("unit") as "wei" | "gwei" | "eth",
      };
    case "token":
      return {
        mode: "token",
        amount: value("amount"),
        direction: value("direction") as "human-to-raw" | "raw-to-human",
        decimals: integer("decimals"),
        tokenLabel: value("tokenLabel"),
      };
    case "rate":
      return {
        mode: "rate",
        amount: value("amount"),
        unit: value("unit") as "percent" | "bps" | "ppm",
      };
    case "fee":
      return {
        mode: "fee",
        amount: value("amount"),
        decimals: integer("decimals"),
        tokenLabel: value("tokenLabel"),
        rate: value("rate"),
        rateUnit: value("rateUnit") as "percent" | "bps" | "ppm",
      };
    default:
      throw Error("Unsupported mode.");
  }
};
const label = (key: string) =>
  ({
    wei: "Wei",
    gwei: "Gwei",
    eth: "ETH",
    tokenBaseUnits: "Token base units",
    humanAmount: "Human token amount",
    percent: "Percent (%)",
    bps: "Basis points (bps)",
    ppm: "Parts per million (ppm)",
    amount: "Amount before fee",
    fee: "Fee charged",
    afterFee: "Amount after fee",
    feePercent: "Fee rate (%)",
  })[key as "wei"] ?? key;
form.addEventListener("submit", (event) => {
  event.preventDefault();
  invalidate();
  try {
    const response = runAhTool("token-fee-converter", read());
    if (response.status === "ERROR") throw Error(response.error.message);
    current = response.output;
    const list = report.querySelector<HTMLElement>("[data-values]")!;
    list.replaceChildren();
    for (const [key, item] of Object.entries(current.display)) {
      const row = document.createElement("div"),
        term = document.createElement("dt"),
        detail = document.createElement("dd");
      const code = document.createElement("code"),
        copy = document.createElement("button");
      term.textContent = label(key);
      code.textContent = item;
      copy.type = "button";
      copy.textContent = `Copy ${label(key)}`;
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(item);
          copy.textContent = "Copied";
        } catch {
          error.textContent =
            "Clipboard unavailable; select and copy the displayed value.";
          error.hidden = false;
        }
      });
      detail.append(code, " ", copy);
      row.append(term, detail);
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
      new Blob([tokenFeeReportJSON(current)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "pit-token-fee-conversion.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
