import { test, expect } from "@playwright/test";
for (const chainId of [84532, 1, 8453, 42161, 999]) {
  test(`CoW UI refuses chain ${chainId} before any signature`, async ({
    page,
  }) => {
    await page.route(/^https?:\/\//, (route) =>
      new URL(route.request().url()).hostname === "127.0.0.1"
        ? route.continue()
        : route.abort(),
    );
    await page.addInitScript((chain) => {
      const address = "0x1111111111111111111111111111111111111111";
      let connected = false;
      (window as any).__signs = 0;
      (window as any).ethereum = {
        isMetaMask: true,
        on: () => {},
        removeListener: () => {},
        request: async ({ method }: any) => {
          if (method === "eth_accounts") return connected ? [address] : [];
          if (method === "eth_requestAccounts") {
            connected = true;
            return [address];
          }
          if (method === "eth_chainId") return "0x" + chain.toString(16);
          if (method === "eth_getBalance") return "0xde0b6b3a7640000";
          if (method.includes("sign") || method === "eth_sendTransaction") {
            (window as any).__signs++;
            throw Error("No signing in tests");
          }
          throw Error(method);
        },
      };
    }, chainId);
    await page.goto("/");
    await page
      .getByRole("button", { name: "Connect Wallet", exact: true })
      .click();
    await page
      .getByRole("button", { name: /MetaMask|Injected|Browser Wallet/ })
      .first()
      .click();
    await expect(page.getByText(/ETH · wallet RPC/)).toBeVisible();
    await page
      .getByLabel("Sell token address")
      .fill("0x1111111111111111111111111111111111111111");
    await page
      .getByLabel("Buy token address")
      .fill("0x2222222222222222222222222222222222222222");
    await page.getByLabel("You sell").fill("1");
    const quote = page.getByRole("button", { name: "Get quote", exact: true });
    // The Sepolia-only connector fails closed before a quote is requested.
    await expect(quote).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Sign & submit order" }),
    ).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__signs)).toBe(0);
  });
}
