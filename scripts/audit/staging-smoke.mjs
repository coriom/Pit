import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { accountingOrigins } from "../../src/lib/storage-origins.ts";

const originText = process.env.PIT_STAGING_ORIGIN;
const gatewayText = process.env.PIT_STAGING_SHARED_GATEWAY_URL;
const blocked = (reason) => {
  throw Error(`BLOCKED — ${reason}`);
};
if (!originText || !gatewayText)
  blocked(
    "PIT_STAGING_ORIGIN and PIT_STAGING_SHARED_GATEWAY_URL are required for real staging verification",
  );
const staging = new URL(originText);
if (
  staging.protocol !== "https:" ||
  staging.href !== `${staging.origin}/` ||
  !/^pit-testnet-stage-k-[a-z0-9-]+\.pages\.dev$/.test(staging.hostname)
)
  blocked(
    "staging target must be one dedicated PIT testnet Pages HTTPS origin",
  );
if (!accountingOrigins.includes(staging.origin))
  blocked(
    "the exact staging origin has not been reviewed and compiled into the accounting allowlist",
  );
const gateway = new URL(gatewayText);
if (
  gateway.protocol !== "https:" ||
  gateway.origin === staging.origin ||
  !/(?:^|\/)ip(?:fs|ns)\//i.test(gateway.pathname)
)
  blocked(
    "negative target must be a distinct HTTPS shared-origin IPFS/IPNS path gateway",
  );
