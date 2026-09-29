import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function walk(dir) {
  const files = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) files.push(...(await walk(p)));
    else if (!p.endsWith("build-manifest.json")) files.push(p);
  }
  return files.sort();
}
const files = await walk("dist");
const entries = await Promise.all(
  files.map(async (p) => [
    p.slice(5),
    createHash("sha256")
      .update(await readFile(p))
      .digest("hex"),
  ]),
);
const hash = createHash("sha256").update(JSON.stringify(entries)).digest("hex");
await writeFile(
  "dist/build-manifest.json",
  JSON.stringify(
    { algorithm: "sha256", hash, files: Object.fromEntries(entries) },
    null,
    2,
  ),
);
console.log(`Build SHA-256: ${hash}`);
