import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function localTool(page: Page, path: string) {
  const external: string[] = [];
  await page.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://127.0.0.1:4398") return route.continue();
    external.push(`${route.request().method()} ${url.origin}`);
    return route.abort("blockedbyclient");
  });
  await page.addInitScript(() => {
    (window as any).__ahCalls = [];
    (window as any).ethereum = {
      request: async ({ method }: { method: string }) => {
        (window as any).__ahCalls.push(`wallet:${method}`);
        throw Error("Wallet access is forbidden in a local tool");
      },
    };
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<typeof indexedDB.open>) => {
      (window as any).__ahCalls.push("indexedDB.open");
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
        (window as any).__ahCalls.push(`storage:${method}`);
        return (original as (...values: string[]) => unknown).apply(this, args);
      };
    }
  });
  await page.goto(path);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex,nofollow",
  );
  return external;
}

async function assertLocalOnly(page: Page, external: string[]) {
  expect(external).toEqual([]);
  expect(await page.evaluate(() => (window as any).__ahCalls)).toEqual([]);
}

test("converter shows exact units, fee rounding and a local raw-integer report", async ({
  page,
}) => {
  const external = await localTool(page, "/tools/token-fee-converter/");
  await page.getByRole("button", { name: "Convert locally" }).click();
  await expect(page.locator("[data-report]")).toContainText(
    "1000000000000000000",
  );
  await expect(page.getByRole("button", { name: "Copy Wei" })).toBeVisible();

  await page.getByLabel("Calculation mode").selectOption("token");
  await page.getByRole("button", { name: "Convert locally" }).click();
  await expect(page.locator("[data-report]")).toContainText("1234567");
  await expect(page.locator("[data-report]")).toContainText("1.234567");
  await page.getByLabel("Token amount").fill("1.2345678");
  await page.getByRole("button", { name: "Convert locally" }).click();
  await expect(page.getByRole("alert")).toContainText("precision");
  await expect(page.locator("[data-report]")).toBeHidden();

  await page.getByLabel("Calculation mode").selectOption("rate");
  await page.getByRole("button", { name: "Convert locally" }).click();
  await expect(page.locator("[data-report]")).toContainText("0.5");
  await expect(page.locator("[data-report]")).toContainText("5000");

  await page.getByLabel("Calculation mode").selectOption("fee");
  await page.getByRole("button", { name: "Convert locally" }).click();
  await expect(page.locator("[data-report]")).toContainText("0.5");
  await expect(page.locator("[data-report]")).toContainText("99.5");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download local JSON" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("pit-token-fee-conversion.json");
  const report = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(report.raw).toMatchObject({
    amountBaseUnits: "100000000",
    feeBaseUnits: "500000",
    afterFeeBaseUnits: "99500000",
  });
  expect(report.simulated).toBe(true);
  await assertLocalOnly(page, external);
});

test("yield planner separates APR, APY, principal, contributions and recovery", async ({
  page,
}) => {
  const external = await localTool(page, "/tools/yield-growth/");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-report]")).toContainText(
    "12.6825030131969721%",
  );

  await page.getByLabel("Calculation mode").selectOption("simple");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-report]")).toContainText("1100 USD");
  await expect(page.locator("[data-report]")).toContainText("100 USD");

  await page.getByLabel("Calculation mode").selectOption("contributions");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-report]")).toContainText("2400 USD");
  await page.getByLabel("Contribution timing").selectOption("beginning");
  await expect(page.locator("[data-report]")).toBeHidden();
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download local JSON" }).click(),
  ]);
  const result = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(result.input.timing).toBe("beginning");
  expect(
    result.fields.find(
      (item: { name: string }) => item.name === "contributions",
    ).raw,
  ).toBe("2400000000000000000000");

  await page.getByLabel("Calculation mode").selectOption("recovery");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-report]")).toContainText("25%");
  await assertLocalOnly(page, external);
});

test("both local pages remain usable with keyboard input on a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const external = await localTool(page, "/tools/token-fee-converter/");
  await page.getByLabel("Native amount").focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("1");
  await page.getByRole("button", { name: "Convert locally" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-report]")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await assertLocalOnly(page, external);
});
