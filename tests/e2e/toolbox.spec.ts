import { test, expect } from "@playwright/test";
import { TOOLS } from "../../src/lib/tool-registry";

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\//, (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
});

test("every registered tool has a production URL", async ({ page }) => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const tool of TOOLS) {
    const response = await page.goto(tool.path);
    expect(response?.status(), tool.path).toBe(200);
    await expect(
      page.getByRole("heading", { name: tool.title, exact: true }),
    ).toBeVisible();
    const title = await page.title();
    const description = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(title).toBe(`${tool.title} · PIT Toolbox`);
    expect(description).toContain(tool.description);
    expect(titles.has(title)).toBe(false);
    expect(descriptions.has(description!)).toBe(false);
    titles.add(title);
    descriptions.add(description!);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex,nofollow",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    const structured = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent())!,
    );
    expect(structured).toMatchObject({
      "@type": "WebApplication",
      name: tool.title,
      applicationCategory: tool.category,
    });
    if (tool.executionMode === "execution") {
      expect(structured.description).toContain("Testnet only.");
      await expect(page.getByText("TESTNET PREVIEW")).toBeVisible();
    }
    for (const id of tool.relatedToolIds) {
      const related = TOOLS.find((entry) => entry.id === id)!;
      await expect(page.locator(`a[href="../${related.slug}/"]`)).toHaveCount(
        1,
      );
    }
  }
});

test("unverified-origin robots policy withholds a sitemap", async ({
  request,
  page,
}) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(404);
  await page.goto("/tools/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex,nofollow",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test("landing search, category and direct reload lead to a local calculation", async ({
  page,
}) => {
  await page.goto("/tools/");
  await expect(
    page.getByRole("heading", { name: "Choose a tool." }),
  ).toBeVisible();
  await page.getByLabel("Search tools").fill("impermanent");
  await expect(page.locator("[data-tool-card]:visible")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Calculate", exact: true })
    .first()
    .click();
  await expect(page.locator("[data-tool-card]:visible")).toHaveCount(1);
  await page.getByRole("link", { name: /Impermanent Loss Calculator/ }).click();
  await expect(page).toHaveURL(/\/tools\/impermanent-loss\/$/);
  await page.getByLabel("Initial price (quote units / asset unit)").fill("100");
  await page.getByLabel("Final price (quote units / asset unit)").fill("400");
  await page.getByLabel("Initial pool value (quote units)").fill("1000");
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(page.getByRole("status").last()).toContainText(
    "Impermanent loss: -20%",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Impermanent Loss Calculator" }),
  ).toBeVisible();
  await page.getByLabel("Initial price (quote units / asset unit)").fill("1");
  await page.getByLabel("Final price (quote units / asset unit)").fill("1");
  await page.getByLabel("Initial pool value (quote units)").fill("100");
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(page.getByRole("status").last()).toContainText(
    "Impermanent loss: 0%",
  );
});

for (const fixture of [
  {
    path: "/tools/pnl/",
    values: {
      entryPrice: "100",
      exitPrice: "120",
      quantity: "2",
      totalFees: "2",
    },
    result: "Net PnL: 38 quote units",
  },
  {
    path: "/tools/liquidation/",
    values: {
      entryPrice: "100",
      quantity: "1",
      collateral: "20",
      maintenanceRatePct: "5",
    },
    result: "Threshold price: 84.21052632 quote units / asset unit",
  },
  {
    path: "/tools/impermanent-loss/",
    values: {
      initialPrice: "100",
      finalPrice: "400",
      initialPoolValue: "1000",
    },
    result: "Impermanent loss: -20%",
  },
]) {
  test(`${fixture.path} calculates offline after assets load without network calls`, async ({
    page,
    context,
  }) => {
    const initialRequests: string[] = [];
    const laterRequests: string[] = [];
    const sockets: string[] = [];
    let loaded = false;
    page.on("request", (request) =>
      (loaded ? laterRequests : initialRequests).push(request.url()),
    );
    page.on("websocket", (socket) => sockets.push(socket.url()));
    await page.goto(fixture.path);
    await expect(
      page.getByRole("button", { name: "Calculate", exact: true }),
    ).toBeVisible();
    expect(
      initialRequests.every((url) => new URL(url).hostname === "127.0.0.1"),
    ).toBe(true);
    expect(initialRequests.some((url) => url.endsWith(".js"))).toBe(false);
    loaded = true;
    await context.setOffline(true);
    for (const [name, value] of Object.entries(fixture.values))
      await page.locator(`[name="${name}"]`).fill(value);
    await page.getByRole("button", { name: "Calculate", exact: true }).click();
    await expect(page.getByRole("status").last()).toContainText(fixture.result);
    await page
      .locator(`[name="${Object.keys(fixture.values)[0]}"]`)
      .fill("Infinity");
    await page.getByRole("button", { name: "Calculate", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      "must be a decimal number",
    );
    expect(laterRequests).toEqual([]);
    expect(sockets).toEqual([]);
  });
}

test("direct execution URLs keep signing controls behind existing preflight", async ({
  page,
}) => {
  await page.goto("/tools/swap/");
  await expect(
    page.getByRole("button", { name: "Get quote", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Sign & submit order" }),
  ).toHaveCount(0);
  await page.goto("/tools/perps/");
  await expect(
    page.getByRole("button", { name: "Sign & place limit order" }),
  ).toBeDisabled();
  await expect(page.getByTestId("hl-preflight")).not.toContainText("GREEN");
});
