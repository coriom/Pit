import { LOCAL_TASK_INVENTORY } from "./local-task-registry";
import { LOCAL_TOOLS } from "./local-toolbox";
import { categoryForLocal, type V2CatalogueEntry } from "./v2-catalog-core";

// Adapter over the existing reviewed task registry. The engine contracts and
// stable URLs remain authoritative in LOCAL_TASK_INVENTORY and LOCAL_TOOLS.
export const V2_LOCAL_TASKS: readonly V2CatalogueEntry[] = LOCAL_TASK_INVENTORY.filter((task) => task.status !== "extraction-needed").map((task) => ({
  id: task.id,
  title: task.title,
  description: task.question,
  category: categoryForLocal(task.engineId, task.category, task.id),
  tags: [task.category, task.engineId, task.status === "genuinely-new" ? "new capability" : "reviewed calculation"],
  networks: [],
  execution: "local",
  pricing: "free",
  availability: "available",
  path: task.path,
  walletRequired: false,
  risk: task.assumptions,
}));

export const V2_LOCAL_WORKSPACES: readonly V2CatalogueEntry[] = LOCAL_TOOLS.map((tool) => ({
  id: tool.id,
  title: tool.title,
  description: tool.description,
  category: categoryForLocal(tool.id, tool.category),
  tags: [tool.category, "full workspace"],
  networks: [],
  execution: "local",
  pricing: "free",
  availability: "available",
  path: tool.path,
  walletRequired: false,
  risk: "Manual assumptions only; no live quotes or transactions.",
}));
