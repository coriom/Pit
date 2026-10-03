import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

test("CoW quote failure leaves the read-only Uniswap quote visible and signing gated", async ({
  page,
}) => {
  const records: {
    origin: string;
    method: string;
    rpcMethod: string;
    headerNames: string[];
  }[] = [];
  let signingCalls = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname === "127.0.0.1") return;
    const body = request.postData() || "";
    expect(url.username || url.password).toBe("");
    expect(
      [...url.searchParams.keys()].some((name) =>
        /key|token|secret|credential|project/i.test(name),
      ),
    ).toBe(false);
    expect(/api[_-]?key|private[_-]?key|bearer\s+[a-z0-9]/i.test(body)).toBe(
      false,
    );
    const headerNames = Object.keys(request.headers()).sort();
    expect(
      headerNames.some((name) =>
        /authorization|x-api-key|proxy-authorization|cookie/i.test(name),
      ),
    ).toBe(false);
    let rpcMethod = "";
    try {
      rpcMethod = JSON.parse(body).method || "";
    } catch {
      /* non-RPC request */
    }
    records.push({
      origin: url.origin,
      method: request.method(),
      rpcMethod,
      headerNames,
    });
  });
  await page.addInitScript(() => {
    let authorized = false;
    const address = "0x1111111111111111111111111111111111111111";
    (window as any).ethereum = {
      isMetaMask: true,
      on: () => {},
      removeListener: () => {},
      request: async ({ method }: { method: string }) => {
        if (method === "eth_accounts") return authorized ? [address] : [];
        if (method === "eth_requestAccounts") {
          authorized = true;
          return [address];
        }
        if (method === "eth_chainId") return "0xaa36a7";
        if (method === "eth_getBalance") return "0xde0b6b3a7640000";
        if (method === "eth_getCode")
          throw Error("CoW wallet-provider read failed");
        if (method.includes("sign") || method === "eth_sendTransaction") {
          (window as any).__signingCalls =
            ((window as any).__signingCalls || 0) + 1;
          throw Error("Signing forbidden in quote-only fixture");
        }
        throw Error(`Unsupported fixture RPC ${method}`);
      },
    };
    (window as any).__signingCalls = 0;
  });
  await page.route(/^https?:\/\//, (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  await page.route("https://api.cow.fi/**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("https://api.hyperliquid-testnet.xyz/info", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route(
    "https://ethereum-sepolia-rpc.publicnode.com/**",
    async (route) => {
      const payload = JSON.parse(route.request().postData() || "{}");
      const method = payload.method;
      let result: string;
      if (method === "eth_chainId") result = "0xaa36a7";
      else if (method === "eth_getCode") result = "0x6000";
      else if (method === "eth_call") {
        const call = payload.params[0];
        if (call.data?.startsWith("0x313ce567"))
          result = `0x${BigInt(
            call.to.toLowerCase() ===
              "0x1111111111111111111111111111111111111111"
              ? 18
              : 6,
          )
            .toString(16)
            .padStart(64, "0")}`;
        else
          result = `0x${[2000000n, 1n, 0n, 100000n].map((value) => value.toString(16).padStart(64, "0")).join("")}`;
      } else throw Error(`Unexpected public RPC ${method}`);
      await route.fulfill({ json: { jsonrpc: "2.0", id: payload.id, result } });
    },
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Injected|Browser Wallet/ })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Get quote", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Sell token address")
    .fill("0x1111111111111111111111111111111111111111");
  await page
    .getByLabel("Buy token address")
    .fill("0x2222222222222222222222222222222222222222");
  await page.getByLabel("You sell").fill("1");
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  await expect(page.getByTestId("quote-cow")).toContainText("unavailable");
  await expect(page.getByTestId("quote-uniswap-v3")).toContainText(
    "Quoted output: 2 buy token",
  );
  await expect(page.getByTestId("quote-uniswap-v3")).toContainText(
    "Quote-only: PIT cannot execute this Uniswap quote.",
  );
  await expect(page.getByTestId("quote-ranking")).toContainText(
    "Only one fresh quote",
  );
  await expect(
    page.getByRole("button", { name: "Sign & submit order" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Approve exact sell amount" }),
  ).toHaveCount(0);
  signingCalls = await page.evaluate(() => (window as any).__signingCalls);
  expect(signingCalls).toBe(0);
  expect([...new Set(records.map((record) => record.origin))].sort()).toEqual([
    "https://api.cow.fi",
    "https://api.hyperliquid-testnet.xyz",
    "https://ethereum-sepolia-rpc.publicnode.com",
  ]);
  expect(records.some((record) => record.rpcMethod === "eth_call")).toBe(true);
  const credentialHeaders = [
    ...new Set(
      records
        .flatMap((record) => record.headerNames)
        .filter((name) =>
          /authorization|x-api-key|proxy-authorization|cookie/i.test(name),
        ),
    ),
  ];
  expect(credentialHeaders).toEqual([]);
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/quote-runtime.json",
    JSON.stringify(
      {
        fixture: "keyless synthetic wallet; external HTTP fulfilled or aborted",
        origins: [...new Set(records.map((record) => record.origin))].sort(),
        rpcMethods: [
          ...new Set(records.map((record) => record.rpcMethod).filter(Boolean)),
        ].sort(),
        credentialHeaders,
        signingCalls,
      },
      null,
      2,
    ) + "\n",
  );
});
