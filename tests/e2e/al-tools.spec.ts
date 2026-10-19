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
    (window as any).__alCalls = [];
    (window as any).ethereum = {
      request: async ({ method }: { method: string }) => {
        (window as any).__alCalls.push(`wallet:${method}`);
        throw Error("Wallet forbidden");
      },
    };
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<typeof indexedDB.open>) => {
      (window as any).__alCalls.push("indexedDB.open");
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
        (window as any).__alCalls.push(`storage:${method}`);
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
  expect(await page.evaluate(() => (window as any).__alCalls)).toEqual([]);
}
test("collateral modes expose dual constraints, conservative change and fixed-debt shock", async ({
  page,
}) => {
  const evidence = await localPage(page, "/tools/collateral-health/");
  await expect(
    page.getByRole("heading", { name: "Collateral Health Planner" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load illustrative example" }).click();
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-primary]")).toContainText(
    "230.76 USDmanual",
  );
  await page.getByLabel("Calculation mode").selectOption("adjust");
  await page.getByRole("button", { name: "Load illustrative example" }).click();
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText("200 USDmanual");
  await expect(page.locator("[data-result]")).toContainText("375 USDmanual");
  await page.getByLabel("Calculation mode").selectOption("shock");
  await page.getByRole("button", { name: "Load illustrative example" }).click();
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-primary]")).toContainText("0.96");
  await expect(page.locator("[data-breaches]")).toContainText("MODELED BREACH");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download local JSON" }).click(),
  ]);
  const json = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(json.calculationVersion).toBe("pit.collateral-health.local.v1");
  expect(
    json.fields.find(
      (item: { name: string }) => item.name === "shockedCollateralValue",
    ).raw,
  ).toBe("120000");
  await page.getByLabel("Quote currency decimals (0–18)").fill("");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-error]")).toContainText("blank is not zero");
  await assertLocal(page, evidence);
});
test("borrowing modes separate compound cost, repayment and incomplete carry", async ({
  page,
}) => {
  const evidence = await localPage(page, "/tools/borrowing-cost/");
  await expect(
    page.getByRole("heading", { name: "Borrowing Cost Planner" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load illustrative example" }).click();
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-primary]")).toContainText(
    "1126.83 USDmanual",
  );
  await page.getByLabel("Calculation mode").selectOption("repayment");
  await page.getByRole("button", { name: "Load illustrative example" }).click();
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText(
    "Period-by-period repayment",
  );
  await page.locator("[data-schedule] summary").click();
  await expect(page.locator("[data-rows] tr").first()).toContainText("910");
  await page.getByLabel("Calculation mode").selectOption("carry");
  await page.getByRole("button", { name: "Load illustrative example" }).click();
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-primary]")).toContainText("20 USDmanual");
  await page
    .locator('[data-panel="carry"] [name="costCoverage"]')
    .selectOption("unknown");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-status]")).toContainText("INCOMPLETE");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download local JSON" }).click(),
  ]);
  const json = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(json.calculationVersion).toBe("pit.borrowing-cost.local.v1");
  expect(
    json.fields.some(
      (item: { name: string }) => item.name === "netCarryAfterKnownCosts",
    ),
  ).toBe(false);
  await assertLocal(page, evidence);
});
test("AL pages retain keyboard use and fit mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, button] of [
    ["/tools/collateral-health/", "Calculate local scenario"],
    ["/tools/borrowing-cost/", "Calculate local scenario"],
  ]) {
    const evidence = await localPage(page, path);
    await page.getByRole("button", { name: button }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-result]")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await assertLocal(page, evidence);
  }
});
