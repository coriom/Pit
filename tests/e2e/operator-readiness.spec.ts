import { expect, test } from "@playwright/test";

test("local public-address observer is available without connecting a wallet", async ({
  page,
}) => {
  const walletActions: string[] = [];
  await page.addInitScript(() => {
    (window as any).ethereum = {
      isMetaMask: true,
      on: () => {},
      removeListener: () => {},
      request: async ({ method }: { method: string }) => {
        if (method === "eth_accounts") return [];
        if (method === "eth_chainId") return "0xaa36a7";
        (window as any).__observerWalletActions ??= [];
        (window as any).__observerWalletActions.push(method);
        throw Error(method);
      },
    };
  });
  page.on("request", (request) => {
    if (
      /\/api\/v1\/orders|eth_sendTransaction|eth_sendRawTransaction/.test(
        request.url(),
      )
    )
      walletActions.push(request.url());
  });
  await page.goto("/tools/swap/");
  const observer = page.getByTestId("operator-observer");
  await expect(observer).toContainText(
    "No wallet connection, approval, signature or order is requested.",
  );
  const run = observer.getByRole("button", { name: "Observe public address" });
  await expect(run).toBeDisabled();
  await observer.getByLabel("Public EVM address").fill("invalid-address");
  await expect(run).toBeDisabled();
  expect(walletActions).toEqual([]);
  expect(
    await page.evaluate(() => (window as any).__observerWalletActions ?? []),
  ).toEqual([]);
});

test("disconnected dry-run rehearses both checkpoints without wallet or exchange actions", async ({
  page,
}) => {
  const unsafe: string[] = [];
  await page.addInitScript(() => {
    (window as any).__walletActions = [];
    (window as any).ethereum = {
      isMetaMask: true,
      on: () => {},
      removeListener: () => {},
      request: async ({ method }: { method: string }) => {
        if (
          /eth_requestAccounts|sign|eth_sendTransaction|eth_sendRawTransaction/i.test(
            method,
          )
        )
          (window as any).__walletActions.push(method);
        if (method === "eth_accounts") return [];
        if (method === "eth_chainId") return "0xaa36a7";
        throw Error(method);
      },
    };
  });
  page.on("request", (request) => {
    if (
      /\/exchange|\/api\/v1\/orders|eth_sendTransaction|eth_sendRawTransaction/.test(
        request.url(),
      )
    )
      unsafe.push(request.url());
  });
  await page.route("https://api.hyperliquid-testnet.xyz/info", (route) =>
    route.fulfill({ json: { universe: [{ name: "ETH", szDecimals: 4 }] } }),
  );
  await page.goto("/tools/swap/");
  await expect(page.getByTestId("cow-readiness-wallet")).toContainText("FAIL");
  await expect(page.getByTestId("cow-readiness-quote")).toContainText("FAIL");
  await page.getByLabel(/Dry run only · rehearse checkpoints/).check();
  await page
    .getByRole("button", { name: "Preview token approval · dry run" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "token approval checkpoint" }),
  ).toContainText("PIT fee:");
  await expect(
    page.getByRole("button", { name: "Advance dry run" }),
  ).toBeDisabled();
  await page.getByLabel(/I reviewed the network/).check();
  await page.getByRole("button", { name: "Advance dry run" }).click();
  await expect(page.getByTestId("cow-dry-run-stage")).toContainText("order");
  await page
    .getByRole("button", {
      name: "Preview order signature and submission · dry run",
    })
    .click();
  await page.getByLabel(/I reviewed the network/).check();
  await page.getByRole("button", { name: "Advance dry run" }).click();
  await expect(page.getByTestId("cow-dry-run-stage")).toContainText("done");
  expect(await page.evaluate(() => (window as any).__walletActions)).toEqual(
    [],
  );

  await page.goto("/tools/perps/");
  await expect(page.getByTestId("hyperliquid-readiness-account")).toContainText(
    "FAIL",
  );
  await expect(
    page.getByTestId("hyperliquid-readiness-accounting"),
  ).toContainText("unsupported_derivative_v1");
  await page.getByLabel(/Dry run only · rehearse the order checkpoint/).check();
  await page
    .getByRole("button", { name: "Preview testnet limit order · dry run" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "testnet limit order checkpoint" }),
  ).toContainText("PIT builder fee: 0%");
  await expect(
    page.getByRole("button", { name: "Advance dry run" }),
  ).toBeDisabled();
  await page.getByLabel(/I reviewed the network/).check();
  await page.getByRole("button", { name: "Advance dry run" }).click();
  await expect(page.getByTestId("hl-dry-run-stage")).toContainText(
    "preview complete",
  );
  expect(await page.evaluate(() => (window as any).__walletActions)).toEqual(
    [],
  );
  expect(unsafe).toEqual([]);
  expect(
    await page.evaluate(async () =>
      (await indexedDB.databases())
        .map((db) => db.name)
        .filter((name) => name?.startsWith("pit-")),
    ),
  ).toEqual([]);
});

test("acceptance evidence view is local, testnet-labelled, and dry run makes no evidence session", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (
      /\/exchange|\/api\/v1\/orders|eth_sendTransaction|eth_sendRawTransaction/.test(
        request.url(),
      )
    )
      requests.push(request.url());
  });
  await page.goto("/tools/swap/");
  await expect(page.getByTestId("acceptance-evidence")).toContainText(
    "Evidence capture does not mean live acceptance has passed.",
  );
  await expect(page.getByTestId("acceptance-evidence")).toContainText(
    "Connect an external testnet wallet",
  );
  await page.getByLabel(/Dry run only · rehearse checkpoints/).check();
  await page
    .getByRole("button", { name: "Preview token approval · dry run" })
    .click();
  await page.getByLabel(/I reviewed the network/).check();
  await page.getByRole("button", { name: "Advance dry run" }).click();
  expect(
    await page.evaluate(async () =>
      (await indexedDB.databases())
        .map((db) => db.name)
        .filter((name) => name?.includes("acceptance")),
    ),
  ).toEqual([]);
  expect(requests).toEqual([]);
});

test("connected testnet operator can start and export a local evidence session without signing", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).__actions = [];
    let connected = false;
    const account = "0x1111111111111111111111111111111111111111";
    (window as any).ethereum = {
      isMetaMask: true,
      on: () => {},
      removeListener: () => {},
      request: async ({ method }: { method: string }) => {
        if (method === "eth_accounts") return connected ? [account] : [];
        if (method === "eth_requestAccounts") {
          connected = true;
          return [account];
        }
        if (method === "eth_chainId") return "0xaa36a7";
        if (method === "eth_getBalance") return "0x0";
        if (/sign|send|approve|order/i.test(method))
          (window as any).__actions.push(method);
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
  await page.goto("/tools/swap/");
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Injected|Browser Wallet/ })
    .first()
    .click();
  const panel = page.getByTestId("acceptance-evidence");
  await expect(panel).toContainText(
    "0x1111111111111111111111111111111111111111",
  );
  await panel
    .getByRole("button", { name: "Start local acceptance session" })
    .click();
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Export evidence JSON" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^pit-acceptance-[0-9a-f-]+\.json$/);
  expect(
    await page.evaluate(async () =>
      (await indexedDB.databases()).map((db) => db.name),
    ),
  ).toContain("pit-acceptance-evidence-v1");
  expect(await page.evaluate(() => (window as any).__actions)).toEqual([]);
});
