// Execute the real workspace importer read-only. No substitute importer is permitted.
import { build } from "esbuild";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const root = process.env.PIT_TAXLOT_REPO ?? "/home/corio/TAXLOT";
const out = "docs/audit/phase-i";
await mkdir(out, { recursive: true });
const importerPath = resolve(root, "src/importers/index.ts");
try {
  await readFile(importerPath);
} catch {
  console.error("BLOCKED — real Taxlot importer not available to PIT");
  process.exit(2);
}
const local = await readFile("schemas/events.v1.json"),
  upstream = await readFile(resolve(root, "schemas/events.v1.json"));
assert.deepEqual(local, upstream, "BLOCKED: Taxlot schema divergence");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const tmp = await mkdtemp("/tmp/pit-taxlot-roundtrip-");
await build({
  entryPoints: [importerPath],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: tmp + "/importer.mjs",
  logLevel: "silent",
});
await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `import 'fake-indexeddb/auto'; export {recordCowFill} from './src/lib/record-fills'; export {eventDB,listEvents,eventsCSV,assertEvent} from './src/lib/events';`,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: tmp + "/pit.mjs",
  logLevel: "silent",
});
const { importCsv } = await import(pathToFileURL(tmp + "/importer.mjs").href);
const pit = await import(pathToFileURL(tmp + "/pit.mjs").href);
globalThis.location = new URL("http://localhost:4321/");
const account = "0x3333333333333333333333333333333333333333";
const eth = "0x1111111111111111111111111111111111111111",
  stable = "0x2222222222222222222222222222222222222222";
const fills = [
  {
    owner: account,
    orderUid: "synthetic-cow-one",
    blockNumber: 1,
    logIndex: 0,
    sellToken: eth,
    buyToken: stable,
    sellAmountBeforeFees: "1000000000000000001",
    sellAmount: "1000000000000000002",
    buyAmount: "3000000000",
    txHash: "fixture-tx-1",
  },
  {
    owner: account,
    orderUid: "synthetic-cow-two",
    blockNumber: 2,
    logIndex: 0,
    sellToken: stable,
    buyToken: eth,
    sellAmountBeforeFees: "1234567",
    sellAmount: "1234568",
    buyAmount: "617283500000000",
    txHash: "fixture-tx-2",
  },
];
const db = await pit.eventDB();
await db.put("meta", 42, "sequence");
db.close();
const provider = {
  getChainId: async () => 11155111,
  readContract: async ({ address }) => (address === eth ? 18 : 6),
  getBlock: async ({ blockNumber }) => ({
    timestamp: 1790683200n + blockNumber,
  }),
};
for (const fill of fills)
  assert.equal(await pit.recordCowFill(fill, 11155111, provider), true);
const events = await pit.listEvents(account);
events.forEach(pit.assertEvent);
const csv = pit.eventsCSV(events);
await writeFile(out + "/cow-fixture.csv", csv);
const options = {
  platform: "Generic",
  account,
  fileId: "pit-phase-i-fixture",
  mapping: {
    timestamp: "timestamp",
    type: "type",
    asset: "asset",
    quantity: "quantity",
    counter_asset: "counter_asset",
    counter_quantity: "counter_quantity",
    fee_asset: "fee_asset",
    fee_quantity: "fee_quantity",
    txid: "txid",
  },
};
const imported = importCsv(csv, options);
assert.deepEqual(imported.issues, []);
assert.equal(imported.events.length, 2);
imported.events.forEach(pit.assertEvent);
assert.deepEqual(
  importCsv(csv, options),
  imported,
  "Importer must be deterministic for identical input/options",
);
const differences = [];
for (let i = 0; i < events.length; i++) {
  const before = events[i],
    after = imported.events[i];
  for (const key of [
    "version",
    "type",
    "timestamp",
    "quantity",
    "counter_quantity",
    "txid",
    "account",
  ])
    assert.deepEqual(after[key], before[key], key);
  for (const key of ["asset", "counter_asset"])
    assert.equal(after[key], before[key].toUpperCase(), key);
  assert.equal(after.fee.length, 1);
  assert.equal(after.fee[0].quantity, before.fee[0].quantity);
  assert.equal(after.fee[0].asset, before.fee[0].asset.toUpperCase());
  assert.equal(after.type, "trade");
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)]))
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      differences.push({
        row: i + 1,
        field: key,
        pit: before[key] ?? null,
        taxlot: after[key] ?? null,
      });
}
const evidence = {
  fixture: true,
  live_execution: false,
  taxlotHead: execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  schemaSha256: sha(local),
  importerPath,
  importerSha256: sha(await readFile(importerPath)),
  options,
  sourceFills: fills,
  persisted: events,
  imported,
  differences,
};
await writeFile(
  out + "/roundtrip.json",
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log("Real importer:", importerPath);
console.log("Taxlot HEAD:", evidence.taxlotHead);
console.log("Schema byte-identical:", evidence.schemaSha256);
console.log("Importer SHA256:", evidence.importerSha256);
console.log(
  "Synthetic CoW fills -> actual PIT recorder -> IndexedDB -> CSV -> actual Taxlot Generic importer",
);
console.log(
  "Persisted/schema-valid:",
  events.length,
  "Imported/schema-valid:",
  imported.events.length,
  "Blocking issues:",
  imported.issues.length,
);
console.log(
  "Exact economic fields preserved; asset IDs uppercased by upstream assetName; deterministic replay: PASS",
);
console.log("All field differences:", JSON.stringify(differences));
console.log("Artifacts: docs/audit/phase-i/cow-fixture.csv and roundtrip.json");
console.log(
  "No live execution and no tax calculation/valuation acceptance claimed.",
);
