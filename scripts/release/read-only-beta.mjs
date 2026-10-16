import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, posix } from "node:path";
import { fileURLToPath } from "node:url";

export const BETA_ROOT = "dist-readonly-beta";
export const BETA_PAGES = [
  "index.html", "tools/index.html", "tools/portfolio-exposure/index.html",
  "tools/swap-cost/index.html", "tools/impermanent-loss/index.html",
  "tools/pnl/index.html", "tools/bridge-cost/index.html",
  "tools/liquidation/index.html",
];
const forbiddenExecutable = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|indexedDB|eth_sendTransaction|eth_sendRawTransaction|eth_requestAccounts|personal_sign|eth_signTypedData|signTypedData|connectKit|wagmi|cowprotocol|hyperliquid|uniswap-execution|pit-taxlot-v1)\b/i;
const sensitiveAssets = /(?:autonomous-signer|private.key|walletconnect|metamask|connectkit|taxlot|staging-accounting|uniswap-execution)/i;
const headerNames = ["Content-Security-Policy", "Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "X-Robots-Tag"];

async function walk(dir, root = dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path, root));
    else files.push(relative(root, path).replaceAll("\\", "/"));
  }
  return files.sort();
}
function policyFrom(html, page) {
  const encoded = html.match(/<meta\s+http-equiv="content-security-policy"\s+content="([^"]+)"/i)?.[1];
  if (!encoded) throw Error(`Missing CSP meta: ${page}`);
  return encoded.replaceAll("&amp;", "&").replace(/;+$/, "");
}
function executableScripts(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/type="application\/ld\+json"/i.test(match[1]));
}
function assertLocalLinks(html, page, expected) {
  for (const [, href] of html.matchAll(/\bhref="([^"]+)"/gi)) {
    if (href.startsWith("#")) continue;
    if (/^(?:https?:|\/\/|javascript:|data:)/i.test(href)) throw Error(`External or executable link: ${page}`);
    const target = posix.normalize(posix.join("/", posix.dirname(page), href.split(/[?#]/)[0]));
    const file = target.endsWith("/") ? `${target}index.html` : target;
    if (!expected.has(file.slice(1))) throw Error(`Link leaves beta allowlist: ${page} -> ${href}`);
  }
}

export async function prepareAndValidateBeta(root = BETA_ROOT) {
  const files = await walk(root);
  const expected = new Set([...BETA_PAGES, "robots.txt", "_headers"]);
  const assets = files.filter((file) => file.startsWith("_astro/"));
  if (!assets.length || assets.some((name) => !/^_astro\/[\w.-]+\.css$/.test(name) || sensitiveAssets.test(name)))
    throw Error("Read-only beta contains unexpected executable or sensitive asset");
  assets.forEach((file) => expected.add(file));
  for (const asset of assets) {
    const css = await readFile(join(root, asset), "utf8");
    if (/@import\s+(?:url\()?\s*["']?https?:\/\/|url\(\s*["']?https?:\/\//i.test(css))
      throw Error(`Remote CSS resource in read-only beta: ${asset}`);
  }
  if (files.some((file) => !expected.has(file) && file !== "_headers") || BETA_PAGES.some((page) => !files.includes(page)))
    throw Error("Read-only beta routes or files differ from explicit allowlist");
  if (await readFile(join(root, "robots.txt"), "utf8") !== "User-agent: *\nDisallow: /\n")
    throw Error("Read-only beta robots policy changed");
  const policies = new Set();
  for (const page of BETA_PAGES) {
    const path = join(root, page);
    let html = await readFile(path, "utf8");
    const prefix = "../".repeat(page.split("/").length - 1) || "./";
    html = html.replaceAll('="/_astro/', `="${prefix}_astro/`);
    if (!html.includes('<meta name="robots" content="noindex,nofollow">'))
      html = html.replace("</head>", '<meta name="robots" content="noindex,nofollow"></head>');
    const policy = policyFrom(html, page);
    policies.add(policy);
    if (!policy.includes("connect-src 'none'") || !policy.includes("default-src 'none'") || !policy.includes("script-src 'self'") || /unsafe-eval|unsafe-inline/.test(policy.split("script-src")[1]?.split(";")[0] ?? ""))
      throw Error(`Read-only beta CSP weakened: ${page}`);
    for (const [, attrs, script] of executableScripts(html)) {
      if (/\bsrc\s*=/.test(attrs) || forbiddenExecutable.test(script)) throw Error(`Executable network/wallet code in ${page}`);
      const hash = `sha256-${createHash("sha256").update(script).digest("base64")}`;
      if (!policy.includes(`'${hash}'`)) throw Error(`CSP hash does not cover executable script: ${page}`);
    }
    assertLocalLinks(html, page, expected);
    await writeFile(path, html);
  }
  if (policies.size !== 1) throw Error("Read-only beta pages have divergent CSP policies");
  const policy = [...policies][0] + "; frame-ancestors 'none'";
  const headers = `/*\n  Content-Security-Policy: ${policy}\n  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  X-Robots-Tag: noindex\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n`;
  await writeFile(join(root, "_headers"), headers);
  if (headerNames.some((name) => !headers.includes(`${name}:`))) throw Error("Read-only beta security header missing");
  const hash = createHash("sha256");
  for (const file of (await walk(root)).sort()) {
    hash.update(file); hash.update("\0"); hash.update(await readFile(join(root, file))); hash.update("\0");
  }
  return { pages: BETA_PAGES.length, assets: assets.length, artifactSha256: hash.digest("hex"), files: (await walk(root)).length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await prepareAndValidateBeta();
  console.log(`READ-ONLY BETA PASS — ${result.pages} allowlisted pages; ${result.assets} CSS assets; ${result.files} files; SHA-256 ${result.artifactSha256}; noindex; no executable chunks`);
}
