import { runWorkshopTool } from "./an-workshop-contract";
import {
  inspectDelimiters,
  MAX_CSV_BYTES,
  workshopReportJSON,
  workshopReviewedCSV,
  type Delimiter,
  type Mapping,
  type WorkshopInput,
  type WorkshopResult,
} from "./crypto-data-workshop";
const root = document.querySelector<HTMLElement>("[data-an-csv]")!;
const form = root.querySelector<HTMLFormElement>("form")!;
const file = root.querySelector<HTMLInputElement>("[data-file]")!;
const mode = root.querySelector<HTMLSelectElement>("[data-mode]")!;
const error = root.querySelector<HTMLElement>("[data-error]")!;
let originalText = "",
  originalName = "",
  reviewed: { input: WorkshopInput; result: WorkshopResult } | null = null;
let inspected = false;
let decisions: Record<string, "keep" | "exclude"> = {};
const get = (name: string) =>
  form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!;
const checked = (name: string) =>
  form.querySelector<HTMLInputElement>(`[name="${name}"]`)!.checked;
const showError = (message: string) => {
  error.textContent = message;
  error.hidden = false;
};
const invalidate = () => {
  reviewed = null;
  root.querySelector<HTMLElement>("[data-result]")!.hidden = true;
  error.hidden = true;
  error.textContent = "";
};
const showMode = () => {
  root.querySelector<HTMLElement>("[data-panel=" + '"inspect"]')!.hidden =
    mode.value !== "inspect";
  root.querySelector<HTMLElement>("[data-panel=" + '"transform"]')!.hidden =
    mode.value === "inspect";
  root.querySelector<HTMLElement>("[data-dedupe]")!.hidden =
    mode.value !== "dedupe";
  invalidate();
};
mode.addEventListener("change", showMode);
form.addEventListener("input", () => {
  decisions = {};
  invalidate();
});
form.addEventListener("change", (event) => {
  if (event.target !== mode) {
    decisions = {};
    invalidate();
  }
});
const setOriginal = (text: string, name: string) => {
  originalText = text;
  originalName = name;
  decisions = {};
  inspected = false;
  invalidate();
  root.querySelector<HTMLElement>("[data-file-status]")!.textContent =
    `${name} · ${new TextEncoder().encode(text).length} bytes · local session only`;
  for (const select of root.querySelectorAll<HTMLSelectElement>(
    "[data-map],[data-identity]",
  ))
    select.replaceChildren(new Option("Unmapped", ""));
  try {
    const delimiter =
      get("delimiter").value === "tab"
        ? "\t"
        : (get("delimiter").value as Delimiter);
    const parsed = runWorkshopTool({
      mode: "inspect",
      text,
      delimiter,
      hasHeader: checked("hasHeader"),
    });
    if (parsed.status === "ERROR") throw Error(parsed.error.message);
    for (const select of root.querySelectorAll<HTMLSelectElement>("[data-map]"))
      for (const h of parsed.output.parsed.header) select.add(new Option(h, h));
    for (const select of root.querySelectorAll<HTMLSelectElement>(
      "[data-identity]",
    ))
      for (const key of [
        "recordId",
        "chainId",
        "eventId",
        "timestampUtc",
        "amount",
        "note",
      ])
        select.add(new Option(key, key));
    root.querySelector<HTMLElement>("[data-file-status]")!.textContent +=
      ` · ${parsed.output.parsed.rows.length} data rows · ${parsed.output.parsed.header.length} columns`;
  } catch (cause) {
    showError(
      cause instanceof Error ? cause.message : "CSV inspection failed.",
    );
  }
};
file.addEventListener("change", async () => {
  const selected = file.files?.[0];
  if (!selected) return;
  if (selected.size > MAX_CSV_BYTES) {
    showError("File exceeds the 256 KiB local limit.");
    return;
  }
  try {
    const bytes = await selected.arrayBuffer();
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    setOriginal(text, selected.name.slice(0, 120));
  } catch {
    showError("File is not valid UTF-8.");
  }
});
root
  .querySelector<HTMLButtonElement>("[data-sample]")!
  .addEventListener("click", () => {
    setOriginal(
      "id,chain,event,time,amount,note\r\nA,11155111,0,2026-01-02T10:00:00+02:00,1.250000,first\r\nB,11155111,1,2026-01-03T08:00:00Z,0,second\r\nA,11155111,0,2026-01-02T10:00:00+02:00,1.250000,first\r\n",
      "fictional-example.csv",
    );
    const m: Record<string, string> = {
      recordId: "id",
      chainId: "chain",
      eventId: "event",
      timestampUtc: "time",
      amount: "amount",
      note: "note",
      identityA: "recordId",
      identityB: "eventId",
    };
    for (const [name, value] of Object.entries(m)) get(name).value = value;
  });
