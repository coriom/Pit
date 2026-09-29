import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
// Relative HTML asset URLs support root hosting and IPFS /ipfs/CID/ gateways.
// JS chunks already resolve their imports relative to their own URL.
async function visit(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) await visit(p);
    else if (p.endsWith(".html")) {
      const depth = path
        .relative("dist", path.dirname(p))
        .split(path.sep)
        .filter(Boolean).length;
      const prefix = depth ? "../".repeat(depth) : "./";
      let html = await readFile(p, "utf8");
      html = html.replaceAll('="/_astro/', `="${prefix}_astro/`);
      // ConnectKit uses dynamic styled-components styles. Restrict scripts with Astro hashes;
      // allow inline CSS explicitly, without hash sources that would override unsafe-inline.
      html = html.replace(
        /style-src[^;\"]*/g,
        "style-src 'self' 'unsafe-inline'",
      );
      await writeFile(p, html);
    }
  }
}
await visit("dist");
