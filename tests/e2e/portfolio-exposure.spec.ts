import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function offlinePage(page: Page) {
  const external: string[] = [];
  await page.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    external.push(`${route.request().method()} ${url.origin}`);
    return route.abort("blockedbyclient");
  });
  await page.addInitScript(() => {
    (window as any).__portfolioWalletCalls = [];
    (window as any).__portfolioDbOpens = 0;
    (window as any).ethereum = {
      request: async ({ method }: { method: string }) => {
        (window as any).__portfolioWalletCalls.push(method);
        throw Error("WALLET_FORBIDDEN");
      },
    };
    const original = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<typeof indexedDB.open>) => {
      (window as any).__portfolioDbOpens++;
      return original(...args);
    }) as typeof indexedDB.open;
  });
  await page.goto("/tools/portfolio-exposure/");
  await expect(
    page.getByRole("heading", { name: "Portfolio Exposure Analyzer" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex,nofollow",
  );
  return external;
}
async function assertLocal(page: Page, external: string[]) {
  expect(external).toEqual([]);
  expect(
    await page.evaluate(() => (window as any).__portfolioWalletCalls),
  ).toEqual([]);
  expect(await page.evaluate(() => (window as any).__portfolioDbOpens)).toBe(0);
}

test("illustrative spot portfolio calculates exact chain, group and concentration data offline", async ({
  page,
}) => {
  const external = await offlinePage(page);
  await page
    .getByRole("button", { name: "Load illustrative three-position sample" })
    .click();
  await page.getByRole("button", { name: "Analyze current positions" }).click();
  const report = page.locator("[data-report]");
  await expect(report).toContainText("COMPLETE manual valuation coverage");
  await expect(report).toContainText("Total known value: $3000");
  await expect(report).toContainText("Largest position: 66.6667%");
  await expect(report).toContainText("Top three: 100%");
  await expect(report).toContainText("HHI: 5000");
  await expect(report.locator('[data-allocation="group"]')).toContainText(
    "ETH exposure",
  );
  await expect(report.locator('[data-allocation="group"]')).toContainText(
    "$2500",
  );
  await expect(report.locator('[data-allocation="group"]')).toContainText(
    "83.3333%",
  );
  await assertLocal(page, external);
});

test("unpriced holding removes whole-portfolio percentages without valuing it at zero", async ({
  page,
}) => {
  const external = await offlinePage(page);
  await page
    .getByRole("button", { name: "Load illustrative three-position sample" })
    .click();
  await page
    .getByRole("button", { name: "Add illustrative unpriced holding" })
    .click();
  await page.getByRole("button", { name: "Analyze current positions" }).click();
  const report = page.locator("[data-report]");
  await expect(report).toContainText("INCOMPLETE manual valuation coverage");
  await expect(report).toContainText("Total known value: $3000");
  await expect(report).toContainText("3 priced; 1 unpriced");
  await expect(report).toContainText("Largest position: UNKNOWN");
  await expect(report.locator('[data-allocation="group"]')).toContainText(
    "UNKNOWN",
  );
  await assertLocal(page, external);
});

test("manual entry and CSV preview require explicit acceptance, reject duplicates, and keep quoted cells inert", async ({
  page,
}) => {
  const external = await offlinePage(page);
  const at = new Date().toISOString();
  await page.getByLabel("Local account label").fill("Manual wallet");
  await page.getByLabel("Blockchain").selectOption("1");
  await page.getByLabel("Asset type").selectOption("native");
  await page.getByLabel("Symbol (display only)").fill("ETH");
  await page.getByLabel("Token decimals").fill("18");
  await page.getByLabel("Exact spot quantity").fill("1");
  await page.getByLabel("Manual USD price (blank = unknown)").fill("2000");
  await page.getByLabel("Price observation time with timezone").fill(at);
  await page
    .getByLabel("Optional explicit exposure group")
    .fill("ETH exposure");
  await page.getByRole("button", { name: "Add position locally" }).click();
  await expect(page.locator("[data-row-count]")).toHaveText("1 position");
  const csv = `accountLabel,chainId,assetType,tokenAddress,symbol,decimals,quantity,unitPriceUsd,priceObservedAt,exposureGroup\n"Second, wallet",8453,erc20,0x1111111111111111111111111111111111111111,USDC,6,500,1,${at},Stablecoin exposure\n`;
  await page
    .getByLabel("Choose local portfolio CSV")
    .setInputFiles({
      name: "portfolio.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await expect(page.locator("[data-import-status]")).toContainText(
    "1 rows previewed",
  );
  await expect(page.locator("[data-row-count]")).toHaveText("1 position");
  await page.getByRole("button", { name: "Accept valid preview" }).click();
  await expect(page.locator("[data-row-count]")).toHaveText("2 positions");
  await page
    .getByLabel("Choose local portfolio CSV")
    .setInputFiles({
      name: "duplicate.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await expect(page.locator("[data-import-status]")).toContainText("duplicate");
  await expect(
    page.getByRole("button", { name: "Accept valid preview" }),
  ).toBeDisabled();
  await assertLocal(page, external);
});

test("local JSON download preserves exact raw assumptions and reset touches this page only", async ({
  page,
}) => {
  const external = await offlinePage(page);
  await page
    .getByRole("button", { name: "Load illustrative three-position sample" })
    .click();
  await page.getByRole("button", { name: "Analyze current positions" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download local JSON report" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(
    "pit-portfolio-exposure-manual.json",
  );
  const json = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(json.calculationVersion).toBe("pit.portfolio-exposure.manual.v1");
  expect(json.knownSubtotalUsdRaw).toBe("3000000000000000000000");
  expect(json.positions[2].quantityRaw).toBe("250000000000000000");
  expect(
    json.byGroup.find(
      (p: { identity: string }) => p.identity === "ETH exposure",
    ).valueUsdRaw,
  ).toBe("2500000000000000000000");
  expect(json.disclaimer).toContain("no live data");
  await page.getByRole("button", { name: "Reset this page only" }).click();
  await expect(page.locator("[data-row-count]")).toHaveText("0 positions");
  await expect(page.locator("[data-report]")).toBeHidden();
  await assertLocal(page, external);
});

test("mobile layout and keyboard-only sample analysis remain usable offline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const external = await offlinePage(page);
  await page
    .getByRole("button", { name: "Load illustrative three-position sample" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-row-count]")).toHaveText("3 positions");
  await page.getByRole("button", { name: "Analyze current positions" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-report]")).toContainText("$3000");
  await expect(page.locator("[data-report]")).toBeVisible();
  await assertLocal(page, external);
});
