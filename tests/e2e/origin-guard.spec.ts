import { test, expect } from "@playwright/test";
import { build } from "esbuild";
let bundle: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `import * as events from './src/lib/events'; import * as policy from './src/lib/storage-policy'; import * as derivatives from './src/lib/derivative-evidence'; window.audit={...events,...policy,...derivatives};`,
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
  expect(result.records[0].id).toBe("preserved");
  expect(result.csv).toContain('"trade"');
  expect(result.csv).toContain('"2000"');
  expect(result.csv).not.toContain('"preserved"');
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

test("dedicated-origin derivative evidence never enters Taxlot events and unsafe origins cannot open its store", async ({
  page,
}) => {
  await harness(page, "https://pit.example/");
  const result = await page.evaluate(async () => {
    const a = (window as any).audit,
      account = "0x4444444444444444444444444444444444444444";
    const fill = {
      tid: 1,
      oid: 2,
      time: 1790683200000,
      coin: "ETH",
      side: "B",
      sz: "0.1",
      px: "2000",
      fee: "0.01",
      feeToken: "USDC",
      hash: "fixture",
      closedPnl: "0",
      dir: "Open Long",
    };
    await a.recordPerpFills([fill], account);
    await a.recordPerpFills([fill], account);
    await a.recordPerpFills([{ ...fill, fee: "0.02" }], account);
    return {
      evidence: await a.listDerivativeEvidence(account),
      events: await a.listEvents(account),
    };
  });
  expect(result.evidence).toHaveLength(2);
  expect(result.events).toEqual([]);
  expect(
    result.evidence.every(
      (e: any) => e.taxlot_status === "unsupported_derivative_v1",
    ),
  ).toBe(true);
  await page.goto("https://unknown.example/");
  await page.addScriptTag({ content: bundle });
  const blocked = await page.evaluate(async () => {
    try {
      await (window as any).audit.recordPerpFills(
        [],
        "0x4444444444444444444444444444444444444444",
      );
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
  expect(
    await page.evaluate(async () =>
      (await indexedDB.databases()).map((d) => d.name),
    ),
  ).not.toContain("pit-derivative-evidence-v1");
});

test("shared-origin query, encoded path and reload cannot enable accounting", async ({
  page,
}) => {
  for (const url of [
    "https://pit.example/ipfs/untrusted/?pit_origin=https%3A%2F%2Fpit.example",
    "https://pit.example/ipns/name/?fees=false",
    "https://pit.example/%69pfs/untrusted/?allow=1",
  ]) {
    await harness(page, url);
    for (let i = 0; i < 2; i++) {
      if (i) {
        await page.reload();
        await page.addScriptTag({ content: bundle });
      }
      const result = await page.evaluate(async () => {
        const a = (window as any).audit;
        const denied = [];
        for (const fn of [
          () => a.eventDB(),
          () => a.listEvents("fixture"),
          () => a.downloadCSV("fixture"),
        ]) {
          try {
            await fn();
            denied.push(false);
          } catch {
            denied.push(true);
          }
        }
        return {
          allowed: a.storageEnabled(),
          denied,
          databases: (await indexedDB.databases()).map((x) => x.name),
        };
      });
      expect(result.allowed).toBe(false);
      expect(result.denied).toEqual([true, true, true]);
      expect(result.databases).not.toContain("pit-taxlot-v1");
    }
  }
});
