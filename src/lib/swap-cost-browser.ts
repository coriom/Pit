import {
  SwapCostInputError,
  calculateSwapCost,
  compareSwapCosts,
  formatRaw,
  swapCostReportJSON,
  type SwapCostInput,
  type SwapCostResult,
} from "./swap-cost";

const root = document.querySelector<HTMLElement>("[data-swap-cost]")!;
const examples = JSON.parse(root.dataset.examples!) as Record<
  "A" | "B",
  Record<string, string>
>;
const form = root.querySelector<HTMLFormElement>("[data-swap-cost-form]")!;
const report = root.querySelector<HTMLElement>("[data-report]")!;
const error = root.querySelector<HTMLElement>("[data-error]")!;
let current: {
  A: SwapCostResult;
  B: SwapCostResult;
  comparison: ReturnType<typeof compareSwapCosts>;
} | null = null;
const control = (name: "A" | "B", key: string) =>
  form.elements.namedItem(`${name}-${key}`) as
    HTMLInputElement | HTMLSelectElement;
const value = (name: "A" | "B", key: string) => control(name, key).value;
const smallInteger = (text: string, label: string) => {
  if (!/^(?:0|[1-9]\d*)$/.test(text) || !Number.isSafeInteger(Number(text)))
    throw new SwapCostInputError(`${label} must be a safe whole number.`);
  return Number(text);
};
const read = (name: "A" | "B"): SwapCostInput => ({
  sellToken: value(name, "sellToken"),
  buyToken: value(name, "buyToken"),
  sellDecimals: smallInteger(
    value(name, "sellDecimals"),
    "Sell-token decimals",
  ),
  buyDecimals: smallInteger(value(name, "buyDecimals"), "Buy-token decimals"),
  sellAmount: value(name, "sellAmount"),
  quotedBuyAmount: value(name, "quotedBuyAmount"),
  venue: value(name, "venue") as SwapCostInput["venue"],
  feeCoverage: value(name, "feeCoverage") as SwapCostInput["feeCoverage"],
  unembeddedVenueFeeBuyAmount: value(name, "unembeddedVenueFeeBuyAmount"),
  approvalRequired: value(
    name,
    "approvalRequired",
  ) as SwapCostInput["approvalRequired"],
  swapGasUnits: value(name, "swapGasUnits"),
  approvalGasUnits: value(name, "approvalGasUnits"),
  gasPriceGwei: value(name, "gasPriceGwei"),
  nativeGasToken: value(name, "nativeGasToken"),
  nativeToBuyRate: value(name, "nativeToBuyRate"),
  slippageBps: smallInteger(value(name, "slippageBps"), "Slippage bps"),
});
const text = (element: Element, selector: string, content: string) => {
  element.querySelector<HTMLElement>(selector)!.textContent = content;
};
const show = (name: "A" | "B", key: string, visible: boolean) => {
  form.querySelector<HTMLElement>(
    `[data-scenario="${name}"] [data-field="${key}"]`,
  )!.hidden = !visible;
};
const visibility = (name: "A" | "B") => {
  const venue = value(name, "venue");
  const approval = value(name, "approvalRequired");
  if (venue === "uniswap-like" && value(name, "feeCoverage") === "not-included")
    control(name, "feeCoverage").value = "included";
  if (value(name, "feeCoverage") !== "not-included")
    control(name, "unembeddedVenueFeeBuyAmount").value = "";
  if (approval !== "yes") control(name, "approvalGasUnits").value = "";
  if (venue === "cow-like") control(name, "swapGasUnits").value = "";
  if (venue === "cow-like" && approval === "no") {
    control(name, "gasPriceGwei").value = "";
    control(name, "nativeToBuyRate").value = "";
  }
  show(
    name,
    "unembeddedVenueFeeBuyAmount",
    value(name, "feeCoverage") === "not-included",
  );
  show(name, "swapGasUnits", venue === "uniswap-like");
  show(name, "approvalGasUnits", approval === "yes");
  show(name, "gasPriceGwei", venue === "uniswap-like" || approval !== "no");
  show(name, "nativeToBuyRate", venue === "uniswap-like" || approval !== "no");
};
const invalidate = () => {
  current = null;
  report.hidden = true;
  error.hidden = true;
  error.textContent = "";
};
for (const name of ["A", "B"] as const) visibility(name);
form.addEventListener("input", invalidate);
form.addEventListener("change", (event) => {
  const changed = event.target as HTMLInputElement | HTMLSelectElement;
  const name = changed.name.startsWith("A-") ? "A" : "B";
  visibility(name);
  invalidate();
});
for (const button of root.querySelectorAll<HTMLButtonElement>("[data-example]"))
  button.addEventListener("click", () => {
    for (const name of ["A", "B"] as const)
      for (const [key, item] of Object.entries(examples[name]))
        control(name, key).value = item;
    if (button.dataset.example === "unknown")
      control("B", "swapGasUnits").value = "";
    visibility("A");
    visibility("B");
    invalidate();
  });
