import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\//, (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue() : route.abort("blockedbyclient"),
  );
});

test("tool-first homepage exposes three wallet-free journeys and keeps the lab separate", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).hostname !== "127.0.0.1") external.push(request.url()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Understand your DeFi positions and costs." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore free DeFi tools" })).toHaveAttribute("href", "./tools/");
  for (const name of ["Portfolio Exposure Analyzer", "Swap Cost Simulator", "Impermanent Loss Calculator"])
    await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sepolia swap lab" })).toBeVisible();
  await expect(page.locator("astro-island")).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
  expect(external).toEqual([]);
});

test("flagship samples produce useful local results without wallet or network calls", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/tools/impermanent-loss/");
  await page.getByRole("button", { name: /Try illustrative example/ }).click();
  await expect(page.getByRole("status").last()).toContainText("Impermanent loss: -20%");
  await page.goto("/tools/portfolio-exposure/");
  await page.getByRole("button", { name: "Load illustrative three-position sample" }).click();
  await page.getByRole("button", { name: "Analyze current positions" }).click();
  await expect(page.locator("[data-known-total]")).toHaveText("$3000");
  await page.goto("/tools/swap-cost/");
  await page.getByRole("button", { name: "Load illustrative CoW and Uniswap example" }).click();
  await page.getByRole("button", { name: "Calculate local cost comparison" }).click();
  await expect(page.getByTestId("swap-cost-report")).toBeVisible();
  expect(requests.every((url) => new URL(url).hostname === "127.0.0.1")).toBe(true);
});

test("mobile homepage and toolbox remain navigable with keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAttribute("href", "./");
  await page.getByRole("link", { name: "Explore free DeFi tools" }).click();
  await expect(page.getByRole("heading", { name: "Choose a tool." })).toBeVisible();
  await expect(page.locator("[data-tool-card]").first()).toContainText("Portfolio Exposure Analyzer");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("separate read-only artifact calculates in a browser without executable chunks", async ({ page }) => {
  const network: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).protocol !== "file:") network.push(request.url()); });
  await page.goto(pathToFileURL(resolve("dist-readonly-beta/tools/impermanent-loss/index.html")).href);
  await expect(page.getByRole("heading", { name: "Impermanent Loss Calculator" })).toBeVisible();
  await page.getByRole("button", { name: /Try illustrative example/ }).click();
  await expect(page.getByRole("status").last()).toContainText("Impermanent loss: -20%");
  expect(await page.locator("script[src]").count()).toBe(0);
  expect(network).toEqual([]);
});

test("separate read-only artifact imports a local CSV and downloads a local report", async ({ page }) => {
  const network: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).protocol !== "file:") network.push(request.url()); });
  await page.addInitScript(() => {
    (window as any).__walletCalls = [];
    (window as any).ethereum = { request: async ({ method }: { method: string }) => {
      (window as any).__walletCalls.push(method);
      throw Error("WALLET_FORBIDDEN");
    } };
    (window as any).__dbOpens = 0;
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<typeof indexedDB.open>) => {
      (window as any).__dbOpens++;
      return open(...args);
    }) as typeof indexedDB.open;
  });
  await page.goto(pathToFileURL(resolve("dist-readonly-beta/tools/portfolio-exposure/index.html")).href);
  const csv = `accountLabel,chainId,assetType,tokenAddress,symbol,decimals,quantity,unitPriceUsd,priceObservedAt,exposureGroup\nExample,1,native,,ETH,18,1,2000,2026-10-16T00:00:00.000Z,ETH exposure\n`;
  await page.getByLabel("Choose local portfolio CSV").setInputFiles({
    name: "illustrative.csv", mimeType: "text/csv", buffer: Buffer.from(csv),
  });
  await expect(page.locator("[data-import-status]")).toContainText("1 rows previewed");
  await expect(page.locator("[data-row-count]")).toHaveText("0 positions");
  await page.getByRole("button", { name: "Accept valid preview" }).click();
  await page.getByRole("button", { name: "Analyze current positions" }).click();
  await expect(page.locator("[data-report]")).toContainText("$2000");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download local JSON report" }).click(),
  ]);
  const report = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(report.positions).toHaveLength(1);
  expect(report.knownSubtotalUsdRaw).toBe("2000000000000000000000");
  expect(await page.evaluate(() => (window as any).__walletCalls)).toEqual([]);
  expect(await page.evaluate(() => (window as any).__dbOpens)).toBe(0);
  expect(network).toEqual([]);
});
