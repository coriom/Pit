import { buildSync } from "esbuild";
import { writeFile } from "node:fs/promises";

const compiled = buildSync({
  entryPoints: ["src/lib/local-task-registry.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
  logLevel: "silent",
}).outputFiles?.[0]?.text;
if (!compiled) throw Error("Task inventory could not be compiled");
const source = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const { LOCAL_TASK_INVENTORY, PENDING_LOCAL_TASKS } = await import(source);
const result = {
  version: 1,
  definition: "A distinct manual user question with a stable direct URL; multi-mode workspaces are not double-counted.",
  counts: {
    complete: LOCAL_TASK_INVENTORY.length - PENDING_LOCAL_TASKS.length,
    existingSinglePage: LOCAL_TASK_INVENTORY.filter((entry) => entry.status === "existing").length,
    extractedDirectTask: LOCAL_TASK_INVENTORY.filter((entry) => entry.status === "extracted").length,
    genuinelyNewCapability: LOCAL_TASK_INVENTORY.filter((entry) => entry.status === "genuinely-new").length,
    pending: PENDING_LOCAL_TASKS.length,
  },
  tasks: LOCAL_TASK_INVENTORY,
};
const serialized = `${JSON.stringify(result, null, 2)}\n`;
const target = "docs/product/PIT-TOOLBOX-V1-TASKS.json";
if (process.argv.includes("--check")) {
  const { readFile } = await import("node:fs/promises");
  if (await readFile(target, "utf8") !== serialized) throw Error("Local task inventory JSON is stale");
  console.log(`PASS local task inventory: ${result.counts.complete} complete; ${result.counts.pending} pending`);
} else {
  await writeFile(target, serialized);
  console.log(`Wrote ${target}: ${result.counts.complete} complete; ${result.counts.pending} pending`);
}
