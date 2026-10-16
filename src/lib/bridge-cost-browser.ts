import {
  BRIDGE_CHAINS,
  FEE_KINDS,
  calculateBridgeCost,
  compareBridgeCosts,
  bridgeCostReportJSON,
  type BridgeRouteInput,
  type BridgeRouteResult,
} from "./bridge-cost";
import { formatRaw, SwapCostInputError } from "./swap-cost";

const root = document.querySelector<HTMLElement>("[data-bridge-cost]")!;
const form = root.querySelector<HTMLFormElement>("[data-bridge-form]")!;
const report = root.querySelector<HTMLElement>("[data-bridge-report]")!;
const error = root.querySelector<HTMLElement>("[data-bridge-error]")!;
const examples = JSON.parse(root.dataset.examples!) as Record<
  "A" | "B",
  Record<string, string>
>;
let current: {
  A: BridgeRouteResult;
  B: BridgeRouteResult;
  comparison: ReturnType<typeof compareBridgeCosts>;
} | null = null;
const control = (name: "A" | "B", key: string) =>
  form.elements.namedItem(`${name}-${key}`) as
    HTMLInputElement | HTMLSelectElement;
const value = (name: "A" | "B", key: string) => control(name, key).value;
const integer = (raw: string, label: string) => {
  if (!/^(?:0|[1-9]\d*)$/.test(raw) || !Number.isSafeInteger(Number(raw)))
    throw new SwapCostInputError(`${label} must be a safe whole number.`);
  return Number(raw);
};
const read = (name: "A" | "B"): BridgeRouteInput => {
  const sourceChainId = integer(value(name, "sourceChainId"), "Source chain");
  const destinationChainId = integer(
    value(name, "destinationChainId"),
    "Destination chain",
  );
  if (
    !BRIDGE_CHAINS.includes(sourceChainId as (typeof BRIDGE_CHAINS)[number]) ||
    !BRIDGE_CHAINS.includes(
      destinationChainId as (typeof BRIDGE_CHAINS)[number],
    )
  )
    throw new SwapCostInputError("Unsupported hypothetical chain.");
  const fees = {} as BridgeRouteInput["fees"];
  for (const kind of FEE_KINDS) {
    const denomination = value(
      name,
      `${kind}-denomination`,
    ) as BridgeRouteInput["fees"][typeof kind]["denomination"];
    fees[kind] = {
      coverage: value(
        name,
        `${kind}-coverage`,
      ) as BridgeRouteInput["fees"][typeof kind]["coverage"],
      payer: value(
        name,
        `${kind}-payer`,
      ) as BridgeRouteInput["fees"][typeof kind]["payer"],
      denomination,
      chainId: denomination.startsWith("source-")
        ? sourceChainId
        : destinationChainId,
      amount: value(name, `${kind}-amount`),
    };
  }
  return {
    sourceChainId,
    destinationChainId,
    sourceToken: {
      chainId: sourceChainId,
      address: value(name, "sourceAddress"),
      decimals: integer(value(name, "sourceDecimals"), "Source decimals"),
    },
    destinationToken: {
      chainId: destinationChainId,
      address: value(name, "destinationAddress"),
      decimals: integer(
        value(name, "destinationDecimals"),
        "Destination decimals",
      ),
    },
    sourceAmount: value(name, "sourceAmount"),
    quotedDestinationAmount: value(name, "quotedDestinationAmount"),
    minimumDestinationAmount: value(name, "minimumDestinationAmount"),
    estimatedMinutes: value(name, "estimatedMinutes"),
    fees,
    approvalRequired: value(
      name,
      "approvalRequired",
    ) as BridgeRouteInput["approvalRequired"],
    sourceGas: {
      coverage: value(
        name,
        "sourceGasCoverage",
      ) as BridgeRouteInput["sourceGas"]["coverage"],
      units: value(name, "sourceGasUnits"),
      gasPriceGwei: value(name, "sourceGasPriceGwei"),
      nativeAsset: value(name, "sourceNativeAsset"),
      destinationTokensPerNative: value(name, "sourceNativeRate"),
    },
    approvalGasUnits: value(name, "approvalGasUnits"),
    destinationGas: {
      coverage: value(
        name,
        "destinationGasCoverage",
      ) as BridgeRouteInput["destinationGas"]["coverage"],
      units: value(name, "destinationGasUnits"),
      gasPriceGwei: value(name, "destinationGasPriceGwei"),
      nativeAsset: value(name, "destinationNativeAsset"),
      destinationTokensPerNative: value(name, "destinationNativeRate"),
    },
    destinationTokensPerSourceToken: value(name, "sourceTokenRate"),
    commonUnit: value(name, "commonUnit"),
    commonUnitDecimals: integer(
      value(name, "commonUnitDecimals"),
      "Common-unit decimals",
    ),
    commonUnitsPerDestinationToken: value(name, "commonRate"),
  };
};
const invalidate = () => {
  current = null;
  report.hidden = true;
  error.hidden = true;
  error.textContent = "";
};
const visible = (name: "A" | "B") => {
  const scenario = form.querySelector<HTMLElement>(`[data-route="${name}"]`)!;
  for (const kind of FEE_KINDS) {
    const coverage = value(name, `${kind}-coverage`);
    if (coverage === "unknown") control(name, `${kind}-amount`).value = "";
    scenario.querySelector<HTMLElement>(
      `[data-fee="${kind}"]`,
    )!.dataset.coverage = coverage;
  }
  const approval = value(name, "approvalRequired");
  if (approval !== "yes") control(name, "approvalGasUnits").value = "";
  if (value(name, "sourceGasCoverage") !== "wallet")
    control(name, "sourceGasUnits").value = "";
  if (value(name, "destinationGasCoverage") !== "wallet")
    control(name, "destinationGasUnits").value = "";
  for (const key of [
    "approvalGasUnits",
    "sourceGasUnits",
    "destinationGasUnits",
  ] as const) {
    const show =
      key === "approvalGasUnits"
        ? approval === "yes"
        : key === "sourceGasUnits"
          ? value(name, "sourceGasCoverage") === "wallet"
          : value(name, "destinationGasCoverage") === "wallet";
    scenario.querySelector<HTMLElement>(`[data-field="${key}"]`)!.hidden =
      !show;
  }
};
for (const name of ["A", "B"] as const) visible(name);
form.addEventListener("input", invalidate);
form.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  const name = target.name.startsWith("A-") ? "A" : "B";
  visible(name);
  invalidate();
});
for (const button of root.querySelectorAll<HTMLButtonElement>("[data-example]"))
  button.addEventListener("click", () => {
    for (const name of ["A", "B"] as const)
      for (const [key, item] of Object.entries(examples[name]))
        control(name, key).value = item;
    if (button.dataset.example === "unknown") {
      control("B", "destinationNativeRate").value = "";
      control("B", "destinationGasCoverage").value = "unknown";
    }
    visible("A");
    visible("B");
    invalidate();
  });
