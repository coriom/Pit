import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function localPage(page: Page, path: string) {
  const unexpected: string[] = [];
  await page.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin === "http://127.0.0.1:4398" &&
      !url.pathname.startsWith("/api/") &&
      !url.pathname.includes("rpc")
    )
      return route.continue();
    unexpected.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  await page.addInitScript(() => {
    (window as any).__amCalls = [];
    (window as any).ethereum = {
      request: async ({ method }: { method: string }) => {
        (window as any).__amCalls.push(`wallet:${method}`);
        throw Error("Wallet forbidden");
      },
    };
    const original = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<typeof indexedDB.open>) => {
      (window as any).__amCalls.push("indexedDB.open");
      return original(...args);
    }) as typeof indexedDB.open;
    for (const method of [
      "getItem",
      "setItem",
      "removeItem",
      "clear",
    ] as const) {
      const fn = Storage.prototype[method];
      (Storage.prototype[method] as any) = function (
        this: Storage,
        ...args: string[]
      ) {
        (window as any).__amCalls.push(`storage:${method}`);
        return (fn as (...args: string[]) => unknown).apply(this, args);
      };
    }
  });
  await page.goto(path);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex,nofollow",
  );
  return async () => {
    expect(unexpected).toEqual([]);
    expect(await page.evaluate(() => (window as any).__amCalls)).toEqual([]);
  };
}

test("AMM modes keep pool mechanics separate from executable quotes", async ({
  page,
}) => {
  const safe = await localPage(page, "/tools/amm-pool-math/");
  await expect(
    page.getByRole("heading", { name: "AMM Pool Math Lab" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load illustrative example" }).click();
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-primary]")).toContainText(
    "100 TokenB/TokenA",
  );
  await page.getByLabel("Calculation mode").selectOption("swap");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-primary]")).toContainText(
    "909.090909 TokenB",
  );
  await expect(page.locator("[data-result]")).toContainText(
    "Fee-free reserve impact",
  );
  await page.getByLabel("Calculation mode").selectOption("liquidity");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText(
    "0.090909090909090909 fraction",
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download local JSON" }).click(),
  ]);
  const report = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(report.calculationVersion).toBe("pit.amm-pool-math.local.v1");
  expect(
    report.fields.find((f: { name: string }) => f.name === "usedToken1").raw,
  ).toBe("1000000000");
  await page.getByLabel("Existing token0 reserve").fill("0");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-error]")).toContainText("positive");
  await safe();
});

test("concentrated scenarios expose matched HODL, fee coverage and local export", async ({
  page,
}) => {
  const safe = await localPage(page, "/tools/concentrated-liquidity/");
  await expect(
    page.getByRole("heading", { name: "Concentrated Liquidity Planner" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load illustrative example" }).click();
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-primary]")).toContainText("100 TokenB");
  await page.getByLabel("Calculation mode").selectOption("scenario");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-primary]")).toContainText("-100 TokenB");
  await page.getByLabel("Calculation mode").selectOption("fees");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-primary]")).toContainText("105 TokenB");
  await page.getByLabel("Management/gas cost coverage").selectOption("unknown");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-status]")).toContainText("INCOMPLETE");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download local JSON" }).click(),
  ]);
  const report = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(report.status).toBe("incomplete");
  expect(
    report.fields.some((f: { name: string }) => f.name === "netLpMinusHodl"),
  ).toBe(false);
  await page.getByLabel("Lower price (token1 per token0)").fill("4");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-error]")).toContainText("strictly below");
  await safe();
});

test("AMM and concentrated pages remain keyboard usable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  const safe = await localPage(page, "/tools/concentrated-liquidity/");
  await page.getByLabel("Calculation mode").focus();
  await page.keyboard.press("End");
  await expect(page.getByLabel("Management/gas cost coverage")).toBeVisible();
  await page.getByRole("button", { name: "Calculate local scenario" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-result]")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    ),
  ).toBe(true);
  await safe();
});
