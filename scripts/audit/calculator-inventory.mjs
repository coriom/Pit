import { chromium } from "@playwright/test";

const origin = process.env.PIT_LOCAL_PREVIEW || "http://127.0.0.1:4398";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))
  throw Error("Local preview only");

const fixtures = [
  {
    slug: "pnl",
    fields: {
      entryPrice: "100",
      exitPrice: "120",
      quantity: "2",
      totalFees: "2",
    },
    expected: "Net PnL: 38 quote units",
  },
  {
    slug: "liquidation",
    fields: {
      entryPrice: "100",
      quantity: "1",
      collateral: "20",
      maintenanceRatePct: "5",
    },
    expected: "Threshold price: 84.21052632",
  },
  {
    slug: "impermanent-loss",
    fields: {
      initialPrice: "100",
      finalPrice: "400",
      initialPoolValue: "1000",
    },
    expected: "Impermanent loss: -20%",
  },
];
const browser = await chromium.launch({ headless: true });
try {
  const results = [];
  for (const fixture of fixtures) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const initialRequests = [];
    const afterLoadRequests = [];
    const websockets = [];
    let loaded = false;
    page.on("request", (request) =>
      (loaded ? afterLoadRequests : initialRequests).push({
        type: request.resourceType(),
        url: request.url(),
      }),
    );
    page.on("websocket", (socket) => websockets.push(socket.url()));
    await page.route(/^https?:\/\//, (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort("blockedbyclient"),
    );
    await page.goto(`${origin}/tools/${fixture.slug}/`);
    await page
      .getByRole("button", { name: "Calculate", exact: true })
      .waitFor();
    if (
      initialRequests.some((request) => new URL(request.url).origin !== origin)
    )
      throw Error(`External load request: ${fixture.slug}`);
    loaded = true;
    await context.setOffline(true);
    for (const [name, value] of Object.entries(fixture.fields))
      await page.locator(`[name="${name}"]`).fill(value);
    await page.getByRole("button", { name: "Calculate", exact: true }).click();
    const result = await page.locator("[data-result]").innerText();
    if (!result.includes(fixture.expected))
      throw Error(`Unexpected result: ${fixture.slug}`);
    if (afterLoadRequests.length || websockets.length)
      throw Error(`Calculator requested network: ${fixture.slug}`);
    results.push({
      tool: fixture.slug,
      initialRequests,
      afterLoadRequests,
      websockets,
      result,
    });
    await context.close();
  }
  console.log(
    JSON.stringify({ origin, offlineAfterLoad: true, results }, null, 2),
  );
} finally {
  await browser.close();
}
