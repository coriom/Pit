import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  APPROVAL_COVERAGE,
  APPROVAL_SPENDERS,
  APPROVAL_TOKENS,
} from "../../src/lib/token-approvals";

const owner = "0x29d0B5939dcC4D0492D72ABd1210dEbd6c90cC96";
const rpcHost = "ethereum-sepolia-rpc.publicnode.com";
const word = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`;

function mockRpc(
  page: import("@playwright/test").Page,
  options: { wrongChain?: boolean; failAllowance?: boolean } = {},
) {
  const calls: string[] = [];
  const origins: string[] = [];
  page.route(/^https?:\/\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    origins.push(url.origin);
    if (url.hostname === "127.0.0.1") return route.continue();
    if (url.hostname !== rpcHost) return route.abort("blockedbyclient");
    const payload = request.postDataJSON();
    const method = payload.method as string;
    calls.push(method);
    if (/^eth_(?:send|sign)|^personal_|^wallet_/.test(method))
      return route.fulfill({
        status: 403,
        json: { error: "STATE_CHANGE_FORBIDDEN" },
      });
    if (method === "eth_chainId")
      return route.fulfill({
        json: {
          jsonrpc: "2.0",
          id: payload.id,
          result: options.wrongChain ? "0x1" : "0xaa36a7",
        },
      });
    if (method === "eth_getBlockByNumber")
      return route.fulfill({
        json: {
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            number: "0xb5e4aa",
            timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}`,
            hash: `0x${"1".repeat(64)}`,
            transactions: [],
          },
        },
      });
    if (method === "eth_getCode")
      return route.fulfill({
        json: { jsonrpc: "2.0", id: payload.id, result: "0x6000" },
      });
    if (method === "eth_call") {
      const call = payload.params[0];
      const selector = String(call.data).slice(0, 10).toLowerCase();
      const token = String(call.to).toLowerCase();
      const usdc = token === APPROVAL_TOKENS[0].address.toLowerCase();
      if (
        selector === "0xdd62ed3e" &&
        options.failAllowance &&
        usdc &&
        String(call.data)
          .toLowerCase()
          .endsWith(APPROVAL_SPENDERS[0].address.slice(2).toLowerCase())
      )
        return route.fulfill({
          status: 503,
          json: { error: "TEMPORARY_RPC_FAILURE" },
        });
      const result =
        selector === "0x313ce567"
          ? word(BigInt(usdc ? 6 : 18))
          : selector === "0x70a08231"
            ? word(usdc ? 270_299_154n : 0n)
            : selector === "0xdd62ed3e"
              ? word(
                  usdc &&
                    String(call.data)
                      .toLowerCase()
                      .endsWith(
                        APPROVAL_SPENDERS[0].address.slice(2).toLowerCase(),
                      )
                    ? 10_000_000n
                    : 0n,
                )
              : null;
      if (result === null)
        throw Error(`Unexpected read-only selector ${selector}`);
      return route.fulfill({
        json: { jsonrpc: "2.0", id: payload.id, result },
      });
    }
    throw Error(`Unexpected RPC method ${method}`);
  });
  return { calls, origins };
}

test("public address inspection shows exact allowance and downloads local JSON without wallet calls", async ({
  page,
}) => {
  const { calls, origins } = mockRpc(page);
  await page.addInitScript(() => {
    (window as any).__approvalWalletCalls = 0;
    (window as any).__approvalDbOpens = 0;
    (window as any).ethereum = {
      request: async () => {
        (window as any).__approvalWalletCalls++;
        throw Error("WALLET_REQUEST_FORBIDDEN");
      },
    };
    const originalOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<typeof indexedDB.open>) => {
      (window as any).__approvalDbOpens++;
      return originalOpen(...args);
    }) as typeof indexedDB.open;
  });
  await page.goto("/tools/token-approvals/");
  await expect(
    page.getByRole("heading", { name: "Token Approval Inspector" }),
  ).toBeVisible();
  await page.getByLabel("Public EVM address").fill(owner);
  await page.getByRole("button", { name: "Inspect approvals" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Four reviewed allowance pairs checked",
  );
  const result = page.getByTestId(
    "approval-circle-test-usdc-uniswap-router-02",
  );
  await expect(result).toContainText("NONZERO");
  await expect(result).toContainText("Raw allowance: 10000000");
  await expect(result).toContainText("Current balance: 270.299154 USDC");
  await expect(page.getByText(APPROVAL_COVERAGE)).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download local JSON report" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("pit-sepolia-token-approvals.json");
  const data = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(data).toMatchObject({
    chainId: 11155111,
    owner,
    coverage: APPROVAL_COVERAGE,
  });
  expect(data.rows).toHaveLength(4);
  expect(data.rows[0]).toMatchObject({
    state: "nonzero",
    rawAllowance: "10000000",
    readableAllowance: "10",
    rawBalance: "270299154",
    verifiedDecimals: 6,
  });
  expect(
    data.rows.slice(1).every((row: { state: string }) => row.state === "zero"),
  ).toBe(true);
  expect(calls.filter((method) => method === "eth_call")).toHaveLength(8);
  expect(
    calls.some((method) => /send|sign|personal_|wallet_/i.test(method)),
  ).toBe(false);
  expect(new Set(origins)).toEqual(
    new Set(["http://127.0.0.1:4398", `https://${rpcHost}`]),
  );
  expect(await page.evaluate(() => (window as any).__approvalWalletCalls)).toBe(
    0,
  );
  expect(await page.evaluate(() => (window as any).__approvalDbOpens)).toBe(0);
});

test("invalid address and wrong-chain RPC never show a false zero allowance", async ({
  page,
}) => {
  const { calls } = mockRpc(page, { wrongChain: true });
  await page.goto("/tools/token-approvals/");
  await page.getByLabel("Public EVM address").fill("invalid");
  await page.getByRole("button", { name: "Inspect approvals" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Enter a valid public EVM address",
  );
  expect(calls).toEqual([]);
  await page.getByLabel("Public EVM address").fill(owner);
  await page.getByRole("button", { name: "Inspect approvals" }).click();
  await expect(page.getByRole("status")).toContainText("wrong chain");
  await expect(page.getByTestId("approval-report")).toHaveCount(0);
  expect(calls).toEqual(["eth_chainId"]);
});

test("a failed allowance read remains unavailable while other rows remain usable", async ({
  page,
}) => {
  mockRpc(page, { failAllowance: true });
  await page.goto("/tools/token-approvals/");
  await page.getByLabel("Public EVM address").fill(owner);
  await page.getByRole("button", { name: "Inspect approvals" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Partial result: 1 of four",
  );
  await expect(
    page.getByTestId("approval-circle-test-usdc-uniswap-router-02"),
  ).toContainText("UNAVAILABLE · ALLOWANCE_UNAVAILABLE");
  await expect(
    page.getByTestId("approval-sepolia-weth-cow-relayer"),
  ).toContainText("ZERO");
});

test("keyboard-only address entry and narrow layout keep results and export usable", async ({
  page,
}) => {
  mockRpc(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tools/token-approvals/");
  await page.getByLabel("Public EVM address").focus();
  await page.keyboard.insertText(owner);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Inspect approvals" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("approval-report")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download local JSON report" }),
  ).toBeVisible();
  const overflowing = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflowing).toBe(false);
});
