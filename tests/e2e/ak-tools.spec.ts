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
    (window as any).__akCalls = [];
    (window as any).ethereum = {
      request: async ({ method }: { method: string }) => {
        (window as any).__akCalls.push(`wallet:${method}`);
        throw Error("Wallet forbidden");
      },
    };
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<typeof indexedDB.open>) => {
      (window as any).__akCalls.push("indexedDB.open");
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
        (window as any).__akCalls.push(`storage:${method}`);
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
  expect(await page.evaluate(() => (window as any).__akCalls)).toEqual([]);
}

test("staking examples keep projection, claim coverage and restaking distinct", async ({
  page,
}) => {
  const evidence = await localPage(page, "/tools/staking-rewards/");
  await expect(
    page.getByRole("heading", { name: "Staking & Rewards Planner" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load illustrative example" }).click();
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText("108 TOKEN");
  await page.getByLabel("Calculation mode").selectOption("claim");
  await page.getByRole("button", { name: "Load illustrative example" }).click();
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText("8.5 TOKEN");
  await page
    .locator('[data-panel="claim"] [name="feeAssetRelation"]')
    .selectOption("different");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText("INCOMPLETE");
  await page
    .locator('[data-panel="claim"] [name="rewardPerFeeAsset"]')
    .fill("1");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText("8.5 TOKEN");
  await page.getByLabel("Calculation mode").selectOption("restake");
  await page.getByRole("button", { name: "Load illustrative example" }).click();
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-result]")).toContainText("980 TOKEN");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download local JSON" }).click(),
  ]);
  const json = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(json.calculationVersion).toBe("pit.staking-rewards.local.v1");
  expect(
    json.fields.find(
      (item: { name: string }) => item.name === "principalAfterSlash",
    ).raw,
  ).toBe("980000000");
  await page.getByLabel("Token decimals (0–36)").fill("");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-error]")).toContainText("blank is not zero");
  await assertLocal(page, evidence);
});

test("vesting examples cover cliff, initial unlock, tranches and local JSON", async ({
  page,
}) => {
  const evidence = await localPage(page, "/tools/vesting-unlocks/");
  await expect(
    page.getByRole("heading", { name: "Vesting & Unlock Planner" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Calculate local schedule" }).click();
  await expect(page.locator("[data-result]")).toContainText("Modeled vested");
  await page.getByLabel("Calculation mode").selectOption("initial-linear");
  await page.getByRole("button", { name: "Load illustrative example" }).click();
  await page.getByRole("button", { name: "Calculate local schedule" }).click();
  await expect(page.locator("[data-result]")).toContainText("1000 TOKEN");
  await page.getByLabel("Calculation mode").selectOption("tranches");
  await page.getByRole("button", { name: "Load illustrative example" }).click();
  await page.getByRole("button", { name: "Calculate local schedule" }).click();
  await expect(page.locator("[data-result]")).toContainText("400 TOKEN");
  await expect(page.locator("[data-result]")).toContainText(
    "2026-07-01, 600 TOKEN",
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download local JSON" }).click(),
  ]);
  const json = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(json.calculationVersion).toBe("pit.vesting-unlocks.local.v1");
  expect(
    json.fields.find(
      (item: { name: string }) => item.name === "vestedAllocation",
    ).raw,
  ).toBe("400000000");
  await page.locator('[data-row] [name="date"]').nth(2).fill("2026-04-01");
  await page.getByRole("button", { name: "Calculate local schedule" }).click();
  await expect(page.locator("[data-error]")).toContainText(
    "strictly increasing",
  );
  await page.getByLabel("Token decimals (0–36)").fill("");
  await page.getByRole("button", { name: "Calculate local schedule" }).click();
  await expect(page.locator("[data-error]")).toContainText("blank is not zero");
  await assertLocal(page, evidence);
});

test("both AK pages support keyboard calculation at mobile width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, button] of [
    ["/tools/staking-rewards/", "Calculate local scenario"],
    ["/tools/vesting-unlocks/", "Calculate local schedule"],
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
