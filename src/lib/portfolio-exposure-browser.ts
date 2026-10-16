import {
  CHAIN_LABELS,
  MAX_CSV_BYTES,
  MAX_POSITIONS,
  calculatePortfolio,
  formatHhi,
  formatPercent,
  formatUsd,
  normalizePosition,
  parsePortfolioCSV,
  portfolioReportJSON,
  type PositionInput,
  type PortfolioResult,
} from "./portfolio-exposure";

const root = document.querySelector<HTMLElement>("[data-portfolio]")!;
const form = root.querySelector<HTMLFormElement>("[data-position-form]")!;
const error = root.querySelector<HTMLElement>("[data-error]")!;
const report = root.querySelector<HTMLElement>("[data-report]")!;
const csvFile = root.querySelector<HTMLInputElement>("[data-csv-file]")!;
const importStatus = root.querySelector<HTMLElement>("[data-import-status]")!;
const previewTable = root.querySelector<HTMLTableElement>(
  "[data-import-preview]",
)!;
const acceptImport = root.querySelector<HTMLButtonElement>(
  "[data-accept-import]",
)!;
const positionsBody = root.querySelector<HTMLTableSectionElement>(
  "[data-positions] tbody",
)!;
let positions: PositionInput[] = [];
let preview: PositionInput[] | null = null;
let current: PortfolioResult | null = null;

const text = (selector: string, value: string) => {
  root.querySelector<HTMLElement>(selector)!.textContent = value;
};
const cell = (row: HTMLTableRowElement, value: string) => {
  const td = document.createElement("td");
  td.textContent = value;
  row.append(td);
  return td;
};
const showError = (message: string) => {
  error.textContent = message;
  error.hidden = false;
};
const invalidate = () => {
  current = null;
  report.hidden = true;
  error.hidden = true;
  error.textContent = "";
};
const clearPreview = () => {
  preview = null;
  acceptImport.disabled = true;
  previewTable.hidden = true;
  previewTable.tBodies[0].replaceChildren();
  csvFile.value = "";
  importStatus.textContent = "";
};
function renderPositions() {
  positionsBody.replaceChildren();
  text(
    "[data-row-count]",
    `${positions.length} position${positions.length === 1 ? "" : "s"}`,
  );
  positions.forEach((position, index) => {
    const tr = document.createElement("tr");
    cell(tr, position.accountLabel);
    cell(
      tr,
      `${CHAIN_LABELS[position.chainId]} · ${position.assetType === "native" ? "native" : position.tokenAddress} · ${position.symbol}`,
    );
    cell(tr, position.quantity);
    cell(tr, position.unitPriceUsd || "UNKNOWN");
    cell(tr, position.exposureGroup || "Ungrouped");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Remove";
    button.setAttribute("aria-label", `Remove position ${index + 1}`);
    button.addEventListener("click", () => {
      positions.splice(index, 1);
      invalidate();
      clearPreview();
      renderPositions();
    });
    cell(tr, "").append(button);
    positionsBody.append(tr);
  });
}
const field = (key: keyof PositionInput) =>
  (form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement).value;
