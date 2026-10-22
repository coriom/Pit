import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { publicOriginFromEnv, publicRobots, publicSitemap } from "./local-toolbox-publishing.mjs";

export const CANDIDATE_ROOT = "dist-local-toolbox";
export const HOST_ROOT = "dist-local-toolbox-host";
export const PUBLIC_CANDIDATE_ROOT = "dist-local-toolbox-public";
export const PUBLIC_HOST_ROOT = "dist-local-toolbox-public-host";
export const LOCAL_IDS = [
  "pnl", "swap-cost", "token-fee-converter", "yield-growth", "trade-risk",
  "execution-math", "bridge-cost", "portfolio-exposure", "portfolio-rebalance",
  "performance-drawdown", "staking-rewards", "vesting-unlocks",
  "collateral-health", "borrowing-cost", "liquidation", "amm-pool-math",
  "concentrated-liquidity", "impermanent-loss", "evm-data-inspector",
  "crypto-data-workshop",
];
export const LOCAL_TASK_IDS = [
  "eth-wei-gwei", "erc20-base-units", "rate-units", "stated-fee",
  "apr-to-apy", "apy-to-apr", "annualize-periodic-return", "simple-interest",
  "compound-growth", "recurring-contributions", "income-principal", "loss-recovery",
  "average-entry", "stop-risk-size", "risk-reward", "bid-ask-spread",
  "slippage-bounds", "gas-budget", "target-rebalance", "contribution-rebalance",
  "portfolio-shock", "flow-adjusted-performance", "flow-adjusted-drawdown",
  "staking-reward-projection", "claim-economics", "restaking-scenario",
  "linear-vesting", "initial-unlock-vesting", "tranche-unlocks",
  "collateral-health-factor", "collateral-adjustment", "collateral-shock",
  "debt-growth", "repayment-schedule", "borrowed-capital-carry",
  "amm-reserve-price", "amm-swap-output", "amm-proportional-liquidity",
  "cl-position-composition", "cl-price-scenario", "cl-fee-break-even",
  "evm-address-checksum", "evm-signature-hash", "abi-calldata-decode",
  "csv-structure-inspect", "csv-normalize-preview", "csv-deduplicate-export",
  "purchase-acquisition-cost", "fee-aware-break-even", "planned-stop-distance",
  "modeled-stop-loss", "net-target-payoff", "bid-ask-midpoint",
  "execution-reference-deviation", "maximum-input-bound", "maximum-gas-price",
  "rebalance-turnover", "rebalance-fee-drag", "minimum-contribution",
  "shock-concentration", "flow-neutral-monetary-gain", "best-observed-period",
  "worst-observed-period", "current-portfolio-drawdown", "flow-neutral-index",
  "gross-staking-rewards", "validator-commission", "claim-reward-threshold",
  "claim-wait-days", "slash-adjusted-principal", "restaked-net-growth",
  "vested-unreceived", "initial-unlock-share", "collateral-equity",
  "collateral-gross-leverage", "minimum-debt-repayment", "minimum-collateral-addition",
  "maximum-collateral-withdrawal", "collateral-critical-drop", "simple-borrow-interest",
  "compounded-final-debt", "repayment-total-interest", "carry-break-even-yield",
  "amm-manual-composition", "amm-reserve-impact", "amm-post-swap-price",
  "amm-new-lp-share", "cl-unused-token-budget", "cl-fees-including-costs",
  "perpetual-pnl", "perpetual-funding", "perpetual-margin", "futures-basis",
  "european-option-payoff", "black-scholes-greeks", "implied-volatility", "trade-expectancy",
];
export const LOCAL_PAGES = ["index.html", "tools/index.html", "privacy/index.html", "legal/index.html", ...LOCAL_IDS.map((id) => `tools/${id}/index.html`), ...LOCAL_TASK_IDS.map((id) => `tasks/${id}/index.html`)].sort();
const CONTENT_POLICY = [
  "default-src 'none'", "connect-src 'none'", "font-src 'self'", "img-src 'self'",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'",
];
const OTHER_HEADERS = {
  "Strict-Transport-Security": "max-age=86400",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
const privateHeaders = { ...OTHER_HEADERS, "X-Robots-Tag": "noindex, nofollow" };
const forbiddenCode = /\b(?:fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|indexedDB|localStorage|sessionStorage|eth_sendTransaction|eth_sendRawTransaction|eth_requestAccounts|personal_sign|eth_signTypedData|connectKit|wagmi|cowprotocol|hyperliquid|pit-taxlot-v1)\b|\bwindow\.ethereum\b/i;
const forbiddenAssets = /(?:autonomous-signer|private\.key|walletconnect|metamask|connectkit|taxlot|staging-accounting|uniswap-execution)/i;

async function walk(dir, root = dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await walk(path, root));
    else if (entry.isFile()) found.push(relative(root, path).replaceAll("\\", "/"));
    else throw Error(`Non-regular file in local toolbox: ${path}`);
  }
  return found.sort();
}

