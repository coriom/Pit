// Convert the checked static PIT staging artifact for a future Access-protected Worker.
// This command does not call Cloudflare or deploy anything.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const source = resolve("dist-product-staging");
const target = resolve("dist-product-cloudflare-staging");
const manifest = JSON.parse(readFileSync(join(source, "manifest.json"), "utf8"));
const vercel = JSON.parse(readFileSync(join(source, "vercel.json"), "utf8"));
if (manifest.status !== "BUILT_NOT_DEPLOYED" || manifest.mode !== "hosted-read-only"
  || !manifest.surfaces.operations.csp.includes("connect-src 'none'") || Object.keys(manifest.files).length < 200)
  throw Error("Checked static staging package missing");
const csp = Object.fromEntries(Object.entries(manifest.surfaces).map(([name, value]) => [name, value.csp]));
if (!csp.toolbox.includes("connect-src 'none'") || !csp.operations.includes("frame-ancestors 'none'"))
  throw Error("Surface CSP isolation missing");
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(join(source, "public"), join(target, "public"), { recursive: true });
// No Worker code is needed. Worker-level Access must be configured before making workers.dev reachable.
const rules = [
  ["/*", [
    "X-Robots-Tag: noindex, nofollow",
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: no-referrer",
    "Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()",
  ]],
  ["/", [`Content-Security-Policy: ${csp.operations}`]],
  ["/guide/*", [`Content-Security-Policy: ${csp.operations}`]],
  ["/operations/*", [`Content-Security-Policy: ${csp.operations}`]],
  ["/toolbox/*", [`Content-Security-Policy: ${csp.toolbox}`]],
  ["/tools/*", [`Content-Security-Policy: ${csp.toolbox}`]],
  ["/tasks/*", [`Content-Security-Policy: ${csp.toolbox}`]],
  ["/privacy/*", [`Content-Security-Policy: ${csp.toolbox}`]],
  ["/legal/*", [`Content-Security-Policy: ${csp.toolbox}`]],
  ["/explorer/*", [`Content-Security-Policy: ${csp.explorer}`]],
  ["/inspect/*", [`Content-Security-Policy: ${csp.explorer}`]],
];
const headers = rules.map(([path, values]) => `${path}\n${values.map((value) => `  ${value}`).join("\n")}`).join("\n\n") + "\n";
if (rules.length > 100 || headers.split("\n").some((line) => line.length > 2000))
  throw Error("Cloudflare static header limits exceeded");
writeFileSync(join(target, "public", "_headers"), headers);
const expected = vercel.headers.find((item) => item.source === "/operations/(.*)")?.headers[0]?.value;
if (expected !== csp.operations) throw Error("Operations CSP differs from reviewed staging package");
// Fail closed: a later explicit hosting approval must first create the Worker without a public route,
// attach Worker-level Access to all traffic, verify it, then enable the reviewed hostname.
const config = {
  $schema: "../node_modules/wrangler/config-schema.json",
  name: "pit-v2-private-staging",
  compatibility_date: "2026-10-29",
  workers_dev: false,
  preview_urls: false,
  assets: { directory: "./public", html_handling: "auto-trailing-slash", not_found_handling: "404-page" },
};
writeFileSync(join(target, "wrangler.jsonc"), JSON.stringify(config, null, 2) + "\n");
for (const path of ["index.html", "toolbox/index.html", "explorer/index.html", "operations/token-creator/index.html", "404.html"])
  if (!existsSync(join(target, "public", path)) || !statSync(join(target, "public", path)).isFile())
    throw Error(`Missing Cloudflare staging route ${path}`);
console.log(`CLOUDFLARE STAGING PACKAGE PASS: ${Object.keys(manifest.files).length} checked static files, ${rules.length} header rules, public routes disabled; NOT DEPLOYED`);
