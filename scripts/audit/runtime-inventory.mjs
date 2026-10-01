import { chromium } from "@playwright/test";

const base = process.env.PIT_LOCAL_PREVIEW || "http://127.0.0.1:4398";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))
  throw Error("Local preview only");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  let phase = "first load";
  const requests = [];
  const violations = [];
  page.on("request", (request) =>
    requests.push({ phase, type: request.resourceType(), url: request.url() }),
  );
  await page.addInitScript(() => {
    window.__pitCspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      window.__pitCspViolations.push({
        directive: event.violatedDirective,
        blocked: event.blockedURI,
      }),
    );
  });
  await page.route(/^https?:\/\//, (route) =>
    new URL(route.request().url()).origin === base
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  await page.addInitScript(() => {
    let authorized = false;
    const address = "0x1111111111111111111111111111111111111111";
    window.ethereum = {
      isMetaMask: true,
      on: () => {},
      removeListener: () => {},
      request: async ({ method }) => {
        if (method === "eth_accounts") return authorized ? [address] : [];
        if (method === "eth_requestAccounts") {
          authorized = true;
          return [address];
        }
        if (method === "eth_chainId") return "0xaa36a7";
        if (method === "eth_getBalance") return "0xde0b6b3a7640000";
        throw Error(`Mock provider rejected ${method}`);
      },
    };
  });
  await page.goto(base);
  await page.getByRole("heading", { name: "Swap tokens" }).waitFor();
  phase = "wallet dialog";
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByText("Connect your wallet", { exact: false })
    .first()
    .waitFor();
  phase = "connected wallet";
  await page
    .getByRole("button", { name: /MetaMask|Injected|Browser Wallet/ })
    .first()
    .click();
  await page.getByText("1 ETH · wallet RPC").waitFor();
  phase = "perps info";
  await page.getByRole("button", { name: "Perpetuals", exact: true }).click();
  await page.waitForTimeout(500);
  const unique = [
    ...new Map(requests.map((r) => [JSON.stringify(r), r])).values(),
  ];
  const externalOrigins = [
    ...new Set(
      unique
        .map((r) => new URL(r.url).origin)
        .filter((origin) => origin !== base),
    ),
  ].sort();
  const expected = [
    "https://api.cow.fi",
    "https://api.hyperliquid-testnet.xyz",
  ];
  if (JSON.stringify(externalOrigins) !== JSON.stringify(expected))
    throw Error(
      `Unexpected external request origins: ${externalOrigins.join(", ")}`,
    );
  const runtime = await page.evaluate(() => ({
    inlineStyles: document.querySelectorAll("style").length,
    styleKinds: [...document.querySelectorAll("style")].map((style) => ({
      styledComponents: style.hasAttribute("data-styled"),
      astro: style.hasAttribute("data-astro-cid"),
      length: style.textContent.length,
    })),
    violations: window.__pitCspViolations,
  }));
  if (runtime.violations.length)
    throw Error(
      `Unexpected CSP violations: ${JSON.stringify(runtime.violations)}`,
    );
  console.log(
    JSON.stringify(
      {
        origin: new URL(base).origin,
        requests: unique,
        externalOrigins,
        ...runtime,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
