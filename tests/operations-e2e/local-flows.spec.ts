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
  await expect(page.locator("#advanced-settings")).toBeHidden();
  await expect(page.getByLabel("Advanced cap (18 decimals)")).toBeDisabled();
  await page.getByLabel("Preset").selectOption("advanced");
  await expect(page.locator("#advanced-settings")).toBeVisible();
  await page.getByLabel("Token name").fill("Advanced Browser");
  await page.getByLabel("Symbol").fill("ABR");
  await page.getByLabel("Initial supply (18 decimals)").fill("100");
  await page.getByLabel("Advanced cap (18 decimals)").fill("50");
  await page.getByLabel("Initial recipient").fill(accounts[0]);
  await page.getByRole("button", { name: "Validate and review" }).click();
  await expect(page.locator("#lifecycle")).toHaveText("Invalid input");
  await page.getByLabel("Advanced cap (18 decimals)").fill("150");
  await page.getByLabel(/Mint up to cap/).check();
  await page.getByLabel(/Pause transfers/).check();
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

test("four local paid browser workflows use exact mock USDC, real receipts and state readback", async ({ page }) => {
  test.setTimeout(180_000);
  const unexpected: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" || ![4414, 8545].includes(Number(url.port))) unexpected.push(request.url());
  });
  await page.addInitScript(() => {
    (window as any).ethereum = { request: async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
      const response = await fetch("http://127.0.0.1:8545", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method === "eth_requestAccounts" ? "eth_accounts" : method, params }) });
      const data = await response.json(); if (data.error) throw Error(`Local Anvil error ${data.error.code}`); return data.result;
    }};
  });
  const client = createPublicClient({ chain: foundry, transport: http(rpcUrl) });
  const navigate = async (kind: string) => {
    const response = await page.goto(`/operations/${kind}/?paid-local=1`);
    // Firefox may revalidate an already visited static route and receive 304;
    // the wallet and on-chain assertions below still verify the rendered page.
    expect([200, 304]).toContain(response?.status());
    await page.getByLabel("Wallet provider").selectOption({ label: "Injected wallet" });
    await page.getByRole("button", { name: "Connect local wallet" }).click();
    await expect(page.locator("#paid-wallet")).toContainText("chain 31337", { timeout: 30_000 });
  };
  const pay = async () => {
    await page.getByRole("button", { name: "Validate and quote" }).click();
    await expect(page.locator("#paid-state")).toContainText("Quote ready");
    await page.getByRole("button", { name: "Approve exact amounts" }).click();
    await expect(page.locator("#paid-state")).toContainText("Approvals confirmed", { timeout: 30_000 });
    await page.getByRole("button", { name: "Simulate and estimate gas" }).click();
    await expect(page.locator("#paid-state")).toContainText("Ready for wallet confirmation", { timeout: 30_000 });
    await page.getByRole("button", { name: "Confirm atomic operation" }).click();
    await expect(page.locator("#paid-state")).toContainText("Success · receipt and state verified", { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Download JSON receipt" })).toBeVisible();
    return await page.locator("#paid-output").textContent() ?? "";
  };
  await navigate("token-creator");
  await page.getByRole("button", { name: "Deploy local payment fixtures" }).click();
  await expect(page.locator("#paid-state")).toContainText("Local fixtures ready", { timeout: 30_000 });
  const preset = page.getByLabel("Preset");
  const advancedSettings = page.locator("#advanced-settings");
  await expect(advancedSettings).toBeHidden();
  await expect(advancedSettings).toHaveAttribute("disabled", "");
  await expect(page.getByLabel("Advanced cap (18 decimals)")).toBeDisabled();
  await preset.selectOption("advanced");
  await expect(advancedSettings).toBeVisible();
  await page.getByLabel("Advanced cap (18 decimals)").fill("2000");
  await page.getByLabel(/Mint up to cap/).check();
  expect(await page.getByLabel(/Mint up to cap/).evaluate((node) => Math.round(node.getBoundingClientRect().width))).toBe(20);
  await preset.selectOption("standard");
  await expect(advancedSettings).toBeHidden();
  expect(await page.locator("#paid-form").evaluate((form) => [...new FormData(form as HTMLFormElement).keys()])).not.toContain("cap");
  expect(await page.getByLabel("Advanced cap (18 decimals)").inputValue()).toBe("");
  expect(await page.getByLabel(/Mint up to cap/).isChecked()).toBe(false);
  if (process.env.PIT_UI_EVIDENCE_DIR) await page.locator("#paid-form").screenshot({ path: `${process.env.PIT_UI_EVIDENCE_DIR}/apple-standard-form-after.png` });
  const setup = await page.locator("#paid-output").textContent() ?? "";
  const mock = setup.match(/LOCAL MOCK USDC (0x[0-9a-fA-F]{40})/)?.[1];
  const creatorRouter = setup.match(/Creator router (0x[0-9a-fA-F]{40})/)?.[1];
  const assetRouter = setup.match(/Asset router (0x[0-9a-fA-F]{40})/)?.[1];
  expect(mock && creatorRouter && assetRouter).toBeTruthy();
  await page.getByLabel("Name").fill("Browser Paid");
  await page.getByLabel("Symbol").fill("BPD");
  await page.getByLabel("Initial supply (18 decimals)").fill("1000");
  await page.getByLabel("Initial supply recipient").fill(accounts[0]);
  const created = await pay();
  const token = created.match(/Result (0x[0-9a-fA-F]{40})/)?.[1];
  expect(token).toBeTruthy();
  await navigate("token-creator");
  await page.getByLabel("Preset").selectOption("advanced");
  await page.getByLabel("Name").fill("Browser Advanced");
  await page.getByLabel("Symbol").fill("BADV");
  await page.getByLabel("Initial supply (18 decimals)").fill("1000");
  await page.getByLabel("Initial supply recipient").fill(accounts[0]);
  await page.getByLabel("Advanced cap (18 decimals)").fill("2000");
  await page.getByLabel(/Mint up to cap/).check();
  if (process.env.PIT_UI_EVIDENCE_DIR) await page.locator("#paid-form").screenshot({ path: `${process.env.PIT_UI_EVIDENCE_DIR}/apple-advanced-form-after.png` });
  const advancedCreated = await pay();
  const advancedToken = advancedCreated.match(/Result (0x[0-9a-fA-F]{40})/)?.[1];
  expect(advancedToken).toBeTruthy();
  const advancedStateAbi = [
    { type: "function", name: "cap", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
    { type: "function", name: "mintingEnabled", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  ] as const;
  expect(await client.readContract({ address: advancedToken as `0x${string}`, abi: advancedStateAbi, functionName: "cap" })).toBe(parseUnits("2000", 18));
  expect(await client.readContract({ address: advancedToken as `0x${string}`, abi: advancedStateAbi, functionName: "mintingEnabled" })).toBe(true);
  await navigate("multisender");
  await page.getByLabel("ERC-20 asset contract").fill(mock!);
  await page.getByLabel(/Recipients CSV/).fill(`address,amount\n${accounts[1]},1`);
  await page.getByRole("button", { name: "Validate and quote" }).click();
  await expect(page.locator("#paid-output")).toContainText("cannot also be the distributed or locked asset");
  await expect(page.getByRole("button", { name: "Approve exact amounts" })).toBeDisabled();
  await page.getByLabel("ERC-20 asset contract").fill(token!);
  await page.getByLabel(/Recipients CSV/).fill(`address,amount\n${accounts[1]},7\n${accounts[2]},3`);
  await pay();
  const tokenBalance = (owner: string) => client.readContract({ address: token as `0x${string}`, abi: [{ type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }], functionName: "balanceOf", args: [owner as `0x${string}`] });
  expect(await tokenBalance(accounts[1])).toBe(parseUnits("7", 18));
  expect(await tokenBalance(accounts[2])).toBe(parseUnits("3", 18));
  const now = (await client.getBlock()).timestamp;
  await navigate("token-locker");
  await page.getByLabel("ERC-20 asset contract").fill(token!);
  await page.getByLabel("Asset amount").fill("25");
  await page.getByLabel("Immutable beneficiary").fill(accounts[0]);
  await page.getByLabel("Unlock UTC").fill(new Date(Number(now + 3600n) * 1000).toISOString().slice(0, 16));
  const lock = await pay();
  expect(lock).toMatch(/Result 0x[0-9a-fA-F]{40}/);
  const vestStart = (await client.getBlock()).timestamp + 7200n;
  await navigate("token-vesting");
  await page.getByLabel("ERC-20 asset contract").fill(token!);
  await page.getByLabel("Asset amount").fill("100");
  await page.getByLabel("Immutable beneficiary").fill(accounts[0]);
  await page.getByLabel("Start UTC").fill(new Date(Number(vestStart) * 1000).toISOString().slice(0, 16));
  await page.getByLabel("Duration in whole days").fill("1");
  const vest = await pay();
  expect(vest).toMatch(/Result 0x[0-9a-fA-F]{40}/);
  const merchantBalance = await client.readContract({ address: mock as `0x${string}`, abi: [{ type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }], functionName: "balanceOf", args: ["0x0000000000000000000000000000000000000FEE"] });
  expect(merchantBalance).toBe(319_200_000n);
  const allowanceAbi = [{ type: "function", name: "allowance", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }] as const;
  for (const spender of [creatorRouter!, assetRouter!]) {
    expect(await client.readContract({ address: mock as `0x${string}`, abi: allowanceAbi, functionName: "allowance", args: [accounts[0] as `0x${string}`, spender as `0x${string}`] })).toBe(0n);
  }
  expect(await client.readContract({ address: token as `0x${string}`, abi: allowanceAbi, functionName: "allowance", args: [accounts[0] as `0x${string}`, assetRouter as `0x${string}`] })).toBe(0n);
  expect(unexpected).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
});

test("local paid route rejects missing wallet and non-Anvil chain before setup", async ({ page }) => {
  await page.goto("/operations/token-creator/?paid-local=1");
  await page.getByRole("button", { name: "Connect local wallet" }).click();
  await expect(page.locator("#paid-state")).toHaveText("Connection failed");
  await expect(page.getByRole("button", { name: "Deploy local payment fixtures" })).toBeDisabled();
  await page.evaluate(() => { (window as any).ethereum = { request: async ({ method }: { method: string }) => method === "eth_chainId" ? "0x2105" : [] }; });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { name: "Wrong network" }, provider: (window as any).ethereum } })));
  await page.getByLabel("Wallet provider").selectOption({ label: "Wrong network" });
  await page.getByRole("button", { name: "Connect local wallet" }).click();
  await expect(page.locator("#paid-output")).toContainText("Remote chains cannot execute here");
  await expect(page.getByRole("button", { name: "Deploy local payment fixtures" })).toBeDisabled();
  await page.evaluate((account) => { (window as any).ethereum = { request: async ({ method }: { method: string }) =>
    method === "eth_chainId" ? "0x7a69" : method === "eth_requestAccounts" || method === "eth_accounts" ? [account]
      : method === "eth_getBlockByNumber" ? { number: "0x0", hash: `0x${"00".repeat(32)}` } : null }; }, accounts[0]);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { name: "Inconsistent local state" }, provider: (window as any).ethereum } })));
  await page.getByLabel("Wallet provider").selectOption({ label: "Inconsistent local state" });
  await page.getByRole("button", { name: "Connect local wallet" }).click();
  await expect(page.locator("#paid-output")).toContainText("do not share the same chain state");
  await expect(page.getByRole("button", { name: "Deploy local payment fixtures" })).toBeDisabled();
});

