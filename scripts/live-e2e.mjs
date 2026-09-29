import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const required = [
  "PIT_LIVE_CDP_URL",
  "PIT_TEST_ACCOUNT",
  "PIT_SEPOLIA_SELL_TOKEN",
  "PIT_SEPOLIA_BUY_TOKEN",
  "PIT_SEPOLIA_SELL_AMOUNT",
  "PIT_HL_PRICE",
  "PIT_HL_SIZE",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(
    `LIVE EXECUTION BLOCKED: missing public configuration: ${missing.join(", ")}. No test order was sent.`,
  );
  process.exit(2);
}
// Browser wallet holds keys. The harness never reads keys or approves wallet dialogs.
const browser = await chromium.connectOverCDP(process.env.PIT_LIVE_CDP_URL);
const page = await browser.contexts()[0].newPage();
await page.goto(process.env.PIT_DEV_URL ?? "http://127.0.0.1:4397");
console.log(
  "Use the existing test wallet to connect and confirm wallet dialogs. Harness will wait up to 5 minutes per step.",
);
await page.getByText(/ETH · wallet RPC/).waitFor({ timeout: 300000 });
const accounts = await page.evaluate(() =>
  window.ethereum.request({ method: "eth_accounts" }),
);
if (accounts[0]?.toLowerCase() !== process.env.PIT_TEST_ACCOUNT.toLowerCase())
  throw Error("Connected wallet does not match PIT_TEST_ACCOUNT");
await page.getByLabel("Wallet network").selectOption("11155111");
await page
  .getByLabel("Sell token address")
  .fill(process.env.PIT_SEPOLIA_SELL_TOKEN);
await page
  .getByLabel("Buy token address")
  .fill(process.env.PIT_SEPOLIA_BUY_TOKEN);
await page.getByLabel("You sell").fill(process.env.PIT_SEPOLIA_SELL_AMOUNT);
await page.getByRole("button", { name: "Get quote", exact: true }).click();
await page
  .getByRole("button", { name: "Approve exact sell amount" })
  .click({ timeout: 300000 });
await page
  .getByRole("button", { name: "Sign & submit order" })
  .click({ timeout: 300000 });
await page.getByText(/^Submitted:/).waitFor({ timeout: 300000 });
await page.screenshot({
  path: "docs/live-sepolia-submitted.png",
  fullPage: true,
});
const submittedText = await page.getByText(/^Submitted:/).innerText();
const orderUid = submittedText.match(/0x[0-9a-f]+/i)?.[0];
if (!orderUid) throw Error("Could not identify submitted order");
await page
  .locator(`[data-order-id="${orderUid}"]`)
  .getByText("fulfilled", { exact: true })
  .waitFor({ timeout: 300000 });
await page.screenshot({ path: "docs/live-sepolia-filled.png", fullPage: true });
await page.getByRole("button", { name: "Perpetuals", exact: true }).click();
await page
  .getByLabel("Market")
  .selectOption({ label: process.env.PIT_HL_MARKET ?? "ETH / USDC" });
await page.getByLabel("Limit price (USDC)").fill(process.env.PIT_HL_PRICE);
await page.getByLabel(/^Size/).fill(process.env.PIT_HL_SIZE);
await page.getByRole("button", { name: "Sign & place limit order" }).click();
await page
  .locator('pre[role="status"]')
  .filter({ hasText: "statuses" })
  .waitFor({ timeout: 300000 });
await page.screenshot({
  path: "docs/live-hyperliquid-order.png",
  fullPage: true,
});
console.log(
  "Live order acceptance captured. Verify specific fill IDs and local exports before claiming settlement.",
);
await browser.close();
