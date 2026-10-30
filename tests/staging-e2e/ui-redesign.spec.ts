import { expect, test } from "@playwright/test";

test("desktop navigation, category discovery and card details", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "PIT home" })).toHaveText("PIT");
  await page.locator(".desktop-nav .tools-menu summary").click();
  await expect(page.locator(".category-menu a")).toHaveCount(9);
  await page.keyboard.press("Escape");
  await expect(page.locator(".desktop-nav .tools-menu")).not.toHaveAttribute("open");
  await page.keyboard.press("/");
  await expect(page.locator("#operation-search")).toBeFocused();
  await page.locator("#operation-search").fill("ERC-1155 Creator");
  await expect(page.locator("#directory-search")).toHaveValue("ERC-1155 Creator");
  await expect(page.locator("[data-tool]:visible")).toHaveCount(1);
  await expect(page.locator("#search-count")).toHaveText("1 tool");
  await page.locator("#directory-search").fill("ERC-1155 Creator");
  const card = page.locator("[data-tool]:visible");
  await expect(card.locator(".product-card-details")).not.toHaveAttribute("open");
  await card.locator("summary").click();
  await expect(card.locator(".product-card-details")).toHaveAttribute("open");
  await expect(card.getByText("Anvil for local execution")).toBeVisible();
  await card.getByRole("link", { name: "Open ERC-1155 Creator" }).click();
  await expect(page.getByRole("heading", { name: "ERC-1155 Creator" })).toBeVisible();
  await expect(page.getByText("Preview only")).toBeVisible();
  await expect(page.locator(".technical-details")).not.toHaveAttribute("open");
});

test("category link, reset and tablet layout", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1024 });
  await page.goto("/");
  await page.locator(".category-rail a").first().click();
  await expect(page.locator("#operation-category")).not.toHaveValue("all");
  await expect(page.locator("#reset-filters")).toBeVisible();
  await page.locator("#reset-filters").click();
  await expect(page.locator("#operation-category")).toHaveValue("all");
  await expect(page.locator("[data-tool]:visible")).toHaveCount(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
});

test("mobile menu and cross-surface search remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".mobile-nav > summary").click();
  await expect(page.locator(".mobile-nav > nav")).toBeVisible();
  await page.locator(".mobile-categories > summary").click();
  await expect(page.locator(".mobile-categories a")).toHaveCount(9);
  await page.keyboard.press("Escape");
  await expect(page.locator(".mobile-nav")).not.toHaveAttribute("open");
  await page.locator(".nav-search").click();
  await expect(page.locator("#operation-search")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);

  await page.goto("/toolbox/");
  await expect(page.locator(".local-mobile-nav > nav")).toBeHidden();
  await expect(page.locator(".local-desktop-nav")).toBeHidden();
  await page.locator(".local-mobile-nav > summary").click();
  await expect(page.locator(".local-mobile-nav nav a").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  await page.locator(".local-mobile-nav nav a", { hasText: "Toolbox" }).click();
  await expect(page).toHaveURL(/\/tools\/$/);
  await page.locator(".local-mobile-nav > summary").click();
  await page.locator(".local-mobile-nav nav details > summary").click();
  await page.locator(".local-mobile-nav nav details a").first().click();
  await expect(page.locator("[data-category-filter][aria-pressed='true']")).not.toHaveAttribute("data-category-filter", "all");

  await page.goto("/explorer/");
  await expect(page.locator(".explorer-mobile-nav > nav")).toBeHidden();
  await page.locator(".explorer-mobile-nav > summary").click();
  await expect(page.locator(".explorer-mobile-nav nav a").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
});
