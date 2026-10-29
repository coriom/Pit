// Offline integrity and no-signing gate for the prospective Access-protected Worker.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const sha = (data) => createHash("sha256").update(data).digest("hex");
const source = JSON.parse(readFileSync("dist-product-staging/manifest.json", "utf8"));
const root = "dist-product-cloudflare-staging/public";
const configBytes = readFileSync("dist-product-cloudflare-staging/wrangler.jsonc");
const config = JSON.parse(configBytes);
const headers = readFileSync(join(root, "_headers"), "utf8");
if (source.mode !== "hosted-read-only" || source.status !== "BUILT_NOT_DEPLOYED"
  || config.name !== "pit-v2-private-staging" || config.workers_dev !== false
  || config.preview_urls !== false || config.routes || config.route || config.triggers
  || config.assets?.directory !== "./public")
  throw Error("Cloudflare staging could expose an unreviewed route");
if (!headers.includes("X-Robots-Tag: noindex, nofollow")
  || !source.surfaces.toolbox.csp.includes("connect-src 'none'")
  || !source.surfaces.operations.csp.includes("connect-src 'none'")
  || !headers.includes(source.surfaces.operations.csp))
  throw Error("Staging CSP or noindex policy changed");
const tracked = Object.entries(source.files);
for (const [path, metadata] of tracked) {
  const bytes = readFileSync(join(root, path));
  if (sha(bytes) !== metadata.digest) throw Error(`Staging file hash mismatch: ${path}`);
}
function walk(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? walk(join(dir, entry.name), `${prefix}${entry.name}/`)
    : [`${prefix}${entry.name}`]);
}
const actual = walk(root).sort();
const expected = ["_headers", ...tracked.map(([path]) => path)].sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error("Unexpected staging asset");
const paths = tracked.map(([path]) => path);
if (paths.filter((path) => /^inspect\/[^/]+\/index\.html$/.test(path)).length !== 28
  || paths.filter((path) => /^operations\/[^/]+\/index\.html$/.test(path)).length !== 18
  || paths.filter((path) => /^tasks\/[^/]+\/index\.html$/.test(path)).length < 145)
  throw Error("Catalog route coverage changed");
for (const path of paths.filter((entry) => entry.startsWith("operations/") && entry.endsWith("/index.html"))) {
  const page = readFileSync(join(root, path), "utf8");
  if (!page.includes("Private read-only preview") || page.includes('id="operation-root"')
    || page.includes("paid-local=1") || !page.includes("connect-src 'none'"))
    throw Error(`Hosted execution exposed: ${path}`);
}
const scripts = paths.filter((path) => path.endsWith(".js")).map((path) => readFileSync(join(root, path), "utf8")).join("\n");
if (/eth_sendTransaction|eth_sendRawTransaction|eth_requestAccounts|writeContract|deployContract|sendTransaction|createWalletClient|127\.0\.0\.1:8545/.test(scripts))
  throw Error("Transaction or loopback RPC code leaked into hosted package");
console.log(JSON.stringify({ status: "PASS_LOCAL_ONLY", files: tracked.length, inspections: 28,
  operations: 18, configSha256: sha(configBytes), headersSha256: sha(headers),
  assetManifestSha256: sha(readFileSync("dist-product-staging/manifest.json")) }));
