// Local static artifact validation only. Access control must be checked at the hosting project.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = "dist-product-staging/public";
const manifest = JSON.parse(readFileSync("dist-product-staging/manifest.json", "utf8"));
const config = JSON.parse(readFileSync("dist-product-staging/vercel.json", "utf8"));
if (manifest.status !== "BUILT_NOT_DEPLOYED" || !manifest.protectionRequired.includes("all entrypoints"))
  throw Error("Staging protection status is misleading");
const required = ["index.html", "toolbox/index.html", "explorer/index.html", "tools/index.html",
  "inspect/batch-balances/index.html", "operations/token-creator/index.html",
  "operations/token-locker/index.html", "operations/token-vesting/index.html"];
for (const path of required) if (!existsSync(join(root, path))) throw Error(`Missing route ${path}`);
const html = readFileSync(join(root, "toolbox/index.html"), "utf8");
if (!html.includes('href="/tools/"') || html.includes('href="./tools/')
  || !html.includes('href="/_astro/')) throw Error("Toolbox navigation broke when moved under /toolbox/");
const paths = Object.keys(manifest.files);
if (paths.length < 200 || !paths.some((p) => p.startsWith("tasks/"))
  || !paths.some((p) => p.startsWith("inspect/"))
  || !paths.some((p) => p.startsWith("operations/"))) throw Error("Incomplete combined static package");
const cspFor = (prefix) => config.headers.find((item) => item.source === prefix)?.headers
  .find((item) => item.key === "Content-Security-Policy")?.value;
if (!cspFor("/toolbox/(.*)")?.includes("connect-src 'none'")
  || !cspFor("/tools/(.*)")?.includes("connect-src 'none'")
  || !cspFor("/explorer/(.*)")?.includes("connect-src")
  || !cspFor("/operations/(.*)")?.includes("frame-ancestors 'none'"))
  throw Error("Mixed-surface CSP is missing or weakened");
if (!config.headers.find((item) => item.source === "/(.*)")?.headers
  .some((item) => item.key === "X-Robots-Tag" && item.value === "noindex, nofollow"))
  throw Error("Private candidate must remain non-indexed");
const toolboxJs = readdirSync("dist-local-toolbox", { recursive: true }).filter((path) => path.endsWith(".js"));
if (toolboxJs.length) throw Error("Offline Toolbox produced JavaScript chunks");
console.log(`STAGING PACKAGE PASS: ${paths.length} files, three static surfaces, original deep links, CSP isolation; access still requires hosted verification`);
