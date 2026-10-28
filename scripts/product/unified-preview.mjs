import { createServer } from "node:http";
import { existsSync, readFileSync, statSync, createReadStream, readdirSync } from "node:fs";
import { resolve, relative, extname, join } from "node:path";
import { createHash } from "node:crypto";

// Loopback-only static composition. It does not proxy requests, merge build
// outputs, add a backend, or grant wallet execution to a free surface.
const roots = {
  operations: resolve("dist-operations"),
  toolbox: resolve("dist-local-toolbox-host/public"),
  explorer: resolve("dist-read-only-explorer-host/public"),
};
for (const [name, root] of Object.entries(roots)) {
  if (!existsSync(join(root, "index.html")) || (name === "operations"
    ? !existsSync(join(root, "_headers"))
    : !existsSync(join(root, "../vercel.json"))))
    throw Error(`Missing checked ${name} package. Run pnpm product:preview:build first.`);
}
const headers = Object.fromEntries(Object.entries(roots).map(([name, root]) => {
  let csp;
  let noindex;
  if (name === "operations") {
    const source = readFileSync(join(root, "_headers"), "utf8");
    csp = source.match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1]?.trim();
    noindex = source.includes("X-Robots-Tag: noindex, nofollow");
  } else {
    const config = JSON.parse(readFileSync(join(root, "../vercel.json"), "utf8"));
    const policy = config.headers?.find((rule) => rule.source === "/(.*)")?.headers ?? [];
    csp = policy.find((entry) => entry.key === "Content-Security-Policy")?.value;
    noindex = policy.find((entry) => entry.key === "X-Robots-Tag")?.value === "noindex, nofollow";
  }
  if (!csp || !noindex) throw Error(`Unsafe ${name} headers`);
  if (name === "toolbox" && !csp.includes("connect-src 'none'")) throw Error("Toolbox network isolation missing");
  return [name, csp];
}));
const assetOwners = new Map();
for (const [name, root] of Object.entries(roots)) {
  const dir = join(root, "_astro");
  if (!existsSync(dir)) continue;
  for (const asset of readdirSync(dir)) {
    const path = join(dir, asset);
    if (!statSync(path).isFile()) continue;
    const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
    const previous = assetOwners.get(asset);
    if (previous && previous.hash !== hash) throw Error(`Conflicting isolated asset: ${asset}`);
    assetOwners.set(asset, { name, hash });
  }
}
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon" };
const port = Number(process.env.PIT_PRODUCT_PREVIEW_PORT ?? 4414);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("Invalid preview port");
const server = createServer((request, response) => {
  if (!["GET", "HEAD"].includes(request.method ?? "")) { response.writeHead(405).end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname); }
  catch { response.writeHead(400).end(); return; }
  if (pathname.includes("\\") || pathname.split("/").includes("..") || pathname.includes("\0")) { response.writeHead(400).end(); return; }
  let name = pathname === "/explorer" || pathname.startsWith("/explorer/") || pathname.startsWith("/inspect/") ? "explorer"
    : pathname === "/toolbox" || pathname.startsWith("/toolbox/") || pathname.startsWith("/tools/") || pathname.startsWith("/tasks/") || pathname.startsWith("/privacy/") || pathname.startsWith("/legal/") ? "toolbox"
    : "operations";
  if (pathname.startsWith("/_astro/")) name = assetOwners.get(pathname.slice(8))?.name ?? "operations";
  const relativePath = name === "toolbox" && pathname.startsWith("/toolbox") ? pathname.slice(8)
    : name === "explorer" && pathname.startsWith("/explorer") ? pathname.slice(9) : pathname;
  const root = roots[name];
  const path = resolve(root, `.${relativePath.endsWith("/") ? `${relativePath}index.html` : relativePath}`);
  if (relative(root, path).startsWith("..") || !existsSync(path) || !statSync(path).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" }).end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": types[extname(path)] ?? "application/octet-stream",
    "Content-Security-Policy": headers[name],
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cache-Control": "no-store",
  });
  if (request.method === "HEAD") response.end();
  else createReadStream(path).pipe(response);
});
server.listen(port, "127.0.0.1", () => console.log(`PIT unified PRIVATE LOCAL preview: http://127.0.0.1:${port}/`));
