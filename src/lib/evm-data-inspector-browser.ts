import { runEvmTool } from "./an-evm-contract";
import {
  evmReportJSON,
  type EvmInput,
  type EvmResult,
} from "./evm-data-inspector";
const root = document.querySelector<HTMLElement>("[data-an-evm]")!;
const form = root.querySelector<HTMLFormElement>("form")!;
const mode = root.querySelector<HTMLSelectElement>("[data-mode]")!;
const error = root.querySelector<HTMLElement>("[data-error]")!;
const field = (name: string) =>
  form.querySelector<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >(`[name="${name}"]`)!.value;
let current: { input: EvmInput; output: EvmResult } | null = null;
const invalidate = () => {
  current = null;
  root.querySelector<HTMLElement>("[data-result]")!.hidden = true;
  error.hidden = true;
  error.textContent = "";
};
const showMode = () => {
  for (const panel of root.querySelectorAll<HTMLElement>("[data-panel]"))
    panel.hidden = panel.dataset.panel !== mode.value;
  invalidate();
};
mode.addEventListener("change", showMode);
form.addEventListener("input", invalidate);
root
  .querySelector<HTMLButtonElement>("[data-sample]")!
  .addEventListener("click", () => {
    const samples: Record<string, string> = {
      address: "0x52908400098527886E0F7030069857D2E4169EE7",
      chainId: "11155111",
      kind: "function",
      signature: "transfer(address,uint256)",
      abiJson:
        '{"type":"function","name":"transfer","inputs":[{"name":"to","type":"address"},{"name":"amount","type":"uint256"}]}',
      calldata:
        "0xa9059cbb00000000000000000000000052908400098527886e0f7030069857d2e4169ee70000000000000000000000000000000000000000000000000000000000000064",
    };
    for (const [name, value] of Object.entries(samples))
      form.querySelector<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >(`[name="${name}"]`)!.value = value;
    invalidate();
  });
form.addEventListener("submit", (event) => {
  event.preventDefault();
  invalidate();
  let input: EvmInput;
  if (mode.value === "address")
    input = {
      mode: "address",
      address: field("address"),
      chainId: field("chainId"),
    };
  else if (mode.value === "signature")
    input = {
      mode: "signature",
      kind: field("kind") as "function" | "event",
      signature: field("signature"),
    };
  else
    input = {
      mode: "decode",
      abiJson: field("abiJson"),
      calldata: field("calldata"),
    };
  const result = runEvmTool(input);
  if (result.status === "ERROR") {
    error.textContent = result.error.message;
    error.hidden = false;
    return;
  }
  current = { input, output: result.output };
  root.querySelector<HTMLElement>("[data-primary]")!.textContent =
    result.output.primary;
  const details = root.querySelector<HTMLElement>("[data-details]")!;
  details.replaceChildren();
  for (const detail of result.output.details) {
    const row = document.createElement("div"),
      label = document.createElement("dt"),
      value = document.createElement("dd");
    label.textContent = detail.name;
    value.textContent = detail.value;
    row.append(label, value);
    details.append(row);
  }
  root.querySelector<HTMLElement>("[data-result]")!.hidden = false;
});
root
  .querySelector<HTMLButtonElement>("[data-download]")!
  .addEventListener("click", () => {
    if (!current) return;
    const blob = new Blob([evmReportJSON(current.input, current.output)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "pit-evm-inspection.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
