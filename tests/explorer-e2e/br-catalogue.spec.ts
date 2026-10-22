import { expect, test } from "@playwright/test";

test("Explorer search and categories expose only registered direct routes without RPC", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => { if (request.url().startsWith("https://")) external.push(request.url()); });
  await page.goto("/");
  await expect(page.locator("#explorer-catalogue .card:visible")).toHaveCount(27);
  await page.getByLabel("Category").selectOption("DeFi protocol state");
  await expect(page.locator("#explorer-catalogue .card:visible")).toHaveCount(5);
  await page.getByLabel("Search inspections").fill("chainlink");
  await expect(page.locator("#explorer-catalogue .card:visible")).toHaveCount(1);
  await expect(page.locator("#explorer-count")).toHaveText("1 inspection shown");
  await page.keyboard.press("Tab");
  await expect(page.locator("#explorer-catalogue .card:visible")).toHaveAttribute("href", "/inspect/chainlink-feed/");
  await page.getByLabel("Search inspections").fill("no such inspection");
  await expect(page.locator("#explorer-count")).toHaveText("0 inspections shown");
  expect(external).toEqual([]);
});
