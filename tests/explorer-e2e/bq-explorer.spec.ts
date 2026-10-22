import { expect, test } from "@playwright/test";

const cases = [
  { id: "uniswap-v3-pool", fields: { pool: "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640" }, expected: "Factory-registered pool" },
  { id: "uniswap-v3-position", fields: { tokenId: "1" }, expected: "Position manager" },
  { id: "aave-reserve-index", fields: { asset: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" }, expected: "Normalized income index" },
  { id: "erc4626-vault-state", fields: { vault: "0x028eC7330ff87667b6dfb0D94b954c820195336c", shares: "1000000000000000000" }, expected: "convertToAssets result" },
  { id: "chainlink-feed", fields: { feed: "eth-usd.data.eth", maxAge: "86400" }, expected: "Age at sampled block" },
];

test("five DeFi inspection routes do not query in the background", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => { if (request.url().startsWith("https://")) external.push(request.url()); });
  for (const entry of cases) {
    expect((await page.goto(`/inspect/${entry.id}/`))?.status()).toBe(200);
    await expect(page.locator("#explorer-output")).toHaveText("No query sent.");
  }
  expect(external).toEqual([]);
});

test("five DeFi inspections return public state after an explicit click", async ({ page }) => {
  test.skip(process.env.PIT_EXPLORER_LIVE_RPC !== "1", "Live provider probe is opt-in");
  test.setTimeout(120000);
  for (const entry of cases) {
    if (process.env.PIT_EXPLORER_LIVE_TOOL && entry.id !== process.env.PIT_EXPLORER_LIVE_TOOL) continue;
    await page.goto(`/inspect/${entry.id}/`);
    for (const [name, value] of Object.entries(entry.fields)) {
      const field = page.locator(`[name="${name}"]`);
      if (name === "feed") await field.selectOption(value);
      else await field.fill(value);
    }
    await page.getByRole("button", { name: "Query public chain" }).click();
    await expect(page.locator("#explorer-output"), entry.id).toContainText(entry.expected, { timeout: 20000 });
  }
});
