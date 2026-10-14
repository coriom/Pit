// PIT_STAGING_ACCEPTANCE_ONLY: isolated browser audit, never imported by production code.
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import {
  createRemote,
  deleteSecret,
  recoverRetainedSecret,
  retainSecret,
  revokeRemote,
  verifyRevocation,
} from "./staging-access.mjs";
import { runLifecycle, safeFailure } from "./staging-lifecycle.mjs";
import {
  STAGING_ORIGIN,
  DEPLOYMENT_ID,
  preflight,
  protectedRead,
  scopedBypassHeaders,
} from "./staging-readonly.mjs";

const AUDIT_PATH = "/__pit-staging-accounting/";
const expected = Object.freeze({
  type: "trade",
  asset: "WETH",
  quantity: "0.005",
  counterAsset: "USDC",
  counterQuantity: "10.25",
  sequence: 0,
});

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function sha1(value) { return createHash("sha1").update(value).digest("hex"); }
function inlineScriptHashes(html) {
  const hashes = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(match[1]) || !match[2]) continue;
    hashes.push("sha256-" + createHash("sha256").update(match[2]).digest("base64"));
  }
  return hashes.sort();
}
class AuditFailure extends Error {}
function requireFact(condition, message) { if (!condition) throw new AuditFailure(message); }
function safeReason(error) {
  return error instanceof AuditFailure ? error.message : "Browser operation failed; private browser details omitted";
}
function stage(report, name, status, detail = {}) {
  report.stages[name] = { status, ...detail };
  if (status !== "PASS") throw new AuditFailure(`Stage ${name} ${status}`);
}
async function displayed(page) {
  const value = await page.locator("#report").innerText();
  try { return JSON.parse(value); } catch { throw new AuditFailure("Audit page returned malformed status JSON"); }
}
function economics(value) {
  return Object.entries(expected).every(([key, target]) => value[key] === target);
}
async function act(page, selector) {
  const before = await page.locator("#report").innerText();
  await page.locator(selector).click();
  await page.waitForFunction((value) => document.getElementById("report")?.textContent !== value, before, { timeout: 10_000 });
  return displayed(page);
}

async function compiledAuditHash() {
  const result = await build({
    entryPoints: ["scripts/audit/staging-accounting-harness.ts"],
    bundle: true, platform: "browser", format: "esm", minify: true,
    sourcemap: false, write: false,
  });
  return sha1(result.outputFiles[0].contents);
}

