// PIT_AUTONOMOUS_SIGNER_TEST_ONLY — local Sepolia acceptance; never import from src/.
import { chromium } from "@playwright/test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createPublicClient, encodeFunctionData, erc20Abi, parseAbi } from "viem";
import { sepolia } from "viem/chains";
import { assertReviewedTransaction, assertTestRelease, castTransport, createTestProvider, TEST_OPERATOR as p } from "./autonomous-signer.mjs";
import { assertCheckpointValidity, assertFreshAfterApproval, assertLoopbackFree, mockReviewedSwapGasEstimate, safeRunnerFailure, verifyServedSource } from "./uniswap-runner-diagnostics.mjs";

const origin = "http://127.0.0.1:4397";
const evidenceDir = process.env.PIT_Z3_EVIDENCE_DIR ?? "docs/audit/phase-z";
const reviewedSwapAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
]);
const preflightOnly = !process.argv.includes("--z3-live");
const z3ReadOnly = process.argv.includes("--z3-read-only");
const z4Mock = process.argv.includes("--z4-mock-checkpoint");
const syntheticApprovalHash = `0x${"ab".repeat(32)}`;
const syntheticBlockHash = `0x${"cd".repeat(32)}`;
let mockApprovalRequested = false;
let mockSwapRequested = false;
const requireFact = (ok, code) => { if (!ok) throw Error(code); };
async function ownedServer() {
  // Never attach to a pre-existing listener, even if it looks like PIT.
  try { await assertLoopbackFree(origin); }
  catch (error) {
    console.error(JSON.stringify({ stage: "SERVER_IDENTITY_BLOCKED", reason: "PORT_NOT_PROVEN_FREE" }));
    throw error;
  }
  const child = spawn("pnpm", ["exec", "astro", "dev", "--host", "127.0.0.1", "--port", "4397"],
    { cwd: process.cwd(), detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  const collect = (chunk) => { output = (output + chunk.toString()).slice(-4000); };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  try {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        console.error(JSON.stringify({ stage: "SERVER_IDENTITY_BLOCKED", reason: "CHILD_EXITED",
          exitCode: child.exitCode, signalCode: child.signalCode }));
        throw Error("STALE_OR_WRONG_BUILD");
      }
      if (/127\.0\.0\.1:4397\//.test(output)) {
        const localSource = await readFile("src/lib/uniswap-execution.ts", "utf8");
        const [pageResponse, sourceResponse] = await Promise.all([
          fetch(`${origin}/tools/swap/`, { redirect: "manual" }),
          fetch(`${origin}/@fs${process.cwd()}/src/lib/uniswap-execution.ts?raw`, { redirect: "manual" }),
        ]);
        const htmlMatches = (await pageResponse.text()).includes("<title>Swap · PIT Toolbox</title>");
        if (pageResponse.status !== 200 || sourceResponse.status !== 200 || !htmlMatches) {
          console.error(JSON.stringify({ stage: "SERVER_IDENTITY_BLOCKED", reason: "HTTP_OR_TITLE_MISMATCH",
            pageStatus: pageResponse.status, sourceStatus: sourceResponse.status, htmlMatches }));
          throw Error("STALE_OR_WRONG_BUILD");
        }
        const rawModule = await sourceResponse.text();
        let identity;
        try { identity = verifyServedSource(localSource, rawModule); }
        catch (error) {
          const sha256 = (value) => createHash("sha256").update(value).digest("hex");
          const encoded = rawModule.match(/^export default ("(?:\\.|[^"\\])*");/s)?.[1];
          let servedSha256 = null;
          try { if (encoded) servedSha256 = sha256(JSON.parse(encoded)); }
          catch { /* Report shape only, never response contents. */ }
          console.error(JSON.stringify({ stage: "SERVER_IDENTITY_BLOCKED",
            reason: "SERVED_SOURCE_NOT_EXACT", localSha256: sha256(localSource),
            rawModuleSha256: sha256(rawModule), rawModuleBytes: rawModule.length,
            rawModuleExportShape: rawModule.startsWith("export default "),
            encodedLiteralPresent: !!encoded, servedSha256 }));
          throw error;
        }
        return { child, identity };
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw Error("STALE_OR_WRONG_BUILD");
  } catch (error) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* Process already exited. */ }
    throw error;
  }
}
const readMethods = new Set([
  "eth_blockNumber", "eth_call", "eth_estimateGas", "eth_feeHistory",
  "eth_gasPrice", "eth_getBalance", "eth_getBlockByNumber", "eth_getCode",
  "eth_getLogs", "eth_getTransactionByHash", "eth_getTransactionCount",
  "eth_getTransactionReceipt", "eth_maxPriorityFeePerGas",
]);
const transport = castTransport();
const rawRpc = transport({ chain: sepolia }).request;
const allowanceData = encodeFunctionData({ abi: erc20Abi, functionName: "allowance",
  args: [p.address, p.uniswapRouter] }).toLowerCase();
