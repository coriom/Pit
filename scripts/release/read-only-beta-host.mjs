import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { BETA_PAGES, BETA_ROOT, prepareAndValidateBeta } from "./read-only-beta.mjs";

export const HOST_ROOT = "dist-readonly-beta-host";
export const BETA_HSTS = "max-age=86400";
const HOST_HEADERS = {
  "Strict-Transport-Security": BETA_HSTS,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

async function walk(dir, root = dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path, root));
    else if (entry.isFile()) files.push(relative(root, path).replaceAll("\\", "/"));
    else throw Error(`Non-regular file in beta host package: ${path}`);
  }
  return files.sort();
}

async function artifactHash(root, files) {
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(file); digest.update("\0");
    digest.update(await readFile(join(root, file))); digest.update("\0");
  }
  return digest.digest("hex");
}

function cspFromHtml(html, page) {
  const encoded = html.match(/<meta\s+http-equiv="content-security-policy"\s+content="([^"]+)"/i)?.[1];
  if (!encoded) throw Error(`Missing beta CSP meta: ${page}`);
  return encoded.replaceAll("&amp;", "&").replace(/;+$/, "");
}

function executableHashes(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/type="application\/ld\+json"/i.test(match[1]))
    .map(([, attrs, script]) => {
      if (/\bsrc\s*=/.test(attrs)) throw Error("External script in beta host package");
      return `sha256-${createHash("sha256").update(script).digest("base64")}`;
    });
}

export function validateBetaCsp(htmlByPage, responseCsp) {
  const hashPattern = /'sha256-[A-Za-z0-9+/=]+'/g;
  const actual = new Set();
  for (const [page, html] of htmlByPage) {
    const metaCsp = cspFromHtml(html, page);
    if (`${metaCsp}; frame-ancestors 'none'` !== responseCsp)
      throw Error(`Response CSP differs from beta HTML meta: ${page}`);
    for (const hash of executableHashes(html)) actual.add(`'${hash}'`);
  }
  const scriptDirective = responseCsp.split("script-src")[1]?.split(";")[0] ?? "";
  const declared = new Set(scriptDirective.match(hashPattern) ?? []);
  if (!actual.size || [...actual].some((hash) => !declared.has(hash)))
    throw Error("Beta response CSP omits an executable inline-script hash");
  if (!responseCsp.includes("connect-src 'none'") || !responseCsp.includes("frame-ancestors 'none'") ||
      /unsafe-eval|unsafe-inline/.test(scriptDirective))
    throw Error("Beta response CSP policy weakened");
  return [...actual].sort();
}

function parseCloudflareHeaders(contents) {
  if (!contents.startsWith("/*\n")) throw Error("Unexpected beta _headers format");
  return Object.fromEntries(contents.trimEnd().split("\n").slice(1).map((line) => {
    const match = line.match(/^  ([A-Za-z-]+): (.+)$/);
    if (!match) throw Error("Malformed beta _headers line");
    return [match[1], match[2]];
  }));
}

export async function validateHostPackage(candidateRoot = BETA_ROOT, hostRoot = HOST_ROOT) {
  const candidateFiles = await walk(candidateRoot);
  const css = candidateFiles.filter((file) => file.startsWith("_astro/"));
  const publicFiles = [...BETA_PAGES, "robots.txt", ...css].sort();
  if (css.length !== 1 || candidateFiles.length !== publicFiles.length + 1 ||
      JSON.stringify(candidateFiles) !== JSON.stringify([...publicFiles, "_headers"].sort()))
    throw Error("Beta candidate inventory changed before host packaging");
  const htmlByPage = await Promise.all(BETA_PAGES.map(async (page) => [page, await readFile(join(candidateRoot, page), "utf8")]));
  const cloudflare = parseCloudflareHeaders(await readFile(join(candidateRoot, "_headers"), "utf8"));
  const csp = cloudflare["Content-Security-Policy"];
  if (!csp || Object.keys(cloudflare).length !== Object.keys(HOST_HEADERS).length + 1 ||
      Object.entries(HOST_HEADERS).some(([key, value]) => cloudflare[key] !== value))
    throw Error("Beta _headers diverges from the reviewed host header policy");
  const scriptHashes = validateBetaCsp(htmlByPage, csp);
  const config = {
    $schema: "https://openapi.vercel.sh/vercel.json",
    framework: null,
    outputDirectory: "public",
    headers: [{ source: "/(.*)", headers: Object.entries({ "Content-Security-Policy": csp, ...HOST_HEADERS })
      .map(([key, value]) => ({ key, value })) }],
  };
  const hostFiles = await walk(hostRoot);
  const expected = ["vercel.json", ...publicFiles.map((file) => `public/${file}`)].sort();
  if (JSON.stringify(hostFiles) !== JSON.stringify(expected))
    throw Error("Beta host package contains an unreviewed file");
  const written = JSON.parse(await readFile(join(hostRoot, "vercel.json"), "utf8"));
  if (JSON.stringify(written) !== JSON.stringify(config) || Object.keys(written).length !== 4)
    throw Error("Beta Vercel configuration changed after generation");
  for (const file of publicFiles) {
    const original = await readFile(join(candidateRoot, file));
    const copied = await readFile(join(hostRoot, "public", file));
    if (!original.equals(copied)) throw Error(`Beta host copy differs: ${file}`);
  }
  return { candidateSha256: await artifactHash(candidateRoot, candidateFiles),
    hostSha256: await artifactHash(hostRoot, hostFiles), pages: BETA_PAGES.length,
    cssAssets: css.length, publicFiles, hostFiles, scriptHashes, config };
}

export async function prepareAndValidateHostPackage(candidateRoot = BETA_ROOT, hostRoot = HOST_ROOT) {
  const beta = await prepareAndValidateBeta(candidateRoot);
  const candidateFiles = await walk(candidateRoot);
  const publicFiles = candidateFiles.filter((file) => file !== "_headers");
  const html = await readFile(join(candidateRoot, BETA_PAGES[0]), "utf8");
  const csp = `${cspFromHtml(html, BETA_PAGES[0])}; frame-ancestors 'none'`;
  const config = {
    $schema: "https://openapi.vercel.sh/vercel.json",
    framework: null,
    outputDirectory: "public",
    headers: [{ source: "/(.*)", headers: Object.entries({ "Content-Security-Policy": csp, ...HOST_HEADERS })
      .map(([key, value]) => ({ key, value })) }],
  };
  await rm(hostRoot, { recursive: true, force: true });
  await mkdir(join(hostRoot, "public"), { recursive: true });
  for (const file of publicFiles) {
    await mkdir(dirname(join(hostRoot, "public", file)), { recursive: true });
    await copyFile(join(candidateRoot, file), join(hostRoot, "public", file));
  }
  await writeFile(join(hostRoot, "vercel.json"), `${JSON.stringify(config, null, 2)}\n`);
  const result = await validateHostPackage(candidateRoot, hostRoot);
  if (result.candidateSha256 !== beta.artifactSha256) throw Error("Beta candidate changed while packaging");
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = process.argv.includes("--verify")
    ? await validateHostPackage() : await prepareAndValidateHostPackage();
  console.log(`READ-ONLY VERCEL PACKAGE PASS — ${result.pages} pages; ${result.cssAssets} CSS asset; ${result.publicFiles.length} served files; ${result.hostFiles.length} package files; ${result.scriptHashes.length} exact CSP hashes; candidate SHA-256 ${result.candidateSha256}; package SHA-256 ${result.hostSha256}; NOT DEPLOYED`);
}
