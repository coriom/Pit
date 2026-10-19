import { runAiTool } from "./ai-tool-contracts";
import {
  executionMathReportJSON,
  type ExecutionMathInput,
  type ExecutionMathResult,
} from "./execution-math";

const root = document.querySelector<HTMLElement>("[data-ai-execution]")!;
const form = root.querySelector<HTMLFormElement>("[data-ai-form]")!;
const selector = root.querySelector<HTMLSelectElement>("[data-mode-select]")!;
const result = root.querySelector<HTMLElement>("[data-result]")!;
const error = root.querySelector<HTMLElement>("[data-error]")!;
let current: ExecutionMathResult | null = null;
const panel = () =>
  root.querySelector<HTMLFieldSetElement>(`[data-panel="${selector.value}"]`)!;
const value = (name: string) =>
  (panel().elements.namedItem(name) as HTMLInputElement | HTMLSelectElement)
    .value;
const whole = (name: string) => {
  const text = value(name);
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
selector.addEventListener("change", () => {
  for (const item of root.querySelectorAll<HTMLFieldSetElement>("[data-panel]"))
    item.hidden = item.dataset.panel !== selector.value;
  invalidate();
});
const approvalChoice = root.querySelector<HTMLSelectElement>(
  '[name="approvalRequired"]',
)!;
const approvalLabel = root.querySelector<HTMLElement>("[data-approval-units]")!;
approvalChoice.addEventListener("change", () => {
  approvalLabel.hidden = approvalChoice.value !== "yes";
  if (approvalChoice.value !== "yes")
    approvalLabel.querySelector("input")!.value = "";
  invalidate();
});
form.addEventListener("input", invalidate);
form.addEventListener("change", invalidate);
root
  .querySelector<HTMLButtonElement>("[data-sample]")!
  .addEventListener("click", () => {
    const samples: Record<string, Record<string, string>> = {
      spread: {
        quoteLabel: "USD",
        quoteDecimals: "2",
        bid: "99",
        ask: "101",
        referencePrice: "100",
        executionPrice: "101",
      },
      slippage: {
        tokenLabel: "USDC",
        tokenDecimals: "6",
        direction: "exact-input",
        expectedAmount: "100",
        toleranceBps: "50",
      },
      gas: {
        nativeLabel: "ETH",
        transactionGasUnits: "21000",
        approvalRequired: "no",
        approvalGasUnits: "",
        gasPriceGwei: "20",
        budgetNative: "0.001",
        notionalNative: "",
        coverage: "complete",
      },
    };
    for (const [name, item] of Object.entries(samples[selector.value]))
      (
        panel().elements.namedItem(name) as HTMLInputElement | HTMLSelectElement
      ).value = item;
    approvalLabel.hidden = approvalChoice.value !== "yes";
    invalidate();
  });
const read = (): ExecutionMathInput => {
  switch (selector.value) {
    case "spread":
      return {
        mode: "spread",
        quoteLabel: value("quoteLabel"),
        quoteDecimals: whole("quoteDecimals"),
        bid: value("bid"),
        ask: value("ask"),
        referencePrice: value("referencePrice"),
        executionPrice: value("executionPrice"),
      };
    case "slippage":
      return {
        mode: "slippage",
        tokenLabel: value("tokenLabel"),
        tokenDecimals: whole("tokenDecimals"),
        direction: value("direction") as "exact-input" | "exact-output",
        expectedAmount: value("expectedAmount"),
        toleranceBps: value("toleranceBps"),
      };
    case "gas":
      return {
        mode: "gas",
        nativeLabel: value("nativeLabel"),
        transactionGasUnits: value("transactionGasUnits"),
        approvalRequired: value("approvalRequired") as "yes" | "no" | "unknown",
        approvalGasUnits: value("approvalGasUnits"),
        gasPriceGwei: value("gasPriceGwei"),
        budgetNative: value("budgetNative"),
        notionalNative: value("notionalNative"),
        coverage: value("coverage") as "complete" | "unknown-extra",
      };
    default:
      throw Error("Unsupported mode.");
  }
};
const labels: Record<string, string> = {
  midpoint: "Bid/ask midpoint",
  absoluteSpread: "Absolute bid/ask spread",
  midpointSpreadBps: "Spread vs midpoint",
  executionDeviation: "Execution price minus reference",
  executionDeviationBps: "Deviation vs reference",
  expectedAmount: "Expected token amount",
  minimumReceive: "Minimum receive",
  maximumSpend: "Maximum spend",
  toleranceDelta: "Tolerance difference",
  transactionGasUnits: "Transaction gas units",
  approvalGasUnits: "Approval gas units",
  knownGasUnits: "Known gas units",
  transactionGasWei: "Transaction gas cost",
  approvalGasWei: "Approval gas cost",
  knownTotalGasWei: "Known total gas cost",
  knownTotalGasNative: "Known total native gas cost",
  maximumGasPriceWei: "Budget-supported maximum gas price",
  maximumGasPriceGwei: "Budget-supported maximum gas price",
  gasShareOfNativeNotionalBps: "Gas share of same-native-unit notional",
};
form.addEventListener("submit", (event) => {
  event.preventDefault();
  invalidate();
  try {
    const response = runAiTool("execution-math", read());
    if (response.status === "ERROR") throw Error(response.error.message);
    current = response.output;
    result.querySelector<HTMLElement>("[data-status]")!.textContent =
      response.status === "INCOMPLETE"
        ? "INCOMPLETE — missing cost coverage"
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
      new Blob([executionMathReportJSON(current)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "pit-execution-math-simulation.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
