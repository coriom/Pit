// PIT_AUTONOMOUS_SIGNER_TEST_ONLY — reversible representation of VERIFIED public
// transaction/block hashes in audit evidence. Never use this for unknown values.
import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";

const dir = "docs/audit/phase-w";
const settlement = JSON.parse(await readFile(`${dir}/settlement-verification.json`, "utf8"));
const hashes = [settlement.txHash, settlement.blockHash];
for (const hash of hashes) assert.match(hash, /^0x[0-9a-fA-F]{64}$/);
assert.equal(settlement.status, "success");
assert.equal(settlement.chainId, 11155111);
const representation = (hash) => `public-hash:${hash.slice(2, 34)}:${hash.slice(34)}`;
for (const name of await readdir(dir)) {
  if (!/\.(?:json|md|csv|txt)$/.test(name)) continue;
  const path = `${dir}/${name}`;
  const source = await readFile(path, "utf8");
  let changed = source;
  for (const hash of hashes)
    changed = changed.replaceAll(hash, representation(hash));
  if (changed !== source) {
    await writeFile(path, changed);
    console.log(`${path}: public verified hashes represented reversibly`);
  }
}
