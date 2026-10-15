// PIT_AUTONOMOUS_SIGNER_TEST_ONLY — local Sepolia acceptance; never import from src/.
import { chromium } from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createPublicClient, erc20Abi } from "viem";
import { sepolia } from "viem/chains";
import { assertTestRelease, castTransport, createTestProvider, TEST_OPERATOR as p } from "./autonomous-signer.mjs";

const origin = "http://127.0.0.1:4397";
const evidenceDir = "docs/audit/phase-z";
const preflightOnly = !process.argv.includes("--execute-reviewed");
const requireFact = (ok, code) => { if (!ok) throw Error(code); };
const readMethods = new Set([
  "eth_blockNumber", "eth_call", "eth_estimateGas", "eth_feeHistory",
  "eth_gasPrice", "eth_getBalance", "eth_getBlockByNumber", "eth_getCode",
  "eth_getLogs", "eth_getTransactionByHash", "eth_getTransactionCount",
  "eth_getTransactionReceipt", "eth_maxPriorityFeePerGas",
]);
const transport = castTransport();
const rpc = transport({ chain: sepolia }).request;
const client = createPublicClient({ chain: sepolia, transport });
const profile = await mkdtemp("/tmp/pit-uniswap-operator-");
let browser;
let page;
let signer = null;
const sentHashes = [];
try {
  assertTestRelease();
  const [chainId, eth, usdc, allowance, gasPrice] = await Promise.all([
    client.getChainId(), client.getBalance({ address: p.address }),
    client.readContract({ address: p.usdc, abi: erc20Abi, functionName: "balanceOf", args: [p.address] }),
    client.readContract({ address: p.usdc, abi: erc20Abi, functionName: "allowance", args: [p.address, p.uniswapRouter] }),
    client.getGasPrice(),
  ]);
  requireFact(chainId === 11155111 && usdc >= p.uniswapSellCap && eth > 10000000000000000n,
    "UNISWAP_PREFLIGHT_FUNDS_OR_CHAIN");
  console.log(JSON.stringify({ stage: "READ_ONLY_PREFLIGHT", address: p.address, chainId,
    ethWei: eth.toString(), usdcBaseUnits: usdc.toString(),
    routerAllowance: allowance.toString(), gasPriceWei: gasPrice.toString(),
    intendedSellBaseUnits: p.uniswapSellCap.toString(), pitFee: "0",
    transactionCalls: 0 }));
  browser = await chromium.launchPersistentContext(profile, {
    headless: true, viewport: { width: 1440, height: 1000 }, acceptDownloads: true,
  });
  page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.exposeBinding("__pitTestBridge", async (_source, { method, params = [] }) => {
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [p.address];
    if (method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts", caveats: [] }];
    if (method === "wallet_switchEthereumChain") {
      requireFact(Number(params[0]?.chainId) === 11155111, "UNISWAP_WRONG_CHAIN");
      return null;
    }
    if (method === "eth_chainId") return "0xaa36a7";
    if (readMethods.has(method)) return rpc({ method, params });
    requireFact(!preflightOnly && method === "eth_sendTransaction" && signer,
      "UNISWAP_BROWSER_SIGNING_NOT_ARMED");
    const hash = await signer.request({ method, params });
    sentHashes.push(hash);
    return hash;
  });
  await page.addInitScript(() => {
    window.ethereum = { isMetaMask: true, on: () => {}, removeListener: () => {},
      request: (args) => window.__pitTestBridge(args) };
  });
  await page.route("https://ethereum-sepolia-rpc.publicnode.com/**", async (route) => {
    const request = route.request();
    requireFact(request.method() === "POST", "UNISWAP_RPC_METHOD");
    const body = request.postDataJSON();
    requireFact(readMethods.has(body.method) || body.method === "eth_chainId",
      "UNISWAP_RPC_READ_ONLY");
    try {
      const result = await rpc({ method: body.method, params: body.params ?? [] });
      await route.fulfill({ json: { jsonrpc: "2.0", id: body.id, result },
        headers: { "access-control-allow-origin": origin, "content-type": "application/json" } });
    } catch { await route.fulfill({ status: 502, json: { error: "APPROVED_RPC_READ_FAILED" },
      headers: { "access-control-allow-origin": origin } }); }
  });
  await page.route("https://api.cow.fi/**", (route) => {
    requireFact(route.request().method() !== "POST" ||
      !route.request().url().includes("/orders"), "UNISWAP_COW_ORDER_DENIED");
    return route.continue();
  });
  await page.goto(`${origin}/tools/swap/`);
  requireFact(new URL(page.url()).origin === origin, "UNISWAP_ORIGIN");
  await page.getByRole("button", { name: "Connect Wallet", exact: true }).click();
  await page.getByRole("button", { name: /MetaMask|Injected|Browser Wallet/ }).first().click();
  await page.getByLabel("Executable venue").selectOption("uniswap-v3");
  await page.getByLabel("Sell token address").fill(p.usdc);
  await page.getByLabel("You sell").fill("10");
  await page.getByLabel("Buy token address").fill(p.weth);
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  await page.waitForFunction(() => {
    const gate = document.querySelector('[data-testid="uniswap-preflight"]')?.textContent;
    const error = document.querySelector('[role="alert"]')?.textContent;
    return gate?.startsWith("GREEN") || !!error;
  }, null, { timeout: 90000 });
  const gate = await page.getByTestId("uniswap-preflight").innerText();
  const error = await page.getByRole("alert").count()
    ? await page.getByRole("alert").innerText() : null;
  const economics = await page.getByTestId("uniswap-execution-economics").count()
    ? await page.getByTestId("uniswap-execution-economics").innerText() : null;
  console.log(JSON.stringify({ stage: "WALLET_BOUND_QUOTE", gate, error, economics,
    transactionCalls: sentHashes.length }));
  requireFact(gate.startsWith("GREEN") && economics?.includes("PIT fee: 0") &&
    economics.includes("Approval required: "), "UNISWAP_QUOTE_NOT_READY");
  if (preflightOnly) {
    console.log(JSON.stringify({ stage: "READ_ONLY_COMPLETE", transactionCalls: 0 }));
  } else {
    const [quotedOutput, minimumBuy, expiresAt] = [
      /Quoted output: (\d+) base units\./,
      /Minimum received after 0\.50% slippage: (\d+) base units\./,
      /Quote expires: ([^\s]+)\./,
    ].map((pattern) => economics.match(pattern)?.[1]);
    requireFact(!!quotedOutput && !!minimumBuy && !!expiresAt &&
      BigInt(minimumBuy) === BigInt(quotedOutput) * 9950n / 10000n &&
      Date.parse(expiresAt) > Date.now(), "UNISWAP_QUOTE_ECONOMICS");
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(`${evidenceDir}/live-attempt.json`, JSON.stringify({
      at: new Date().toISOString(), stage: "REVIEWED_PRE_APPROVAL",
      account: p.address, chainId, tokenIn: p.usdc, tokenOut: p.weth,
      router: p.uniswapRouter, pool: "0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1",
      feeTier: 500, sellAmount: p.uniswapSellCap.toString(),
      quotedOutput, minimumBuy, expiresAt,
      ethWei: eth.toString(), usdcBaseUnits: usdc.toString(),
      currentAllowance: allowance.toString(), pitFee: "0",
      automaticRetry: false,
    }, null, 2) + "\n", { flag: "wx" });
    let approvalHash = null;
    if (allowance < p.uniswapSellCap) {
      signer = createTestProvider({ allowTransactions: true });
      signer.armReviewedUniswap({ action: "approve" });
      await page.getByRole("button", { name: "Review Uniswap exact token approval" }).click();
      await page.getByLabel(/I reviewed the network/).check();
      await page.getByRole("button", { name: /Continue to external wallet: Uniswap exact token approval/ }).click();
      await page.getByText(/Exact Uniswap approval confirmed:/).waitFor({ timeout: 90000 });
      requireFact(signer.sent && sentHashes.length === 1, "UNISWAP_APPROVAL_NOT_SENT_ONCE");
      approvalHash = sentHashes[0];
      signer = null;
      const [approvalTx, approvalReceipt, approvedAllowance] = await Promise.all([
        client.getTransaction({ hash: approvalHash }),
        client.getTransactionReceipt({ hash: approvalHash }),
        client.readContract({ address: p.usdc, abi: erc20Abi, functionName: "allowance",
          args: [p.address, p.uniswapRouter] }),
      ]);
      requireFact(approvalReceipt.status === "success" &&
        approvalTx.from.toLowerCase() === p.address.toLowerCase() &&
        approvalTx.to?.toLowerCase() === p.usdc.toLowerCase() && approvalTx.value === 0n &&
        approvedAllowance >= p.uniswapSellCap, "UNISWAP_APPROVAL_VERIFICATION");
      console.log(JSON.stringify({ stage: "APPROVAL_CONFIRMED", hash: approvalHash,
        blockNumber: approvalReceipt.blockNumber.toString(),
        allowance: approvedAllowance.toString() }));
      await writeFile(`${evidenceDir}/approval.json`, JSON.stringify({
        hash: approvalHash, status: approvalReceipt.status,
        blockNumber: approvalReceipt.blockNumber.toString(),
        blockHash: approvalReceipt.blockHash, gasUsed: approvalReceipt.gasUsed.toString(),
        effectiveGasPrice: approvalReceipt.effectiveGasPrice.toString(),
        allowance: approvedAllowance.toString(),
      }, null, 2) + "\n", { flag: "wx" });
    }
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await page.waitForFunction((prior) => {
      const gate = document.querySelector('[data-testid="uniswap-preflight"]')?.textContent;
      const text = document.querySelector('[data-testid="uniswap-execution-economics"]')?.textContent ?? "";
      return gate?.startsWith("GREEN") && text.includes("Approval required: NO") &&
        !text.includes(`Quote expires: ${prior}`);
    }, expiresAt, { timeout: 90000 });
    const fresh = await page.getByTestId("uniswap-execution-economics").innerText();
    const nextOutput = fresh.match(/Quoted output: (\d+) base units\./)?.[1];
    const nextMinimum = fresh.match(/Minimum received after 0\.50% slippage: (\d+) base units\./)?.[1];
    const nextExpiry = fresh.match(/Quote expires: ([^\s]+)\./)?.[1];
    requireFact(fresh.includes("PIT fee: 0") &&
      fresh.includes(`Exact input: ${p.uniswapSellCap} base units`) &&
      fresh.includes("pool: 0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1") &&
      !!nextOutput && !!nextMinimum && !!nextExpiry &&
      BigInt(nextMinimum) === BigInt(nextOutput) * 9950n / 10000n &&
      Date.parse(nextExpiry) > Date.now(), "UNISWAP_FRESH_QUOTE_MISMATCH");
    signer = createTestProvider({ allowTransactions: true });
    signer.armReviewedUniswap({ action: "swap", minimumBuy: BigInt(nextMinimum),
      expectedBuy: BigInt(nextOutput), expiresAt: Date.parse(nextExpiry) });
    await writeFile(`${evidenceDir}/swap-attempt.json`, JSON.stringify({
      at: new Date().toISOString(), stage: "REVIEWED_PRE_SWAP", account: p.address,
      chainId, router: p.uniswapRouter, tokenIn: p.usdc, tokenOut: p.weth,
      feeTier: 500, sellAmount: p.uniswapSellCap.toString(),
      quotedOutput: nextOutput, minimumBuy: nextMinimum,
      expiresAt: nextExpiry, pitFee: "0", automaticRetry: false,
    }, null, 2) + "\n", { flag: "wx" });
    await page.getByRole("button", { name: "Review Uniswap swap submission" }).click();
    await page.getByLabel(/I reviewed the network/).check();
    await page.getByRole("button", { name: /Continue to external wallet: Uniswap swap submission/ }).click();
    await page.getByText(/Uniswap swap .* recorded as Taxlot trade/).waitFor({ timeout: 120000 });
    requireFact(signer.sent && sentHashes.length === (approvalHash ? 2 : 1),
      "UNISWAP_SWAP_NOT_SENT_ONCE");
    const swapHash = sentHashes.at(-1);
    signer = null;
    const [tx, receipt] = await Promise.all([
      client.getTransaction({ hash: swapHash }),
      client.getTransactionReceipt({ hash: swapHash }),
    ]);
    requireFact(receipt.status === "success" &&
      tx.from.toLowerCase() === p.address.toLowerCase() &&
      tx.to?.toLowerCase() === p.uniswapRouter.toLowerCase() && tx.value === 0n,
      "UNISWAP_SWAP_VERIFICATION");
    const stored = await page.evaluate(async (expectedHash) => new Promise((resolve, reject) => {
      const opened = indexedDB.open("pit-taxlot-v1");
      opened.onerror = () => reject(Error("INDEXEDDB_OPEN_FAILED"));
      opened.onsuccess = () => {
        const db = opened.result;
        const tx = db.transaction(["events", "raw"], "readonly");
        const read = tx.objectStore("events").getAll();
        read.onerror = () => reject(Error("INDEXEDDB_READ_FAILED"));
        read.onsuccess = () => {
          const event = read.result.find((entry) => entry.txid?.toLowerCase() === expectedHash.toLowerCase());
          if (!event) { db.close(); resolve(null); return; }
          const raw = tx.objectStore("raw").get(event.id);
          raw.onerror = () => reject(Error("INDEXEDDB_RAW_READ_FAILED"));
          raw.onsuccess = () => { db.close(); resolve({ event, raw: raw.result?.payload ?? null }); };
        };
      };
    }), swapHash);
    requireFact(stored?.event?.type === "trade" &&
      stored.event.account.toLowerCase() === p.address.toLowerCase() &&
      stored.event.asset === `eip155:11155111/erc20:${p.usdc.toLowerCase()}` &&
      stored.event.counter_asset === `eip155:11155111/erc20:${p.weth.toLowerCase()}` &&
      stored.raw?.pitFee === "0", "UNISWAP_ACCOUNTING_RECONCILIATION");
    await writeFile(`${evidenceDir}/live-fill.json`, JSON.stringify({
      at: new Date().toISOString(), approvalHash, swapHash,
      blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash,
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      event: stored.event, raw: stored.raw,
    }, null, 2) + "\n", { flag: "wx" });
    await page.goto(`${origin}/tools/taxlot-export/`);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export for Taxlot" }).click(),
    ]);
    await download.saveAs(`${evidenceDir}/live-taxlot.csv`);
    console.log(JSON.stringify({ stage: "CONFIRMED_AND_EXPORTED", swapHash,
      approvalHash, taxlotEventId: stored.event.id,
      sellQuantity: stored.event.quantity,
      buyQuantity: stored.event.counter_quantity,
      csvFile: download.suggestedFilename(), transactionCalls: sentHashes.length }));
  }
} catch (error) {
  const message = String(error?.message ?? "");
  const reason = /^(UNISWAP_|AUTONOMOUS_|QUOTE_EXPIRED|INVALID_EXECUTION_QUOTE|INSUFFICIENT_BALANCE|WRONG_CHAIN|UNSUPPORTED_ASSETS)[A-Z0-9_]*$/.test(message)
    ? message : "UNISWAP_RUNTIME_BLOCKED";
  let uiText = "";
  try {
    if (page && await page.getByRole("alert").count())
      uiText = await page.getByRole("alert").innerText();
  } catch { /* Preserve the original failure classification. */ }
  const uiCode = /^(QUOTE_EXPIRED|INVALID_EXECUTION_QUOTE|INSUFFICIENT_BALANCE|UNISWAP_NOT_ACCEPTED|WRONG_CHAIN)$/.test(uiText)
    ? uiText : null;
  console.error(JSON.stringify({ stage: "BLOCKED", reason, uiCode,
    signingAttempted: signer?.sent ?? false,
    transactionCalls: sentHashes.length }));
  process.exitCode = 2;
} finally {
  if (browser) await browser.close();
  await rm(profile, { recursive: true, force: true });
}
