import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

async function localPage(page: import("@playwright/test").Page) {
  const outside: string[] = [];
  await page.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    outside.push(`${route.request().method()} ${url.origin}`);
    return route.abort("blockedbyclient");
  });
  await page.addInitScript(() => {
    (window as any).__bridgeWalletCalls = [];
    (window as any).__bridgeDbOpens = 0;
    (window as any).ethereum = {
      request: async ({ method }: { method: string }) => {
        (window as any).__bridgeWalletCalls.push(method);
        throw Error("WALLET_FORBIDDEN");
      },
    };
    const original = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<typeof indexedDB.open>) => {
      (window as any).__bridgeDbOpens++;
      return original(...args);
    }) as typeof indexedDB.open;
  });
  await page.goto("/tools/bridge-cost/");
  await expect(
    page.getByLabel("Route A Gross source transfer budget"),
  ).toBeVisible();
  return outside;
}

test("two illustrative routes show embedded versus separate cross-chain costs without wallet or external requests", async ({
  page,
}) => {
  const outside = await localPage(page);
  await expect(
    page.getByRole("heading", { name: "Bridge Cost Comparator" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex,nofollow",
  );
  await page
    .getByRole("button", { name: "Compare hypothetical bridge costs locally" })
    .click();
  const A = page.getByRole("region", { name: "Route A result" });
  const B = page.getByRole("region", { name: "Route B result" });
  await expect(A).toContainText(
    "Effective net destination value98 destination token",
  );
  await expect(A).toContainText("bridge: INCLUDED");
  await expect(B).toContainText(
    "Wallet-funded source approval gas (native units)0.0001 ETH",
  );
  await expect(B).toContainText(
    "Wallet-funded destination gas (native units)0.00012 ETH",
  );
  await expect(B).toContainText(
    "Expected destination tokens received98.7 destination token",
  );
  await expect(B).toContainText(
    "Effective net destination value97.22 destination token",
  );
  await expect(page.getByTestId("bridge-cost-report")).toContainText(
    "Best estimated net destination value under supplied assumptions",
  );
  await expect(page.getByTestId("bridge-cost-report")).toContainText(
    "Route A · net difference 0.78 destination tokens",
  );
  expect(outside).toEqual([]);
  expect(
    await page.evaluate(() => (window as any).__bridgeWalletCalls),
  ).toEqual([]);
  expect(await page.evaluate(() => (window as any).__bridgeDbOpens)).toBe(0);
});

test("unknown destination gas, incompatible destination token and changed source budget prevent ranking", async ({
  page,
}) => {
  await localPage(page);
  await page
    .getByRole("button", {
      name: "Illustrate unknown destination gas and rate",
    })
    .click();
  await page
    .getByRole("button", { name: "Compare hypothetical bridge costs locally" })
    .click();
  await expect(page.getByTestId("bridge-cost-report")).toContainText(
    "NOT COMPARABLE — incomplete or incompatible route economics",
  );
  await expect(
    page.getByRole("region", { name: "Route B result" }),
  ).toContainText("Destination-chain wallet gas coverage is unknown");
  await page
    .getByLabel("Route B Destination transaction gas coverage")
    .selectOption("wallet");
  await page
    .getByLabel("Route B Destination-chain wallet gas units")
    .fill("40000");
  await page
    .getByLabel("Route B Destination tokens per 1 destination native asset")
    .fill("3000");
  await page
    .getByLabel("Route B Destination asset address (manual)")
    .fill("0x3333333333333333333333333333333333333333");
  await page
    .getByRole("button", { name: "Compare hypothetical bridge costs locally" })
    .click();
  await expect(page.getByTestId("bridge-cost-report")).toContainText(
    "Source or destination chain/token identity differs",
  );
  await page
    .getByLabel("Route B Destination asset address (manual)")
    .fill("0x2222222222222222222222222222222222222222");
  await page.getByLabel("Route B Gross source transfer budget").fill("101");
  await page
    .getByRole("button", { name: "Compare hypothetical bridge costs locally" })
    .click();
  await expect(page.getByTestId("bridge-cost-report")).toContainText(
    "Gross source transfer budgets differ",
  );
});

test("actual locally downloaded JSON preserves exact raw cross-chain fields and simulation disclaimer", async ({
  page,
}) => {
  await localPage(page);
  await page
    .getByRole("button", { name: "Compare hypothetical bridge costs locally" })
    .click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Download local JSON scenario report" })
      .click(),
  ]);
  expect(download.suggestedFilename()).toBe("pit-bridge-cost-simulation.json");
  const json = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(json.calculationVersion).toBe("pit.bridge-cost.simulation.v1");
  expect(json.disclaimer).toContain("Illustrative manual routes only");
  expect(json.scenarios.A.sourceAmountRaw).toBe("100000000");
  expect(json.scenarios.B.sourceApprovalGasWei).toBe("100000000000000");
  expect(json.scenarios.B.destinationGasWei).toBe("120000000000000");
  expect(json.scenarios.B.fees.bridge.chainId).toBe(84532);
  expect(json.scenarios.B.netDestinationValueRaw).toBe("97220000");
  expect(json.comparison.winner).toBe("A");
});

test("narrow viewport and keyboard-only submission work offline", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const outside = await localPage(page);
  await context.setOffline(true);
  await page.getByLabel("Route A Gross source transfer budget").focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("100");
  await page
    .getByRole("button", { name: "Compare hypothetical bridge costs locally" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("bridge-cost-report")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  expect(outside).toEqual([]);
  expect(
    await page.evaluate(() => (window as any).__bridgeWalletCalls),
  ).toEqual([]);
  expect(await page.evaluate(() => (window as any).__bridgeDbOpens)).toBe(0);
});