function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function cspHash(bytes) { return `'sha256-${createHash("sha256").update(bytes).digest("base64")}'`; }
async function inventoryHash(root, files) {
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(file); digest.update("\0");
    digest.update(await readFile(join(root, file))); digest.update("\0");
  }
  return digest.digest("hex");
}
function scripts(html, page) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/type=["']application\/ld\+json["']/i.test(match[1]))
    .map(([, attrs, body]) => {
      if (/\bsrc\s*=/.test(attrs)) throw Error(`External script: ${page}`);
      if (forbiddenCode.test(body)) throw Error(`Forbidden executable code: ${page}`);
      return body;
    });
}
function styles(html, page) {
  return [...html.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)].map(([, attrs, body]) => {
    if (/\bsrc\s*=/.test(attrs)) throw Error(`External style: ${page}`);
    return body;
  });
}
function metaPolicy(html, page) {
  const matches = [...html.matchAll(/<meta\s+http-equiv="content-security-policy"\s+content="([^"]+)"\s*\/?\s*>/gi)];
  if (matches.length !== 1) throw Error(`Missing or duplicate CSP meta: ${page}`);
  return matches[0][1].replaceAll("&amp;", "&").replace(/;+$/, "");
}
function assertLinks(html, page, allowed) {
  for (const [, href] of html.matchAll(/\bhref="([^"]+)"/gi)) {
    if (href.startsWith("#")) continue;
    if (/^(?:[a-z]+:|\/\/)/i.test(href)) throw Error(`External or executable link: ${page} -> ${href}`);
    const linkPath = href.split(/[?#]/)[0];
    const target = linkPath.startsWith("/") ? posix.normalize(linkPath) : posix.normalize(posix.join("/", posix.dirname(page), linkPath));
    const file = target.endsWith("/") ? `${target}index.html` : target;
    if (!allowed.has(file.slice(1))) throw Error(`Link leaves local toolbox: ${page} -> ${href}`);
  }
}
function validatePolicy(htmlByPage, policy) {
  const scriptActual = new Set(), styleActual = new Set();
  for (const [page, html] of htmlByPage) {
    if (metaPolicy(html, page) !== policy) throw Error(`Divergent CSP: ${page}`);
    for (const body of scripts(html, page)) scriptActual.add(cspHash(body));
    for (const body of styles(html, page)) styleActual.add(cspHash(body));
  }
  const directive = (name) => policy.split(`${name} `)[1]?.split(";")[0] ?? "";
  const declared = (name) => new Set(directive(name).match(/'sha256-[A-Za-z0-9+/=]+'/g) ?? []);
  if (JSON.stringify([...declared("script-src")].sort()) !== JSON.stringify([...scriptActual].sort()) ||
      JSON.stringify([...declared("style-src")].sort()) !== JSON.stringify([...styleActual].sort()))
    throw Error("CSP hash declarations differ from executable scripts or inline styles");
  if (!policy.includes("connect-src 'none'") || !policy.includes("default-src 'none'") ||
      /'unsafe-inline'|'unsafe-eval'|\bhttps?:/i.test(policy)) throw Error("Local toolbox CSP weakened");
  return { scriptHashes: [...scriptActual].sort(), styleHashes: [...styleActual].sort() };
}

async function candidateInventory(root, publicOrigin = null) {
  const files = await walk(root);
  const assets = files.filter((file) => file.startsWith("_astro/"));
  if (assets.length !== 1 || !/^_astro\/[\w.-]+\.css$/.test(assets[0]) || forbiddenAssets.test(assets[0]) ||
      JSON.stringify(files) !== JSON.stringify([...LOCAL_PAGES, "robots.txt", ...(publicOrigin ? ["sitemap.xml"] : []), ...assets].sort()))
    throw Error("Local toolbox file or route inventory differs from explicit allowlist");
  if (await readFile(join(root, "robots.txt"), "utf8") !== (publicOrigin ? publicRobots(publicOrigin) : "User-agent: *\nDisallow: /\n"))
    throw Error("Local toolbox robots policy changed");
  if (publicOrigin && await readFile(join(root, "sitemap.xml"), "utf8") !== publicSitemap(publicOrigin, LOCAL_IDS, LOCAL_TASK_IDS))
    throw Error("Local toolbox sitemap differs from approved routes");
  const css = await readFile(join(root, assets[0]), "utf8");
  if (/@import\s+(?:url\()?\s*["']?https?:\/\/|url\(\s*["']?https?:\/\//i.test(css))
    throw Error("Remote CSS in local toolbox");
  return { files, assets };
}

export async function prepareLocalCandidate(root = CANDIDATE_ROOT, { publicOrigin = null } = {}) {
  if (publicOrigin) {
    await writeFile(join(root, "robots.txt"), publicRobots(publicOrigin));
    await writeFile(join(root, "sitemap.xml"), publicSitemap(publicOrigin, LOCAL_IDS, LOCAL_TASK_IDS));
  }
  const { files, assets } = await candidateInventory(root, publicOrigin);
  const htmlByPage = await Promise.all(LOCAL_PAGES.map(async (page) => [page, await readFile(join(root, page), "utf8")]));
  const scriptHashes = new Set(), styleHashes = new Set();
  for (const [page, html] of htmlByPage) {
    metaPolicy(html, page);
    for (const body of scripts(html, page)) scriptHashes.add(cspHash(body));
    for (const body of styles(html, page)) styleHashes.add(cspHash(body));
  }
  if (scriptHashes.size !== 21 || styleHashes.size === 0) throw Error("Unexpected local toolbox executable/style count");
  const policy = [
    ...CONTENT_POLICY,
    `script-src ${[...scriptHashes].sort().join(" ")}`,
    `style-src 'self' ${[...styleHashes].sort().join(" ")}`,
  ].join("; ");
  for (const [page, original] of htmlByPage) {
    const prefix = "../".repeat(page.split("/").length - 1) || "./";
    const prepared = original
      .replace(/<meta\s+http-equiv="content-security-policy"\s+content="[^"]+"\s*\/?\s*>/i,
        `<meta http-equiv="content-security-policy" content="${policy}">`)
      .replaceAll('="/_astro/', `="${prefix}_astro/`)
      .replace("</head>", `<meta name="robots" content="${publicOrigin ? "index,follow" : "noindex,nofollow"}"></head>`);
    await writeFile(join(root, page), prepared);
  }
  return validateLocalCandidate(root, { expectedAssets: assets, expectedFiles: files, publicOrigin });
}

export async function validateLocalCandidate(root = CANDIDATE_ROOT, expected = {}) {
  const { publicOrigin = null } = expected;
  const { files, assets } = await candidateInventory(root, publicOrigin);
  if (expected.expectedAssets && JSON.stringify(assets) !== JSON.stringify(expected.expectedAssets)) throw Error("Local toolbox assets changed while preparing");
  if (expected.expectedFiles && JSON.stringify(files) !== JSON.stringify(expected.expectedFiles)) throw Error("Local toolbox files changed while preparing");
  const htmlByPage = await Promise.all(LOCAL_PAGES.map(async (page) => [page, await readFile(join(root, page), "utf8")]));
  const policy = metaPolicy(htmlByPage[0][1], LOCAL_PAGES[0]);
  const hashes = validatePolicy(htmlByPage, policy);
  const allowed = new Set(files);
  for (const [page, html] of htmlByPage) {
    const expectedRobots = publicOrigin ? "index,follow" : "noindex,nofollow";
    if (!html.includes(`<meta name="robots" content="${expectedRobots}">`)) throw Error(`Robots meta differs: ${page}`);
    if (publicOrigin && html.includes("data-publication-pending")) throw Error(`Publisher details still pending: ${page}`);
    const canonicalLinks = [...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]+)"\s*\/?\s*>/gi)];
    const path = page === "index.html" ? "/" : `/${page.slice(0, -"index.html".length)}`;
    if (publicOrigin ? canonicalLinks.length !== 1 || canonicalLinks[0][1] !== `${publicOrigin}${path}` : canonicalLinks.length !== 0)
      throw Error(`Canonical metadata differs: ${page}`);
    const withoutCanonical = html.replace(/<link\s+rel="canonical"\s+href="[^"]+"\s*\/?\s*>/gi, "");
    assertLinks(withoutCanonical, page, allowed);
    if (/\b(?:src|href)=["'](?:https?:|\/\/)/i.test(withoutCanonical)) throw Error(`Remote resource: ${page}`);
  }
  return { files, pages: LOCAL_PAGES.length, assets, ...hashes, policy, sha256: await inventoryHash(root, files) };
}

export async function validateLocalHost(candidateRoot = CANDIDATE_ROOT, hostRoot = HOST_ROOT, { publicOrigin = null } = {}) {
  const candidate = await validateLocalCandidate(candidateRoot, { publicOrigin });
  const hostFiles = await walk(hostRoot);
  const expected = ["manifest.json", "vercel.json", ...candidate.files.map((file) => `public/${file}`)].sort();
  if (JSON.stringify(hostFiles) !== JSON.stringify(expected)) throw Error("Host package has an unreviewed file");
  const config = JSON.parse(await readFile(join(hostRoot, "vercel.json"), "utf8"));
  const expectedConfig = {
    $schema: "https://openapi.vercel.sh/vercel.json",
    framework: null,
    outputDirectory: "public",
    headers: [{ source: "/(.*)", headers: Object.entries({
      "Content-Security-Policy": `${candidate.policy}; frame-ancestors 'none'`, ...(publicOrigin ? OTHER_HEADERS : privateHeaders),
    }).map(([key, value]) => ({ key, value })) }],
  };
  if (JSON.stringify(config) !== JSON.stringify(expectedConfig) || Object.keys(config).length !== 4)
    throw Error("Unexpected local toolbox Vercel configuration");
  const manifest = JSON.parse(await readFile(join(hostRoot, "manifest.json"), "utf8"));
  const manifestFiles = await Promise.all(candidate.files.map(async (file) => ({
    path: file, bytes: (await readFile(join(candidateRoot, file))).length,
    sha256: hash(await readFile(join(candidateRoot, file))),
  })));
  if (JSON.stringify(manifest) !== JSON.stringify({ version: 1, candidateSha256: candidate.sha256, files: manifestFiles }))
    throw Error("Local toolbox manifest differs from public contents");
  for (const file of candidate.files) {
    const a = await readFile(join(candidateRoot, file));
    const b = await readFile(join(hostRoot, "public", file));
    if (!a.equals(b)) throw Error(`Host copy differs: ${file}`);
  }
  return { ...candidate, hostFiles, manifest, config, hostSha256: await inventoryHash(hostRoot, hostFiles) };
}

export async function prepareLocalHost(candidateRoot = CANDIDATE_ROOT, hostRoot = HOST_ROOT, { publicOrigin = null } = {}) {
  const candidate = await prepareLocalCandidate(candidateRoot, { publicOrigin });
  await rm(hostRoot, { recursive: true, force: true });
  await mkdir(join(hostRoot, "public"), { recursive: true });
  for (const file of candidate.files) {
    await mkdir(dirname(join(hostRoot, "public", file)), { recursive: true });
    await copyFile(join(candidateRoot, file), join(hostRoot, "public", file));
  }
  const config = {
    $schema: "https://openapi.vercel.sh/vercel.json",
    framework: null,
    outputDirectory: "public",
    headers: [{ source: "/(.*)", headers: Object.entries({
      "Content-Security-Policy": `${candidate.policy}; frame-ancestors 'none'`, ...(publicOrigin ? OTHER_HEADERS : privateHeaders),
    }).map(([key, value]) => ({ key, value })) }],
  };
  await writeFile(join(hostRoot, "vercel.json"), `${JSON.stringify(config, null, 2)}\n`);
  const files = await Promise.all(candidate.files.map(async (file) => {
    const data = await readFile(join(candidateRoot, file));
    return { path: file, bytes: data.length, sha256: hash(data) };
  }));
  await writeFile(join(hostRoot, "manifest.json"), `${JSON.stringify({ version: 1, candidateSha256: candidate.sha256, files }, null, 2)}\n`);
  return validateLocalHost(candidateRoot, hostRoot, { publicOrigin });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const publicOrigin = publicOriginFromEnv();
  if (Boolean(publicOrigin) !== process.argv.includes("--public")) throw Error("Toolbox build mode and package mode differ");
  const candidateRoot = publicOrigin ? PUBLIC_CANDIDATE_ROOT : CANDIDATE_ROOT;
  const hostRoot = publicOrigin ? PUBLIC_HOST_ROOT : HOST_ROOT;
  const result = process.argv.includes("--verify")
    ? await validateLocalHost(candidateRoot, hostRoot, { publicOrigin })
    : await prepareLocalHost(candidateRoot, hostRoot, { publicOrigin });
  console.log(`LOCAL TOOLBOX PACKAGE PASS — ${result.pages} pages; ${result.files.length} served files; ${result.hostFiles.length} package files; ${result.scriptHashes.length} exact script hashes; candidate SHA-256 ${result.sha256}; package SHA-256 ${result.hostSha256}; NOT DEPLOYED`);
}