const put = (root: Element, key: string, content: string) => {
  root.querySelector<HTMLElement>(`[data-value="${key}"]`)!.textContent =
    content;
};
const formatted = (raw: string | null, decimals: number, unit: string) =>
  raw === null ? "UNKNOWN" : `${formatRaw(raw, decimals)} ${unit}`;
const render = (name: "A" | "B", item: BridgeRouteResult) => {
  const section = report.querySelector<HTMLElement>(`[data-result="${name}"]`)!;
  const decimals = item.input.destinationToken.decimals;
  const unit = `destination token (${item.input.destinationChainId})`;
  section.querySelector<HTMLElement>("[data-result-heading]")!.textContent =
    `Route ${name}: ${item.status.toUpperCase()}`;
  const reasons = section.querySelector<HTMLElement>("[data-reasons]")!;
  reasons.hidden = item.reasons.length === 0;
  reasons.textContent = item.reasons.join(" ");
  put(
    section,
    "gross",
    formatted(
      item.sourceAmountRaw,
      item.input.sourceToken.decimals,
      `source token (${item.input.sourceChainId})`,
    ),
  );
  put(section, "quote", formatted(item.quotedDestinationRaw, decimals, unit));
  put(
    section,
    "received",
    formatted(item.expectedDestinationReceivedRaw, decimals, unit),
  );
  put(
    section,
    "payout",
    formatted(item.payoutFeeDestinationRaw, decimals, unit),
  );
  put(
    section,
    "external",
    formatted(item.externalFeeDestinationRaw, decimals, unit),
  );
  put(
    section,
    "sourceGas",
    formatted(
      item.sourceGasWei,
      18,
      `${item.input.sourceGas.nativeAsset} on ${item.input.sourceChainId}`,
    ),
  );
  put(
    section,
    "approvalGas",
    formatted(
      item.sourceApprovalGasWei,
      18,
      `${item.input.sourceGas.nativeAsset} on ${item.input.sourceChainId}`,
    ),
  );
  put(
    section,
    "destinationGas",
    formatted(
      item.destinationGasWei,
      18,
      `${item.input.destinationGas.nativeAsset} on ${item.input.destinationChainId}`,
    ),
  );
  put(
    section,
    "sourceGasCost",
    formatted(item.sourceGasCostDestinationRaw, decimals, unit),
  );
  put(
    section,
    "destinationGasCost",
    formatted(item.destinationGasCostDestinationRaw, decimals, unit),
  );
  put(
    section,
    "cost",
    formatted(item.totalSeparateUserCostDestinationRaw, decimals, unit),
  );
  put(section, "net", formatted(item.netDestinationValueRaw, decimals, unit));
  put(
    section,
    "minimum",
    formatted(item.minimumDestinationReceivedRaw, decimals, unit),
  );
  put(
    section,
    "netMinimum",
    formatted(item.netMinimumValueRaw, decimals, unit),
  );
  put(
    section,
    "commonCost",
    item.commonUnitCostRaw === null
      ? "NOT SUPPLIED"
      : formatted(
          item.commonUnitCostRaw,
          item.input.commonUnitDecimals,
          item.input.commonUnit,
        ),
  );
  put(
    section,
    "common",
    item.commonUnitNetRaw === null
      ? "NOT SUPPLIED"
      : formatted(
          item.commonUnitNetRaw,
          item.input.commonUnitDecimals,
          item.input.commonUnit,
        ),
  );
  put(
    section,
    "time",
    item.estimatedMinutes === null
      ? "NOT SUPPLIED"
      : `${item.estimatedMinutes} minutes (separate estimate)`,
  );
  put(section, "pitFee", `0 ${unit}`);
  for (const kind of FEE_KINDS) {
    const fee = item.fees[kind];
    const row = section.querySelector<HTMLElement>(
      `[data-fee-result="${kind}"]`,
    )!;
    row.textContent = `${kind}: ${fee.coverage.toUpperCase()} · ${fee.amountRaw ?? "UNKNOWN"} raw ${fee.tokenIdentity} · payer ${fee.payer}${fee.coverage === "included" ? " · already reflected in manual quote" : ""}`;
  }
};
form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const A = calculateBridgeCost(read("A"));
    const B = calculateBridgeCost(read("B"));
    const comparison = compareBridgeCosts(A, B);
    current = { A, B, comparison };
    render("A", A);
    render("B", B);
    report.querySelector<HTMLElement>("[data-comparison-status]")!.textContent =
      comparison.status;
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
        : `Route ${comparison.winner === "tie" ? "tie" : comparison.winner} · net difference ${formatRaw(comparison.netDifferenceDestinationRaw!, A.input.destinationToken.decimals)} destination tokens`;
    report.querySelector<HTMLElement>("[data-cost-difference]")!.textContent =
      comparison.separateCostDifferenceDestinationRaw === null
        ? "UNKNOWN"
        : `${formatRaw(comparison.separateCostDifferenceDestinationRaw, A.input.destinationToken.decimals)} destination tokens · ${comparison.costDifferencePercent}% of the higher separate cost`;
    error.hidden = true;
    error.textContent = "";
    report.hidden = false;
  } catch (cause) {
    current = null;
    report.hidden = true;
    error.textContent =
      cause instanceof SwapCostInputError
        ? cause.message
        : "Invalid route assumption.";
    error.hidden = false;
  }
});
root
  .querySelector<HTMLButtonElement>("[data-download]")!
  .addEventListener("click", () => {
    if (!current) return;
    const blob = new Blob(
      [bridgeCostReportJSON(current.A, current.B, current.comparison)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pit-bridge-cost-simulation.json";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
