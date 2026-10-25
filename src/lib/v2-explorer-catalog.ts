import { EXPLORER_TOOLS } from "./explorer-registry";
import type { V2CatalogueEntry } from "./v2-catalog-core";

// Explorer source metadata stays in its existing read-only registry.
export const V2_EXPLORER_TASKS: readonly V2CatalogueEntry[] = EXPLORER_TOOLS.map((tool) => ({
  id: tool.id,
  title: tool.title,
  description: tool.question,
  category: "blockchain-explorer",
  tags: [tool.category],
  networks: tool.chains,
  execution: "read-only blockchain",
  pricing: "free",
  availability: "available",
  path: `/inspect/${tool.id}/`,
  walletRequired: false,
  risk: tool.limitation,
}));
