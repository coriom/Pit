import { test, expect } from "@playwright/test";
// Audit runs are offline: explicit per-test fixtures override this route.
test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\//, (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
});
test("production swap, wallet dialog, navigation and CSP", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    (window as any).__violations = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      (window as any).__violations.push(e.violatedDirective),
    );
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Perps review CSV", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Swap tokens" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Get quote", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await expect(
    page.getByText("Connect your wallet", { exact: false }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/production-wallet.png",
    fullPage: true,
  });
  await page.goto("/fees/");
  await expect(
    page.getByRole("heading", { name: "What PIT earns." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Legal", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "MiCA / PSAN opinion — pending" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => (window as any).__violations)).toEqual([]);
});
test("perps fields render against public info fixture and mobile does not overflow", async ({
  page,
}) => {
  await page.route("https://api.hyperliquid-testnet.xyz/info", (route) =>
    route.fulfill({
      json: { universe: [{ name: "ETH", szDecimals: 4, maxLeverage: 20 }] },
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Perpetuals", exact: true }).click();
  await expect(page.getByLabel("Market")).toContainText("ETH / USDC");
  await page.getByLabel("Limit price (USDC)").fill("2000");
  await page.getByLabel("Size (ETH)").fill("0.01");
  await expect(
    page.getByRole("button", { name: "Sign & place limit order" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-perps-fixture.png",
    fullPage: true,
  });
});
test("injected test provider connects without secrets; invalid swaps cannot sign", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let chain = "0xaa36a7";
    let authorized = false;
    const listeners: Record<string, Function[]> = {};
    (window as any).__signCalls = 0;
    const address = "0x1111111111111111111111111111111111111111";
    (window as any).ethereum = {
      isMetaMask: true,
      on: (e: string, f: Function) => (listeners[e] ??= []).push(f),
      removeListener: () => {},
      request: async ({ method, params }: any) => {
        if (method === "eth_accounts") return authorized ? [address] : [];
        if (method === "eth_requestAccounts") {
          authorized = true;
          return [address];
        }
        if (method === "eth_chainId") return chain;
        if (method === "eth_getBalance") return "0xde0b6b3a7640000";
        if (method === "wallet_switchEthereumChain") {
          chain = params[0].chainId;
          for (const f of listeners.chainChanged ?? []) f(chain);
          return null;
        }
        if (method.includes("sign") || method === "eth_sendTransaction") {
          (window as any).__signCalls++;
          throw Error("Signing blocked by UI test provider");
        }
        throw Error(`Unsupported mock RPC ${method}`);
      },
    };
  });
  await page.route("https://api.cow.fi/**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("https://api.hyperliquid-testnet.xyz/info", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  const injected = page
    .getByRole("button", { name: /MetaMask|Injected|Browser Wallet/ })
    .first();
  await injected.click();
  await expect(page.getByText("1 ETH · wallet RPC")).toBeVisible();
  await page.getByLabel("Sell token address").fill("invalid");
  await page.getByLabel("Buy token address").fill("invalid");
  await page.getByLabel("You sell").fill("1");
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("UNSUPPORTED_ASSETS");
  expect(await page.evaluate(() => (window as any).__signCalls)).toBe(0);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("pit-taxlot-v1", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction("events", "readwrite");
    tx.objectStore("events").put({
      version: 1,
      id: "csv-fixture",
      type: "trade",
      timestamp: "2026-09-29T00:00:00Z",
      sequence: 0,
      asset: "ETH",
      quantity: "0.123456789012345678",
      counter_asset: "USDC",
      counter_quantity: "250",
      fee: [],
      source: "pit:cow:11155111",
      account: "0x1111111111111111111111111111111111111111",
      raw_row_ref: "csv-fixture",
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export for Taxlot", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("pit-taxlot.csv");
  const stream = await download.createReadStream();
  let csv = "";
  for await (const chunk of stream!) csv += chunk.toString();
  expect(csv).toContain("0.123456789012345678");
  expect(csv).toContain('"trade"');
});

test("IPFS-style subpath hydrates and links stay beneath the CID", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/ipfs/test-cid/**", async (route) => {
    const url = new URL(route.request().url());
    let relative = url.pathname.slice("/ipfs/test-cid/".length);
    if (!relative || relative.endsWith("/")) relative += "index.html";
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const root = resolve("dist");
    const file = resolve(root, relative);
    if (!file.startsWith(root + "/")) return route.abort();
    const type = relative.endsWith(".html")
      ? "text/html"
      : relative.endsWith(".js")
        ? "text/javascript"
        : relative.endsWith(".css")
          ? "text/css"
          : "application/octet-stream";
    try {
      await route.fulfill({ body: await readFile(file), contentType: type });
    } catch {
      await route.fulfill({ status: 404, body: "Not found" });
    }
  });
  const rootAssetRequests: string[] = [];
  page.on("request", (request) => {
    const p = new URL(request.url()).pathname;
    if (p.startsWith("/_astro/")) rootAssetRequests.push(p);
  });
  await page.goto("/ipfs/test-cid/");
  await expect(page.getByRole("alert")).toContainText(
    "Accounting storage and CSV export are disabled",
  );
  await expect(
    page.getByRole("button", { name: "Export for Taxlot", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Perps review CSV", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Filled trades stay in this browser", { exact: false }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(async () =>
      (await indexedDB.databases()).map((x) => x.name),
    ),
  ).not.toContain("pit-taxlot-v1");
  await expect(
    page.getByRole("heading", { name: "Swap tokens" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Fee transparency ↗" }).click();
  await expect(page).toHaveURL(/\/ipfs\/test-cid\/fees\//);
  expect(rootAssetRequests).toEqual([]);
  await expect(
    page.getByRole("heading", { name: "What PIT earns." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("Cloudflare static artifact emits a response CSP alongside Astro meta CSP", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile("dist/index.html", "utf8");
  const headers = await readFile("dist/_headers", "utf8");
  const match = html.match(
    /<meta\s+http-equiv="content-security-policy"\s+content="([^"]+)"\s*\/?\s*>/i,
  );
  expect(match).toBeTruthy();
  const meta = match![1].replaceAll("&amp;", "&").replace(/;+$/, "");
  expect(headers).toContain(
    `Content-Security-Policy: ${meta}; frame-ancestors 'none'`,
  );
  expect(headers).toContain("X-Content-Type-Options: nosniff");
  expect(headers).toContain("Referrer-Policy: no-referrer");
  expect(headers).toContain("X-Frame-Options: DENY");
});