const local = JSON.parse(await readFile("dist/build-manifest.json", "utf8"));
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const requests = [];
  page.on("request", (request) =>
    requests.push({ method: request.method(), url: request.url() }),
  );
  // A public, keyless fixture. External protocol requests are blocked; no wallet signature is possible.
  await page.route(/^https?:\/\//, (route) =>
    new URL(route.request().url()).origin === staging.origin
      ? route.continue()
      : ["https://api.cow.fi", "https://api.hyperliquid-testnet.xyz"].includes(
            new URL(route.request().url()).origin,
          )
        ? route.fulfill({ json: [] })
        : route.abort("blockedbyclient"),
  );
  const response = await page.goto(staging.origin, {
    waitUntil: "domcontentloaded",
  });
  if (
    !response?.ok() ||
    page.url() !== staging.origin ||
    new URL(page.url()).origin !== staging.origin
  )
    throw Error("Staging document did not load at the exact HTTPS origin");
  const headers = response.headers();
  for (const [key, expected] of Object.entries({
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
  })) {
    if (headers[key]?.toLowerCase() !== expected.toLowerCase())
      throw Error(`Missing or incorrect actual HTTP header: ${key}`);
  }
  if (!headers["permissions-policy"]?.includes("camera=()"))
    throw Error("Missing actual Permissions-Policy response header");
  const csp = headers["content-security-policy"];
  if (
    !csp?.includes("default-src 'none'") ||
    !csp.includes("script-src 'self'") ||
    !csp.includes("frame-ancestors 'none'") ||
    csp.includes("'unsafe-eval'")
  )
    throw Error("Missing or unsafe actual HTTP CSP response header");
  const remoteManifest = await context.request.get(
    new URL("/build-manifest.json", staging.origin).href,
  );
  if (!remoteManifest.ok())
    throw Error("Deployed build manifest is unavailable");
  const remote = await remoteManifest.json();
  if (remote.hash !== local.hash)
    throw Error(
      "Deployed build hash differs from the locally verified artifact",
    );
  await page.getByRole("heading", { name: "Swap tokens" }).waitFor();
  const text = await page.locator("body").innerText();
  if (!text.includes("Testnet only") || !text.includes("OFF"))
    throw Error("Deployed UI does not disclose disabled fees and testnet only");
  const fixture = "0x4444444444444444444444444444444444444444";
  await page.addInitScript((account) => {
    let connected = false;
    window.__pitSmokeSignatures = 0;
    window.ethereum = {
      isMetaMask: true,
      on: () => {},
      removeListener: () => {},
      request: async ({ method }) => {
        if (method === "eth_accounts") return connected ? [account] : [];
        if (method === "eth_requestAccounts") {
          connected = true;
          return [account];
        }
        if (method === "eth_chainId") return "0xaa36a7";
        if (method === "eth_getBalance") return "0x1";
        if (method.includes("sign") || method === "eth_sendTransaction") {
          window.__pitSmokeSignatures++;
          throw Error("Wallet signing forbidden in staging smoke");
        }
        throw Error(`Unsupported fixture RPC: ${method}`);
      },
    };
  }, fixture);
  await page.reload();
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Injected|Browser Wallet/ })
    .first()
    .click();
  await page.getByText(/ETH · wallet RPC/).waitFor();
  const preflight = page.getByTestId("cow-preflight");
  await page
    .getByLabel("Sell token address")
    .fill("0x1111111111111111111111111111111111111111");
  await page
    .getByLabel("Buy token address")
    .fill("0x2222222222222222222222222222222222222222");
  await page.getByLabel("You sell").fill("1");
  if ((await preflight.innerText()).includes("GREEN"))
    throw Error("Synthetic unfunded wallet unexpectedly passed CoW preflight");
  if (await page.getByRole("button", { name: "Sign & submit order" }).count())
    throw Error("Signing control appeared without a successful quote");
  const record = {
    version: 1,
    id: "staging-origin-fixture",
    type: "trade",
    timestamp: "2026-09-30T00:00:00Z",
    sequence: 0,
    asset: "eip155:11155111/erc20:0x1111111111111111111111111111111111111111",
    quantity: "1",
    counter_asset:
      "eip155:11155111/erc20:0x2222222222222222222222222222222222222222",
    counter_quantity: "2",
    fee: [],
    source: "pit:cow:11155111",
    account: fixture,
    raw_row_ref: "staging-origin-fixture",
  };
  const schema = JSON.parse(await readFile("schemas/events.v1.json", "utf8"));
  const validator = addFormats(new Ajv()).compile(schema);
  if (!validator(record))
    throw Error("Staging fixture does not match the exact Taxlot v1 schema");
  const inserted = await page.evaluate(async (event) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("pit-taxlot-v1");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      if (!db.objectStoreNames.contains("events"))
        throw Error("PIT accounting store missing");
      const tx = db.transaction("events", "readwrite");
      const existing = await new Promise((resolve, reject) => {
        const request = tx.objectStore("events").get(event.id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (existing)
        throw Error("Fresh staging browser already contains fixture ID");
      tx.objectStore("events").add(event);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } finally {
      db.close();
    }
  }, record);
  if (!inserted) throw Error("Accounting fixture could not be written");
  await page.reload();
  await page.getByRole("heading", { name: "Swap tokens" }).waitFor();
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Injected|Browser Wallet/ })
    .first()
    .click();
  await page.getByText(/ETH · wallet RPC/).waitFor();
  const retained = await page.evaluate(async () => {
    const request = indexedDB.open("pit-taxlot-v1");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction("events");
      const get = tx.objectStore("events").get("staging-origin-fixture");
      return await new Promise((resolve, reject) => {
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
      });
    } finally {
      db.close();
    }
  });
  if (JSON.stringify(retained) !== JSON.stringify(record))
    throw Error("IndexedDB fixture changed after reload");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export for Taxlot", exact: true })
    .click();
  const download = await downloadPromise;
  const chunks = [];
  for await (const chunk of await download.createReadStream())
    chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString("utf8");
  if (!csv.includes('"staging-origin-fixture"') || !csv.includes('"trade"'))
    throw Error("Taxlot CSV did not contain the stored fixture");
  if ((await page.evaluate(() => window.__pitSmokeSignatures)) !== 0)
    throw Error("Staging smoke caused a wallet signature");
  const otherHosts = requests.filter(
    ({ url }) =>
      ![
        staging.origin,
        "https://api.cow.fi",
        "https://api.hyperliquid-testnet.xyz",
      ].includes(new URL(url).origin),
  );
  if (otherHosts.length)
    throw Error("Unexpected outbound host in keyless staging smoke");
  const mainnet = await browser.newContext();
  const mainnetPage = await mainnet.newPage();
  await mainnetPage.route(/^https?:\/\//, (route) =>
    new URL(route.request().url()).origin === staging.origin
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  await mainnetPage.addInitScript((account) => {
    let connected = false;
    window.__pitSmokeSignatures = 0;
    window.ethereum = {
      isMetaMask: true,
      on: () => {},
      removeListener: () => {},
      request: async ({ method }) => {
        if (method === "eth_accounts") return connected ? [account] : [];
        if (method === "eth_requestAccounts") {
          connected = true;
          return [account];
        }
        if (method === "eth_chainId") return "0x1";
        if (method === "eth_getBalance") return "0x1";
        if (method.includes("sign") || method === "eth_sendTransaction") {
          window.__pitSmokeSignatures++;
          throw Error("Wallet signing forbidden in staging smoke");
        }
        throw Error(`Unsupported fixture RPC: ${method}`);
      },
    };
  }, fixture);
  await mainnetPage.goto(staging.origin);
  await mainnetPage
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await mainnetPage
    .getByRole("button", { name: /MetaMask|Injected|Browser Wallet/ })
    .first()
    .click();
  await mainnetPage.getByText(/ETH · wallet RPC/).waitFor();
  await mainnetPage
    .getByLabel("Sell token address")
    .fill("0x1111111111111111111111111111111111111111");
  await mainnetPage
    .getByLabel("Buy token address")
    .fill("0x2222222222222222222222222222222222222222");
  await mainnetPage.getByLabel("You sell").fill("1");
  await mainnetPage.waitForFunction(() =>
    document
      .querySelector('[data-testid="cow-preflight"]')
      ?.textContent?.includes("WRONG_CHAIN"),
  );
  if (
    await mainnetPage
      .getByRole("button", { name: "Sign & submit order" })
      .count()
  )
    throw Error("Mainnet displayed a signing control");
  if ((await mainnetPage.evaluate(() => window.__pitSmokeSignatures)) !== 0)
    throw Error("Mainnet fixture caused a wallet signature");
  await mainnet.close();
  console.log(
    JSON.stringify(
      {
        staging_origin: staging.origin,
        document_url: response.url(),
        http_status: response.status(),
        http_headers: headers,
        local_build_hash: local.hash,
        deployed_build_hash: remote.hash,
        wallet_ui: "fixture connected without signatures",
        fee_disclosure: "OFF",
        mainnet_preflight: "WRONG_CHAIN; no signing control or signature",
        indexeddb_fixture_retained: true,
        csv_fixture_exported: true,
        fixture_address: fixture,
        unexpected_outbound_hosts: otherHosts.length,
      },
      null,
      2,
    ),
  );
  await context.close();
  const negative = await browser.newContext();
  const negativePage = await negative.newPage();
  for (const url of [
    gateway.href,
    `${gateway.href}?pit_origin=${encodeURIComponent(staging.origin)}`,
  ]) {
    for (const reload of [false, true]) {
      const gatewayResponse = reload
        ? await negativePage.reload({ waitUntil: "domcontentloaded" })
        : await negativePage.goto(url, { waitUntil: "domcontentloaded" });
      if (!gatewayResponse?.ok())
        throw Error(`Shared gateway response unavailable: ${url}`);
      await negativePage
        .getByRole("heading", { name: "Swap tokens" })
        .waitFor();
      if (
        await negativePage
          .getByRole("button", { name: "Export for Taxlot", exact: true })
          .isEnabled()
      )
        throw Error(`Shared gateway enabled accounting export: ${url}`);
      if (
        !(await negativePage
          .getByRole("alert")
          .filter({ hasText: "Accounting storage" })
          .count())
      )
        throw Error(`Shared gateway did not show the storage warning: ${url}`);
      const databases = await negativePage.evaluate(() =>
        indexedDB.databases().then((items) => items.map((d) => d.name)),
      );
      if (databases.includes("pit-taxlot-v1"))
        throw Error(`Shared gateway opened PIT accounting: ${url}`);
    }
  }
  console.log(
    JSON.stringify(
      {
        shared_gateway_url: gateway.href,
        query_retest: "blocked",
        accounting_database: "absent",
        export: "disabled",
      },
      null,
      2,
    ),
  );
  await negative.close();
} finally {
  await browser.close();
}
