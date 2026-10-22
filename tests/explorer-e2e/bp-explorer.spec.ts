import { expect, test } from "@playwright/test";

const ZERO = "0x0000000000000000000000000000000000000000";
test("eight contract-inspection routes load without background RPC", async ({ page }) => {
  const network: string[] = [];
  page.on("request", (request) => { if (request.url().startsWith("https://")) network.push(request.url()); });
  for (const id of ["proxy-storage", "bytecode-compare", "ownership-role", "erc20-contract", "permit-signals", "erc165-interface", "timelock-standard", "safe-multisig"]) {
    expect((await page.goto(`/inspect/${id}/`))?.status()).toBe(200);
    await expect(page.locator("#explorer-output")).toHaveText("No query sent.");
  }
  expect(network).toEqual([]);
});

test("eight contract inspections return bounded public examples", async ({ page }) => {
  test.skip(process.env.PIT_EXPLORER_LIVE_RPC !== "1", "Explicit live read-only provider probe only");
  test.setTimeout(90000);
  const multicall = "0xcA11bde05977b3631167028862bE2a173976CA11";
  const usdc = "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
  const timelock = "0x1dD03B88D166694073308685F8a2c57b46987300";
  const safe = "0x8EEc10616802Ef639ca55C98Ac856553FadeFbAd";
  const nameWrapper = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
  const cases = [
    { id: "proxy-storage", fields: { contract: usdc }, expected: "EIP-1967 implementation slot" },
    { id: "bytecode-compare", fields: { contract: multicall, otherContract: multicall, otherChain: "base" }, expected: "Runtime bytecode identical" },
    { id: "ownership-role", fields: { contract: timelock, account: ZERO, role: "0x" + "0".repeat(64) }, expected: "Chosen account has role" },
    { id: "erc20-contract", fields: { contract: usdc }, expected: "Total supply, raw base units" },
    { id: "permit-signals", fields: { contract: usdc, account: ZERO }, expected: "EIP-2612 support conclusion" },
    { id: "erc165-interface", fields: { contract: nameWrapper, interfaceId: "0xd9b67a26" }, expected: "Contract reports support" },
    { id: "timelock-standard", fields: { contract: timelock, account: ZERO }, expected: "Minimum delay, seconds" },
    { id: "safe-multisig", fields: { contract: safe }, expected: "Signature threshold" },
  ];
  for (const entry of cases) {
    if (process.env.PIT_EXPLORER_LIVE_TOOL && entry.id !== process.env.PIT_EXPLORER_LIVE_TOOL) continue;
    await page.goto(`/inspect/${entry.id}/`);
    for (const [name, value] of Object.entries(entry.fields)) {
      const element = page.locator(`[name="${name}"]`);
      if (name === "otherChain") await element.selectOption(value);
      else await element.fill(value);
    }
    await page.getByRole("button", { name: "Query public chain" }).click();
    await expect(page.locator("#explorer-output"), entry.id).toContainText(entry.expected, { timeout: 20000 });
  }
});
