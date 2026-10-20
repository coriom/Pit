import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("bounded CSV workshop stays responsive at 1,000 rows and 30 columns", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "CPU throttling measurement uses Chromium CDP",
  );
  test.setTimeout(120_000);
  const unexpected: string[] = [];
  await page.route(/^https?:\/\//, (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin === "http://127.0.0.1:4398" &&
      !url.pathname.startsWith("/api/")
    )
      return route.continue();
    unexpected.push(url.href);
    return route.abort("blockedbyclient");
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/tools/crypto-data-workshop/");
  const header = [
    "id",
    "chain",
    "event",
    "time",
    "amount",
    "note",
    ...Array.from({ length: 24 }, (_, i) => `extra${i}`),
  ];
  const rows = Array.from({ length: 1000 }, (_, i) =>
    [
      `r${i}`,
      "11155111",
      String(i),
      "2026-01-02T00:00:00Z",
      "1.250000",
      "fictional",
      ...Array(24).fill("abcdefg"),
    ].join(","),
  );
  const source = `${header.join(",")}\r\n${rows.join("\r\n")}\r\n`;
  const bytes = Buffer.from(source, "utf8");
  expect(bytes.length).toBeLessThanOrEqual(262_144);
  const startUpload = Date.now();
  await page
    .locator("[data-file]")
    .setInputFiles({
      name: "fictional-limit.csv",
      mimeType: "text/csv",
      buffer: bytes,
    });
  await expect(page.locator("[data-file-status]")).toContainText(
    "1000 data rows · 30 columns",
  );
  const uploadMs = Date.now() - startUpload;
  const startInspect = Date.now();
  await page.getByRole("button", { name: "Run local review" }).click();
  await expect(page.locator("[data-summary]")).toContainText(
    "COMPLETE · 1000 data rows · 30 columns",
  );
  const inspectMs = Date.now() - startInspect;
  await page.getByLabel("Workshop mode").selectOption("normalize");
  for (const [field, source] of Object.entries({
    recordId: "id",
    chainId: "chain",
    eventId: "event",
    timestampUtc: "time",
    amount: "amount",
    note: "note",
  }))
    await page.locator(`[name="${field}"]`).selectOption(source);
  await page.getByLabel(/I reviewed the original preview/).check();
  const startNormalize = Date.now();
  await page.getByRole("button", { name: "Run local review" }).click();
  await expect(page.locator("[data-summary]")).toContainText("COMPLETE");
  const normalizeMs = Date.now() - startNormalize;
  await page.getByLabel("Workshop mode").selectOption("dedupe");
  await page.locator('[name="identityA"]').selectOption("recordId");
  await page.locator('[name="identityB"]').selectOption("eventId");
  const startDedupe = Date.now();
  await page.getByRole("button", { name: "Run local review" }).click();
  await expect(page.locator("[data-summary]")).toContainText("COMPLETE");
  const dedupeMs = Date.now() - startDedupe;
  const startExport = Date.now();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Download exact local JSON report" })
      .click(),
  ]);
  const reportBytes = (await readFile(await download.path()!)).length;
  const exportMs = Date.now() - startExport;
  expect(await page.locator("[data-preview] td").count()).toBeLessThanOrEqual(
    180,
  );
  expect(unexpected).toEqual([]);
  console.log(
    `AO_CSV_PERFORMANCE ${JSON.stringify({ browserName, cpuThrottle: 4, viewport: "390x780", sourceBytes: bytes.length, rows: 1000, columns: 30, uploadMs, inspectMs, normalizeMs, dedupeMs, exportMs, reportBytes })}`,
  );
});