async function runBrowser(secret, report) {
  const profile = mkdtempSync(join(tmpdir(), "pit-staging-browser-"));
  const downloads = mkdtempSync(join(tmpdir(), "pit-staging-download-"));
  chmodSync(profile, 0o700);
  chmodSync(downloads, 0o700);
  let context;
  let fixtureCreated = false;
  let completed = false;
  let blockedExternal = 0;
  let stateChangingRequests = 0;
  let currentStage = "security";
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      acceptDownloads: true,
      serviceWorkers: "block",
      args: ["--disable-extensions", "--disable-sync", "--no-first-run", "--no-default-browser-check"],
    });
    report.browser = { launched: true, authenticatedPIT: false };
    await context.route("**/*", async (route) => {
      const request = route.request();
      const headers = scopedBypassHeaders(request.url(), request.headers(), secret);
      if (!headers) { blockedExternal++; return route.abort(); }
      if (request.method() !== "GET") { stateChangingRequests++; return route.abort(); }
      return route.continue({ headers });
    });
    const page = context.pages()[0] ?? await context.newPage();
    await page.addInitScript(() => {
      window.__pitAuditWalletCalls = 0;
      Object.defineProperty(window, "ethereum", {
        configurable: false,
        value: { request: () => { window.__pitAuditWalletCalls++; throw Error("Wallet access forbidden in staging audit"); } },
      });
    });
    const documentResponse = await page.goto(STAGING_ORIGIN + AUDIT_PATH, { waitUntil: "load", timeout: 30_000 });
    requireFact(documentResponse?.status() === 200, "Protected PIT application did not return HTTP 200");
    requireFact(new URL(page.url()).origin === STAGING_ORIGIN, "Browser left the exact PIT staging origin");
    report.browser.authenticatedPIT = true;
    const headers = documentResponse.headers();
    const csp = headers["content-security-policy"] ?? "";
    const html = await documentResponse.text();
    const meta = html.match(/<meta\s+http-equiv="content-security-policy"\s+content="([^"]+)"/i)?.[1] ?? "";
    const expectedHeaderCsp = `${meta.replaceAll("&amp;", "&").replace(/;+$/, "")}; frame-ancestors 'none'`;
    requireFact(csp && csp === expectedHeaderCsp, "Served CSP differs from deployed HTML meta CSP plus frame protection");
    requireFact(csp.includes("default-src 'none'") && csp.includes("frame-ancestors 'none'") && !csp.includes("unsafe-eval"), "CSP security invariant failed");
    requireFact(headers["strict-transport-security"]?.includes("max-age="), "HSTS missing");
    requireFact(headers["x-content-type-options"] === "nosniff", "Content-type protection missing");
    requireFact(headers["referrer-policy"] === "no-referrer", "Referrer policy missing");
    requireFact(headers["x-frame-options"] === "DENY", "Frame protection missing");
    requireFact(headers["x-robots-tag"] === "noindex", "Indexing protection missing");
    report.http = { status: 200, origin: STAGING_ORIGIN, csp, hsts: headers["strict-transport-security"], noindex: headers["x-robots-tag"] };

    const jsResponse = await page.request.get(STAGING_ORIGIN + AUDIT_PATH + "audit.js", {
      headers: scopedBypassHeaders(STAGING_ORIGIN, {}, secret),
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    requireFact(jsResponse.status() === 200, "Deployed audit script unavailable");
    const deployedHash = sha1(await jsResponse.body());
    const localHash = await compiledAuditHash();
    requireFact(deployedHash === localHash, "Deployed audit script differs from local reviewed source");
    report.auditScriptSha1 = deployedHash;

    const manifestResponse = await page.request.get(STAGING_ORIGIN + "/build-manifest.json", {
      headers: scopedBypassHeaders(STAGING_ORIGIN, {}, secret),
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    requireFact(manifestResponse.status() === 200, "Deployed build manifest unavailable");
    const remoteManifest = await manifestResponse.json();
    const localManifest = JSON.parse(readFileSync("dist/build-manifest.json", "utf8"));
    requireFact(remoteManifest.hash === localManifest.hash, "Deployed build identity differs");
    report.buildSha256 = remoteManifest.hash;

    const toolsResponse = await page.request.get(STAGING_ORIGIN + "/tools/", {
      headers: scopedBypassHeaders(STAGING_ORIGIN, {}, secret),
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    requireFact(toolsResponse.status() === 200, "Deployed toolbox HTML unavailable");
    const toolsHtml = await toolsResponse.text();
    requireFact(sha256(toolsHtml) === remoteManifest.files?.["tools/index.html"], "Served toolbox HTML differs from build manifest");
    requireFact(toolsResponse.headers()["content-security-policy"] === csp, "Toolbox and audit HTTP CSP differ");
    const inlineHashes = inlineScriptHashes(toolsHtml);
    const allowedHashes = [...csp.matchAll(/'sha256-([A-Za-z0-9+/=]+)'/g)].map((match) => `sha256-${match[1]}`).sort();
    requireFact(inlineHashes.length > 0 && inlineHashes.every((hash) => allowedHashes.includes(hash)), "Served toolbox inline script lacks an HTTP CSP hash");
    requireFact(allowedHashes.length === 9, "Unexpected generated CSP hash count");
    report.cspHashes = { servedInline: inlineHashes, policy: allowedHashes, missing: [], extraForThisPage: allowedHashes.filter((hash) => !inlineHashes.includes(hash)) };

    const allDatabases = await page.evaluate(() => indexedDB.databases());
    requireFact(!allDatabases.some((entry) => entry.name === "pit-taxlot-v1"), "Isolated browser has preexisting PIT accounting storage");
    requireFact((await displayed(page)).status.startsWith("READY"), "Staging audit page is not READY");
    stage(report, "security", "PASS", { browser: "isolated Linux Playwright Chromium", deploymentId: DEPLOYMENT_ID });

    currentStage = "A";
    const created = await act(page, "#create");
    requireFact(created.status.startsWith("CREATED") && created.schemaValid === true && /^pit-staging-synthetic-[0-9a-f-]{36}$/.test(created.id), "Step A did not create one schema-valid fixture");
    fixtureCreated = true;
    report.fixtureId = created.id;
    stage(report, "A", "PASS", { id: created.id, schemaValid: true });

    currentStage = "B";
    await page.reload({ waitUntil: "load" });
    requireFact(new URL(page.url()).hash === "#" + created.id, "Fixture URL fragment was lost on reload");
    const persisted = await act(page, "#verify");
    requireFact(persisted.status.startsWith("PERSISTED") && persisted.id === created.id && persisted.schemaValid === true && economics(persisted), "Step B persistence or economics mismatch");
    stage(report, "B", "PASS", { id: created.id, ...expected, schemaValid: true });

    currentStage = "C";
    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    const beforeExport = await page.locator("#report").innerText();
    await page.locator("#export").click();
    const download = await downloadPromise;
    requireFact(download.suggestedFilename() === "pit-taxlot.csv", "Step C filename differs");
    const downloadedPath = join(downloads, "pit-taxlot.csv");
    await download.saveAs(downloadedPath);
    chmodSync(downloadedPath, 0o600);
    const csv = readFileSync(downloadedPath);
    requireFact(csv.length > 0, "Step C downloaded CSV is empty");
    await page.waitForFunction((value) => document.getElementById("report")?.textContent !== value, beforeExport, { timeout: 10_000 });
    const exported = await displayed(page);
    requireFact(exported.status.startsWith("DOWNLOADED") && exported.count === 1, "Step C export count differs");
    stage(report, "C", "PASS", { filename: "pit-taxlot.csv", bytes: csv.length, sha256: sha256(csv) });

    currentStage = "D";
    await page.locator("#csv-file").setInputFiles(downloadedPath);
    const selected = await page.locator("#csv-file").evaluate((input) => ({
      count: input.files?.length ?? 0, name: input.files?.[0]?.name ?? null,
    }));
    requireFact(selected.count === 1 && selected.name === "pit-taxlot.csv", "Step D input did not hold the actual downloaded file");
    const validated = await act(page, "#validate");
    requireFact(validated.status.startsWith("CSV VERIFIED") && validated.rowCount === 1 && economics(validated), "Step D CSV validation or economics mismatch");
    stage(report, "D", "PASS", { rowCount: 1, economicMismatches: 0, ...expected });

    currentStage = "E";
    const cleaned = await act(page, "#cleanup");
    requireFact(cleaned.status.startsWith("PASS") && cleaned.fixtureId === created.id && cleaned.remainingRecords === 0 && cleaned.preexistingRecords === 0, "Step E cleanup did not target only this fixture");
    await page.reload({ waitUntil: "load" });
    const counts = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("pit-taxlot-v1", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(["events", "raw", "meta"], "readonly");
      return Promise.all(["events", "raw", "meta"].map((name) => new Promise((resolve, reject) => {
        const request = tx.objectStore(name).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })));
    });
    requireFact(counts.every((count) => count === 0), "Synthetic fixture remains after cleanup and reload");
    stage(report, "E", "PASS", { fixtureId: created.id, remainingStoreCounts: counts });
    requireFact(blockedExternal === 0 && stateChangingRequests === 0, "Unexpected external or state-changing browser request");
    requireFact(await page.evaluate(() => window.__pitAuditWalletCalls) === 0, "Staging audit requested wallet access");
    report.network = { externalRequests: 0, stateChangingRequests: 0, walletConnections: 0, approvals: 0, signatures: 0, orders: 0, mainnetRequests: 0 };
    report.operatorBraveFixture = "PRESERVED — separate browser profile was never opened";
    completed = true;
  } catch (error) {
    report.stages[currentStage] ??= { status: "BLOCKED", reason: safeReason(error) };
    throw error;
  } finally {
    if (context) await context.close().catch(() => {});
    // On a failure after A, keep the isolated profile for fixture diagnosis. Never touch the operator profile.
    if (completed || !fixtureCreated) rmSync(profile, { recursive: true, force: true });
    rmSync(downloads, { recursive: true, force: true });
    if (!completed && fixtureCreated) report.isolatedFailureProfile = profile;
  }
}

async function main() {
  const mode = process.argv[2];
  if (!["--run-authorized", "--revoke"].includes(mode)) {
    console.log(JSON.stringify({ status: "AUTHORIZATION_REQUIRED", reason: "EXPLICIT_RUN_MODE_REQUIRED" }));
    process.exitCode = 2;
    return;
  }
  if (mode === "--revoke") {
    const result = await recoverRetainedSecret();
    console.log(JSON.stringify(result));
    if (result.status !== "REVOCATION_CONFIRMED") process.exitCode = 2;
    return;
  }
  const report = { status: "BLOCKED", deploymentId: DEPLOYMENT_ID, origin: STAGING_ORIGIN, evidence: "SYNTHETIC", stages: {} };
  const reportDirectory = mkdtempSync(join(tmpdir(), "pit-staging-report-"));
  chmodSync(reportDirectory, 0o700);
  const reportPath = join(reportDirectory, "result.json");
  const lifecycle = await runLifecycle({
    now: () => new Date().toISOString(),
    preflight,
    retainSecret,
    createRemote,
    checkAccess: async (secret) => {
      const response = await protectedRead(secret);
      return { status: response.status, csp: !!response.csp };
    },
    runBrowser: (secret) => runBrowser(secret, report),
    revokeRemote,
    verifyRevocation,
    deleteSecret,
  });
  Object.assign(report, lifecycle);
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, failure: report.failure, creationResponse: report.creationResponse, revokeRequest: report.revokeRequest, revocation: report.revocation, stages: report.stages, reportPath }));
  if (report.status !== "PASS") process.exitCode = 2;
}

main().catch((error) => {
  // Do not stringify raw errors from HTTP clients, browsers, or auth files.
  console.error(JSON.stringify({ status: "STAGING_ACCEPTANCE_BLOCKED", reason: safeFailure(error) }));
  process.exitCode = 2;
});
