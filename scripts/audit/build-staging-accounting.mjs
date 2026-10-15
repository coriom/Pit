// Builds an isolated audit addendum outside dist. Never part of pnpm build.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = "/tmp/pit-y5-staging-accounting";
const html = readFileSync("dist/tools/index.html", "utf8");
const meta = html.match(/<meta\s+http-equiv="content-security-policy"\s+content="([^"]+)"/i)?.[1];
if (!meta) throw Error("Built Astro CSP is missing");
const directory = join(out, "__pit-staging-accounting");
mkdirSync(directory, { recursive: true, mode: 0o700 });
await build({
  entryPoints: ["scripts/audit/staging-accounting-harness.ts"],
  outfile: join(directory, "audit.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
  minify: true,
  sourcemap: false,
});
writeFileSync(join(directory, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow">
<meta http-equiv="content-security-policy" content="${meta}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PIT staging synthetic accounting check</title></head>
<body><main><h1>Staging synthetic accounting check</h1>
<p>This test creates one synthetic spot trade in an empty, isolated browser. It is not a settlement or tax result. No wallet is required.</p>
<p>If any PIT accounting record already exists, this check refuses to write. Use a fresh authenticated browser profile; do not delete existing records.</p>
<ol>
<li><button id="create">A. Create synthetic record</button></li>
<li>Reload this page. <button id="verify">B. Verify persisted record</button></li>
<li><button id="export">C. Download PIT CSV</button></li>
<li>Choose the downloaded CSV: <input id="csv-file" type="file" accept=".csv,text/csv"> <button id="validate" disabled>D. Validate downloaded CSV</button>
<pre id="file-state" role="status"></pre></li>
<li><button id="cleanup" disabled>E. Clean up only this synthetic fixture</button></li>
<li>After cleanup, reopen this page with the original fixture ID in the URL and reload. <button id="absence">F. Verify synthetic fixture absent</button></li>
</ol><pre id="report" role="status"></pre></main>
<script type="module" src="/__pit-staging-accounting/audit.js"></script>
</body></html>`);
console.log(`Staging-only audit files written under ${out}; normal dist unchanged.`);
