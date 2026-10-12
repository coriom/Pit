import { test, expect } from "@playwright/test";
import { build } from "esbuild";

const origin = "https://pit-testnet-staging-corioms-projects.vercel.app";
const path = "/__pit-staging-accounting/";
const html = `<!doctype html><title>Synthetic audit</title>
<button id="create">Create</button><button id="verify">Verify</button>
<button id="export">Export</button><input id="csv-file" type="file">
<button id="validate">Validate</button><button id="cleanup">Cleanup</button>
<pre id="report"></pre><script src="${path}audit.js"></script>`;
let code: string;
test.beforeAll(async () => {
  const result = await build({
    entryPoints: ["scripts/audit/staging-accounting-harness.ts"],
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
  });
  code = result.outputFiles[0].text;
});
async function open(page: any, base = origin) {
  await page.route("**/*", (route: any) => {
    const url = new URL(route.request().url());
    if (url.pathname === path + "audit.js")
      return route.fulfill({ contentType: "text/javascript", body: code });
    if (url.pathname === path)
      return route.fulfill({ contentType: "text/html", body: html });
    return route.abort();
  });
  await page.goto(base + path);
}
test("staging-only synthetic event survives reload, downloads actual PIT CSV, then cleans only itself", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.addInitScript(() => {
    (window as any).__walletCalls = 0;
    (window as any).ethereum = {
      request: () => {
        (window as any).__walletCalls++;
        throw Error("Wallet access forbidden in synthetic audit");
      },
    };
  });
  await open(page);
  await expect(page.locator("#report")).toContainText("READY");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.locator("#report")).toContainText("CREATED");
  await page.reload();
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator("#report")).toContainText("PERSISTED");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("pit-taxlot.csv");
  await page.locator("#csv-file").setInputFiles((await download.path())!);
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(page.locator("#report")).toContainText("CSV VERIFIED");
  await page.getByRole("button", { name: "Cleanup" }).click();
  await expect(page.locator("#report")).toContainText("stores empty");
  const counts = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("pit-taxlot-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return Promise.all(["events", "raw", "meta"].map((name) => new Promise<number>((resolve, reject) => {
      const request = db.transaction(name).objectStore(name).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    })));
  });
  expect(counts).toEqual([0, 0, 0]);
  expect(await page.evaluate(() => (window as any).__walletCalls)).toBe(0);
  expect(requests.every((url) => new URL(url).origin === origin)).toBe(true);
});

test("preexisting records and unapproved origins fail closed", async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("pit-taxlot-v1", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("events", { keyPath: "id" });
        db.createObjectStore("raw", { keyPath: "id" });
        db.createObjectStore("meta");
      };
      request.onsuccess = () => {
        const tx = request.result.transaction("events", "readwrite");
        tx.objectStore("events").add({ id: "existing" });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.locator("#report")).toContainText("no existing PIT records");
  expect(await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("pit-taxlot-v1");
      r.onsuccess = () => resolve(r.result);
    });
    return new Promise((resolve) => {
      const r = db.transaction("events").objectStore("events").getAllKeys();
      r.onsuccess = () => resolve(r.result);
    });
  })).toEqual(["existing"]);
  await open(page, "https://unapproved.example");
  await expect(page.locator("#report")).toContainText("BLOCKED");
  await expect(page.getByRole("button", { name: "Create" })).toBeDisabled();
});
