// Operator-driven observer. No keys, wallet clicks, automatic signatures or retries.
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
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
const config = await readFile("src/lib/config.ts", "utf8");
if (
  !config.includes("FEES_ENABLED: false") ||
  !config.includes("MAINNET_ENABLED: false")
)
  throw Error("Fee/network preflight failed");
for (const name of [
  "PIT_TEST_ACCOUNT",
  "PIT_SEPOLIA_SELL_TOKEN",
  "PIT_SEPOLIA_BUY_TOKEN",
])
  if (!/^0x[\da-f]{40}$/i.test(process.env[name]))
    throw Error(`Invalid public address: ${name}`);
function localURL(value, protocols) {
  const u = new URL(value);
  if (
    !protocols.includes(u.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw Error("Only credential-free loopback browser/dev URLs are accepted");
  return u.href;
}
const cdp = localURL(process.env.PIT_LIVE_CDP_URL, [
  "http:",
  "https:",
  "ws:",
  "wss:",
]);
const dev = localURL(process.env.PIT_DEV_URL ?? "http://127.0.0.1:4397/", [
  "http:",
]);
if (new URL(dev).pathname !== "/")
  throw Error("Use the dedicated local PIT root");
const dir = "docs/audit/phase-h/live";
await mkdir(dir, { recursive: true });
const evidence = {
  status: "PREPARED_NOT_EXECUTED",
  account: process.env.PIT_TEST_ACCOUNT,
  chainId: 11155111,
  hyperliquidNetwork: "testnet",
  feesEnabled: false,
  startedAt: new Date().toISOString(),
  cow: [],
  hyperliquid: [],
  blockedRequests: [],
};
const path = `${dir}/session.json`;
await writeFile(path, JSON.stringify(evidence, null, 2), { flag: "wx" }); // Do not overwrite/replay an existing acceptance session.
let saving = Promise.resolve();
function save() {
  saving = saving.then(() =>
    writeFile(path, JSON.stringify(evidence, null, 2)),
  );
  return saving;
}
const browser = await chromium.connectOverCDP(cdp);
const page = await browser.contexts()[0].newPage();
let cowCount = 0,
  hlCount = 0;
const responses = new Set();
await page.route("**/*", async (route) => {
  const req = route.request(),
    u = new URL(req.url());
  if (req.method() !== "POST") return route.continue();
  const cow =
    u.origin === "https://api.cow.fi" &&
    u.pathname === "/sepolia/api/v1/orders";
  const hl =
    u.origin === "https://api.hyperliquid-testnet.xyz" &&
    u.pathname === "/exchange";
  if (!cow && !hl) {
    if (
      (u.hostname.endsWith("cow.fi") && !u.pathname.startsWith("/sepolia/")) ||
      u.hostname === "api.hyperliquid.xyz"
    )
      return route.abort("blockedbyclient");
    return route.continue();
  }
  try {
    const body = req.postDataJSON();
    const accounts = await page.evaluate(() =>
      window.ethereum.request({ method: "eth_accounts" }),
    );
    if (accounts[0]?.toLowerCase() !== evidence.account.toLowerCase())
      throw Error("Account changed");
    if (cow) {
      if (cowCount)
        throw Error(
          "Exactly one CoW order allowed; reconcile existing session before retrying",
        );
      const chain = await page.evaluate(() =>
        window.ethereum.request({ method: "eth_chainId" }),
      );
      if (Number(chain) !== 11155111) throw Error("Wallet is not on Sepolia");
      const appData =
        typeof body.appData === "string"
          ? JSON.parse(body.appData)
          : body.appData;
      if (!appData || appData.metadata?.partnerFee !== undefined)
        throw Error("Disabled fee invariant: partnerFee must be absent");
      cowCount++;
      const order = Object.fromEntries(
        [
          "from",
          "sellToken",
          "buyToken",
          "sellAmount",
          "buyAmount",
          "kind",
          "validTo",
          "feeAmount",
          "appData",
          "appDataHash",
        ]
          .filter((k) => k in body)
          .map((k) => [k, body[k]]),
      );
      evidence.cow.push({
        submittedAt: new Date().toISOString(),
        endpoint: req.url(),
        chainId: Number(chain),
        order,
        partnerFeePresent: false,
        status: "SUBMISSION_OBSERVED_NOT_SETTLED",
      });
    } else {
      if (body.action?.type !== "order")
        throw Error(
          "Only the single testnet order is allowed by this acceptance observer",
        );
      if (hlCount)
        throw Error(
          "Additional order blocked; any reduce-only cleanup requires separately inspected operator action",
        );
      if (body.action.builder !== undefined)
        throw Error("Disabled fee invariant: builder must be absent");
      if (body.action.orders?.length !== 1)
        throw Error("Exactly one order leg required");
      hlCount++;
      evidence.hyperliquid.push({
        submittedAt: new Date().toISOString(),
        endpoint: req.url(),
        action: body.action,
        builderPresent: false,
        status: "SUBMISSION_OBSERVED_NOT_FILLED",
      });
    }
    evidence.status = "SUBMISSION_OBSERVED_ACCEPTANCE_UNVERIFIED";
    await save();
    await route.continue();
  } catch (error) {
    evidence.blockedRequests.push({
      timestamp: new Date().toISOString(),
      reason: String(error),
    });
    await save();
    await route.abort("blockedbyclient");
  }
});
page.on("response", (response) => {
  const req = response.request(),
    u = new URL(response.url());
  if (req.method() !== "POST") return;
  const target =
    u.origin === "https://api.cow.fi" && u.pathname === "/sepolia/api/v1/orders"
      ? evidence.cow
      : u.origin === "https://api.hyperliquid-testnet.xyz" &&
          u.pathname === "/exchange"
        ? evidence.hyperliquid
        : null;
  if (!target?.length) return;
  const work = (async () => {
    target[target.length - 1].response = {
      status: response.status(),
      body: await response.json(),
    };
    await save();
  })();
  responses.add(work);
  work.finally(() => responses.delete(work)).catch(() => {});
});
await page.goto(dev);
console.log(
  "Operator: connect your external testnet wallet. Inspect account, Sepolia chain, token contracts, amount, complete quote and zero PIT fees before every signature.",
);
console.log(
  "No buttons will be clicked by this observer. Manually perform only one CoW swap and one minimal Hyperliquid testnet order. Do not resubmit on timeout.",
);
console.log(
  "Prefer reducing an existing testnet position. If opening exposure is necessary, plan a separately approved reduce-only close; this observer blocks extra orders.",
);
console.log(
  "Inspect quote expiry after token approval; obtain a fresh quote if needed. Verify final settlement/fill, not merely submission.",
);
const input = createInterface({ input: process.stdin, output: process.stdout });
await input.question(
  "After manual execution/verification, or to stop without execution, press Enter to capture the page and accounting snapshot: ",
);
input.close();
await Promise.allSettled([...responses]);
await page.screenshot({ path: `${dir}/operator-page.png`, fullPage: true });
const snapshot = await page.evaluate(async (account) => {
  const names = (await indexedDB.databases()).map((db) => db.name);
  async function all(name, store) {
    if (!names.includes(name)) return [];
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(name);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const req = db.transaction(store).objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }
  const mine = (e) =>
    (e.account ?? e.payload?.owner)?.toLowerCase() === account;
  return {
    databaseExists: names.includes("pit-taxlot-v1"),
    events: (await all("pit-taxlot-v1", "events")).filter(mine),
    raw: (await all("pit-taxlot-v1", "raw")).filter(mine),
    derivativeEvidence: (
      await all("pit-derivative-evidence-v1", "observations")
    ).filter(mine),
  };
}, evidence.account.toLowerCase());
// Snapshot is public trade data, not wallet data; keep it local until reviewed for publication.
await writeFile(
  `${dir}/accounting-snapshot.json`,
  JSON.stringify(snapshot, null, 2),
);
evidence.finishedAt = new Date().toISOString();
await save();
console.log(
  "Evidence saved locally. Acceptance remains UNVERIFIED until public API/on-chain settlement, schema validation, CSV reconciliation and final positions are reviewed.",
);
await page.close();
await browser.close();
