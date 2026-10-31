import { expect, test, type Page } from "@playwright/test";
import { join, resolve, sep } from "node:path";
import { stat } from "node:fs/promises";

const root = resolve("dist-product-cloudflare-staging/public");
async function openStatic(page: Page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "pit.local") return route.abort("blockedbyclient");
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = join(root, relative.endsWith("/") || !relative ? `${relative}index.html` : relative);
    if (!file.startsWith(root + sep)) return route.abort("blockedbyclient");
    try { if ((await stat(file)).isFile()) return route.fulfill({ path: file }); }
    catch { /* A missing route is a real 404 in this static package. */ }
    return route.fulfill({ status: 404, body: "Not found" });
  });
  await page.goto("http://pit.local/", { waitUntil: "domcontentloaded" });
}

test("desktop identity, keyboard menu and discovery", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStatic(page);
  await expect(page.getByRole("heading", { name: /Make more of what’s on-chain/ })).toBeVisible();
  await expect(page.locator(".category-tile")).toHaveCount(9);
  await expect(page.locator('.featured-grid a[href="/tools/portfolio-exposure/"]')).toContainText("Free");
  await expect(page.locator('.featured-grid a[href="/operations/token-creator/"]')).toContainText("Preview");
  const colors = await page.locator(".category-tile").evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).getPropertyValue("--category-accent").trim()));
  expect(new Set(colors).size).toBe(9);
  await expect(page.locator(".product-hero")).toHaveCSS("background-image", /radial-gradient/);
  await page.locator(".tools-menu summary").click();
  await expect(page.locator(".tools-menu-panel")).toBeVisible();
  await expect(page.locator(".menu-category")).toHaveCount(9);
  await page.locator(".hero-search").click();
  await expect(page.locator(".tools-menu")).not.toHaveAttribute("open");
  await page.locator(".tools-menu summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".tools-menu-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".tools-menu")).not.toHaveAttribute("open");
  await page.keyboard.press("/");
  await expect(page.locator("#operation-search")).toBeFocused();
  await page.locator("#operation-search").fill("ERC-1155 Creator");
  await expect(page.locator("[data-tool]:visible")).toHaveCount(1);
  await expect(page.locator("#search-count")).toHaveText("1 tool");
  const card = page.locator("[data-tool]:visible");
  await expect(card.locator(".product-card-details")).not.toHaveAttribute("open");
  await card.locator("summary").click();
  await expect(card.getByText("Anvil for local execution")).toBeVisible();
  await card.getByRole("link", { name: "Open ERC-1155 Creator" }).click();
  await expect(page.getByText("Preview only")).toBeVisible();
  await expect(page.locator("#operation-root")).toHaveCount(0);
});

test("category links, mobile menu, search and no overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStatic(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  await page.locator(".mobile-nav > summary").click();
  await expect(page.locator(".mobile-nav > nav")).toBeVisible();
  await page.locator(".mobile-categories > summary").click();
  await expect(page.locator(".mobile-categories a")).toHaveCount(9);
  await page.keyboard.press("Escape");
  await expect(page.locator(".mobile-nav")).not.toHaveAttribute("open");
  await page.locator(".nav-search").click();
  await expect(page.locator("#operation-search")).toBeFocused();
  await page.locator(".category-tile").first().click();
  await expect(page.locator("#operation-category")).not.toHaveValue("all");
  await expect(page.locator("#operation-category")).toHaveAttribute("data-category", "trading-risk");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const transition = await page.locator(".category-tile").first().evaluate((node) => getComputedStyle(node).transitionDuration);
  expect(transition.split(",").every((part) => parseFloat(part) <= .001)).toBe(true);
});

test("offline Toolbox keeps category cues and existing discovery", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openStatic(page);
  await page.goto("http://pit.local/toolbox/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Make sense of the numbers." })).toBeVisible();
  await expect(page.locator(".local-task-card[data-category]")).toHaveCount(9);
  await page.locator(".local-desktop-nav details summary").click();
  await expect(page.locator(".local-nav-panel [data-category]")).toHaveCount(8);
  await page.goto("http://pit.local/tools/", { waitUntil: "domcontentloaded" });
  await page.locator("#tool-search").fill("portfolio exposure");
  await expect(page.locator("[data-card]:visible").first()).toContainText(/Portfolio Exposure/i);
  await expect(page.locator("[data-category-filter='portfolio-analytics']")).toBeVisible();
  await expect(page.locator("[data-card]:visible").first()).toHaveCSS("background-image", /linear-gradient/);
});

test("motion adds card response and ambient hero without changing navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openStatic(page);
  const tile = page.locator(".category-tile").first();
  await expect(tile).toBeVisible();
  await expect.poll(() => tile.evaluate((node) => getComputedStyle(node).animationName)).toContain("pit-enter");
  await expect.poll(() => page.locator(".product-hero").evaluate((node) => getComputedStyle(node, "::before").animationName)).toContain("pit-grid-drift");
  await tile.hover();
  await expect.poll(() => tile.evaluate((node) => getComputedStyle(node).transform)).not.toBe("none");
  await page.locator(".tools-menu summary").click();
  await expect(page.locator(".tools-menu-panel")).toBeVisible();
  await expect(page.locator(".tools-menu-panel")).toHaveCSS("animation-name", "pit-menu-enter");
});

test("reduced motion keeps the same controls usable and removes decorative loops", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStatic(page);
  const tile = page.locator(".category-tile").first();
  await expect(tile).toBeVisible();
  await expect(tile).toHaveCSS("animation-name", "none");
  await expect.poll(() => page.locator(".product-hero").evaluate((node) => getComputedStyle(node, "::before").animationName)).toBe("none");
  await tile.hover();
  await expect(tile).toHaveCSS("transform", "none");
  await page.locator(".mobile-nav > summary").click();
  await expect(page.locator(".mobile-nav > nav")).toBeVisible();
  await page.locator(".mobile-categories > summary").click();
  await expect(page.locator(".mobile-categories a")).toHaveCount(9);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
});

test("tablet category cards and menu remain within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await openStatic(page);
  await expect(page.locator(".category-tile")).toHaveCount(9);
  await page.locator(".tools-menu summary").click();
  await expect(page.locator(".tools-menu-panel")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
});
