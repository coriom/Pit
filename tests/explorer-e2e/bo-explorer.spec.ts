import { expect, test } from "@playwright/test";

test("six BO routes load without querying a provider", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => { if (request.url().startsWith("https://")) requests.push(request.url()); });
  for (const id of ["transaction-detail", "network-gas", "blob-activity", "tx-transfer-events", "base-transaction-cost", "multicall-static-reads"]) {
    const response = await page.goto(`/inspect/${id}/`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("#explorer-output")).toHaveText("No query sent.");
  }
  expect(requests).toEqual([]);
});

test("six BO inspections retrieve bounded public examples", async ({ page }) => {
  test.skip(process.env.PIT_EXPLORER_LIVE_RPC !== "1", "Explicit live read-only provider probe only");
  test.setTimeout(60000);
  const ethTx = ["0x8fc90a6c3ee3001cdcbbb685b4fbe67b", "1fa2bec575b15b0395fea5540d0901ae"].join("");
  const baseTx = ["0x4ea2fc16119c6f2d05d88f32ec5b5b5e", "0d0d2ff5e64f98b8de427af6eaa00f23"].join("");
  const cases = [
    { id: "transaction-detail", network: "ethereum", fields: { hash: ethTx }, expected: "Receipt status" },
    { id: "network-gas", network: "ethereum", fields: {}, expected: "Block base fee" },
    { id: "blob-activity", network: "ethereum", fields: {}, expected: "Blob gas used" },
    { id: "tx-transfer-events", network: "ethereum", fields: { hash: ethTx }, expected: "raw value (ERC-20-like)" },
    { id: "base-transaction-cost", network: "base", fields: { hash: baseTx }, expected: "L2 execution component" },
    { id: "multicall-static-reads", network: "ethereum", fields: { calls: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48|decimals" }, expected: " · decimals" },
  ];
  for (const entry of cases) {
    if (process.env.PIT_EXPLORER_LIVE_TOOL && entry.id !== process.env.PIT_EXPLORER_LIVE_TOOL) continue;
    await page.goto(`/inspect/${entry.id}/`);
    await page.locator('[name="chain"]').selectOption(entry.network);
    for (const [name, value] of Object.entries(entry.fields)) await page.locator(`[name="${name}"]`).fill(value);
    await page.getByRole("button", { name: "Query public chain" }).click();
    await expect(page.locator("#explorer-output"), entry.id).toContainText(entry.expected, { timeout: 20000 });
  }
});
