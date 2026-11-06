// Assemble a publishable *candidate* from the checked read-only static build.
// Publication, public origin and indexing require a separate release decision.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

function sourceCommit() {
  const git = statSync(".git").isDirectory() ? resolve(".git")
    : resolve(readFileSync(".git", "utf8").trim().replace(/^gitdir: /, ""));
  const head = readFileSync(join(git, "HEAD"), "utf8").trim();
  const common = statSync(".git").isDirectory() ? git
    : resolve(git, readFileSync(join(git, "commondir"), "utf8").trim());
  const sha = head.startsWith("ref: ") ? readFileSync(join(common, head.slice(5)), "utf8").trim() : head;
  if (!/^[0-9a-f]{40}$/.test(sha)) throw Error("Git source commit is unavailable");
  return sha;
}

const source = JSON.parse(readFileSync("dist-product-staging/manifest.json", "utf8"));
if (source.mode !== "hosted-read-only" || source.status !== "BUILT_NOT_DEPLOYED"
  || !source.surfaces.toolbox.csp.includes("connect-src 'none'")
  || !source.surfaces.operations.csp.includes("connect-src 'none'"))
  throw Error("Free release candidate requires checked read-only assets");
const entries = Object.entries(source.files);
const count = (pattern) => entries.filter(([path]) => pattern.test(path)).length;
if (count(/^inspect\/[^/]+\/index\.html$/) !== 28
  || count(/^operations\/[^/]+\/index\.html$/) !== 18
  || count(/^tasks\/[^/]+\/index\.html$/) < 145)
  throw Error("Free candidate route coverage changed");
const target = "dist-pit-free-rc";
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync("dist-product-cloudflare-staging/public", join(target, "public"), { recursive: true });
for (const [path, metadata] of entries) {
  const actual = createHash("sha256").update(readFileSync(join(target, "public", path))).digest("hex");
  if (actual !== metadata.digest) throw Error(`Free candidate asset mismatch: ${path}`);
}
for (const path of ["index.html", "toolbox/index.html", "explorer/index.html"]) {
  const html = readFileSync(join(target, "public", path), "utf8");
  if (!html.includes("PIT Crypto") || html.includes("Private candidate · No indexing"))
    throw Error(`Unfinished PIT Crypto Free branding: ${path}`);
}
const manifest = {
  schema: "pit.free-release-candidate.v1",
  status: "PREPARED_NOT_PUBLISHED",
  sourceCommit: sourceCommit(),
  publicOrigin: null,
  indexingEnabled: false,
  walletSigning: false,
  paymentCollection: false,
  catalog: { toolbox: 151, explorer: 28, operationsPreviewOnly: 18, distinctTasks: 196 },
  assetManifestSha256: createHash("sha256").update(readFileSync("dist-product-staging/manifest.json")).digest("hex"),
  packageFiles: entries.length,
  caveat: "Operations routes are informational preview pages; public origin, SEO, legal copy and hosting require separate approval."
};
writeFileSync(join(target, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`FREE RC PACKAGE PASS: ${entries.length} integrity-checked files; 151 Toolbox, 28 Explorer, 18 operations previews; NOT PUBLISHED`);
