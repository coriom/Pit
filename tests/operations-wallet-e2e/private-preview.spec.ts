import { expect, test } from "@playwright/test";

const signer = "0xCb8c794c7B33FeC20C30D970725933bE1fc656C6";
test("wallet preview stays localhost only, has four routes, and excludes unrelated surfaces", async ({ page }) => {
  const remote: string[] = [];
  page.on("request", (request) => { if (!request.url().startsWith("http://127.0.0.1:4416/")) remote.push(request.url()); });
  for (const route of ["token-creator", "multisender", "token-locker", "token-vesting"]) {
    const response = await page.goto(`/operations/${route}/`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("main .eyebrow")).toContainText("Base Sepolia private wallet test");
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm in wallet" })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  }
  expect((await page.goto("/operations/swap/"))?.status()).toBe(404);
  expect(remote).toEqual([]);
});

test("explicit provider selection, wrong chain, and account changes fail closed", async ({ page }) => {
  await page.route("https://sepolia.base.org/", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result: body.method === "eth_chainId" ? "0x14a34" : "0x" }) });
  });
  await page.addInitScript((address) => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const make = (chain: string) => ({
      request: async ({ method }: { method: string }) => method === "eth_chainId" ? chain : method === "eth_accounts" || method === "eth_requestAccounts" ? [address] : null,
      on: (event: string, callback: (...args: unknown[]) => void) => { (listeners[event] ??= []).push(callback); },
      emit: (event: string) => { for (const callback of listeners[event] ?? []) callback(); },
    });
    const first = make("0x1"), second = make("0x14a34");
    (window as any).pitTestWallets = { first, second };
    window.addEventListener("eip6963:requestProvider", () => {
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { name: "Wrong Chain" }, provider: first } }));
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { name: "Base Sepolia Test" }, provider: second } }));
    });
  }, signer);
  await page.goto("/operations/token-creator/");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.locator("#lifecycle")).toHaveText("Connection failed");
  await page.getByLabel("Provider").selectOption({ label: "Wrong Chain" });
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.locator("#result")).toContainText("Wrong network");
  await page.getByLabel("Provider").selectOption({ label: "Base Sepolia Test" });
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.locator("#wallet-state")).toContainText("Base Sepolia 84532");
  await expect(page.locator("#result")).toContainText("signing is disabled");
  await page.getByLabel("Token name").fill("Local Test");
  await page.getByLabel("Symbol").fill("LCL");
  await page.getByLabel("Initial supply (18 decimals)").fill("10");
  await page.getByLabel("Initial recipient").fill(signer);
  await page.getByRole("button", { name: "Validate and review" }).click();
  await expect(page.locator("#lifecycle")).toHaveText("Ready to simulate");
  await expect(page.getByRole("button", { name: "Confirm in wallet" })).toBeDisabled();
  await page.evaluate(() => (window as any).pitTestWallets.second.emit("accountsChanged"));
  await expect(page.locator("#lifecycle")).toHaveText("Connection changed");
  await expect(page.getByRole("button", { name: "Simulate next step" })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("button", { name: "Confirm in wallet" })).toBeDisabled();
});

test("no injected wallet and keyboard navigation remain usable", async ({ page }) => {
  await page.goto("/operations/multisender/");
  await expect(page.getByLabel("Provider")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip")).toBeFocused();
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.locator("#lifecycle")).toHaveText("Connection failed");
  await expect(page.getByRole("button", { name: "Confirm in wallet" })).toBeDisabled();
});
