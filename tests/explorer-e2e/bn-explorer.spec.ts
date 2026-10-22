import { expect, test } from "@playwright/test";
const ZERO = "0x0000000000000000000000000000000000000000";
test("reviewed routes are usable and no request occurs before explicit action", async ({ page }) => {
  const network: string[] = [];
  page.on("request", (request) => { if (request.url().startsWith("https://")) network.push(request.url()); });
  await page.goto("/");
  await expect(page.locator(".card")).toHaveCount(27);
  for (const href of await page.locator(".card").evaluateAll((cards) => cards.map((card) => card.getAttribute("href")!))) {
    const response = await page.goto(href);
    expect(response?.status()).toBe(200);
    await expect(page.locator("form button")).toHaveText("Query public chain");
    await expect(page.locator("#explorer-output")).toContainText("No query sent");
  }
  expect(network).toEqual([]);
  await page.goto("/inspect/wallet-nonce/");
  await page.route("https://eth.drpc.org/", async (route) => {
    const request = route.request().postDataJSON();
    const values: Record<string, string> = { eth_chainId: "0x1", eth_blockNumber: "0x64", eth_getTransactionCount: "0x7" };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: request.id, result: values[request.method] }) });
  });
  await page.getByLabel("account").fill(ZERO);
  await page.getByRole("button", { name: "Query public chain" }).click();
  await expect(page.locator("#explorer-output")).toContainText("Confirmed transaction count");
  await expect(page.locator("#explorer-output")).toContainText("Ethereum mainnet · block 100");
  await expect(page.locator("#explorer-output")).toContainText("Provider: https://eth.drpc.org/");
  expect(network).toEqual(Array(3).fill("https://eth.drpc.org/"));
  await page.getByLabel("account").fill("bad");
  await page.getByRole("button", { name: "Query public chain" }).click();
  await expect(page.locator("#explorer-output")).toContainText("Address must contain exactly 20 hex bytes");
});
test("public RPC CORS serves chain IDs from the Explorer origin", async ({ page }) => {
  test.skip(process.env.PIT_EXPLORER_LIVE_RPC !== "1", "Explicit live read-only provider probe only");
  await page.goto("/");
  for (const [url, expected] of [["https://eth.drpc.org/", "0x1"], ["https://base.drpc.org/", "0x2105"]]) {
    const result = await page.evaluate(async ({ url }) => {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      return (await response.json()).result;
    }, { url });
    expect(result).toBe(expected);
  }
});
test("a deliberate read returns provider and sampled block in the browser", async ({ page }) => {
  test.skip(process.env.PIT_EXPLORER_LIVE_RPC !== "1", "Explicit live read-only provider probe only");
  await page.goto("/inspect/wallet-nonce/");
  await page.getByLabel("account").fill(ZERO);
  await page.getByRole("button", { name: "Query public chain" }).click();
  await expect(page.locator("#explorer-output")).toContainText("Confirmed transaction count", { timeout: 15000 });
  await expect(page.locator("#explorer-output")).toContainText("Ethereum mainnet · block");
  await expect(page.locator("#explorer-output")).toContainText("https://eth.drpc.org/");
});
test("all eight bounded inspections retrieve public-chain data", async ({ page }) => {
  test.skip(process.env.PIT_EXPLORER_LIVE_RPC !== "1", "Explicit live read-only provider probe only");
  const usdc = "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
  const ensRegistrar = "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85";
  const vitalikTokenId = "79233663829379634837589865448569342784712482819484549289560981379859480642508";
  const cases: { id: string; values: Record<string, string>; expected: string }[] = [
    { id: "native-balance", values: { account: ZERO }, expected: "Balance, raw wei" },
    { id: "selected-erc20-balances", values: { account: ZERO, tokens: usdc }, expected: "raw base units (6 decimals)" },
    { id: "selected-erc20-allowances", values: { account: ZERO, token: usdc, spender: ZERO }, expected: "Allowance, raw base units" },
    { id: "nft-approval", values: { owner: ZERO, collection: ensRegistrar, operator: ZERO, tokenId: vitalikTokenId }, expected: "Token-specific approved address" },
    { id: "ens-resolver", values: { name: "vitalik.eth" }, expected: "Resolver" },
    { id: "nft-ownership", values: { account: ZERO, collection: ensRegistrar, tokenId: vitalikTokenId }, expected: "Recorded ERC-721 owner" },
    { id: "account-code", values: { account: ensRegistrar }, expected: "Bytecode present" },
    { id: "wallet-nonce", values: { account: ZERO }, expected: "Confirmed transaction count" },
  ];
  for (const entry of cases) {
    await page.goto(`/inspect/${entry.id}/`);
    for (const [field, value] of Object.entries(entry.values)) await page.locator(`[name="${field}"]`).fill(value);
    await page.getByRole("button", { name: "Query public chain" }).click();
    await expect(page.locator("#explorer-output"), entry.id).toContainText(entry.expected, { timeout: 20000 });
    await expect(page.locator("#explorer-output")).toContainText("Provider: https://eth.drpc.org/");
  }
});
