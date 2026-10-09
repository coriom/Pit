// PIT_AUTONOMOUS_SIGNER_TEST_ONLY — Node/Playwright audit runner, never bundled.
import { chromium } from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createPublicClient, erc20Abi, formatUnits, keccak256, toBytes } from "viem";
import { sepolia } from "viem/chains";
import { getQuoteAmountsAndCosts } from "@cowprotocol/cow-sdk";
import { assertTestRelease, castTransport, createTestProvider, TEST_OPERATOR as p } from "./autonomous-signer.mjs";

const origin = "http://127.0.0.1:4397";
const dir = "docs/audit/phase-w";
const attemptPath = `${dir}/order-attempt.json`;
const preflightOnly = process.argv.includes("--preflight-only");
const lower = (value) => String(value).toLowerCase();
const must = (condition, reason) => { if (!condition) throw Error(reason); };
const profile = await mkdtemp("/tmp/pit-test-operator-browser-");
const browser = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
let page;
let signed = false;
let orderPosts = 0;
let orderResponse = null;
let quoteResponse = null;
let orderSpec = null;
const signer = createTestProvider({ allowOrderSigning: true });
try {
  assertTestRelease();
  const chain = createPublicClient({ chain: sepolia, transport: castTransport() });
  const chainId = await chain.getChainId();
  const eth = await chain.getBalance({ address: p.address });
  const weth = await chain.readContract({ address: p.weth, abi: erc20Abi, functionName: "balanceOf", args: [p.address] });
  const allowance = await chain.readContract({ address: p.weth, abi: erc20Abi, functionName: "allowance", args: [p.address, p.relayer] });
  console.log(JSON.stringify({ stage: "READ_ONLY_PREFLIGHT", address: p.address, chainId,
    ethWei: eth.toString(), wethWei: weth.toString(), allowanceWei: allowance.toString(),
    limits: { ethValueWei: p.maxEthValue.toString(), cowSellWei: p.sellBudget.toString(), approvalWei: p.sellBudget.toString() },
    intended: ["one fresh PIT executable quote", "one EIP-712 CoW order", "one CoW order submission"] }));
  must(chainId === p.chainId && weth >= p.sellBudget && allowance >= p.sellBudget && eth > 10000000000000000n,
    "AUTONOMOUS_PREFLIGHT_BLOCKED");

  page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.exposeBinding("__pitTestSign", async (_source, args) => {
    must(["eth_signTypedData_v4", "eth_sendTransaction"].includes(args.method), "AUTONOMOUS_BROWSER_SIGN_METHOD");
    const result = await signer.request(args);
    if (args.method === "eth_signTypedData_v4") signed = true;
    return result;
  });
  await page.addInitScript((address) => {
    const reads = new Set(["eth_blockNumber", "eth_call", "eth_estimateGas", "eth_feeHistory", "eth_gasPrice",
      "eth_getBalance", "eth_getBlockByNumber", "eth_getCode", "eth_getLogs", "eth_getTransactionByHash",
      "eth_getTransactionCount", "eth_getTransactionReceipt", "eth_maxPriorityFeePerGas"]);
    let id = 0;
    window.ethereum = { isMetaMask: true, on: () => {}, removeListener: () => {}, request: async (args) => {
      const { method, params = [] } = args;
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [address];
      if (method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts", caveats: [] }];
      if (method === "wallet_switchEthereumChain") {
        if (Number(params[0]?.chainId) !== 11155111) throw Error("WRONG_CHAIN");
        return null;
      }
      if (method === "eth_chainId" || reads.has(method)) {
        const response = await fetch("https://ethereum-sepolia-rpc.publicnode.com", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
        });
        if (!response.ok) throw Error(`SEPOLIA_RPC_HTTP_${response.status}`);
        const body = await response.json();
        if (body.error) throw Error(`SEPOLIA_RPC_ERROR_${body.error.code}`);
        if (method === "eth_chainId" && Number(body.result) !== 11155111) throw Error("WRONG_CHAIN");
        return body.result;
      }
      return window.__pitTestSign(args);
    } };
  }, p.address);
  await page.route("https://api.cow.fi/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname !== "/sepolia/api/v1/orders" || request.method() !== "POST") return route.continue();
    must(orderSpec && signed && orderPosts === 0, "AUTONOMOUS_ORDER_POST_NOT_ARMED");
    const body = request.postDataJSON();
    must(Number(body.quoteId) === quoteResponse?.body?.id &&
      lower(body.from) === lower(p.address) && lower(body.sellToken) === lower(p.weth) &&
      lower(body.buyToken) === lower(p.usdc) && BigInt(body.sellAmount) === p.sellBudget &&
      BigInt(body.buyAmount) === orderSpec.minimumBuy && Number(body.validTo) > Date.now()/1000 &&
      body.kind === "sell" && body.partiallyFillable === false &&
      body.signingScheme === "eip712" && BigInt(body.feeAmount ?? -1) === 0n,
      "AUTONOMOUS_ORDER_POST_INTENT");
    must(typeof body.appData === "string" &&
      (lower(body.appData) === lower(orderSpec.appDataHash) ||
        keccak256(toBytes(body.appData)) === orderSpec.appDataHash), "AUTONOMOUS_ORDER_APPDATA");
    const appData = body.appData.startsWith("{") ? JSON.parse(body.appData) : null;
    must(appData?.metadata?.partnerFee === undefined, "AUTONOMOUS_PARTNER_FEE");
    orderPosts++;
    await route.continue();
  });
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (url.origin !== "https://api.cow.fi" || response.request().method() !== "POST") return;
    try {
      const body = await response.json();
      if (url.pathname === "/sepolia/api/v1/quote") quoteResponse = { status: response.status(), body };
      if (url.pathname === "/sepolia/api/v1/orders") orderResponse = { status: response.status(), body };
    } catch { /* status still handled by UI and missing body fails closed */ }
  });
  await page.goto(`${origin}/tools/swap/`);
  must(new URL(page.url()).origin === origin, "AUTONOMOUS_ORIGIN");
  await page.getByRole("button", { name: "Connect Wallet", exact: true }).click();
  await page.getByRole("button", { name: /MetaMask|Injected|Browser Wallet/ }).first().click();
  await page.getByTestId("acceptance-evidence").getByRole("button", { name: "Start local acceptance session" }).click();
  await page.getByLabel("Sell token address").fill(p.weth);
  await page.getByLabel("You sell").fill("0.005");
  await page.getByLabel("Buy token address").fill(p.usdc);
  await page.getByRole("button", { name: "Get quote" }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="cow-preflight"]')?.textContent?.startsWith("GREEN"), null, { timeout: 45000 });
  must(quoteResponse?.status === 200, "AUTONOMOUS_NO_EXECUTION_QUOTE_RESPONSE");
  const quote = quoteResponse.body;
  must(quote.verified === true && lower(quote.from) === lower(p.address) &&
    lower(quote.quote.sellToken) === lower(p.weth) && lower(quote.quote.buyToken) === lower(p.usdc) &&
    BigInt(quote.quote.sellAmount) + BigInt(quote.quote.feeAmount) === p.sellBudget &&
    Date.parse(quote.expiration) > Date.now(), "AUTONOMOUS_QUOTE_CONTEXT");
  const costs = getQuoteAmountsAndCosts({ orderParams: quote.quote, slippagePercentBps: 50,
    partnerFeeBps: 0, protocolFeeBps: Number(quote.protocolFeeBps ?? "0") });
  must(costs.costs.partnerFee.amount === 0n && costs.amountsToSign.sellAmount === p.sellBudget,
    "AUTONOMOUS_QUOTE_ECONOMICS");
  const readiness = await page.locator('[data-testid^="cow-readiness-"]').allInnerTexts();
  must(readiness.length === 8 && readiness.every((row) => row.startsWith("PASS")), "AUTONOMOUS_READINESS_NOT_GREEN");
  const display = await page.getByTestId("quote-cow").innerText();
  must(display.includes(formatUnits(costs.afterPartnerFees.buyAmount, 6)) &&
    display.includes(formatUnits(costs.costs.networkFee.amountInSellCurrency, 18)) &&
    display.includes("PIT fee: 0"), "AUTONOMOUS_DISCLOSURE_MISMATCH");
  const snapshot = { quoteId: quote.id, quoteVerified: quote.verified, origin, address: p.address,
    sellBudget: p.sellBudget.toString(), expectedBuy: costs.afterPartnerFees.buyAmount.toString(),
    minimumBuy: costs.afterSlippage.buyAmount.toString(), networkCostSell: costs.costs.networkFee.amountInSellCurrency.toString(),
    protocolFeeBuy: costs.costs.protocolFee.amount.toString(), pitFeeBuy: "0", quoteExpiration: quote.expiration,
    readiness, preflight: await page.getByTestId("cow-preflight").innerText() };
  console.log(JSON.stringify({ stage: "PRESIGNATURE", ...snapshot }));
  must(!signer.sent && !signer.signed && orderPosts === 0, "AUTONOMOUS_PREMATURE_ACTION");
  if (preflightOnly) {
    console.log(JSON.stringify({ stage: "READ_ONLY_COMPLETE", profile, signed: signer.signed, transactionSent: signer.sent, orderPosts }));
  } else {
  // The UI's first checkpoint reads the already-sufficient allowance and returns without a transaction.
  await page.getByRole("button", { name: "Review token approval" }).click();
  await page.getByLabel(/I reviewed the network/).check();
  await page.getByRole("button", { name: /Continue to external wallet: token approval/ }).click();
  await page.getByRole("button", { name: "Review order signature and submission" }).waitFor({ timeout: 30000 });
  must(!signer.sent && !signer.signed && orderPosts === 0 &&
    (await chain.readContract({ address: p.weth, abi: erc20Abi, functionName: "allowance", args: [p.address, p.relayer] })) >= p.sellBudget,
    "AUTONOMOUS_UNEXPECTED_APPROVAL");
  must((await page.getByTestId("cow-preflight").innerText()).startsWith("GREEN") &&
    Date.parse(quote.expiration) > Date.now(), "AUTONOMOUS_QUOTE_EXPIRED");
  await mkdir(dir, { recursive: true });
  await writeFile(attemptPath, JSON.stringify({ stage: "ORDER_ATTEMPT_ARMED", at: new Date().toISOString(),
    account: p.address, quoteId: quote.id, sellBudget: p.sellBudget.toString(),
    minimumBuy: costs.afterSlippage.buyAmount.toString(), profile }, null, 2), { flag: "wx" });
  orderSpec = { minimumBuy: costs.afterSlippage.buyAmount, appDataHash: quote.quote.appDataHash };
  signer.armReviewedOrder({ quoteId: quote.id, verified: true, expiresAt: quote.expiration,
    appDataHash: quote.quote.appDataHash, minimumBuy: costs.afterSlippage.buyAmount });
  await page.getByRole("button", { name: "Review order signature and submission" }).click();
  await page.getByLabel(/I reviewed the network/).check();
  await page.getByRole("button", { name: /Continue to external wallet: order signature and submission/ }).click();
  await page.getByText(/Submitted:/).waitFor({ timeout: 45000 });
  must(signer.signed && orderPosts === 1 && orderResponse?.status >= 200 && orderResponse.status < 300,
    "AUTONOMOUS_ORDER_SUBMISSION_UNVERIFIED");
  const orderUid = typeof orderResponse.body === "string" ? orderResponse.body : orderResponse.body?.uid;
  must(/^0x[0-9a-fA-F]{112}$/.test(orderUid), "AUTONOMOUS_ORDER_UID_INVALID");
  await writeFile(`${dir}/order-submission.json`, JSON.stringify({
    at: new Date().toISOString(), orderUid, quoteId: quote.id, account: p.address,
    sellToken: p.weth, buyToken: p.usdc, sellBudget: p.sellBudget.toString(),
    expectedBuy: costs.afterPartnerFees.buyAmount.toString(), minimumBuy: costs.afterSlippage.buyAmount.toString(),
    networkCostSell: costs.costs.networkFee.amountInSellCurrency.toString(),
    protocolFeeBuy: costs.costs.protocolFee.amount.toString(), pitFeeBuy: "0",
    quoteExpiration: quote.expiration, httpStatus: orderResponse.status,
  }, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ stage: "ORDER_SUBMITTED", orderUid, httpStatus: orderResponse.status,
    status: await page.getByRole("status").last().innerText(), profile, orderPosts,
    signed: signer.signed, transactionSent: signer.sent }));
  let final = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const observation = await page.evaluate(async (uid) => {
      const response = await fetch(`https://api.cow.fi/sepolia/api/v1/orders/${uid}`);
      const order = response.ok ? await response.json() : null;
      const stored = await new Promise((resolve, reject) => {
        const opened = indexedDB.open("pit-taxlot-v1");
        opened.onerror = () => reject(Error("INDEXEDDB_OPEN_FAILED"));
        opened.onsuccess = () => {
          const db = opened.result;
          const tx = db.transaction(["events", "raw"], "readonly");
          const read = tx.objectStore("events").getAll();
          read.onerror = () => reject(Error("INDEXEDDB_READ_FAILED"));
          read.onsuccess = () => {
            const event = read.result.find((record) => record.id.includes(uid));
            if (!event) { resolve(null); db.close(); return; }
            const raw = tx.objectStore("raw").get(event.id);
            raw.onerror = () => reject(Error("INDEXEDDB_RAW_READ_FAILED"));
            raw.onsuccess = () => {
              const fill = raw.result?.payload;
              resolve({ event, raw: fill ? {
                orderUid: fill.orderUid, owner: fill.owner, txHash: fill.txHash,
                sellToken: fill.sellToken, buyToken: fill.buyToken,
                sellAmount: fill.sellAmount, sellAmountBeforeFees: fill.sellAmountBeforeFees,
                buyAmount: fill.buyAmount, blockNumber: fill.blockNumber, logIndex: fill.logIndex,
              } : null });
              db.close();
            };
          };
        };
      });
      return { at: new Date().toISOString(), httpStatus: response.status,
        order: order ? { status: order.status, executedSellAmountBeforeFees: order.executedSellAmountBeforeFees,
          executedBuyAmount: order.executedBuyAmount, executedFeeAmount: order.executedFeeAmount,
          sellAmount: order.sellAmount, buyAmount: order.buyAmount, owner: order.owner,
          sellToken: order.sellToken, buyToken: order.buyToken, feeAmount: order.feeAmount } : null,
        ...stored };
    }, orderUid);
    if (observation.event) { final = observation; break; }
    if (["expired", "cancelled", "invalid"].includes(observation.order?.status)) {
      await writeFile(`${dir}/order-terminal.json`, JSON.stringify(observation, null, 2) + "\n", { flag: "wx" });
      throw Error(`AUTONOMOUS_ORDER_TERMINAL_${observation.order.status}`);
    }
    if (attempt % 4 === 0)
      console.log(JSON.stringify({ stage: "ORDER_POLL", attempt: attempt + 1, at: observation.at,
        httpStatus: observation.httpStatus, orderStatus: observation.order?.status ?? null, localEvent: false }));
    await page.waitForTimeout(15000);
  }
  must(final?.event && final.raw, "AUTONOMOUS_FILL_OR_ACCOUNTING_TIMEOUT");
  const tradesResult = await page.evaluate(async (uid) => {
    const response = await fetch(`https://api.cow.fi/sepolia/api/v2/trades?orderUid=${uid}&offset=0&limit=10`);
    return { status: response.status, trades: response.ok ? await response.json() : null };
  }, orderUid);
  must(tradesResult.status === 200 && Array.isArray(tradesResult.trades) && tradesResult.trades.length === 1,
    "AUTONOMOUS_TRADE_VERIFICATION_UNAVAILABLE");
  const receivedTrade = tradesResult.trades[0];
  const trade = { orderUid: receivedTrade.orderUid, owner: receivedTrade.owner,
    txHash: receivedTrade.txHash, sellToken: receivedTrade.sellToken,
    buyToken: receivedTrade.buyToken, sellAmount: receivedTrade.sellAmount,
    sellAmountBeforeFees: receivedTrade.sellAmountBeforeFees,
    buyAmount: receivedTrade.buyAmount, blockNumber: receivedTrade.blockNumber,
    logIndex: receivedTrade.logIndex };
  must(trade.orderUid === orderUid && lower(trade.owner) === lower(p.address) &&
    trade.txHash === final.event.txid &&
    BigInt(trade.sellAmount) === BigInt(final.raw.sellAmount) &&
    BigInt(trade.sellAmountBeforeFees) === BigInt(final.raw.sellAmountBeforeFees) &&
    BigInt(trade.buyAmount) === BigInt(final.raw.buyAmount), "AUTONOMOUS_TRADE_SOURCE_MISMATCH");
  must(final.event.type === "trade" && final.event.account.toLowerCase() === lower(p.address) &&
    final.event.asset === `eip155:11155111/erc20:${lower(p.weth)}` &&
    final.event.counter_asset === `eip155:11155111/erc20:${lower(p.usdc)}` &&
    final.event.txid && final.order?.status === "fulfilled", "AUTONOMOUS_FILL_ACCOUNTING_MISMATCH");
  await writeFile(`${dir}/live-fill.json`, JSON.stringify({ orderUid, ...final, trade }, null, 2) + "\n", { flag: "wx" });
  await page.waitForFunction(async (uid) => new Promise((resolve, reject) => {
    const opened = indexedDB.open("pit-acceptance-evidence-v1");
    opened.onerror = () => reject(Error("ACCEPTANCE_DB_OPEN_FAILED"));
    opened.onsuccess = () => {
      const db = opened.result;
      const read = db.transaction("entries", "readonly").objectStore("entries").getAll();
      read.onerror = () => reject(Error("ACCEPTANCE_DB_READ_FAILED"));
      read.onsuccess = () => {
        resolve(read.result.some((entry) => entry.data?.kind === "cow-fill" &&
          entry.data.orderUid === uid && entry.data.reconciliation === "MATCH"));
        db.close();
      };
    };
  }), orderUid, { timeout: 30000 });
  const saveDownload = async (button, filename) => {
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: button }).click()]);
    await download.saveAs(`${dir}/${filename}`);
  };
  await saveDownload("Export for Taxlot", "live-taxlot.csv");
  await saveDownload("Export evidence JSON", "live-acceptance.json");
  await saveDownload("Export evidence Markdown", "live-acceptance.md");
  console.log(JSON.stringify({ stage: "ACCOUNTING_EXPORTED", orderUid, settlementTxHash: final.event.txid,
    taxlotEventId: final.event.id, orderStatus: final.order.status,
    paths: [`${dir}/live-fill.json`, `${dir}/live-taxlot.csv`, `${dir}/live-acceptance.json`, `${dir}/live-acceptance.md`] }));
  }
} catch (error) {
  const message = String(error?.message ?? "");
  const reason = /^AUTONOMOUS_[A-Z0-9_]+$/.test(message) ? message : "AUTONOMOUS_RUNTIME_FAILURE";
  console.error(JSON.stringify({ stage: "BLOCKED", reason,
    signed: signer.signed, transactionSent: signer.sent, orderPosts,
    orderStatus: orderResponse?.status ?? null }));
  process.exitCode = 2;
} finally { await browser.close(); }
