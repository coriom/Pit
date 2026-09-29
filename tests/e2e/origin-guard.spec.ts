import { test, expect } from "@playwright/test";
import { build } from "esbuild";
let bundle: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `import * as events from './src/lib/events'; import * as policy from './src/lib/storage-policy'; window.audit={...events,...policy};`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    plugins: [
      {
        name: "reviewed-test-origins",
        setup(b) {
          b.onLoad({ filter: /storage-origins\.ts$/ }, () => ({
            contents:
              'export const accountingOrigins=Object.freeze(["https://pit.example","https://stable.ipns.gateway.example"]);',
            loader: "ts",
          }));
        },
      },
    ],
  });
  bundle = result.outputFiles[0].text;
});
async function harness(page: any, url: string) {
  await page.route("**/*", (route: any) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Offline storage policy harness</title>",
    }),
  );
  await page.goto(url);
  await page.addScriptTag({ content: bundle });
}
const event = {
  version: 1,
  id: "preserved",
  type: "trade",
  timestamp: "2026-09-29T12:00:00Z",
  sequence: 0,
  asset: "ETH",
  quantity: "1",
  counter_asset: "USDC",
  counter_quantity: "2000",
  fee: [],
  source: "pit:cow:11155111",
  account: "fixture",
  raw_row_ref: "preserved",
};
test("approved dedicated HTTPS origin persists and exports; sibling origin cannot read records", async ({
  page,
}) => {
  await harness(page, "https://pit.example/");
  const result = await page.evaluate(async (e) => {
    const a = (window as any).audit;
    await a.appendEvent(e, { fixture: true });
    return {
      allowed: a.storageEnabled(),
      records: await a.listEvents("fixture"),
      csv: a.eventsCSV(await a.listEvents("fixture")),
    };
  }, event);
  expect(result.allowed).toBe(true);
  expect(result.records).toHaveLength(1);
  expect(result.csv).toContain('"preserved"');
  const downloadPromise = page.waitForEvent("download");
  await page.evaluate(async () => (window as any).audit.downloadCSV("fixture"));
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("pit-taxlot.csv");
  const { readFile } = await import("node:fs/promises");
  expect(await readFile((await download.path())!, "utf8")).toBe(result.csv);
  await page.reload();
  await page.addScriptTag({ content: bundle });
  expect(
    await page.evaluate(
      async () => (await (window as any).audit.listEvents("fixture")).length,
    ),
  ).toBe(1);
  await page.goto("https://sibling.example/");
  expect(
    await page.evaluate(async () =>
      (await indexedDB.databases()).map((x) => x.name),
    ),
  ).not.toContain("pit-taxlot-v1");
  console.log(
    "Dedicated origin https://pit.example: reload persistence and CSV passed; https://sibling.example: no PIT database.",
  );
});
test("unsafe path denies open/write/read/download and preserves pre-existing valid records", async ({
  page,
}) => {
  await harness(page, "https://pit.example/");
  await page.evaluate(
    async (e) => (window as any).audit.appendEvent(e, { fixture: true }),
    event,
  );
  await page.goto("https://pit.example/ipfs/untrusted/");
  await page.addScriptTag({ content: bundle });
  const denied = await page.evaluate(async (e) => {
    const a = (window as any).audit;
    const results = [];
    for (const f of [
      () => a.eventDB(),
      () => a.appendEvent({ ...e, id: "blocked" }, {}),
      () => a.listEvents("fixture"),
      () => a.downloadCSV("fixture"),
    ]) {
      try {
        await f();
        results.push(false);
      } catch {
        results.push(true);
      }
    }
    return results;
  }, event);
  expect(denied).toEqual([true, true, true, true]);
  await page.goto("https://pit.example/");
  await page.addScriptTag({ content: bundle });
  expect(
    await page.evaluate(async () =>
      (await (window as any).audit.listEvents("fixture")).map((e: any) => e.id),
    ),
  ).toEqual(["preserved"]);
  console.log(
    "Shared path: eventDB, appendEvent, listEvents, downloadCSV rejected; existing valid event preserved.",
  );
});
test("unapproved production origin never creates PIT storage; approved stable IPNS origin works", async ({
  page,
}) => {
  await harness(page, "https://unknown.example/");
  expect(
    await page.evaluate(() => (window as any).audit.storageEnabled()),
  ).toBe(false);
  await page.evaluate(async () => {
    try {
      await (window as any).audit.eventDB();
    } catch {}
  });
  expect(
    await page.evaluate(async () =>
      (await indexedDB.databases()).map((x) => x.name),
    ),
  ).not.toContain("pit-taxlot-v1");
  await page.goto("https://stable.ipns.gateway.example/");
  await page.addScriptTag({ content: bundle });
  await page.evaluate(
    async (e) => (window as any).audit.appendEvent(e, {}),
    event,
  );
  expect(
    await page.evaluate(
      async () => (await (window as any).audit.listEvents("fixture")).length,
    ),
  ).toBe(1);
});
