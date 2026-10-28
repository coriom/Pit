import { expect, test } from "@playwright/test";

test("unified loopback directory links all three isolated products", async ({ page, request }) => {
  test.setTimeout(120_000);
  const external: string[] = [];
  page.on("request", (request) => { if (!request.url().startsWith("http://127.0.0.1:4414/")) external.push(request.url()); });
  const home = await page.goto("/");
  expect(home?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: /Understand the data/ })).toBeVisible();
  await expect(page.locator("[data-tool]")).toHaveCount(197);
  const hrefs = await page.locator("[data-tool]").evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).getAttribute("href")!));
  for (let offset = 0; offset < hrefs.length; offset += 12) {
    const checked = await Promise.all(hrefs.slice(offset, offset + 12).map(async (href) => ({ href, status: (await request.get(href)).status() })));
    expect(checked.filter(({ status }) => status !== 200)).toEqual([]);
  }
  await expect(page.locator("[data-tool]:visible")).toHaveCount(24);
  await page.getByRole("button", { name: "Show all routes" }).click();
  await expect(page.locator("[data-tool]:visible")).toHaveCount(197);
  await page.locator("#operation-usage").selectOption("read-only");
  await expect(page.locator("[data-tool]:visible")).toHaveCount(28);
  await page.locator("#operation-network").selectOption("base-sepolia");
  expect(await page.locator("[data-tool]:visible").count()).toBeGreaterThan(0);
  await page.locator("#operation-network").selectOption("all");
  await page.locator("#operation-usage").selectOption("local");
  await expect(page.locator("[data-tool]:visible")).toHaveCount(151);
  await page.locator("#operation-usage").selectOption("transaction");
  await expect(page.locator("[data-tool]:visible")).toHaveCount(18);
  await page.locator("#operation-price").selectOption("indicative");
  expect(await page.locator("[data-tool]:visible").count()).toBeGreaterThan(0);
  await page.getByLabel("Search tools").fill("ERC-1155 Creator");
  await expect(page.locator("[data-tool]:visible")).toHaveCount(1);
  await page.locator("[data-tool]:visible").click();
  await expect(page.getByRole("heading", { name: "ERC-1155 Creator" })).toBeVisible();
  await expect(page.getByRole("link", { name: "All tools" })).toBeVisible();
  expect(external).toEqual([]);
});

test("free deep links keep their own CSP and mobile navigation", async ({ page, request }) => {
  const toolbox = await request.get("/toolbox/");
  expect(toolbox.status()).toBe(200);
  expect(toolbox.headers()["content-security-policy"]).toContain("connect-src 'none'");
  const explorer = await request.get("/explorer/");
  expect(explorer.status()).toBe(200);
  expect(explorer.headers()["content-security-policy"]).not.toContain("eth_sendTransaction");
  const operation = await request.get("/operations/token-creator/");
  expect(operation.status()).toBe(200);
  expect(operation.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await page.goto("/toolbox/");
  await expect(page.getByRole("heading", { name: /Understand Web3 positions/ })).toBeVisible();
  await page.goto("/explorer/");
  await expect(page.getByRole("heading", { name: /Read public-chain facts/ })).toBeVisible();
  await page.goto("/operations/token-creator/");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
});
