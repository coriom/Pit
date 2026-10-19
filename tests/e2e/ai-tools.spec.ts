import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function localPage(page: Page, path: string) {
  const external: string[] = [],
    sameOriginApi: string[] = [];
  await page.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://127.0.0.1:4398") {
      if (url.pathname.startsWith("/api/") || url.pathname.includes("rpc"))
        sameOriginApi.push(url.pathname);
      return route.continue();
    }
    external.push(`${route.request().method()} ${url.origin}`);
    return route.abort("blockedbyclient");
  });
  await page.addInitScript(() => {
    (window as any).__aiCalls = [];
    (window as any).ethereum = {
      request: async ({ method }: { method: string }) => {
        (window as any).__aiCalls.push(`wallet:${method}`);
        throw Error("Wallet forbidden");
      },
    };
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<typeof indexedDB.open>) => {
      (window as any).__aiCalls.push("indexedDB.open");
      return open(...args);
    }) as typeof indexedDB.open;
    for (const method of [
      "getItem",
      "setItem",
      "removeItem",
      "clear",
    ] as const) {
      const original = Storage.prototype[method];
      (Storage.prototype[method] as any) = function (
        this: Storage,
        ...args: string[]
      ) {
        (window as any).__aiCalls.push(`storage:${method}`);
        return (original as (...values: string[]) => unknown).apply(this, args);
      };
    }
  });
  await page.goto(path);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex,nofollow",
  );
  return { external, sameOriginApi };
}
async function assertLocal(
  page: Page,
  evidence: { external: string[]; sameOriginApi: string[] },
) {
  expect(evidence.external).toEqual([]);
  expect(evidence.sameOriginApi).toEqual([]);
  expect(await page.evaluate(() => (window as any).__aiCalls)).toEqual([]);
}

test("trade-risk examples separate weighted entry, conservative sizing and reward/risk", async ({
  page,
}) => {
  const evidence = await localPage(page, "/tools/trade-risk/");
  await expect(
    page.getByRole("heading", { name: "Trade Entry & Risk Planner" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText("703 USDC");
  await expect(page.locator("[data-result]")).toContainText(
    "2358.458964 USDC/ETH",
  );
  await page.getByRole("button", { name: "Add purchase fill" }).click();
  await expect(page.locator("[data-fill]")).toHaveCount(3);
  await page.getByRole("button", { name: "Remove last fill" }).click();
  await page
    .locator("[data-fill]")
    .first()
    .locator('[name="feeQuote"]')
    .fill("");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText("INCOMPLETE");
  await expect(page.locator("[data-result]")).not.toContainText(
    "Minimum break-even exit price",
  );

  await page.getByLabel("Calculation mode").selectOption("risk");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText("1 ETH");
  await expect(page.locator("[data-result]")).toContainText("100 USDC");
  await page.getByLabel("Calculation mode").selectOption("reward");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText("2 R (signed)");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download local JSON" }).click(),
  ]);
  const json = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(json.calculationVersion).toBe("pit.trade-risk.local.v1");
  expect(
    json.fields.find(
      (item: { name: string }) => item.name === "rewardRiskRatio",
    ).raw,
  ).toBe("2000000000000000000");
  await assertLocal(page, evidence);
});

test("execution math shows spread, exact slippage bounds and incomplete gas coverage", async ({
  page,
}) => {
  const evidence = await localPage(page, "/tools/execution-math/");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText(
    "200 bps of midpoint",
  );
  await page.getByLabel("Calculation mode").selectOption("slippage");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText("99.5 USDC");
  await page.getByLabel("Transaction direction").selectOption("exact-output");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText("100.5 USDC");
  await page.getByLabel("Calculation mode").selectOption("gas");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText("0.00042 ETH");
  await page.getByLabel("Approval required?").selectOption("unknown");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText("INCOMPLETE");
  await expect(page.locator("[data-result]")).not.toContainText(
    "Known total gas cost",
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download local JSON" }).click(),
  ]);
  const json = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(json.status).toBe("incomplete");
  expect(
    json.fields.some(
      (item: { name: string }) => item.name === "knownTotalGasWei",
    ),
  ).toBe(false);
  await assertLocal(page, evidence);
});

test("both tools stay keyboard-usable at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const evidence = await localPage(page, "/tools/execution-math/");
  await page.getByLabel("Bid price").focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("99");
  await page.getByRole("button", { name: "Calculate local scenario" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-result]")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await assertLocal(page, evidence);
});
