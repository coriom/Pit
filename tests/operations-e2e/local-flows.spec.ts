import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createPublicClient, http, parseUnits } from "viem";
import { foundry } from "viem/chains";

const rpcUrl = "http://127.0.0.1:8545";
let anvil: ChildProcess;
let accounts: string[];
const rpc = async (method: string, params: unknown[] = []) => {
  const response = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const data = await response.json();
  if (data.error) throw Error(`Local Anvil error ${data.error.code}`);
  return data.result;
};
test.beforeAll(async () => {
  anvil = spawn("anvil", ["--host", "127.0.0.1", "--port", "8545", "--chain-id", "31337", "--accounts", "5", "--silent"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try { if (await rpc("eth_chainId") === "0x7a69") break; } catch { /* local startup */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  expect(await rpc("eth_chainId")).toBe("0x7a69");
  accounts = await rpc("eth_accounts");
});
test.afterAll(() => anvil?.kill("SIGTERM"));

test("four real local operations confirm receipts, state, and no remote requests", async ({ page }) => {
  test.setTimeout(120_000);
  const unexpected: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" || ![4414, 8545].includes(Number(url.port))) unexpected.push(request.url());
  });
  await page.addInitScript(() => {
    (window as any).ethereum = {
      request: async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
        const mapped = method === "eth_requestAccounts" ? "eth_accounts" : method;
        const response = await fetch("http://127.0.0.1:8545", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: mapped, params }) });
        const data = await response.json();
        if (data.error) throw Error(`Local RPC error ${data.error.code}`);
        return data.result;
      },
    };
  });
  const publicClient = createPublicClient({ chain: foundry, transport: http(rpcUrl) });
  const goto = async (id: string) => {
    const response = await page.goto(`/operations/${id}/`);
    expect(response?.status()).toBe(200);
    await page.getByRole("button", { name: "Connect local wallet" }).click();
    await expect(page.locator("#wallet-state")).toContainText("chain 31337");
  };
  const submit = async () => {
    await page.getByRole("button", { name: "Validate and review" }).click();
    await expect(page.locator("#lifecycle")).toHaveText("Ready to simulate");
    await page.getByRole("button", { name: "Simulate on Anvil" }).click();
    await expect(page.locator("#lifecycle")).toHaveText("Ready for local execution");
    await page.getByRole("button", { name: "Execute locally" }).click();
    await expect(page.locator("#lifecycle")).toContainText("Success · local receipts confirmed", { timeout: 30_000 });
  };
  await goto("token-creator");
  await page.getByLabel("Token name").fill("Browser Local");
  await page.getByLabel("Symbol").fill("BLOC");
  await page.getByLabel("Initial supply (18 decimals)").fill("1000");
  await page.getByLabel("Initial recipient").fill(accounts[0]);
  await submit();
  const standard = (await page.locator("#result").textContent())?.match(/Created token (0x[0-9a-fA-F]{40})/)?.[1];
  expect(standard).toBeTruthy();
  const balance = await publicClient.readContract({ address: standard as `0x${string}`, abi: [{ type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }], functionName: "balanceOf", args: [accounts[0] as `0x${string}`] });
  expect(balance).toBe(parseUnits("1000", 18));

  await goto("multisender");
  await page.getByLabel("Token contract address").fill(standard!);
  await page.getByLabel(/Recipients \(CSV/).fill(`address,amount\n${accounts[1]},10\n${accounts[2]},20`);
  await submit();
  await expect(page.locator("#result")).toContainText("Batch receipt");

  await goto("token-locker");
  await page.getByLabel("Token contract address").fill(standard!);
  await page.getByLabel("Amount in token units").fill("25");
  await page.getByLabel("Beneficiary address").fill(accounts[0]);
  const unlock = new Date(Date.now() + 10 * 60_000).toISOString().slice(0, 16);
  await page.getByLabel("Unlock date and time (UTC)").fill(unlock);
  await submit();
  const lock = (await page.locator("#result").textContent())?.match(/Helper (0x[0-9a-fA-F]{40})/)?.[1];
  expect(lock).toBeTruthy();
  await page.getByLabel("Deployed schedule address").fill(lock!);
  await page.getByRole("button", { name: "Simulate and release locally" }).click();
  await expect(page.locator("#lifecycle")).toContainText("Release unavailable or failed");
  await rpc("evm_setNextBlockTimestamp", [Math.floor(Date.parse(`${unlock}:00Z`) / 1000)]);
  await rpc("evm_mine");
  await page.getByRole("button", { name: "Simulate and release locally" }).click();
  await expect(page.locator("#lifecycle")).toContainText("Success · local release confirmed");

  await goto("token-vesting");
  await page.getByLabel("Token contract address").fill(standard!);
  await page.getByLabel("Amount in token units").fill("100");
  await page.getByLabel("Beneficiary address").fill(accounts[0]);
  const start = new Date(Date.now() + 30 * 60_000).toISOString().slice(0, 16);
  await page.getByLabel("Start date and time (UTC)").fill(start);
  await page.getByLabel("Duration in whole days").fill("1");
  await submit();
  const vest = (await page.locator("#result").textContent())?.match(/Helper (0x[0-9a-fA-F]{40})/)?.[1];
  expect(vest).toBeTruthy();
  await rpc("evm_setNextBlockTimestamp", [Math.floor(Date.parse(`${start}:00Z`) / 1000) + 86400]);
  await rpc("evm_mine");
  await page.getByLabel("Deployed schedule address").fill(vest!);
  await page.getByRole("button", { name: "Simulate and release locally" }).click();
  await expect(page.locator("#lifecycle")).toContainText("Success · local release confirmed");
  expect(unexpected).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
});