test("paid wallet selection, rejection and account change discard transaction state", async ({ page }) => {
  await page.addInitScript((address) => {
    const listeners: Record<string, (() => void)[]> = {};
    const provider = {
      request: async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
        if (method === "eth_requestAccounts") return [address];
        const response = await fetch("http://127.0.0.1:8545", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
        const data = await response.json(); if (data.error) throw Error(`Local RPC error ${data.error.code}`); return data.result;
      },
      on: (event: string, callback: () => void) => { (listeners[event] ??= []).push(callback); },
      removeListener: (event: string, callback: () => void) => { listeners[event] = (listeners[event] ?? []).filter((entry) => entry !== callback); },
      emit: (event: string) => { for (const callback of listeners[event] ?? []) callback(); },
    };
    const rejected = { request: async () => { throw Error("Wallet rejected confirmation"); } };
    (window as any).pitPaidProviders = { provider, rejected };
    window.addEventListener("eip6963:requestProvider", () => {
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { name: "Rejected wallet" }, provider: rejected } }));
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { name: "Local Anvil" }, provider } }));
    });
  }, accounts[0]);
  await page.goto("/operations/token-creator/?paid-local=1");
  await page.getByRole("button", { name: "Connect local wallet" }).click();
  await expect(page.locator("#paid-output")).toContainText("Select a wallet provider explicitly");
  await page.getByLabel("Wallet provider").selectOption({ label: "Rejected wallet" });
  await page.getByRole("button", { name: "Connect local wallet" }).click();
  await expect(page.locator("#paid-state")).toHaveText("Connection failed");
  await page.getByLabel("Wallet provider").selectOption({ label: "Local Anvil" });
  await page.getByRole("button", { name: "Connect local wallet" }).click();
  await expect(page.locator("#paid-wallet")).toContainText("chain 31337");
  await page.evaluate(() => (window as any).pitPaidProviders.provider.emit("accountsChanged"));
  await expect(page.locator("#paid-state")).toHaveText("Connection changed");
  await expect(page.getByRole("button", { name: "Confirm atomic operation" })).toBeDisabled();
});

test("late wallet response cannot reconnect a provider after selection changes", async ({ page }) => {
  await page.addInitScript(() => {
    let release: (() => void) | undefined;
    const first = { request: async () => { await new Promise<void>((resolve) => { release = resolve; }); return "0x7a69"; } };
    const second = { request: async () => "0x7a69" };
    (window as any).releasePaidWallet = () => release?.();
    window.addEventListener("eip6963:requestProvider", () => {
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { name: "Slow wallet" }, provider: first } }));
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { name: "Other wallet" }, provider: second } }));
    });
  });
  await page.goto("/operations/token-creator/?paid-local=1");
  await page.getByLabel("Wallet provider").selectOption({ label: "Slow wallet" });
  await page.getByRole("button", { name: "Connect local wallet" }).click();
  await page.getByLabel("Wallet provider").selectOption({ label: "Other wallet" });
  await page.evaluate(() => (window as any).releasePaidWallet());
  await expect(page.locator("#paid-state")).toHaveText("Connection changed");
  await expect(page.getByRole("button", { name: "Deploy local payment fixtures" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Confirm atomic operation" })).toBeDisabled();
});
