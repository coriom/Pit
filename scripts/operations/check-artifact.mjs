import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = "dist-operations";
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(relative(root, path).replaceAll("\\", "/"));
  }
}
walk(root);
const expected = ["index.html", "404.html", "operations/token-creator/index.html", "operations/multisender/index.html", "operations/token-locker/index.html", "operations/token-vesting/index.html"].sort();
const html = files.filter((name) => name.endsWith(".html")).sort();
if (JSON.stringify(html) !== JSON.stringify(expected)) throw Error(`Unexpected operation routes: ${html.join(", ")}`);
for (const name of files) if (!expected.includes(name) && name !== "_headers" && name !== "robots.txt" && !/^_astro\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(name)) throw Error(`Unexpected operation artifact: ${name}`);
const headers = readFileSync(join(root, "_headers"), "utf8");
if (!headers.includes("connect-src http://127.0.0.1:8545") || !headers.includes("X-Robots-Tag: noindex, nofollow") || /https:\/\//.test(headers)) throw Error("Unsafe operation headers");
for (const name of html) {
  const source = readFileSync(join(root, name), "utf8");
  if (!/noindex,nofollow/.test(source) || !/connect-src http:\/\/127\.0\.0\.1:8545/.test(source) || /https:\/\/(?:api\.cow\.fi|api\.hyperliquid|.*\.rpc\.)/.test(source)) throw Error(`Unsafe operation page: ${name}`);
}
if (files.some((name) => /(?:premium-worker|taxlot|\.map$)/i.test(name))) throw Error("Forbidden operation artifact");
console.log(`OPERATIONS LOCAL ARTIFACT PASS — ${html.length} HTML routes, ${files.length} files; noindex; localhost-only CSP; NOT DEPLOYED`);
