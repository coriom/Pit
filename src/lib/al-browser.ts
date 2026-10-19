/** Small DOM-only presentation helpers for the two manual Phase AL pages. */
export const input = (root: ParentNode, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!
    .value;
export const number = (root: ParentNode, name: string) => {
  const text = input(root, name);
  if (!/^(?:0|[1-9]\d*)$/.test(text))
    throw Error(`${name} requires a whole number; blank is not zero.`);
  const value = Number(text);
  if (!Number.isSafeInteger(value))
    throw Error(`${name} exceeds the supported whole-number range.`);
  return value;
};
export const setSample = (root: ParentNode, values: Record<string, string>) => {
  for (const [name, value] of Object.entries(values))
    root.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[name="${name}"]`,
    )!.value = value;
};
export type BrowserResult = {
  status: string;
  reasons: string[];
  fields: { name: string; raw: string; display: string; unit: string }[];
  limitations: string[];
};
export const field = (value: BrowserResult, name: string) =>
  value.fields.find((item) => item.name === name);
export const render = (
  root: HTMLElement,
  value: BrowserResult,
  primary: string,
  labels: Record<string, string>,
) => {
  const resultNode = root.querySelector<HTMLElement>("[data-result]")!;
  resultNode.hidden = false;
  root.querySelector<HTMLElement>("[data-status]")!.textContent =
    value.status === "complete"
      ? "MODELED RESULT — manual assumptions"
      : "INCOMPLETE — see the missing coverage below";
  const main = field(value, primary);
  root.querySelector<HTMLElement>("[data-primary]")!.textContent = main
    ? `${labels[primary] ?? primary}: ${main.display} ${main.unit}`
    : "No complete primary result under these assumptions.";
  const list = root.querySelector<HTMLElement>("[data-fields]")!;
  list.replaceChildren();
  for (const item of value.fields) {
    const label = document.createElement("dt");
    const amount = document.createElement("dd");
    label.textContent = labels[item.name] ?? item.name;
    amount.textContent = `${item.display} ${item.unit}`;
    list.append(label, amount);
  }
  const reasons = root.querySelector<HTMLElement>("[data-reasons]")!;
  reasons.replaceChildren();
  for (const message of value.reasons) {
    const item = document.createElement("li");
    item.textContent = message;
    reasons.append(item);
  }
};
export const download = (name: string, content: string) => {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