test("advanced preset and invalid states stay explicit on mobile", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => { if (!request.url().startsWith("http://127.0.0.1:")) requests.push(request.url()); });
  await page.addInitScript(() => {
    (window as any).ethereum = { request: async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
      const response = await fetch("http://127.0.0.1:8545", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method === "eth_requestAccounts" ? "eth_accounts" : method, params }) });
      const data = await response.json(); if (data.error) throw Error(`Local RPC error ${data.error.code}`); return data.result;
    }};
  });
  await page.goto("/operations/token-creator/");
  await page.getByRole("button", { name: "Connect local wallet" }).click();
  await page.getByLabel("Preset").selectOption("advanced");
  await page.getByLabel("Token name").fill("Advanced Browser");
  await page.getByLabel("Symbol").fill("ABR");
  await page.getByLabel("Initial supply (18 decimals)").fill("100");
  await page.getByLabel("Advanced cap (18 decimals)").fill("50");
  await page.getByLabel("Initial recipient").fill(accounts[0]);
  await page.getByRole("button", { name: "Validate and review" }).click();
  await expect(page.locator("#lifecycle")).toHaveText("Invalid input");
  await page.getByLabel("Advanced cap (18 decimals)").fill("150");
  await page.getByLabel("Creator may mint up to cap").check();
  await page.getByLabel("Creator may pause all transfers").check();
  await page.getByRole("button", { name: "Validate and review" }).click();
  await expect(page.locator("#result")).toContainText("mint enabled");
  await page.getByRole("button", { name: "Simulate on Anvil" }).click();
  await page.getByRole("button", { name: "Execute locally" }).click();
  await expect(page.locator("#lifecycle")).toContainText("Success · local receipts confirmed");
  await page.evaluate((otherAccount) => {
    const provider = (window as any).ethereum;
    const originalRequest = provider.request.bind(provider);
    provider.request = (request: { method: string; params?: unknown[] }) =>
      request.method === "eth_accounts" ? [otherAccount] : originalRequest(request);
  }, accounts[1]);
  await page.getByRole("button", { name: "Validate and review" }).click();
  await expect(page.locator("#lifecycle")).toHaveText("Invalid input");
  await expect(page.locator("#result")).toContainText("Wallet account changed");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  await page.goto("/operations/multisender/");
  await page.getByRole("button", { name: "Connect local wallet" }).click();
  await page.getByLabel("Token contract address").fill(accounts[0]);
  await page.getByLabel(/Recipients \(CSV/).fill(`${accounts[1]},1\n${accounts[1]},2`);
  await page.getByRole("button", { name: "Validate and review" }).click();
  await expect(page.locator("#lifecycle")).toHaveText("Invalid input");
  expect(requests).toEqual([]);
});

test("wrong network and wallet rejection cannot produce a success receipt", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).ethereum = { request: async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
      const response = await fetch("http://127.0.0.1:8545", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method === "eth_requestAccounts" ? "eth_accounts" : method, params }) });
      const data = await response.json(); if (data.error) throw Error(`Local RPC error ${data.error.code}`); return data.result;
    }};
  });
  await page.goto("/operations/token-creator/");
  await page.getByRole("button", { name: "Connect local wallet" }).click();
  await page.getByLabel("Token name").fill("Rejected Local");
  await page.getByLabel("Symbol").fill("RJL");
  await page.getByLabel("Initial supply (18 decimals)").fill("10");
  await page.getByLabel("Initial recipient").fill(accounts[0]);
  await page.evaluate(() => {
    const provider = (window as any).ethereum;
    provider.originalRequest = provider.request.bind(provider);
    provider.request = (request: { method: string; params?: unknown[] }) => request.method === "eth_chainId" ? "0x2105" : provider.originalRequest(request);
  });
  await page.getByRole("button", { name: "Validate and review" }).click();
  await expect(page.locator("#lifecycle")).toHaveText("Invalid input");
  await expect(page.locator("#result")).toContainText("Wrong network");
  await page.evaluate(() => { const provider = (window as any).ethereum; provider.request = provider.originalRequest; });
  await page.getByRole("button", { name: "Validate and review" }).click();
  await page.getByRole("button", { name: "Simulate on Anvil" }).click();
  await expect(page.locator("#lifecycle")).toHaveText("Ready for local execution");
  await page.evaluate(() => {
    const provider = (window as any).ethereum;
    const originalRequest = provider.request.bind(provider);
    provider.request = (request: { method: string; params?: unknown[] }) => request.method === "eth_sendTransaction" ? Promise.reject(Error("User rejected local transaction")) : originalRequest(request);
  });
  await page.getByRole("button", { name: "Execute locally" }).click();
  await expect(page.locator("#lifecycle")).toContainText("Failed or reverted");
  await expect(page.locator("#result")).toContainText("User rejected local transaction");
  await expect(page.getByRole("button", { name: "Execute locally" })).toBeDisabled();
});