let mockedAllowance = false;
let mockedAllowanceReads = 0;
let mockedSwapGasEstimates = 0;
const rpcDurations = [];
// The Z.4 browser test is a stateful simulation. Reuse unchanged read-only
// identity/quote answers within that isolated session so repeated UI preflight
// polling does not turn a 30-second quote into a network-latency lottery.
const mockReadCache = new Map();
const rpc = async ({ method, params = [] }) => {
  const started = performance.now();
  try {
    if (z4Mock && mockApprovalRequested &&
        ["eth_getTransactionReceipt", "eth_getTransactionByHash", "eth_blockNumber"].includes(method)) {
      console.log(JSON.stringify({ stage: "Z4_MOCK_RECEIPT_POLL", method,
        at: new Date().toISOString(), parameterShape: typeof params[0],
        matchesSyntheticHash: String(params[0]).toLowerCase() === syntheticApprovalHash }));
    }
    if (z4Mock && mockApprovalRequested && params[0]?.toLowerCase?.() === syntheticApprovalHash) {
      console.log(JSON.stringify({ stage: "Z4_MOCK_APPROVAL_RPC", method,
        at: new Date().toISOString() }));
      const blockNumber = await rawRpc({ method: "eth_blockNumber", params: [] });
      if (method === "eth_getTransactionReceipt") return {
        blockHash: syntheticBlockHash, blockNumber, contractAddress: null,
        cumulativeGasUsed: "0x222e0", effectiveGasPrice: "0xf4240",
        from: p.address, gasUsed: "0x222e0", logs: [], logsBloom: `0x${"00".repeat(256)}`,
        status: "0x1", to: p.usdc, transactionHash: syntheticApprovalHash,
        transactionIndex: "0x0", type: "0x2",
      };
      if (method === "eth_getTransactionByHash") return {
        blockHash: syntheticBlockHash, blockNumber, from: p.address,
        gas: "0x222e0", gasPrice: "0xf4240", hash: syntheticApprovalHash,
        input: encodeFunctionData({ abi: erc20Abi, functionName: "approve",
          args: [p.uniswapRouter, p.uniswapSellCap] }), nonce: "0x2",
        to: p.usdc, transactionIndex: "0x0", value: "0x0", type: "0x2",
        maxFeePerGas: "0xf4240", maxPriorityFeePerGas: "0xf4240",
        r: `0x${"01".repeat(32)}`, s: `0x${"01".repeat(32)}`, v: "0x1",
      };
    }
    if (preflightOnly && mockedAllowance && method === "eth_call" &&
        String(params[0]?.to ?? "").toLowerCase() === p.usdc.toLowerCase() &&
        String(params[0]?.data ?? params[0]?.input ?? "").toLowerCase() === allowanceData) {
      mockedAllowanceReads++;
      return `0x${p.uniswapSellCap.toString(16).padStart(64, "0")}`;
    }
    if (preflightOnly && mockedAllowance && method === "eth_estimateGas" &&
        String(params[0]?.to ?? "").toLowerCase() === p.uniswapRouter.toLowerCase()) {
      const result = mockReviewedSwapGasEstimate(params[0], {
        owner: p.address, router: p.uniswapRouter,
        sellToken: p.usdc, buyToken: p.weth, sellAmount: p.uniswapSellCap,
      });
      mockedSwapGasEstimates++;
      return result;
    }
    const cacheable = z4Mock && ["eth_call", "eth_getCode", "eth_getBalance",
      "eth_gasPrice", "eth_estimateGas", "eth_chainId"].includes(method);
    const cacheKey = cacheable ? JSON.stringify([method, params]) : "";
    if (cacheable && mockReadCache.has(cacheKey)) return mockReadCache.get(cacheKey);
    const result = await rawRpc({ method, params });
    if (cacheable) mockReadCache.set(cacheKey, result);
    return result;
  } catch (error) {
    if (z4Mock) console.log(JSON.stringify({ stage: "Z4_RPC_READ_FAILURE",
      at: new Date().toISOString(), method,
      elapsedMs: Math.round(performance.now() - started),
      safeCode: String(error?.message).startsWith("AUTONOMOUS_RPC_FAILED")
        ? "AUTONOMOUS_RPC_FAILED" : "RPC_READ_FAILED" }));
    throw error;
  } finally {
    rpcDurations.push({ method, durationMs: Math.round(performance.now() - started) });
  }
};
const client = createPublicClient({ chain: sepolia, transport });
const profile = await mkdtemp("/tmp/pit-uniswap-operator-");
let browser;
let page;
let signer = null;
const sentHashes = [];
let server;
let stage = "authorization_gate";
let signingAttempted = false;
let submissionAttempted = false;
let activeQuoteExpiry = 0;
let activeQuoteMinimumBuy = 0n;
let activeSwapData = "0x";
const safeUiCode = (value) => ["QUOTE_EXPIRED", "READ_FAILED", "INVALID_EXECUTION_QUOTE",
  "INSUFFICIENT_BALANCE", "STORAGE_UNAVAILABLE", "UNISWAP_CONFIGURATION"].includes(value)
  ? value : value?.includes("Request a fresh quote before signing") ? "QUOTE_EXPIRED"
    : value?.includes("Z4_MOCK_SWAP_STOP") ? "MOCK_SWAP_STOP"
    : value?.includes("HTTP request failed") || value?.includes("AUTONOMOUS_RPC_FAILED")
      ? "RPC_READ_FAILED" : value ? "REDACTED_UI_ERROR" : null;
