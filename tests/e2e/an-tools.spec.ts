import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function safeLocalPage(page: Page, path: string) {
  const unexpected: string[] = [],
    runtime: string[] = [];
  page.on("pageerror", (error) => runtime.push(error.message));
  await page.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin === "http://127.0.0.1:4398" &&
      !url.pathname.startsWith("/api/") &&
      !url.pathname.includes("rpc")
    )
      return route.continue();
    unexpected.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  await page.addInitScript(() => {
    (window as any).__anCalls = [];
    (window as any).ethereum = {
      request: async ({ method }: { method: string }) => {
        (window as any).__anCalls.push(`wallet:${method}`);
        throw Error("Wallet forbidden");
      },
    };
    const original = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<typeof indexedDB.open>) => {
      (window as any).__anCalls.push("indexedDB.open");
      return original(...args);
    }) as typeof indexedDB.open;
    for (const method of [
      "getItem",
      "setItem",
      "removeItem",
      "clear",
    ] as const) {
      const fn = Storage.prototype[method];
      (Storage.prototype[method] as any) = function (
        this: Storage,
        ...args: string[]
      ) {
        (window as any).__anCalls.push(`storage:${method}`);
        return (fn as (...args: string[]) => unknown).apply(this, args);
      };
    }
  });
  await page.goto(path);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex,nofollow",
  );
  return async () => {
    expect(unexpected).toEqual([]);
    expect(runtime).toEqual([]);
    expect(await page.evaluate(() => (window as any).__anCalls)).toEqual([]);
  };
}

test("EVM inspection examples, malformed input and exact local JSON", async ({
  page,
}) => {
  const safe = await safeLocalPage(page, "/tools/evm-data-inspector/");
  await expect(
    page.getByRole("heading", { name: "EVM Data Inspector" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inspect locally" }).click();
  await expect(page.locator("[data-primary]")).toContainText(
    "0x52908400098527886E0F7030069857D2E4169EE7",
  );
  await page.getByLabel("Inspection mode").selectOption("signature");
  await page.getByRole("button", { name: "Inspect locally" }).click();
  await expect(page.locator("[data-primary]")).toContainText("0xa9059cbb");
  await page.getByLabel("Inspection mode").selectOption("decode");
  await page.getByRole("button", { name: "Inspect locally" }).click();
  await expect(page.locator("[data-result]")).toContainText("100");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download local JSON" }).click(),
  ]);
  expect(
    JSON.parse(await readFile(await download.path()!, "utf8")).output
      .calculationVersion,
  ).toBe("pit.evm-data-inspector.local.v1");
  await page.getByLabel("Hex calldata").fill("0xa9059cbb");
  await page.getByRole("button", { name: "Inspect locally" }).click();
  await expect(page.locator("[data-error]")).toContainText("truncated");
  await safe();
});

test("CSV original preview, exact normalization, duplicate review and exports", async ({
  page,
}) => {
  const safe = await safeLocalPage(page, "/tools/crypto-data-workshop/");
  await page
    .getByRole("button", { name: "Load fictional CSV example" })
    .click();
  await page.getByRole("button", { name: "Run local review" }).click();
  await expect(page.locator("[data-summary]")).toContainText(
    "3 data rows · 6 columns",
  );
  await expect(page.locator("[data-preview]")).toContainText("1.250000");
  await page.getByLabel("Workshop mode").selectOption("normalize");
  await page.getByLabel(/I reviewed the original preview/).check();
  await page.getByRole("button", { name: "Run local review" }).click();
  await expect(page.locator("[data-summary]")).toContainText("COMPLETE");
  const [json] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Download exact local JSON report" })
      .click(),
  ]);
  const report = JSON.parse(await readFile(await json.path()!, "utf8"));
  expect(report.result.normalizedRows[0].fields.amount.value).toBe("1250000");
  expect(report.result.normalizedRows[0].fields.timestampUtc.value).toBe(
    "2026-01-02T08:00:00.000Z",
  );
  await page.getByLabel("Workshop mode").selectOption("dedupe");
  await page.getByRole("button", { name: "Run local review" }).click();
  await expect(page.locator("[data-summary]")).toContainText("INCOMPLETE");
  await expect(page.locator("[data-duplicate-decisions]")).toContainText(
    "rows 1, 3",
  );
  await page.locator('[data-decision="1"]').selectOption("keep");
  await page.locator('[data-decision="3"]').selectOption("exclude");
  await page.getByRole("button", { name: "Run local review" }).click();
  await expect(page.locator("[data-summary]")).toContainText("COMPLETE");
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Download reviewed spreadsheet-safe CSV" })
      .click(),
  ]);
  const content = await readFile(await csv.path()!, "utf8");
  expect(content).toContain('"1250000"');
  expect(content.split("\r\n").filter(Boolean)).toHaveLength(3);
  await safe();
});

test("CSV rejects malformed local input and remains keyboard/mobile usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  const safe = await safeLocalPage(page, "/tools/crypto-data-workshop/");
  await page
    .locator("[data-file]")
    .setInputFiles({
      name: "bad.csv",
      mimeType: "text/csv",
      buffer: Buffer.from('a,b\n"unterminated'),
    });
  await expect(page.locator("[data-error]")).toContainText("unterminated");
  await page
    .getByRole("button", { name: "Load fictional CSV example" })
    .focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Run local review" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-result]")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    ),
  ).toBe(true);
  await safe();
});
