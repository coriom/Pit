import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANDIDATE_ROOT, HOST_ROOT, PUBLIC_CANDIDATE_ROOT, PUBLIC_HOST_ROOT,
  LOCAL_PAGES, LOCAL_TASK_IDS, validateLocalHost,
} from "./local-toolbox-host.mjs";
import { publicOriginFromEnv } from "./local-toolbox-publishing.mjs";

export const CLOUDFLARE_ROOT = "dist-local-toolbox-cloudflare";
export const CLOUDFLARE_PUBLIC_ROOT = "dist-local-toolbox-cloudflare-public";
const HEADER_LINE_LIMIT = 2000;
const FREE_FILE_LIMIT = 20_000;
const FREE_ASSET_LIMIT = 25 * 1024 * 1024;
const NOT_FOUND = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex,nofollow"><title>Page not found · PIT Toolbox</title></head><body><main><h1>Page not found</h1><p>This route is not part of the local PIT Toolbox.</p><p><a href="/">Home</a> · <a href="/tools/">Browse tools</a></p></main></body></html>
`;

async function walk(dir, root = dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path, root));
    else if (entry.isFile()) files.push(relative(root, path).replaceAll("\\", "/"));
    else throw Error(`Non-regular Cloudflare package entry: ${path}`);
  }
  return files.sort();
}

async function packageHash(root, files) {
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(file); digest.update("\0");
    digest.update(await readFile(join(root, file))); digest.update("\0");
  }
  return digest.digest("hex");
}

export function cloudflareHeaders(headers) {
  if (!Array.isArray(headers) || headers.length !== 6 && headers.length !== 7) throw Error("Unexpected security-header count");
  const names = new Set();
  const lines = ["/*"];
  for (const { key, value } of headers) {
    if (!/^[A-Za-z][A-Za-z-]*$/.test(key) || names.has(key.toLowerCase()) ||
        typeof value !== "string" || !value || /[\r\n]/.test(value))
      throw Error("Malformed or duplicate Cloudflare header");
    names.add(key.toLowerCase());
    const line = `  ${key}: ${value}`;
    if (Buffer.byteLength(line, "utf8") > HEADER_LINE_LIMIT)
      throw Error(`Cloudflare header exceeds ${HEADER_LINE_LIMIT} characters: ${key}`);
    lines.push(line);
  }
  const policy = headers.find(({ key }) => key === "Content-Security-Policy")?.value;
  if (!policy?.includes("connect-src 'none'") || !policy.includes("frame-ancestors 'none'") ||
      !policy.includes("form-action 'none'")) throw Error("Cloudflare CSP incomplete");
  for (const name of ["Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Permissions-Policy"])
    if (!names.has(name.toLowerCase())) throw Error(`Missing Cloudflare security header: ${name}`);
  if (lines.length - 1 > 100) throw Error("Cloudflare header rule limit exceeded");
  return `${lines.join("\n")}\n`;
}

export async function validateCloudflarePackage({
  publicOrigin = null,
  root = publicOrigin ? CLOUDFLARE_PUBLIC_ROOT : CLOUDFLARE_ROOT,
  candidateRoot = publicOrigin ? PUBLIC_CANDIDATE_ROOT : CANDIDATE_ROOT,
  hostRoot = publicOrigin ? PUBLIC_HOST_ROOT : HOST_ROOT,
} = {}) {
  const source = await validateLocalHost(candidateRoot, hostRoot, { publicOrigin });
  const files = await walk(root);
  const expected = [...source.files, "404.html", "_headers"].sort();
  if (JSON.stringify(files) !== JSON.stringify(expected)) throw Error("Cloudflare package differs from the static allowlist");
  if (files.length > FREE_FILE_LIMIT) throw Error("Cloudflare Free file limit exceeded");
  if (LOCAL_PAGES.length !== 169 || LOCAL_TASK_IDS.length !== 145 || source.scriptHashes.length !== 23)
    throw Error("Local toolbox inventory changed");
  let bytes = 0;
  for (const file of source.files) {
    const actual = await readFile(join(root, file));
    if (!actual.equals(await readFile(join(hostRoot, "public", file))))
      throw Error(`Cloudflare static file differs from reviewed source: ${file}`);
  }
  for (const file of files) {
    const size = (await stat(join(root, file))).size;
    if (size > FREE_ASSET_LIMIT) throw Error(`Cloudflare Free asset limit exceeded: ${file}`);
    bytes += size;
  }
  if ((await readFile(join(root, "404.html"), "utf8")) !== NOT_FOUND)
    throw Error("Cloudflare 404 fallback changed");
  const expectedHeaders = cloudflareHeaders(source.config.headers[0].headers);
  if ((await readFile(join(root, "_headers"), "utf8")) !== expectedHeaders)
    throw Error("Cloudflare response headers differ from reviewed CSP");
  if (!publicOrigin && !expectedHeaders.includes("X-Robots-Tag: noindex, nofollow"))
    throw Error("Private Cloudflare package is indexable");
  return { files, bytes, pages: LOCAL_PAGES.length, tasks: LOCAL_TASK_IDS.length + 6,
    scriptHashes: source.scriptHashes.length, sourceSha256: source.hostSha256,
    packageSha256: await packageHash(root, files), headers: expectedHeaders };
}

export async function prepareCloudflarePackage(options = {}) {
  const publicOrigin = options.publicOrigin ?? null;
  const root = options.root ?? (publicOrigin ? CLOUDFLARE_PUBLIC_ROOT : CLOUDFLARE_ROOT);
  const hostRoot = options.hostRoot ?? (publicOrigin ? PUBLIC_HOST_ROOT : HOST_ROOT);
  const candidateRoot = options.candidateRoot ?? (publicOrigin ? PUBLIC_CANDIDATE_ROOT : CANDIDATE_ROOT);
  const source = await validateLocalHost(candidateRoot, hostRoot, { publicOrigin });
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  for (const file of source.files) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await copyFile(join(hostRoot, "public", file), join(root, file));
  }
  await writeFile(join(root, "404.html"), NOT_FOUND);
  await writeFile(join(root, "_headers"), cloudflareHeaders(source.config.headers[0].headers));
  return validateCloudflarePackage({ publicOrigin, root, candidateRoot, hostRoot });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const isPublic = process.argv.includes("--public");
  const publicOrigin = publicOriginFromEnv();
  if (isPublic !== Boolean(publicOrigin)) throw Error("Cloudflare package mode and approved build mode differ");
  const result = process.argv.includes("--verify")
    ? await validateCloudflarePackage({ publicOrigin })
    : await prepareCloudflarePackage({ publicOrigin });
  console.log(`CLOUDFLARE TOOLBOX PACKAGE PASS — ${result.tasks} tasks; ${result.pages} content pages; ${result.files.length} package files; ${result.bytes} bytes; ${result.scriptHashes} exact script hashes; SHA-256 ${result.packageSha256}; NOT DEPLOYED`);
}