async function checkpointState(label, expiresAt) {
  const ui = await page.evaluate(() => {
    const button = (prefix) => [...document.querySelectorAll("button")]
      .find((entry) => entry.textContent?.trim().startsWith(prefix));
    const review = button("Review Uniswap");
    const continueButton = button("Continue to external wallet: Uniswap");
    return {
      gate: document.querySelector('[data-testid="uniswap-preflight"]')?.textContent?.split(":")[0] ?? null,
      approvalGate: document.querySelector('[data-testid="uniswap-approval-preflight"]')?.textContent?.split(":")[0] ?? null,
      reviewPresent: !!review, reviewEnabled: review ? !review.disabled : null,
      dialogPresent: !!document.querySelector('[role="dialog"]'),
      continuePresent: !!continueButton,
      continueEnabled: continueButton ? !continueButton.disabled : null,
      alert: document.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
      approvalStatusPresent: [...document.querySelectorAll('[role="status"]')]
        .some((entry) => entry.textContent?.includes("Exact Uniswap approval confirmed:")),
    };
  });
  const snapshot = { stage: "Z4_CHECKPOINT_STATE", label, at: new Date().toISOString(),
    remainingMs: expiresAt - Date.now(), ...ui, alert: safeUiCode(ui.alert),
    mockApprovalRequested, mockSwapRequested };
  console.log(JSON.stringify(snapshot));
  return snapshot;
}
try {
  assertTestRelease();
  requireFact(!process.argv.includes("--execute-reviewed") &&
    !(z3ReadOnly && !preflightOnly), "UNISWAP_LIVE_RUN_NOT_AUTHORIZED");
  stage = "server_identity";
  server = await ownedServer();
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  console.log(JSON.stringify({ stage: "SERVED_SOURCE_IDENTITY", head,
    sourceSha256: server.identity.sourceSha256,
    executionAccepted: server.identity.executionAccepted, origin }));
  requireFact(server.identity.executionAccepted, "UNISWAP_NOT_ACCEPTED");
  stage = "read_only_preflight";
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
    if (z4Mock && method === "eth_sendTransaction") {
      const tx = params[0];
      const action = assertReviewedTransaction(tx, {
        action: String(tx?.to).toLowerCase() === p.usdc.toLowerCase() ? "approve" : "swap",
        data: activeSwapData, minimumBuy: activeQuoteMinimumBuy,
        expiresAt: activeQuoteExpiry,
      });
      if (action === "uniswap-swap") assertCheckpointValidity(activeQuoteExpiry);
      if (action === "uniswap-approve" && !mockApprovalRequested) {
        mockApprovalRequested = true;
        mockedAllowance = true;
        console.log(JSON.stringify({ stage: "Z4_MOCK_WALLET_APPROVAL", at: new Date().toISOString(),
          exactIntent: true, syntheticHash: syntheticApprovalHash, signing: false, broadcast: false }));
        return syntheticApprovalHash;
      }
      if (action === "uniswap-swap" && mockApprovalRequested && !mockSwapRequested) {
        mockSwapRequested = true;
        console.log(JSON.stringify({ stage: "Z4_MOCK_WALLET_SWAP", at: new Date().toISOString(),
          exactIntent: true, signing: false, broadcast: false }));
        throw Error("Z4_MOCK_SWAP_STOP");
      }
      throw Error("Z4_NO_AUTOMATIC_RETRY");
    }
    requireFact(!preflightOnly && method === "eth_sendTransaction" && signer,
      "UNISWAP_BROWSER_SIGNING_NOT_ARMED");
    const tx = params[0];
    requireFact(!!tx && tx.from?.toLowerCase() === p.address.toLowerCase(),
      "UNISWAP_BROWSER_SIGNING_NOT_ARMED");
    const reviewedAction = assertReviewedTransaction(tx, {
      action: String(tx.to).toLowerCase() === p.usdc.toLowerCase() ? "approve" : "swap",
      ...(String(tx.to).toLowerCase() === p.uniswapRouter.toLowerCase() ? {
        minimumBuy: activeQuoteMinimumBuy,
        data: activeSwapData,
        expiresAt: activeQuoteExpiry,
      } : {}),
    });
    requireFact(reviewedAction === "uniswap-approve" || reviewedAction === "uniswap-swap",
      "UNISWAP_BROWSER_SIGNING_NOT_ARMED");
    if (reviewedAction === "uniswap-swap") assertCheckpointValidity(activeQuoteExpiry);
    const [freshChain, latestNonce, pendingNonce, freshEth, freshSell, freshAllowance, freshGasPrice,
      freshGas] = await Promise.all([
      client.getChainId(),
      client.getTransactionCount({ address: p.address, blockTag: "latest" }),
      client.getTransactionCount({ address: p.address, blockTag: "pending" }),
      client.getBalance({ address: p.address }),
      client.readContract({ address: p.usdc, abi: erc20Abi, functionName: "balanceOf", args: [p.address] }),
      client.readContract({ address: p.usdc, abi: erc20Abi, functionName: "allowance",
        args: [p.address, p.uniswapRouter] }),
      client.getGasPrice(),
      client.estimateGas({ account: p.address, to: tx.to,
        data: tx.data ?? tx.input, value: BigInt(tx.value ?? 0) }),
    ]);
    requireFact(freshChain === 11155111 && latestNonce === pendingNonce &&
      freshSell >= p.uniswapSellCap && freshEth >= freshGas * freshGasPrice * 10n &&
      (reviewedAction === "uniswap-approve" || freshAllowance >= p.uniswapSellCap),
    "UNISWAP_PREFLIGHT_FUNDS_OR_CHAIN");
    const remainingMs = reviewedAction === "uniswap-swap"
      ? assertCheckpointValidity(activeQuoteExpiry) : null;
    console.log(JSON.stringify({ stage: "LIVE_WALLET_BOUNDARY", action: reviewedAction,
      at: new Date().toISOString(), remainingMs, latestNonce, pendingNonce,
      ethWei: freshEth.toString(), sellBalance: freshSell.toString(),
      allowance: freshAllowance.toString(), gasEstimate: freshGas.toString(),
      gasPriceWei: freshGasPrice.toString(), signingAttempted: false,
      submissionAttempted: false }));
    signingAttempted = true;
    stage = "wallet_transaction_request";
    const hash = await signer.request({ method, params });
    submissionAttempted ||= signer.sent;
    sentHashes.push(hash);
    console.log(JSON.stringify({ stage: "TRANSACTION_HASH_RETURNED", action: reviewedAction,
      at: new Date().toISOString(), hash }));
    await writeFile(`${evidenceDir}/Z3-${reviewedAction}-hash.json`, JSON.stringify({
      at: new Date().toISOString(), action: reviewedAction, hash,
    }, null, 2) + "\n", { flag: "wx" });
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
  stage = "browser_initialization";
  await page.goto(`${origin}/tools/swap/`);
  requireFact(new URL(page.url()).origin === origin, "UNISWAP_ORIGIN");
  await page.getByRole("button", { name: "Connect Wallet", exact: true }).click();
  await page.getByRole("button", { name: /MetaMask|Injected|Browser Wallet/ }).first().click();
  await page.getByLabel("Executable venue").selectOption("uniswap-v3");
  await page.getByLabel("Sell token address").fill(p.usdc);
  await page.getByLabel("You sell").fill("10");
  await page.getByLabel("Buy token address").fill(p.weth);
  if (preflightOnly && !z4Mock) await page.getByLabel(/Dry run only/).check();
  stage = "wallet_bound_quote";
  const quoteStarted = performance.now();
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  await page.getByTestId("uniswap-execution-economics").waitFor({ timeout: 90000 });
  const quoteReady = performance.now();
  await page.waitForFunction(() => {
    const gate = document.querySelector('[data-testid="uniswap-preflight"]')?.textContent;
    const error = document.querySelector('[role="alert"]')?.textContent;
    return gate?.startsWith("GREEN") || !!error;
  }, null, { timeout: 90000 });
  const readinessReady = performance.now();
  const gate = await page.getByTestId("uniswap-preflight").innerText();
  const error = await page.getByRole("alert").count()
    ? await page.getByRole("alert").innerText() : null;
  const economics = await page.getByTestId("uniswap-execution-economics").count()
    ? await page.getByTestId("uniswap-execution-economics").innerText() : null;
  console.log(JSON.stringify({ stage: "WALLET_BOUND_QUOTE", gate, error, economics,
    quoteAcquisitionMs: Math.round(quoteReady - quoteStarted),
    readinessMs: Math.round(readinessReady - quoteReady),
    rpcMethods: Object.fromEntries([...new Set(rpcDurations.map((row) => row.method))]
      .map((method) => [method, { calls: rpcDurations.filter((row) => row.method === method).length,
        totalMs: rpcDurations.filter((row) => row.method === method)
          .reduce((sum, row) => sum + row.durationMs, 0) }])),
    transactionCalls: sentHashes.length }));
  requireFact(gate.startsWith("GREEN") && economics?.includes("PIT fee: 0") &&
    economics.includes("Approval required: "), "UNISWAP_QUOTE_NOT_READY");
  if (preflightOnly) {
    const firstExpiry = Date.parse(economics.match(/Quote expires: ([^\s]+)\./)?.[1] ?? "");
    requireFact(Number.isFinite(firstExpiry) && firstExpiry > Date.now(), "QUOTE_EXPIRED");
    const approvalNeeded = economics.includes("Approval required: YES");
    const checkpointStarted = performance.now();
    if (z3ReadOnly) {
      const action = approvalNeeded ? "approval" : "swap";
      stage = "z3_read_only_checkpoint";
      await page.getByRole("button", { name: approvalNeeded
        ? "Preview Uniswap exact token approval · dry run"
        : "Preview Uniswap swap submission · dry run" }).click();
      await page.getByLabel(/I reviewed the network/).check();
      const checkpointAt = Date.now();
      const remainingMs = assertCheckpointValidity(firstExpiry, checkpointAt);
      console.log(JSON.stringify({ stage: "Z3_READ_ONLY_CHECKPOINT", action,
        quoteObtainedAt: new Date(firstExpiry - 30000).toISOString(),
        quoteExpiresAt: new Date(firstExpiry).toISOString(),
        checkpointAt: new Date(checkpointAt).toISOString(), remainingMs,
        minimumRequiredMs: 10000,
        quoteAcquisitionMs: Math.round(quoteReady - quoteStarted),
        identityAndReadinessMs: Math.round(readinessReady - quoteReady),
        providerPreparationMs: Math.round(performance.now() - checkpointStarted),
        signingAttempted: false, submissionAttempted: false, transactionCalls: 0 }));
    } else if (z4Mock) {
      stage = "z4_mock_approval_checkpoint";
      activeQuoteExpiry = firstExpiry;
      await page.waitForFunction(() => document.querySelector('[data-testid="uniswap-approval-preflight"]')
        ?.textContent?.startsWith("GREEN"), null, { timeout: 90000 });
      await checkpointState("approval-before-review", firstExpiry);
      await page.getByRole("button", { name: "Review Uniswap exact token approval" })
        .click({ timeout: 15000 });
      await checkpointState("approval-review-open", firstExpiry);
      await page.getByLabel(/I reviewed the network/).check();
      await checkpointState("approval-confirmed-checkbox", firstExpiry);
      await page.getByRole("button", { name: /Continue to external wallet: Uniswap exact token approval/ })
        .click({ timeout: 15000 });
      await checkpointState("approval-continue-clicked", firstExpiry);
      await page.waitForFunction(() => {
        const approved = [...document.querySelectorAll('[role="status"]')]
          .some((entry) => entry.textContent?.includes("Exact Uniswap approval confirmed:"));
        return approved ||
          !!document.querySelector('[role="alert"]');
      }, null, { timeout: 60000 });
      const approvalOutcome = await checkpointState("approval-handler-outcome", firstExpiry);
      requireFact(mockApprovalRequested && !approvalOutcome.alert,
        approvalOutcome.alert === "QUOTE_EXPIRED" ? "QUOTE_EXPIRED" : "Z4_APPROVAL_HANDLER_FAILED");
      stage = "z4_fresh_quote_after_mock_approval";
      const secondStarted = performance.now();
      await page.getByRole("button", { name: "Get quote", exact: true }).click();
      await page.waitForFunction((prior) => {
        const gate = document.querySelector('[data-testid="uniswap-preflight"]')?.textContent;
        const text = document.querySelector('[data-testid="uniswap-execution-economics"]')?.textContent ?? "";
        return gate?.startsWith("GREEN") && text.includes("Approval required: NO") &&
          !text.includes(`Quote expires: ${prior}`);
      }, new Date(firstExpiry).toISOString(), { timeout: 90000 });
      const secondEconomics = await page.getByTestId("uniswap-execution-economics").innerText();
      const nextExpiry = Date.parse(secondEconomics.match(/Quote expires: ([^\s]+)\./)?.[1] ?? "");
      const nextOutput = BigInt(secondEconomics.match(/Quoted output: (\d+) base units\./)?.[1] ?? 0);
      activeQuoteMinimumBuy = BigInt(secondEconomics.match(/Minimum received after 0\.50% slippage: (\d+) base units\./)?.[1] ?? 0);
      assertFreshAfterApproval(firstExpiry, nextExpiry);
      requireFact(nextOutput > 0n && activeQuoteMinimumBuy === nextOutput * 9950n / 10000n &&
        mockedAllowanceReads > 0 && mockedSwapGasEstimates > 0 &&
        secondEconomics.includes("PIT fee: 0"), "UNISWAP_FRESH_QUOTE_MISMATCH");
      activeQuoteExpiry = nextExpiry;
      activeSwapData = encodeFunctionData({ abi: reviewedSwapAbi,
        functionName: "exactInputSingle", args: [{ tokenIn: p.usdc, tokenOut: p.weth,
          fee: 500, recipient: p.address, amountIn: p.uniswapSellCap,
          amountOutMinimum: activeQuoteMinimumBuy, sqrtPriceLimitX96: 0n }] }).toLowerCase();
      stage = "z4_mock_swap_checkpoint";
      await checkpointState("swap-before-review", nextExpiry);
      assertCheckpointValidity(nextExpiry);
      await page.getByRole("button", { name: "Review Uniswap swap submission" })
        .click({ timeout: Math.max(1000, nextExpiry - Date.now()) });
      await checkpointState("swap-review-open", nextExpiry);
      await page.getByLabel(/I reviewed the network/).check();
      await checkpointState("swap-confirmed-checkbox", nextExpiry);
      await page.getByRole("button", { name: /Continue to external wallet: Uniswap swap submission/ })
        .click({ timeout: Math.max(1000, nextExpiry - Date.now()) });
      await checkpointState("swap-continue-clicked", nextExpiry);
      await page.waitForFunction(() => !!document.querySelector('[role="alert"]'), null,
        { timeout: Math.max(1000, Math.min(30000, nextExpiry - Date.now() + 5000)) });
      const swapOutcome = await checkpointState("swap-mock-stop", nextExpiry);
      requireFact(mockSwapRequested && !!swapOutcome.alert && sentHashes.length === 0 &&
        !signingAttempted && !submissionAttempted, "Z4_SWAP_CHECKPOINT_FAILED");
      const storedEvents = await page.evaluate(async () => {
        // A swap stopped at the mock wallet boundary must not initialize the
        // accounting DB merely to inspect it.
        if (!(await indexedDB.databases()).some((db) => db.name === "pit-taxlot-v1"))
          return { total: 0, uniswap: 0 };
        return new Promise((resolve, reject) => {
          const opened = indexedDB.open("pit-taxlot-v1");
          opened.onerror = () => reject(Error("INDEXEDDB_OPEN_FAILED"));
          opened.onsuccess = () => {
            const db = opened.result;
            if (!db.objectStoreNames.contains("events")) {
              db.close();
              resolve({ total: 0, uniswap: 0 });
              return;
            }
            const request = db.transaction("events", "readonly").objectStore("events").getAll();
            request.onerror = () => reject(Error("INDEXEDDB_READ_FAILED"));
            request.onsuccess = () => {
              db.close();
              const events = request.result;
              resolve({ total: events.length, uniswap: events.filter((event) =>
                String(event.source).toLowerCase().includes("uniswap")).length });
            };
          };
        });
      });
      console.log(JSON.stringify({ stage: "Z4_INDEXEDDB_COUNT", storedEvents }));
      requireFact(storedEvents.uniswap === 0, "Z4_FALSE_TAXLOT_EVENT");
      console.log(JSON.stringify({ stage: "Z4_MOCK_COMPLETE", approvalWalletBoundary: true,
        swapWalletBoundary: true, syntheticApprovalHash, freshQuoteMs: Math.round(performance.now() - secondStarted),
        freshQuoteExpiry: new Date(nextExpiry).toISOString(), storedEvents,
        signingAttempted: false, submissionAttempted: false, realTransactionHashes: 0 }));
    } else {
    if (approvalNeeded) {
      stage = "mock_approval_checkpoint";
      await page.getByRole("button", { name: "Preview Uniswap exact token approval · dry run" }).click();
      await page.getByLabel(/I reviewed the network/).check();
      await page.getByRole("button", { name: "Advance dry run" }).click();
      requireFact(sentHashes.length === 0 && !signingAttempted, "UNISWAP_BROWSER_SIGNING_NOT_ARMED");
      console.log(JSON.stringify({ stage: "MOCK_APPROVAL_CHECKPOINT", outcome: "PASS",
        actualApprovalSubmitted: false, elapsedMs: Math.round(performance.now() - checkpointStarted) }));
    }
    // Simulate *only* the exact router allowance read. This is not a chain
    // write or an approval receipt; all other reads and the new quote stay live.
    mockedAllowance = true;
    stage = "fresh_quote_after_mock_approval";
    const secondStarted = performance.now();
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await page.waitForFunction((prior) => {
      const gate = document.querySelector('[data-testid="uniswap-preflight"]')?.textContent;
      const text = document.querySelector('[data-testid="uniswap-execution-economics"]')?.textContent ?? "";
      return gate?.startsWith("GREEN") && text.includes("Approval required: NO") &&
        !text.includes(`Quote expires: ${prior}`);
    }, new Date(firstExpiry).toISOString(), { timeout: 90000 });
    const secondEconomics = await page.getByTestId("uniswap-execution-economics").innerText();
    const nextExpiry = Date.parse(secondEconomics.match(/Quote expires: ([^\s]+)\./)?.[1] ?? "");
    assertFreshAfterApproval(firstExpiry, nextExpiry);
    requireFact(mockedAllowanceReads > 0 && mockedSwapGasEstimates > 0 &&
      secondEconomics.includes("PIT fee: 0"),
      "UNISWAP_FRESH_QUOTE_MISMATCH");
    stage = "mock_swap_checkpoint";
    await page.getByRole("button", { name: "Preview Uniswap swap submission · dry run" }).click();
    await page.getByLabel(/I reviewed the network/).check();
    await page.getByRole("button", { name: "Advance dry run" }).click();
    requireFact(sentHashes.length === 0 && !signingAttempted, "UNISWAP_BROWSER_SIGNING_NOT_ARMED");
    console.log(JSON.stringify({ stage: "MOCK_SWAP_CHECKPOINT", outcome: "PASS",
      simulatedAllowanceReads: mockedAllowanceReads,
      simulatedSwapGasEstimates: mockedSwapGasEstimates,
      freshQuoteMs: Math.round(performance.now() - secondStarted),
      freshExpiry: new Date(nextExpiry).toISOString(), actualSwapSubmitted: false }));
    console.log(JSON.stringify({ stage: "READ_ONLY_COMPLETE", transactionCalls: 0,
      signingAttempted: false, submissionAttempted: false }));
    }
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
    activeQuoteExpiry = Date.parse(expiresAt);
    await writeFile(`${evidenceDir}/Z3-preapproval.json`, JSON.stringify({
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
      stage = "approval_checkpoint";
      signer = createTestProvider({ allowTransactions: true });
      signer.armReviewedUniswap({ action: "approve" });
      await page.waitForFunction(() => document.querySelector('[data-testid="uniswap-approval-preflight"]')
        ?.textContent?.startsWith("GREEN") || !!document.querySelector('[role="alert"]'),
      null, { timeout: 90000 });
      const approvalBefore = await checkpointState("approval-before-review", activeQuoteExpiry);
      requireFact(approvalBefore.approvalGate === "GREEN" && !approvalBefore.alert,
        "UNISWAP_APPROVAL_NOT_READY");
      await page.getByRole("button", { name: "Review Uniswap exact token approval" }).click();
      await checkpointState("approval-review-open", activeQuoteExpiry);
      await page.getByLabel(/I reviewed the network/).check();
      await checkpointState("approval-confirmed-checkbox", activeQuoteExpiry);
      await page.getByRole("button", { name: /Continue to external wallet: Uniswap exact token approval/ }).click();
      await checkpointState("approval-continue-clicked", activeQuoteExpiry);
      await page.waitForFunction(() => {
        const status = document.querySelector('[role="status"]')?.textContent ?? "";
        return status.includes("Exact Uniswap approval confirmed:") ||
          status.includes("Uniswap allowance already sufficient") ||
          !!document.querySelector('[role="alert"]');
      }, null, { timeout: 60000 });
      const approvalOutcome = await checkpointState("approval-handler-outcome", activeQuoteExpiry);
      requireFact(!approvalOutcome.alert, approvalOutcome.alert === "QUOTE_EXPIRED"
        ? "QUOTE_EXPIRED" : "UNISWAP_APPROVAL_HANDLER_FAILED");
      requireFact(signer.sent && sentHashes.length === 1, "UNISWAP_APPROVAL_NOT_SENT_ONCE");
      approvalHash = sentHashes[0];
      signer = null;
      stage = "approval_receipt";
      const [approvalTx, approvalReceipt, approvedAllowance] = await Promise.all([
        client.getTransaction({ hash: approvalHash }),
        client.getTransactionReceipt({ hash: approvalHash }),
        client.readContract({ address: p.usdc, abi: erc20Abi, functionName: "allowance",
          args: [p.address, p.uniswapRouter] }),
      ]);
      requireFact(approvalReceipt.status === "success" &&
        approvalTx.chainId === 11155111 &&
        approvalTx.from.toLowerCase() === p.address.toLowerCase() &&
        approvalTx.to?.toLowerCase() === p.usdc.toLowerCase() && approvalTx.value === 0n &&
        approvalTx.input.toLowerCase() === encodeFunctionData({ abi: erc20Abi,
          functionName: "approve", args: [p.uniswapRouter, p.uniswapSellCap] }).toLowerCase() &&
        approvedAllowance >= p.uniswapSellCap, "UNISWAP_APPROVAL_VERIFICATION");
      console.log(JSON.stringify({ stage: "APPROVAL_CONFIRMED", hash: approvalHash,
        blockNumber: approvalReceipt.blockNumber.toString(),
        allowance: approvedAllowance.toString() }));
      await writeFile(`${evidenceDir}/Z3-approval.json`, JSON.stringify({
        hash: approvalHash, status: approvalReceipt.status,
        blockNumber: approvalReceipt.blockNumber.toString(),
        blockHash: approvalReceipt.blockHash, gasUsed: approvalReceipt.gasUsed.toString(),
        effectiveGasPrice: approvalReceipt.effectiveGasPrice.toString(),
        allowance: approvedAllowance.toString(),
      }, null, 2) + "\n", { flag: "wx" });
    }
    stage = "fresh_quote_after_approval";
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
    assertFreshAfterApproval(Date.parse(expiresAt), Date.parse(nextExpiry));
    requireFact(fresh.includes("PIT fee: 0") &&
      fresh.includes(`Exact input: ${p.uniswapSellCap} base units`) &&
      fresh.includes("pool: 0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1") &&
      !!nextOutput && !!nextMinimum && !!nextExpiry &&
      BigInt(nextMinimum) === BigInt(nextOutput) * 9950n / 10000n &&
      Date.parse(nextExpiry) > Date.now(), "UNISWAP_FRESH_QUOTE_MISMATCH");
    activeQuoteExpiry = Date.parse(nextExpiry);
    assertCheckpointValidity(activeQuoteExpiry);
    activeQuoteMinimumBuy = BigInt(nextMinimum);
    activeSwapData = encodeFunctionData({ abi: reviewedSwapAbi,
      functionName: "exactInputSingle", args: [{ tokenIn: p.usdc, tokenOut: p.weth,
        fee: 500, recipient: p.address, amountIn: p.uniswapSellCap,
        amountOutMinimum: activeQuoteMinimumBuy, sqrtPriceLimitX96: 0n }] }).toLowerCase();
    signer = createTestProvider({ allowTransactions: true });
    stage = "swap_checkpoint";
    signer.armReviewedUniswap({ action: "swap", minimumBuy: BigInt(nextMinimum),
      expectedBuy: BigInt(nextOutput), expiresAt: Date.parse(nextExpiry) });
    await writeFile(`${evidenceDir}/Z3-preswap.json`, JSON.stringify({
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
    stage = "swap_receipt";
    const [tx, receipt] = await Promise.all([
      client.getTransaction({ hash: swapHash }),
      client.getTransactionReceipt({ hash: swapHash }),
    ]);
    requireFact(receipt.status === "success" &&
      tx.chainId === 11155111 &&
      tx.from.toLowerCase() === p.address.toLowerCase() &&
      tx.to?.toLowerCase() === p.uniswapRouter.toLowerCase() && tx.value === 0n &&
      tx.input.toLowerCase() === activeSwapData,
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
    await writeFile(`${evidenceDir}/Z3-fill.json`, JSON.stringify({
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
    await download.saveAs(`${evidenceDir}/Z3-taxlot.csv`);
    console.log(JSON.stringify({ stage: "CONFIRMED_AND_EXPORTED", swapHash,
      approvalHash, taxlotEventId: stored.event.id,
      sellQuantity: stored.event.quantity,
      buyQuantity: stored.event.counter_quantity,
      csvFile: download.suggestedFilename(), transactionCalls: sentHashes.length }));
  }
} catch (error) {
  if (z4Mock && page) {
    try {
      if (stage === "z4_mock_swap_checkpoint") {
        const dbState = await page.evaluate(async () => ({
          indexedDbPresent: typeof indexedDB !== "undefined",
          databasesApiPresent: typeof indexedDB?.databases === "function",
          databaseNames: typeof indexedDB?.databases === "function"
            ? (await indexedDB.databases()).map((db) => db.name) : [],
        }));
        console.log(JSON.stringify({ stage: "Z4_INDEXEDDB_DIAGNOSTIC", ...dbState }));
      }
      await checkpointState("failure-state", activeQuoteExpiry);
      console.log(JSON.stringify({ stage: "Z4_RPC_METHOD_COUNTS",
        methods: Object.fromEntries([...new Set(rpcDurations.map((row) => row.method))]
          .map((method) => [method, rpcDurations.filter((row) => row.method === method).length])) }));
    } catch { /* Retain original failure. */ }
  }
  if (preflightOnly && page && stage === "fresh_quote_after_mock_approval") {
    try {
      const browserState = await page.evaluate(() => ({
        gate: document.querySelector('[data-testid="uniswap-preflight"]')?.textContent ?? null,
        economics: document.querySelector('[data-testid="uniswap-execution-economics"]')?.textContent ?? null,
        alertPresent: !!document.querySelector('[role="alert"]'),
        quoteButton: [...document.querySelectorAll("button")]
          .find((button) => button.textContent?.trim() === "Get quote")?.disabled ?? null,
      }));
      console.log(JSON.stringify({ stage: "FRESH_QUOTE_BROWSER_STATE", ...browserState,
        simulatedAllowanceReads: mockedAllowanceReads }));
    } catch { /* The original failure remains authoritative. */ }
  }
  submissionAttempted ||= signer?.sent === true;
  const failure = safeRunnerFailure(error, stage, {
    signingAttempted, submissionAttempted, hashReturned: sentHashes.length > 0,
  });
  console.error(JSON.stringify({ stage: "BLOCKED", ...failure,
    returnedTransactionHashes: sentHashes }));
  process.exitCode = 2;
} finally {
  if (browser) await browser.close();
  if (server) {
    try { process.kill(-server.child.pid, "SIGTERM"); } catch { /* Already exited. */ }
  }
  await rm(profile, { recursive: true, force: true });
}
