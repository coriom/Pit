// PIT_AUTONOMOUS_SIGNER_TEST_ONLY — read-only validation of an actual browser CSV.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { parseUnits } from "viem";

const dir = "docs/audit/phase-w";
const original = process.argv.includes("--original");
const restore = (value) => typeof value === "string" &&
  /^public-hash:[0-9a-fA-F]{32}:[0-9a-fA-F]{32}$/.test(value)
  ? `0x${value.slice(12, 44)}${value.slice(45)}` : value;
const source = JSON.parse(await readFile(`${dir}/live-fill.json`, "utf8"), (_key, value) => restore(value));
const csv = (await readFile(`${dir}/${original ? "live-taxlot.csv" : "live-taxlot-import.csv"}`, "utf8"))
  .replace(/public-hash:[0-9a-fA-F]{32}:[0-9a-fA-F]{32}/g, restore);
const taxlot = "/home/corio/TAXLOT";
const localSchema = await readFile("schemas/events.v1.json");
const upstreamSchema = await readFile(`${taxlot}/schemas/events.v1.json`);
assert.deepEqual(localSchema, upstreamSchema, "BLOCKED — Taxlot schema divergence");
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(localSchema.toString()));
const event = source.event;
assert.equal(validate(event), true, JSON.stringify(validate.errors));
assert.equal(event.type, "trade");
assert.equal(event.account.toLowerCase(), source.trade.owner.toLowerCase());
assert.equal(parseUnits(event.quantity, 18), BigInt(source.trade.sellAmountBeforeFees));
assert.equal(parseUnits(event.counter_quantity, 6), BigInt(source.trade.buyAmount));
assert.equal(parseUnits(event.fee[0].quantity, 18),
  BigInt(source.trade.sellAmount) - BigInt(source.trade.sellAmountBeforeFees));
const importerPath = resolve(taxlot, "src/importers/index.ts");
await readFile(importerPath);
const temp = await mkdtemp("/tmp/pit-live-taxlot-import-");
await build({ entryPoints: [importerPath], bundle: true, platform: "node", format: "esm",
  outfile: `${temp}/importer.mjs`, logLevel: "silent" });
const { importCsv } = await import(pathToFileURL(`${temp}/importer.mjs`).href);
const options = { platform: "Generic", account: event.account, fileId: `pit-live-${source.orderUid}`,
  mapping: { timestamp: "timestamp", type: "type", asset: "asset", quantity: "quantity",
    counter_asset: "counter_asset", counter_quantity: "counter_quantity", fee_asset: "fee_asset",
    fee_quantity: "fee_quantity", txid: "txid" } };
const imported = importCsv(csv, options);
if (original) {
  const failure = { stage: "ORIGINAL_BROWSER_EXPORT_IMPORT", status: "BLOCKED",
    importedCount: imported.events.length, issues: imported.issues };
  console.log(JSON.stringify(failure));
  process.exit(imported.issues.length ? 2 : 1);
}
assert.deepEqual(imported.issues, []);
assert.equal(imported.events.length, 1);
assert.equal(validate(imported.events[0]), true, JSON.stringify(validate.errors));
const parsed = imported.events[0];
assert.equal(parsed.type, "trade");
assert.equal(parseUnits(parsed.quantity, 18), BigInt(source.trade.sellAmountBeforeFees));
assert.equal(parseUnits(parsed.counter_quantity, 6), BigInt(source.trade.buyAmount));
assert.equal(parseUnits(parsed.fee[0]?.quantity ?? "0", 18),
  BigInt(source.trade.sellAmount) - BigInt(source.trade.sellAmountBeforeFees));
const differences = [];
for (const key of new Set([...Object.keys(event), ...Object.keys(parsed)])) {
  if (JSON.stringify(event[key] ?? null) !== JSON.stringify(parsed[key] ?? null))
    differences.push({ field: key, pit: event[key] ?? null, taxlot: parsed[key] ?? null });
}
const result = { orderUid: source.orderUid, schemaValid: true, type: "trade", importerIssues: [],
  economicReconciliation: "MATCH", importedCount: 1, metadataDifferences: differences };
const resultPath = `${dir}/live-import-result.json`;
try {
  const existing = JSON.parse(await readFile(resultPath, "utf8"));
  assert.deepEqual(existing, result, "Stored importer result changed on replay");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  await writeFile(resultPath, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
}
console.log(JSON.stringify(result));