for (const name of ["delimiter", "hasHeader"])
  get(name).addEventListener("change", () => {
    inspected = false;
    if (originalText) setOriginal(originalText, originalName);
  });
const download = (name: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const render = (result: WorkshopResult) => {
  root.querySelector<HTMLElement>("[data-result]")!.hidden = false;
  root.querySelector<HTMLElement>("[data-summary]")!.textContent =
    `${result.status} · ${result.parsed.rows.length} data rows · ${result.parsed.header.length} columns · ${result.duplicates.length} duplicate groups`;
  root.querySelector<HTMLElement>("[data-candidates]")!.textContent =
    `Delimiter hints (confirmation required): ${inspectDelimiters(originalText)
      .map(
        (x) =>
          `${x.delimiter === "\t" ? "tab" : x.delimiter}: ${x.columns} columns${x.consistent ? "" : " / inconsistent"}`,
      )
      .join("; ")}.`;
  const preview = root.querySelector<HTMLElement>("[data-preview]")!;
  preview.replaceChildren();
  const heading = document.createElement("h3");
  heading.textContent = "Original preview (first five rows)";
  preview.append(heading);
  const table = document.createElement("table"),
    tbody = document.createElement("tbody");
  for (const row of [result.parsed.header, ...result.parsed.rows.slice(0, 5)]) {
    const tr = document.createElement("tr");
    for (const cell of row) {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  preview.append(table);
  const normalized = root.querySelector<HTMLElement>(
    "[data-normalized-preview]",
  )!;
  normalized.replaceChildren();
  if (result.normalizedRows.length) {
    const title = document.createElement("h3");
    title.textContent =
      "Normalized preview (first five rows; exact raw amount units)";
    normalized.append(title);
    const output = document.createElement("table"),
      body = document.createElement("tbody");
    const keys = [
      "recordId",
      "chainId",
      "eventId",
      "timestampUtc",
      "amount",
      "note",
    ] as const;
    for (const cells of [
      keys.map((x) => x),
      ...result.normalizedRows
        .slice(0, 5)
        .map((row) =>
          keys.map((key) =>
            row.fields[key].status === "NORMALIZED"
              ? row.fields[key].value
              : row.fields[key].status,
          ),
        ),
    ]) {
      const tr = document.createElement("tr");
      for (const cell of cells) {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.append(td);
      }
      body.append(tr);
    }
    output.append(body);
    normalized.append(output);
  }
  const issues = root.querySelector<HTMLElement>("[data-issues]")!;
  issues.replaceChildren();
  for (const reason of result.reasons.slice(0, 30)) {
    const li = document.createElement("li");
    li.textContent = reason;
    issues.append(li);
  }
  if (result.reasons.length > 30) {
    const li = document.createElement("li");
    li.textContent = `${result.reasons.length - 30} additional issues in the local JSON report.`;
    issues.append(li);
  }
  const groupNode = root.querySelector<HTMLElement>(
    "[data-duplicate-decisions]",
  )!;
  groupNode.replaceChildren();
  if (mode.value === "dedupe")
    for (const [index, group] of result.duplicates.entries()) {
      const p = document.createElement("p");
      p.textContent = `Group ${index + 1}: rows ${group.rowNumbers.join(", ")}${group.conflict ? " · conflicting non-identity fields" : " · exact duplicate"}`;
      groupNode.append(p);
      for (const rowNumber of group.rowNumbers) {
        const label = document.createElement("label"),
          select = document.createElement("select");
        label.textContent = `Row ${rowNumber}: `;
        select.dataset.decision = String(rowNumber);
        select.add(new Option("Review needed", ""));
        select.add(new Option("Keep", "keep"));
        select.add(new Option("Exclude", "exclude"));
        select.value = decisions[String(rowNumber)] ?? "";
        select.addEventListener("change", () => {
          if (select.value)
            decisions[String(rowNumber)] = select.value as "keep" | "exclude";
          else delete decisions[String(rowNumber)];
          root.querySelector<HTMLButtonElement>("[data-download-csv]")!.hidden =
            true;
        });
        label.append(select);
        groupNode.append(label);
      }
    }
  root.querySelector<HTMLButtonElement>("[data-download-csv]")!.hidden =
    result.mode === "inspect" || result.status !== "COMPLETE";
};
form.addEventListener("submit", (event) => {
  event.preventDefault();
  invalidate();
  if (!originalText) {
    showError("Select a UTF-8 CSV file or load the fictional example first.");
    return;
  }
  const delimiter =
    get("delimiter").value === "tab"
      ? "\t"
      : (get("delimiter").value as Delimiter);
  let input: WorkshopInput;
  if (mode.value === "inspect")
    input = {
      mode: "inspect",
      text: originalText,
      delimiter,
      hasHeader: checked("hasHeader"),
    };
  else {
    if (!inspected) {
      showError(
        "Inspect the original preview before accepting a transformation.",
      );
      return;
    }
    if (!checked("hasHeader") || !checked("confirm")) {
      showError(
        "Confirm the header, mapping and local transformation before continuing.",
      );
      return;
    }
    const mapping = {} as Mapping;
    for (const key of [
      "recordId",
      "chainId",
      "eventId",
      "timestampUtc",
      "amount",
      "note",
    ] as (keyof Mapping)[])
      mapping[key] = get(key).value;
    const rawPrecision = get("amountDecimals").value;
    if (!/^(?:0|[1-9][0-9]?)$/.test(rawPrecision)) {
      showError("Amount precision must be a whole number from 0 to 18.");
      return;
    }
    const identityFields = [
      get("identityA").value,
      get("identityB").value,
    ].filter(Boolean) as (keyof Mapping)[];
    input = {
      mode: mode.value as "normalize" | "dedupe",
      text: originalText,
      delimiter,
      hasHeader: true,
      mapping,
      amountDecimals: Number(rawPrecision),
      dateFormat: get("dateFormat").value as
        "iso-offset" | "utc-date" | "unix-seconds",
      identityFields,
      decisions: { ...decisions },
    };
  }
  const result = runWorkshopTool(input);
  if (result.status === "ERROR") {
    showError(result.error.message);
    return;
  }
  if (input.mode === "inspect") inspected = true;
  reviewed = { input, result: result.output };
  render(result.output);
});
root
  .querySelector<HTMLButtonElement>("[data-download-original]")!
  .addEventListener("click", () => {
    if (originalText)
      download(
        `original-${originalName || "source.csv"}`,
        originalText,
        "text/csv;charset=utf-8",
      );
  });
root
  .querySelector<HTMLButtonElement>("[data-download-json]")!
  .addEventListener("click", () => {
    if (reviewed)
      download(
        "pit-csv-review.json",
        workshopReportJSON(reviewed.input, reviewed.result),
        "application/json;charset=utf-8",
      );
  });
root
  .querySelector<HTMLButtonElement>("[data-download-csv]")!
  .addEventListener("click", () => {
    if (reviewed && reviewed.result.status === "COMPLETE")
      download(
        "pit-reviewed-spreadsheet-safe.csv",
        workshopReviewedCSV(reviewed.result),
        "text/csv;charset=utf-8",
      );
  });
