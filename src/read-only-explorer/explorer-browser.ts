import { runBnTool, type ExplorerChain } from "../lib/explorer-bn";

const form = document.querySelector<HTMLFormElement>("#explorer-form");
const output = document.querySelector<HTMLOutputElement>("#explorer-output");
form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!output || !form) return;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const values: Record<string, string> = {};
  for (const [key, value] of new FormData(form)) values[key] = String(value);
  output.textContent = "Reading the selected public chain…";
  if (button) button.disabled = true;
  try {
    const results = await runBnTool(form.dataset.tool ?? "", values, values.chain as ExplorerChain);
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
  } catch (error) {
    output.textContent = error instanceof Error ? error.message : "The read failed without a usable response.";
  } finally { if (button) button.disabled = false; }
});
