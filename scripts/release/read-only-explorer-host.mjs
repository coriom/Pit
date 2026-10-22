import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = "dist-read-only-explorer";
const HOST = "dist-read-only-explorer-host";
const IDS = ["native-balance", "selected-erc20-balances", "selected-erc20-allowances", "nft-approval", "ens-resolver", "nft-ownership", "account-code", "wallet-nonce"];
const PAGES = ["index.html", "404.html", ...IDS.map((id) => `inspect/${id}/index.html`)].sort();
const HEADERS = {
  "Strict-Transport-Security": "max-age=86400",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-Robots-Tag": "noindex, nofollow",
};
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function cspHash(bytes) { return `'sha256-${createHash("sha256").update(bytes).digest("base64")}'`; }
async function walk(dir, root = dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path, root));
    else if (entry.isFile()) files.push(relative(root, path).replaceAll("\\", "/"));
    else throw Error(`Non-regular Explorer file: ${path}`);
  }
  return files.sort();
}
async function packageHash(root, files) {
  const digest = createHash("sha256");
  for (const file of files) { digest.update(file); digest.update("\0"); digest.update(await readFile(join(root, file))); digest.update("\0"); }
  return digest.digest("hex");
}
function extract(html, tag) { return [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, "gi"))]; }
function policy(htmlByPage, jsAsset) {
  const styleHashes = new Set();
  for (const [page, html] of htmlByPage) {
    if (!html.includes('<meta name="robots" content="noindex,nofollow"')) throw Error(`Explorer indexing gate missing: ${page}`);
    if (/<(?:script|link)\b[^>]*(?:src|href)=["']https?:/i.test(html)) throw Error(`Remote executable resource: ${page}`);
    for (const [, attrs, body] of extract(html, "script")) {
      if (body.trim()) throw Error(`Unexpected Explorer inline script: ${page}`);
      const src = attrs.match(/\bsrc="([^"]+)"/i)?.[1];
      if (!src || src !== `/${jsAsset}`) throw Error(`Unreviewed Explorer script: ${page}`);
    }
    for (const [, , body] of extract(html, "style")) styleHashes.add(cspHash(body));
    for (const [, href] of html.matchAll(/\bhref="([^"]+)"/g)) {
      if (href === "/" || href.startsWith("#")) continue;
      if (!IDS.some((id) => href === `/inspect/${id}/`)) throw Error(`Explorer link leaves allowlist: ${page} -> ${href}`);
    }
  }
  return [
    "default-src 'none'", "connect-src https://eth.drpc.org https://base.drpc.org",
    "script-src 'self'", `style-src 'self' ${[...styleHashes].sort().join(" ")}`,
    "font-src 'self'", "img-src 'self'", "object-src 'none'", "base-uri 'self'",
    "form-action 'none'", "frame-ancestors 'none'",
  ].join("; ");
}
export async function prepareExplorerHost(root = ROOT, host = HOST) {
  const files = await walk(root);
  const assets = files.filter((file) => file.startsWith("_astro/"));
  if (assets.length !== 1 || !/^_astro\/[\w.-]+\.js$/.test(assets[0]) || JSON.stringify(files) !== JSON.stringify([...PAGES, "robots.txt", ...assets].sort()))
    throw Error("Explorer emitted files differ from explicit read-only allowlist");
  if (await readFile(join(root, "robots.txt"), "utf8") !== "User-agent: *\nDisallow: /\n") throw Error("Explorer robots policy changed");
  const js = await readFile(join(root, assets[0]), "utf8");
  if (/eth_send(?:Raw)?Transaction|eth_requestAccounts|personal_sign|eth_signTypedData|walletClient|window\.ethereum|indexedDB|localStorage|sessionStorage|WebSocket|XMLHttpRequest|sendBeacon|cowprotocol|hyperliquid|taxlot/i.test(js))
    throw Error("Execution, wallet, accounting or storage code in Explorer bundle");
  if (!js.includes("https://eth.drpc.org/") || !js.includes("https://base.drpc.org/") || js.includes("eval(")) throw Error("Unexpected Explorer endpoint or executable code");
  const htmlByPage = await Promise.all(PAGES.map(async (page) => [page, await readFile(join(root, page), "utf8")]));
  const csp = policy(htmlByPage, assets[0]);
  const meta = /<meta\s+http-equiv="content-security-policy"\s+content="[^"]+"\s*\/?\s*>/i;
  for (const [page, html] of htmlByPage) {
    if (!meta.test(html)) throw Error(`Missing CSP meta: ${page}`);
    await writeFile(join(root, page), html.replace(meta, `<meta http-equiv="content-security-policy" content="${csp}">`));
  }
  await rm(host, { recursive: true, force: true });
  await mkdir(join(host, "public"), { recursive: true });
  for (const file of files) {
    await mkdir(dirname(join(host, "public", file)), { recursive: true });
    await copyFile(join(root, file), join(host, "public", file));
  }
  const config = {
    $schema: "https://openapi.vercel.sh/vercel.json", framework: null, outputDirectory: "public",
    headers: [{ source: "/(.*)", headers: Object.entries({ "Content-Security-Policy": csp, ...HEADERS }).map(([key, value]) => ({ key, value })) }],
  };
  await writeFile(join(host, "vercel.json"), `${JSON.stringify(config, null, 2)}\n`);
  const manifest = { version: 1, purpose: "read-only-explorer-private-candidate", files: await Promise.all(files.map(async (file) => {
    const bytes = await readFile(join(root, file));
    return { path: file, bytes: bytes.length, sha256: sha(bytes) };
  })) };
  await writeFile(join(host, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const hostFiles = await walk(host);
  if (JSON.stringify(hostFiles) !== JSON.stringify(["manifest.json", "vercel.json", ...files.map((file) => `public/${file}`)].sort())) throw Error("Explorer host inventory changed");
  for (const file of files) if (!(await readFile(join(root, file))).equals(await readFile(join(host, "public", file)))) throw Error(`Explorer host copy differs: ${file}`);
  return { pages: PAGES.length, tasks: IDS.length, files: hostFiles.length, bytes: (await Promise.all(hostFiles.map(async (file) => (await readFile(join(host, file))).length))).reduce((a, b) => a + b, 0), sha256: await packageHash(host, hostFiles), csp };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await prepareExplorerHost();
  console.log(`EXPLORER PACKAGE PASS — ${result.tasks} read-only tasks, ${result.pages} HTML pages, ${result.files} package files, ${result.bytes} bytes, SHA-256 ${result.sha256}; NOT DEPLOYED`);
}