form.addEventListener("submit", (event) => {
  event.preventDefault();
  invalidate();
  try {
    if (positions.length >= MAX_POSITIONS)
      throw Error(`At most ${MAX_POSITIONS} positions are supported.`);
    const decimalText = field("decimals");
    if (!/^(?:0|[1-9]\d*)$/.test(decimalText))
      throw Error("Token decimals must be a whole number.");
    const input: PositionInput = {
      accountLabel: field("accountLabel"),
      chainId: Number(field("chainId")),
      assetType: field("assetType") as PositionInput["assetType"],
      tokenAddress: field("tokenAddress"),
      symbol: field("symbol"),
      decimals: Number(decimalText),
      quantity: field("quantity"),
      unitPriceUsd: field("unitPriceUsd"),
      priceObservedAt: field("priceObservedAt"),
      exposureGroup: field("exposureGroup"),
    };
    normalizePosition(input, Date.now(), 3650);
    calculatePortfolio([...positions, input], {
      nowIso: new Date().toISOString(),
      staleAfterDays: 7,
    });
    positions.push(input);
    clearPreview();
    renderPositions();
    form.reset();
  } catch (cause) {
    showError(cause instanceof Error ? cause.message : "Invalid position.");
  }
});
root
  .querySelector<HTMLButtonElement>("[data-sample]")!
  .addEventListener("click", () => {
    const at = new Date().toISOString();
    positions = [
      {
        accountLabel: "Sample wallet A",
        chainId: 1,
        assetType: "native",
        tokenAddress: "",
        symbol: "ETH",
        decimals: 18,
        quantity: "1",
        unitPriceUsd: "2000",
        priceObservedAt: at,
        exposureGroup: "ETH exposure",
      },
      {
        accountLabel: "Sample wallet B",
        chainId: 8453,
        assetType: "erc20",
        tokenAddress: "0x1111111111111111111111111111111111111111",
        symbol: "USDC",
        decimals: 6,
        quantity: "500",
        unitPriceUsd: "1",
        priceObservedAt: at,
        exposureGroup: "Stablecoin exposure",
      },
      {
        accountLabel: "Sample wallet C",
        chainId: 42161,
        assetType: "erc20",
        tokenAddress: "0x2222222222222222222222222222222222222222",
        symbol: "WETH",
        decimals: 18,
        quantity: "0.25",
        unitPriceUsd: "2000",
        priceObservedAt: at,
        exposureGroup: "ETH exposure",
      },
    ];
    invalidate();
    clearPreview();
    renderPositions();
  });
root
  .querySelector<HTMLButtonElement>("[data-unpriced]")!
  .addEventListener("click", () => {
    if (positions.length >= MAX_POSITIONS) {
      showError("Maximum position count reached.");
      return;
    }
    const candidate: PositionInput = {
      accountLabel: "Sample wallet D",
      chainId: 1,
      assetType: "erc20",
      tokenAddress: "0x3333333333333333333333333333333333333333",
      symbol: "UNKNOWN",
      decimals: 18,
      quantity: "1",
      unitPriceUsd: "",
      priceObservedAt: "",
      exposureGroup: "",
    };
    try {
      calculatePortfolio([...positions, candidate], {
        nowIso: new Date().toISOString(),
        staleAfterDays: 7,
      });
      positions.push(candidate);
      invalidate();
      clearPreview();
      renderPositions();
    } catch (cause) {
      showError(
        cause instanceof Error ? cause.message : "Cannot add sample position.",
      );
    }
  });
root
  .querySelector<HTMLButtonElement>("[data-reset]")!
  .addEventListener("click", () => {
    positions = [];
    invalidate();
    clearPreview();
    renderPositions();
  });
