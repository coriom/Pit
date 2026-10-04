import { expect, test } from "@playwright/test";

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
