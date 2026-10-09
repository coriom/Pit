// PIT_AUTONOMOUS_SIGNER_TEST_ONLY — recovery export; no signer or secret access.
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";

const marker = JSON.parse(await readFile("docs/audit/phase-w/order-attempt.json", "utf8"));
if (marker.account.toLowerCase() !== "0x29d0b5939dcc4d0492d72abd1210debd6c90cc96" ||
    !marker.profile.startsWith("/tmp/pit-test-operator-browser-"))
  throw Error("LIVE_EXPORT_PROFILE_MISMATCH");
const context = await chromium.launchPersistentContext(marker.profile, {
  headless: true, acceptDownloads: true, viewport: { width: 1440, height: 1000 },
});
try {
  await context.addInitScript((address) => {
    const reads = new Set(["eth_blockNumber", "eth_call", "eth_estimateGas", "eth_feeHistory",
      "eth_gasPrice", "eth_getBalance", "eth_getBlockByNumber", "eth_getCode", "eth_getLogs",
      "eth_getTransactionByHash", "eth_getTransactionCount", "eth_getTransactionReceipt",
      "eth_maxPriorityFeePerGas"]);
    let id = 0;
    window.ethereum = { isMetaMask: true, on: () => {}, removeListener: () => {}, request: async ({ method, params = [] }) => {
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [address];
      if (method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts", caveats: [] }];
      if (method === "wallet_switchEthereumChain") {
        if (Number(params[0]?.chainId) !== 11155111) throw Error("WRONG_CHAIN");
        return null;
      }
      if (method !== "eth_chainId" && !reads.has(method)) throw Error("READ_ONLY_EXPORT_NO_SIGNING");
      const response = await fetch("https://ethereum-sepolia-rpc.publicnode.com", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
      });
      if (!response.ok) throw Error(`SEPOLIA_RPC_HTTP_${response.status}`);
      const body = await response.json();
      if (body.error) throw Error(`SEPOLIA_RPC_ERROR_${body.error.code}`);
      if (method === "eth_chainId" && Number(body.result) !== 11155111) throw Error("WRONG_CHAIN");
      return body.result;
    } };
  }, marker.account);
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4397/tools/swap/");
  if (new URL(page.url()).origin !== "http://127.0.0.1:4397") throw Error("EXPORT_ORIGIN");
  await page.waitForTimeout(2500);
  const connect = page.getByRole("button", { name: "Connect Wallet", exact: true });
  if (await connect.isVisible()) {
    await connect.click();
    await page.getByRole("button", { name: /MetaMask|Injected|Browser Wallet/ }).first().click();
  }
  const button = page.getByRole("button", { name: "Export for Taxlot", exact: true });
  await button.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === "Export for Taxlot");
    return button && !button.disabled;
  }, null, { timeout: 30000 });
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  await download.saveAs("docs/audit/phase-w/live-taxlot-import.csv");
  const csv = await readFile("docs/audit/phase-w/live-taxlot-import.csv", "utf8");
  if (!csv.startsWith('"timestamp","type","asset","quantity","counter_asset","counter_quantity","fee_asset","fee_quantity","txid"'))
    throw Error("EXPORT_HEADER_NOT_TAXLOT_GENERIC");
  console.log(JSON.stringify({ stage: "READ_ONLY_REEXPORT", origin: new URL(page.url()).origin,
    account: marker.account, rows: csv.trim().split("\r\n").length - 1,
    path: "docs/audit/phase-w/live-taxlot-import.csv", signingCalls: 0, sendCalls: 0 }));
} finally { await context.close(); }
