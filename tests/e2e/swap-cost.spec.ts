import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

async function localPage(page: import("@playwright/test").Page) {
  const outside: string[] = [];
  const walletCalls: string[] = [];
  await page.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    outside.push(`${route.request().method()} ${url.origin}`);
    return route.abort("blockedbyclient");
  });
  await page.addInitScript(() => {
    (window as any).__swapCostWalletCalls = [];
    (window as any).__swapCostDbOpens = 0;
    (window as any).ethereum = {
      request: async ({ method }: { method: string }) => {
        (window as any).__swapCostWalletCalls.push(method);
        throw Error("WALLET_FORBIDDEN");
      },
    };
    const original = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<typeof indexedDB.open>) => {
      (window as any).__swapCostDbOpens++;
      return original(...args);
    }) as typeof indexedDB.open;
  });
  await page.goto("/tools/swap-cost/");
  await expect(
    page.getByLabel("Scenario A Total sell-token budget"),
  ).toBeVisible();
  return { outside, walletCalls };
}

test("manual CoW and Uniswap scenarios show embedded versus separate costs without network or wallet activity", async ({
  page,
}) => {
  const { outside } = await localPage(page);
  await expect(
    page.getByRole("heading", { name: "Swap Cost Simulator" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex,nofollow",
  );
  await page
    .getByRole("button", { name: "Calculate local cost comparison" })
    .click();
  const A = page.getByRole("region", { name: "Scenario A result" });
  const B = page.getByRole("region", { name: "Scenario B result" });
  await expect(A).toContainText("Embedded in quote; not deducted twice");
  await expect(A).toContainText("Estimated net output0.005 WETH");
  await expect(B).toContainText("Wallet approval gas0.00005 ETH");
  await expect(B).toContainText("Wallet swap gas0.00015 ETH");
  await expect(B).toContainText("Gas converted to buy token0.0002 WETH");
  await expect(B).toContainText("Estimated net output0.0049 WETH");
  await expect(page.getByTestId("swap-cost-report")).toContainText(
    "Best estimated net output under supplied assumptions",
  );
  await expect(page.getByTestId("swap-cost-report")).toContainText(
    "Winner: Scenario A",
  );
  expect(outside).toEqual([]);
  expect(
    await page.evaluate(() => (window as any).__swapCostWalletCalls),
  ).toEqual([]);
  expect(await page.evaluate(() => (window as any).__swapCostDbOpens)).toBe(0);
});

test("unknown gas or approval and mismatched budgets prevent a fabricated ranking", async ({
  page,
}) => {
  await localPage(page);
  await page
    .getByRole("button", { name: "Illustrate unknown swap gas" })
    .click();
  await page
    .getByRole("button", { name: "Calculate local cost comparison" })
    .click();
  await expect(page.getByTestId("swap-cost-report")).toContainText(
    "NOT COMPARABLE — incomplete cost coverage",
  );
  await expect(
    page.getByRole("region", { name: "Scenario B result" }),
  ).toContainText("Wallet swap gas estimate is missing");
  await page
    .getByLabel("Scenario B ERC-20 approval required?")
    .selectOption("unknown");
  await page
    .getByRole("button", { name: "Calculate local cost comparison" })
    .click();
  await expect(
    page.getByRole("region", { name: "Scenario B result" }),
  ).toContainText("Approval requirement is unknown");
  await page
    .getByLabel("Scenario B ERC-20 approval required?")
    .selectOption("yes");
  await page.getByLabel("Scenario B Wallet-paid swap gas units").fill("150000");
  await page.getByLabel("Scenario B Total sell-token budget").fill("11");
  await page
    .getByRole("button", { name: "Calculate local cost comparison" })
    .click();
  await expect(page.getByTestId("swap-cost-report")).toContainText(
    "Total sell-token budgets differ",
  );
});

test("actual downloaded JSON preserves exact integer fields and simulated status", async ({
  page,
}) => {
  await localPage(page);
  await page.getByLabel("Scenario B Quoted buy-token output").fill("0.0051");
  await page
    .getByRole("button", { name: "Calculate local cost comparison" })
    .click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download local JSON report" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("pit-swap-cost-simulation.json");
  const report = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(report.calculationVersion).toBe("pit.swap-cost.simulation.v1");
  expect(report.disclaimer).toContain("Illustrative manual assumptions only");
  expect(report.scenarios.A.quotedBuyRaw).toBe("5000000000000000");
  expect(report.scenarios.B.convertedWalletGasBuyRaw).toBe("200000000000000");
  expect(report.scenarios.B.netAfterWalletGasRaw).toBe("4900000000000000");
  expect(report.scenarios.B.pitFeeBuyRaw).toBe("0");
  expect(report.comparison.winner).toBe("A");
});

test("mobile viewport and keyboard input remain usable offline", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { outside } = await localPage(page);
  await context.setOffline(true);
  await page.getByLabel("Scenario A Total sell-token budget").focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("10");
  await page
    .getByRole("button", { name: "Calculate local cost comparison" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("swap-cost-report")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  expect(outside).toEqual([]);
  expect(
    await page.evaluate(() => (window as any).__swapCostWalletCalls),
  ).toEqual([]);
});