const resultText = (value: SwapCostResult, key: string) => {
  const buy = value.input.buyToken;
  const native = value.input.nativeGasToken;
  const as = (raw: string | null, places = value.input.buyDecimals) =>
    raw === null ? "UNKNOWN" : formatRaw(raw, places);
  switch (key) {
    case "quoted":
      return `${as(value.quotedBuyRaw)} ${buy}`;
    case "venueFee":
      return value.input.feeCoverage === "included"
        ? "Embedded in quote; not deducted twice"
        : value.input.feeCoverage === "unknown"
          ? "Unknown"
          : `${as(value.separatelyDeductedVenueFeeBuyRaw)} ${buy} deducted once`;
    case "expected":
      return `${as(value.expectedBeforeWalletGasRaw)} ${buy}`;
    case "swapGas":
      return `${as(value.swapGasWei, 18)} ${native}`;
    case "approvalGas":
      return `${as(value.approvalGasWei, 18)} ${native}`;
    case "totalGas":
      return `${as(value.totalWalletGasWei, 18)} ${native}`;
    case "gasBuy":
      return `${as(value.convertedWalletGasBuyRaw)} ${buy}`;
    case "net":
      return `${as(value.netAfterWalletGasRaw)} ${buy}`;
    case "min":
      return `${as(value.minimumReceiveRaw)} ${buy}`;
    case "netMin":
      return `${as(value.netMinimumAfterWalletGasRaw)} ${buy}`;
    case "gasImpact":
      return value.gasImpactPercent === null
        ? "UNKNOWN"
        : `${value.gasImpactPercent}% of expected output before wallet gas`;
    case "pitFee":
      return `0 ${buy}`;
    default:
      throw Error("Unknown result field");
  }
};
form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const A = calculateSwapCost(read("A"));
    const B = calculateSwapCost(read("B"));
    const comparison = compareSwapCosts(A, B);
    current = { A, B, comparison };
    for (const name of ["A", "B"] as const) {
      const section = report.querySelector<HTMLElement>(
        `[data-result="${name}"]`,
      )!;
      const item = current[name];
      text(
        section,
        "[data-result-heading]",
        `Scenario ${name}: ${item.status.toUpperCase()}`,
      );
      const reasons = section.querySelector<HTMLElement>("[data-reasons]")!;
      reasons.hidden = item.reasons.length === 0;
      reasons.textContent = item.reasons.join(" ");
      for (const field of section.querySelectorAll<HTMLElement>("[data-value]"))
        field.textContent = resultText(item, field.dataset.value!);
    }
    text(report, "[data-comparison-status]", comparison.status);
    const reasons = report.querySelector<HTMLElement>(
      "[data-comparison-reasons]",
    )!;
    reasons.hidden = comparison.reasons.length === 0;
    reasons.textContent = comparison.reasons.join(" ");
    const winner = report.querySelector<HTMLElement>(
      "[data-comparison-winner]",
    )!;
    winner.hidden = comparison.winner === null;
    winner.textContent =
      comparison.winner === null
        ? ""
        : `Winner: ${comparison.winner === "tie" ? "Tie" : `Scenario ${comparison.winner}`} · difference ${formatRaw(comparison.differenceBuyRaw!, A.input.buyDecimals)} ${A.input.buyToken}`;
    error.hidden = true;
    error.textContent = "";
    report.hidden = false;
  } catch (cause) {
    current = null;
    report.hidden = true;
    error.textContent =
      cause instanceof SwapCostInputError
        ? cause.message
        : "Invalid simulation input.";
    error.hidden = false;
  }
});
root
  .querySelector<HTMLButtonElement>("[data-download]")!
  .addEventListener("click", () => {
    if (!current) return;
    const blob = new Blob(
      [swapCostReportJSON(current.A, current.B, current.comparison)],
      { type: "application/json" },
    );
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "pit-swap-cost-simulation.json";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  });
