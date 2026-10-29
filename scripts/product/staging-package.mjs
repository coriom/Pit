// Prepare a private static package. This script never invokes Vercel or changes access settings.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const roots = {
  operations: resolve("dist-operations"),
  toolbox: resolve("dist-local-toolbox-host/public"),
  explorer: resolve("dist-read-only-explorer-host/public"),
};
for (const [surface, root] of Object.entries(roots))
  if (!existsSync(join(root, "index.html"))) throw Error(`Missing checked ${surface} package`);
const opsHeaders = readFileSync(join(roots.operations, "_headers"), "utf8");
const opsCsp = opsHeaders.match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1]?.trim();
const hostCsp = (name) => {
  const config = JSON.parse(readFileSync(join(roots[name], "../vercel.json"), "utf8"));
  return config.headers?.find((item) => item.source === "/(.*)")?.headers
    ?.find((item) => item.key === "Content-Security-Policy")?.value;
};
const hosted = process.env.PIT_HOSTED_STAGING === "1";
const operationsCsp = hosted ? opsCsp?.replace("connect-src http://127.0.0.1:8545 https:", "connect-src 'none'") : opsCsp;
if (hosted && !operationsCsp?.includes("connect-src 'none'")) throw Error("Hosted operations CSP is not read-only");
const policies = { operations: operationsCsp, toolbox: hostCsp("toolbox"), explorer: hostCsp("explorer") };
if (!opsCsp?.includes("frame-ancestors 'none'") || !policies.toolbox?.includes("connect-src 'none'")
  || !policies.explorer?.includes("connect-src")) throw Error("Surface security policies missing");
const output = resolve("dist-product-staging");
const publicRoot = join(output, "public");
rmSync(output, { recursive: true, force: true });
mkdirSync(publicRoot, { recursive: true });
const files = new Map();
function copySurface(surface) {
  const root = roots[surface];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const source = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw Error(`Symlink in ${surface} artifact`);
      if (entry.isDirectory()) { visit(source); continue; }
      if (!entry.isFile()) throw Error(`Unexpected ${surface} artifact type`);
      const name = relative(root, source).replaceAll("\\", "/");
      if (name === "_headers" || name === "404.html" && surface !== "operations") continue;
      const destinationName = name === "index.html" && surface !== "operations" ? `${surface}/index.html` : name;
      if (name === "robots.txt" && surface !== "operations") continue;
      let bytes = readFileSync(source);
      if (surface === "toolbox" && name === "index.html") {
        const html = bytes.toString("utf8")
          .replaceAll('href="./_astro/', 'href="/_astro/')
          .replaceAll('href="./"', 'href="/toolbox/"')
          .replaceAll('href="./', 'href="/');
        bytes = Buffer.from(html);
      }
      const digest = createHash("sha256").update(bytes).digest("hex");
      const prior = files.get(destinationName);
      if (prior && prior.digest !== digest) throw Error(`Asset collision: ${destinationName}`);
      if (!prior) {
        const target = join(publicRoot, destinationName);
        mkdirSync(resolve(target, ".."), { recursive: true });
        writeFileSync(target, bytes);
        files.set(destinationName, { surface, digest });
      }
    }
  }
  visit(root);
}
copySurface("operations"); copySurface("toolbox"); copySurface("explorer");
const common = { "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer", "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()" };
const headers = [{ source: "/(.*)", headers: Object.entries(common).map(([key, value]) => ({ key, value })) }];
for (const [surface, sources] of Object.entries({
  operations: ["/", "/guide/(.*)", "/operations/(.*)"],
  toolbox: ["/toolbox/(.*)", "/tools/(.*)", "/tasks/(.*)", "/privacy/(.*)", "/legal/(.*)"],
  explorer: ["/explorer/(.*)", "/inspect/(.*)"],
})) for (const source of sources) headers.push({ source, headers: [{ key: "Content-Security-Policy", value: policies[surface] }] });
const vercel = { $schema: "https://openapi.vercel.sh/vercel.json", framework: null,
  outputDirectory: "public", headers };
writeFileSync(join(output, "vercel.json"), JSON.stringify(vercel, null, 2) + "\n");
const manifest = { schema: "pit.private-staging-static.v1", status: "BUILT_NOT_DEPLOYED", mode: hosted ? "hosted-read-only" : "local-candidate",
  surfaces: Object.fromEntries(Object.keys(roots).map((key) => [key, { csp: policies[key] }])),
  files: Object.fromEntries([...files.entries()].sort(([a], [b]) => a.localeCompare(b))),
  protectionRequired: "Vercel Authentication on all entrypoints; confirm before and after deploy",
  expectedFixedCost: "0 only if current project/account entitlement permits it; recheck before deployment" };
writeFileSync(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
if (!statSync(join(publicRoot, "toolbox/index.html")).isFile()
  || !statSync(join(publicRoot, "explorer/index.html")).isFile()) throw Error("Missing unified landing routes");
console.log(`PRIVATE STAGING PACKAGE PASS: ${files.size} static files; three distinct CSPs; NOT DEPLOYED`);
