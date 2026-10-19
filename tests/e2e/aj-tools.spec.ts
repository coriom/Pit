import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function localPage(page: Page, path: string) {
  const external: string[] = [];
  const sameOriginApi: string[] = [];
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
    (window as any).__ajCalls = [];
    (window as any).ethereum = {
      request: async ({ method }: { method: string }) => {
        (window as any).__ajCalls.push(`wallet:${method}`);
        throw Error("Wallet forbidden");
      },
    };
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<typeof indexedDB.open>) => {
      (window as any).__ajCalls.push("indexedDB.open");
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
        (window as any).__ajCalls.push(`storage:${method}`);
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
  expect(await page.evaluate(() => (window as any).__ajCalls)).toEqual([]);
}

test("rebalance target, contribution feasibility, shock and exact local report", async ({
  page,
}) => {
  const evidence = await localPage(page, "/tools/portfolio-rebalance/");
  await expect(
    page.getByRole("heading", { name: "Portfolio Rebalance Planner" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText("100 USD");
  await expect(page.locator("[data-result]")).toContainText("200 USD");
  await page.getByLabel("Calculation mode").selectOption("contribution");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText("FEASIBLE");
  await page.getByLabel("New cash contribution").fill("100");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText("INFEASIBLE");
  await expect(page.locator("[data-result]")).toContainText("200 USD");
  await page.getByLabel("Calculation mode").selectOption("shock");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText("-80 USD");
  await expect(page.locator("[data-result]")).toContainText("920 USD");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download local JSON" }).click(),
  ]);
  const json = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(json.calculationVersion).toBe("pit.portfolio-rebalance.local.v1");
  expect(
    json.fields.find(
      (field: { name: string }) => field.name === "portfolioChange",
    ).raw,
  ).toBe("-80000000000000000000");
  await page.locator('[name="currentValue"]').first().fill("");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText("INCOMPLETE");
  await assertLocal(page, evidence);
});

test("flow-neutral performance, drawdown, validation and exact local report", async ({
  page,
}) => {
  const evidence = await localPage(page, "/tools/performance-drawdown/");
  await expect(
    page.getByRole("heading", { name: "Performance & Drawdown Analyzer" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analyze local series" }).click();
  await expect(page.locator("[data-result]")).toContainText("-1 %");
  await expect(page.locator("[data-result]")).toContainText("-6 USD");
  await page.getByLabel("Analysis mode").selectOption("drawdown");
  await page.getByRole("button", { name: "Analyze local series" }).click();
  await expect(page.locator("[data-result]")).toContainText("-10 %");
  await expect(page.locator("[data-result]")).toContainText("not recovered");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download local JSON" }).click(),
  ]);
  const json = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(json.calculationVersion).toBe("pit.performance-drawdown.local.v1");
  expect(
    json.fields.find(
      (field: { name: string }) => field.name === "maximumDrawdownPercent",
    ).raw,
  ).toBe("-10000000000000000000");
  await page.locator('[name="date"]').nth(2).fill("2026-01-02");
  await page.getByRole("button", { name: "Analyze local series" }).click();
  await expect(page.locator("[data-error]")).toContainText(
    "strictly increasing",
  );
  await assertLocal(page, evidence);
});

test("both AJ tools support keyboard use and a narrow mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, button] of [
    ["/tools/portfolio-rebalance/", "Calculate local scenario"],
    ["/tools/performance-drawdown/", "Analyze local series"],
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
