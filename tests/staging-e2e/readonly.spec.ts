import { expect, test } from "@playwright/test";

test("hosted candidate exposes all routes but no signing journey", async ({ page, request }) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4415/")) external.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator("[data-tool]")).toHaveCount(197);
  await page.getByLabel("Search tools").fill("ERC-1155 Creator");
  await expect(page.locator("[data-tool]:visible")).toHaveCount(1);
  await page.locator("[data-tool]:visible").click();
  await expect(page.getByRole("heading", { name: "ERC-1155 Creator" })).toBeVisible();
  await expect(page.getByText("Execution is unavailable in this private preview")).toBeVisible();
  await expect(page.locator("#operation-root")).toHaveCount(0);
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content")).toContain("connect-src 'none'");
  await expect(page.getByRole("button", { name: /confirm|connect|approve|execute/i })).toHaveCount(0);
  expect((await request.get("/toolbox/")).status()).toBe(200);
  expect((await request.get("/explorer/")).status()).toBe(200);
  expect((await request.get("/favicon.svg")).status()).toBe(200);
  expect(external).toEqual([]);
});

test("private package retains free deep links and mobile layout", async ({ page, request }) => {
  for (const path of ["/toolbox/", "/explorer/", "/inspect/batch-balances/", "/operations/token-locker/"]) {
    expect((await request.get(path)).status()).toBe(200);
  }
  await page.goto("/toolbox/");
  await expect(page.getByRole("heading", { name: /Understand Web3 positions/ })).toBeVisible();
  await page.goto("/operations/token-locker/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
});
