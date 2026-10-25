import { expect, test } from "@playwright/test";
import { EXPLORER_TOOLS } from "../../src/lib/explorer-registry";

test("all read-only Explorer deep links load without querying an RPC", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => { if (request.url().startsWith("https://")) external.push(request.url()); });
  for (const tool of EXPLORER_TOOLS) {
    const response = await page.goto(`/inspect/${tool.id}/`);
    expect(response?.status(), tool.id).toBe(200);
    await expect(page.getByRole("heading", { name: tool.title, exact: true })).toBeVisible();
    await expect(page.getByText("No query sent.")).toBeVisible();
  }
  expect(external).toEqual([]);
});

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
  await page.getByLabel("Search inspections").fill("ENS resolver");
  await page.getByLabel("Category").selectOption("Assets & accounts");
  await expect(page.locator("#explorer-catalogue .card:visible")).toHaveCount(1);
  await page.locator("#explorer-network").selectOption("base");
  await expect(page.locator("#explorer-count")).toHaveText("0 inspections shown");
  await page.locator("#explorer-network").selectOption("ethereum");
  await expect(page.locator("#explorer-catalogue .card:visible")).toHaveCount(1);
  expect(external).toEqual([]);
});

test("27-card catalogue filters promptly on a throttled mobile Chromium page", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CPU throttling measurement uses Chromium CDP");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/");
  const measured = await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>("#explorer-search")!;
    const start = performance.now();
    input.value = "chainlink";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return { milliseconds: performance.now() - start, visible: document.querySelectorAll("#explorer-catalogue .card:not([hidden])").length };
  });
  console.log(`EXPLORER_CATALOGUE_PERF ${JSON.stringify({ cpuThrottle: 4, viewport: "390x780", cards: 27, ...measured })}`);
  expect(measured.visible).toBe(1);
  expect(measured.milliseconds).toBeLessThan(500);
});
