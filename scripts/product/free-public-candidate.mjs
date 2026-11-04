// Local-only finalizer. It cannot deploy, and it refuses to index unresolved legal content.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { freePublicRoutes, freeRobots, freeSitemap, sha256, validatePublicFreeConfig } from "./free-public-policy.mjs";

const input = process.env.PIT_FREE_PUBLIC_CONFIG;
if (!input) throw Error("PIT_FREE_PUBLIC_CONFIG must name a reviewed local JSON configuration.");
const config = validatePublicFreeConfig(JSON.parse(readFileSync(input, "utf8")));
const source = "dist-pit-free-rc";
const target = "dist-pit-free-public-candidate";
const sourceManifest = JSON.parse(readFileSync(join(source, "manifest.json"), "utf8"));
if (sourceManifest.status !== "PREPARED_NOT_PUBLISHED" || sourceManifest.indexingEnabled || sourceManifest.walletSigning || sourceManifest.paymentCollection)
  throw Error("Checked read-only Free source package required.");
const sourceRoot = join(source, "public");
const sourceFiles = JSON.parse(readFileSync("dist-product-staging/manifest.json", "utf8")).files;
const files = Object.keys(sourceFiles);
if (files.length !== sourceManifest.packageFiles) throw Error("Free package inventory changed.");
const routes = freePublicRoutes(files);
if (routes.length < 180 || routes.includes("/operations/token-creator/")) throw Error("Public Free route inventory changed.");
for (const name of files) {
  const bytes = readFileSync(join(sourceRoot, name));
  const expected = sourceFiles[name].digest;
  if (sha256(bytes) !== expected) throw Error(`Unverified source asset: ${name}`);
  if (/\.(?:html|js|json|css)$/.test(name) && /pit-v2-private-staging|coriolanmorel\.workers\.dev/i.test(bytes.toString("utf8")))
    throw Error(`Private staging reference in public asset: ${name}`);
}
if (existsSync(target)) rmSync(target, { recursive: true });
mkdirSync(target, { recursive: true });
cpSync(sourceRoot, join(target, "public"), { recursive: true });
const root = join(target, "public");
const escapeHtml = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const legalTitles = { notice: "Legal notice", privacy: "Privacy", terms: "Terms of use", cookies: "Cookies" };
const legalTemplate = readFileSync(join(root, "legal", "index.html"), "utf8");
for (const [key, title] of Object.entries(legalTitles)) {
  const name = key === "notice" ? "legal" : key;
  const file = join(root, name, "index.html");
  mkdirSync(join(root, name), { recursive: true });
  const facts = key === "notice" ? `<p>Publisher: ${escapeHtml(config.publisherName)} · ${escapeHtml(config.publisherStatus)} · ${escapeHtml(config.publisherRegistration)}.</p><p>Address: ${escapeHtml(config.publisherAddress)}. Contact: ${escapeHtml(config.contactEmail)}.</p><p>Host: ${escapeHtml(config.hostingProvider)}, ${escapeHtml(config.hostingAddress)}. Jurisdiction: ${escapeHtml(config.jurisdiction)}.</p>` : "";
  const privacyContact = key === "privacy" ? `<p>Privacy contact: ${escapeHtml(config.privacyEmail)}.</p>` : "";
  const article = `<article class="local-notice"><h1>${title}</h1>${facts}${privacyContact}<p>${escapeHtml(config.legalText[key])}</p><p><a href="/legal/">Legal</a> · <a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a> · <a href="/cookies/">Cookies</a></p></article>`;
  const legalHtml = legalTemplate.replace(/<title>[^<]*<\/title>/, `<title>${title} · PIT Free</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?\s*>/, `<meta name="description" content="${title} for PIT Free." />`)
    .replace(/<article class="local-notice">[\s\S]*?<\/article>/, article);
  if (!legalHtml.includes(article)) throw Error("Legal template could not be populated.");
  writeFileSync(file, legalHtml);
  if (!routes.includes(`/${name}/`)) routes.push(`/${name}/`);
}
routes.sort();
for (const name of readdirSync(root, { recursive: true })) {
  if (typeof name !== "string" || !name.endsWith(".html")) continue;
  const file = join(root, name);
  const path = name === "index.html" ? "/" : name === "404.html" ? null : `/${name.slice(0, -"index.html".length)}`;
  const indexable = path !== null && !path.startsWith("/operations/");
  let html = readFileSync(file, "utf8");
  if (!html.includes("</head>")) throw Error(`Malformed HTML: ${name}`);
  html = html.replace(/<meta\s+name="robots"\s+content="[^"]*"\s*\/?\s*>/gi, "")
    .replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?\s*>/gi, "");
  html = html.replace("</head>", `<meta name="robots" content="${indexable ? "index,follow" : "noindex,nofollow"}">${indexable ? `<link rel="canonical" href="${config.origin}${path}">` : ""}</head>`);
  if (html.includes("data-publication-pending")) throw Error(`Unresolved legal content: ${name}`);
  writeFileSync(file, html);
}
writeFileSync(join(root, "sitemap.xml"), freeSitemap(config.origin, routes));
writeFileSync(join(root, "robots.txt"), freeRobots(config.origin));
const oldHeaders = readFileSync(join(root, "_headers"), "utf8");
if (!oldHeaders.includes("X-Robots-Tag: noindex, nofollow")) throw Error("Expected private indexing guard missing.");
const toolboxCsp = sourceFiles["tools/index.html"] ? JSON.parse(readFileSync("dist-product-staging/manifest.json", "utf8")).surfaces.toolbox.csp : null;
if (!toolboxCsp?.includes("connect-src 'none'")) throw Error("Toolbox CSP missing.");
writeFileSync(join(root, "_headers"), oldHeaders.replace("  X-Robots-Tag: noindex, nofollow\n", "") + `\n/operations/*\n  X-Robots-Tag: noindex, nofollow\n\n/terms/*\n  Content-Security-Policy: ${toolboxCsp}\n\n/cookies/*\n  Content-Security-Policy: ${toolboxCsp}\n`);
writeFileSync(join(target, "wrangler.jsonc"), JSON.stringify({ name: "pit-v2-free-public", compatibility_date: "2026-10-29", workers_dev: false, preview_urls: false, assets: { directory: "./public", html_handling: "auto-trailing-slash", not_found_handling: "404-page" } }, null, 2) + "\n");
const assetHashes = Object.fromEntries(readdirSync(root, { recursive: true }).filter((name) => typeof name === "string" && statSync(join(root, name)).isFile()).map((name) => [name, sha256(readFileSync(join(root, name)))]));
writeFileSync(join(target, "manifest.json"), JSON.stringify({ schema: "pit.free-public-candidate.v1", status: "BUILT_NOT_DEPLOYED", sourceCommit: sourceManifest.sourceCommit, origin: config.origin, publisherConfigSha256: sha256(readFileSync(input)), catalog: sourceManifest.catalog, walletSigning: false, paymentCollection: false, files: assetHashes }, null, 2) + "\n");
console.log(`PUBLIC FREE CANDIDATE PASS: ${routes.length} indexable routes; separate Worker; NOT DEPLOYED`);
