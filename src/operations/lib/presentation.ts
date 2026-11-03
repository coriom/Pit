/** Build-aware, static product copy. It cannot enable an execution path. */
export type OperationPresentationInput = {
  id: string;
  description: string;
  fee: string;
  pricing: string;
  previewDescription?: string;
};
export function operationPresentation(item: OperationPresentationInput, hosted: boolean, browserOnly = false, readOnly = false) {
  const description = hosted ? item.previewDescription ?? item.description : item.description;
  const amount = item.fee.match(/[\d.]+(?:[–-][\d.]+)? USDC/)?.[0];
  const feeLabel = item.pricing === "FREE" ? "Free" : amount ? `From ${amount} · proposed` : "Indicative PIT fee";
  const modeLabel = hosted ? "Preview only" : browserOnly ? "Browser-local" : readOnly ? "Read-only" : "Local Anvil";
  return { description, feeLabel, modeLabel };
}
