import { type ExplorerChain } from "../lib/explorer-bn";
import { runExplorerTool } from "../lib/explorer-registry";
import type { ExplorerResult } from "../lib/explorer-bn";

const form = document.querySelector<HTMLFormElement>("#explorer-form");
const output = document.querySelector<HTMLOutputElement>("#explorer-output");
const search = document.querySelector<HTMLInputElement>("#explorer-search");
const category = document.querySelector<HTMLSelectElement>("#explorer-category");
const network = document.querySelector<HTMLSelectElement>("#explorer-network");
const count = document.querySelector<HTMLElement>("#explorer-count");
const cards = [...document.querySelectorAll<HTMLAnchorElement>("#explorer-catalogue .card")];
const exportButton = document.querySelector<HTMLButtonElement>("#batch-export");
let lastBatch: ExplorerResult[] | undefined;
document.querySelector<HTMLInputElement>("#batch-address-file")?.addEventListener("change", async (event) => {
  const file = (event.currentTarget as HTMLInputElement).files?.[0];
  if (!file || !form || !output) return;
  if (file.size > 4096) { output.textContent = "Address CSV exceeds 4 KiB."; return; }
  const field = form.elements.namedItem("accounts") as HTMLTextAreaElement;
  field.value = await file.text();
  output.textContent = "Address CSV loaded locally. Review it before starting a public RPC read.";
});
const csvCell = (value: string) => {
  const safe = /^[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
};
exportButton?.addEventListener("click", () => {
  if (!lastBatch) return;
  const rows = [["network", "block", "provider", "address and asset", "balance or status"], ...lastBatch.flatMap((result) => result.rows.map((row) => [result.chain, result.block, result.provider, row.label, row.value]))];
  const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = "pit-batch-balances.csv"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
function filterCatalogue() {
  const query = search?.value.trim().toLocaleLowerCase() ?? "";
  const selected = category?.value ?? "all";
  const selectedNetwork = network?.value ?? "all";
  let shown = 0;
  for (const card of cards) {
    card.hidden = !(selected === "all" || card.dataset.category === selected) || !(selectedNetwork === "all" || (card.dataset.networks ?? "").split(" ").includes(selectedNetwork)) || !(card.dataset.search ?? "").includes(query);
    if (!card.hidden) shown++;
  }
  if (count) count.textContent = `${shown} inspection${shown === 1 ? "" : "s"} shown`;
}
search?.addEventListener("input", filterCatalogue);
category?.addEventListener("change", filterCatalogue);
network?.addEventListener("change", filterCatalogue);
form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!output || !form) return;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const values: Record<string, string> = {};
  for (const [key, value] of new FormData(form)) values[key] = String(value);
  output.textContent = "Reading the selected public chain…";
  lastBatch = undefined;
  if (exportButton) exportButton.hidden = true;
  if (button) button.disabled = true;
  try {
    const results = await runExplorerTool(form.dataset.tool ?? "", values, values.chain as ExplorerChain, undefined, (done, total) => { output.textContent = `Read ${done}/${total} balances…`; });
    const fragment = document.createDocumentFragment();
    for (const result of results) {
      const panel = document.createElement("div"); panel.className = "panel";
      const heading = document.createElement("h3"); heading.textContent = `${result.chain} · block ${result.block}`;
      const provider = document.createElement("p"); provider.textContent = `Provider: ${result.provider}`;
      const list = document.createElement("dl");
      for (const item of result.rows) {
        const dt = document.createElement("dt"); dt.textContent = item.label;
        const dd = document.createElement("dd"); dd.textContent = item.value;
        list.append(dt, dd);
      }
      const limit = document.createElement("p"); limit.textContent = `Limit: ${result.limitation}`;
      panel.append(heading, provider, list, limit); fragment.append(panel);
    }
    output.replaceChildren(fragment);
    if (form.dataset.tool === "batch-balances") { lastBatch = results; if (exportButton) exportButton.hidden = false; }
  } catch (error) {
    output.textContent = error instanceof Error ? error.message : "The read failed without a usable response.";
  } finally { if (button) button.disabled = false; }
});