csvFile.addEventListener("change", async () => {
  preview = null;
  acceptImport.disabled = true;
  previewTable.hidden = true;
  previewTable.tBodies[0].replaceChildren();
  const file = csvFile.files?.[0];
  if (!file) {
    importStatus.textContent = "No file selected.";
    return;
  }
  if (file.size > MAX_CSV_BYTES) {
    importStatus.textContent = "CSV exceeds 256 KiB.";
    return;
  }
  try {
    const bytes = await file.arrayBuffer();
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed = parsePortfolioCSV(content);
    previewTable.hidden = false;
    parsed.rows.forEach((input, index) => {
      const tr = document.createElement("tr");
      [
        String(index + 1),
        input.accountLabel,
        CHAIN_LABELS[input.chainId] ?? String(input.chainId),
        input.symbol,
        input.quantity,
        input.unitPriceUsd || "UNKNOWN",
        "Valid row",
      ].forEach((value) => cell(tr, value));
      previewTable.tBodies[0].append(tr);
    });
    const errors = [...parsed.errors];
    if (!parsed.rows.length) errors.push("CSV contains no valid positions.");
    if (positions.length + parsed.rows.length > MAX_POSITIONS)
      errors.push("Combined portfolio exceeds 200 positions.");
    if (!errors.length) {
      try {
        calculatePortfolio([...positions, ...parsed.rows], {
          nowIso: new Date().toISOString(),
          staleAfterDays: 7,
        });
      } catch (cause) {
        errors.push(
          cause instanceof Error
            ? cause.message
            : "Combined portfolio invalid.",
        );
      }
    }
    importStatus.textContent = errors.length
      ? `Import blocked: ${errors.join(" ")}`
      : `${parsed.rows.length} rows previewed; no positions added yet.`;
    if (!errors.length) {
      preview = parsed.rows;
      acceptImport.disabled = false;
    }
  } catch (cause) {
    importStatus.textContent = `Import blocked: ${cause instanceof Error ? cause.message : "Invalid CSV."}`;
  }
});
acceptImport.addEventListener("click", () => {
  if (!preview) return;
  try {
    calculatePortfolio([...positions, ...preview], {
      nowIso: new Date().toISOString(),
      staleAfterDays: 7,
    });
    positions.push(...preview);
    invalidate();
    clearPreview();
    renderPositions();
  } catch (cause) {
    importStatus.textContent = `Import blocked: ${cause instanceof Error ? cause.message : "Invalid positions."}`;
    acceptImport.disabled = true;
  }
});
const renderAllocation = (key: string, rows: PortfolioResult["byAsset"]) => {
  const body = root.querySelector<HTMLTableSectionElement>(
    `[data-allocation="${key}"] tbody`,
  )!;
  body.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement("tr");
    cell(tr, row.identity);
    cell(tr, formatUsd(row.valueUsdRaw));
    const td = cell(tr, formatPercent(row.weightPpm));
    if (row.weightPpm !== null) {
      const meter = document.createElement("progress");
      meter.max = 1_000_000;
      meter.value = Number(row.weightPpm);
      meter.setAttribute("aria-label", `${row.identity} allocation`);
      td.append(" ", meter);
    }
    body.append(tr);
  }
};
root
  .querySelector<HTMLButtonElement>("[data-analyze]")!
  .addEventListener("click", () => {
    invalidate();
    try {
      const days = root
        .querySelector<HTMLInputElement>("[data-stale-days]")!
        .value.trim();
      if (!/^(?:0|[1-9]\d*)$/.test(days))
        throw Error("Stale-price threshold must be whole days.");
      current = calculatePortfolio(positions, {
        nowIso: new Date().toISOString(),
        staleAfterDays: Number(days),
      });
      report.hidden = false;
      text("[data-coverage]", `${current.status} manual valuation coverage`);
      text("[data-known-total]", formatUsd(current.knownSubtotalUsdRaw));
      text(
        "[data-coverage-detail]",
        `${current.pricedCount} priced; ${current.unpricedCount} unpriced. Known subtotal is not a complete portfolio value when unpriced holdings exist.`,
      );
      text(
        "[data-stale-detail]",
        `${current.staleCount} stale manual price${current.staleCount === 1 ? "" : "s"} under the selected threshold; no price was refreshed automatically.`,
      );
      const valuedBody = root.querySelector<HTMLTableSectionElement>(
        "[data-valued-positions] tbody",
      )!;
      valuedBody.replaceChildren();
      for (const position of current.positions) {
        const tr = document.createElement("tr");
        cell(
          tr,
          `${position.input.accountLabel} · ${position.assetIdentity} · ${position.input.symbol}`,
        );
        cell(tr, position.input.quantity);
        cell(
          tr,
          position.valueUsdRaw === null
            ? "UNKNOWN"
            : formatUsd(position.valueUsdRaw),
        );
        cell(tr, formatPercent(position.weightPpm));
        cell(
          tr,
          position.valueUsdRaw === null
            ? "Unpriced"
            : position.stale
              ? "Stale manual price"
              : "Manual price within threshold",
        );
        valuedBody.append(tr);
      }
      text("[data-largest]", formatPercent(current.largestPositionWeightPpm));
      text("[data-top-three]", formatPercent(current.topThreeWeightPpm));
      text("[data-hhi]", formatHhi(current.hhiMicro));
      renderAllocation("asset", current.byAsset);
      renderAllocation("chain", current.byChain);
      renderAllocation("account", current.byAccount);
      renderAllocation("group", current.byGroup);
    } catch (cause) {
      showError(
        cause instanceof Error ? cause.message : "Cannot analyze portfolio.",
      );
    }
  });
root
  .querySelector<HTMLButtonElement>("[data-download]")!
  .addEventListener("click", () => {
    if (!current) return;
    const blob = new Blob([portfolioReportJSON(current)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pit-portfolio-exposure-manual.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
renderPositions();
