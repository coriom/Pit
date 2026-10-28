import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createPublicClient, createWalletClient, http, parseUnits, type Address } from "viem";
import { foundry } from "viem/chains";
import { contracts } from "../../src/operations/generated/contracts";

const rpcUrl = "http://127.0.0.1:8545";
const client = createPublicClient({ chain: foundry, transport: http(rpcUrl, { retryCount: 0 }) });
let anvil: ChildProcess, accounts: Address[];
const rpc = async (method: string, params: unknown[] = []) => {
  const response = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const data = await response.json(); if (data.error) throw Error(`Local Anvil ${data.error.code}`); return data.result;
};
test.beforeAll(async () => {
  anvil = spawn("anvil", ["--host", "127.0.0.1", "--port", "8545", "--chain-id", "31337", "--accounts", "8", "--silent"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if (await rpc("eth_chainId") === "0x7a69") break; } catch { /* startup */ } await new Promise((resolve) => setTimeout(resolve, 100)); }
  expect(await rpc("eth_chainId")).toBe("0x7a69"); accounts = await rpc("eth_accounts");
});
test.afterAll(() => anvil?.kill("SIGTERM"));

test("eight Phase 5 modules use real local receipts and state readback", async ({ page }) => {
  test.setTimeout(240_000);
  const unexpected: string[] = [];
  page.on("request", (request) => { const url = new URL(request.url()); if (url.hostname !== "127.0.0.1" || ![4418, 8545].includes(Number(url.port))) unexpected.push(request.url()); });
  await page.addInitScript((selected) => { (window as any).ethereum = { request: async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [selected];
    const response = await fetch("http://127.0.0.1:8545", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method === "eth_requestAccounts" ? "eth_accounts" : method, params }) });
    const data = await response.json(); if (data.error) throw Error(`Local RPC ${data.error.code}`); return data.result;
  } }; }, accounts[0]);
  expect((await page.goto("/"))?.status()).toBe(200);
  await page.getByLabel("Search operations").fill("NFT");
  expect(await page.locator("[data-tool]:not([hidden])").count()).toBeGreaterThanOrEqual(2);
  await page.getByLabel("Search operations").fill("");
  await expect(page.locator("[data-tool]:not([hidden])")).toHaveCount(18);
  const wallet = createWalletClient({ account: accounts[0], chain: foundry, transport: http(rpcUrl) });
  const wait = async (hash: `0x${string}`) => { const receipt = await client.waitForTransactionReceipt({ hash }); expect(receipt.status).toBe("success"); return receipt; };
  const deploy = async (item: { abi: any; bytecode: `0x${string}` }, args: unknown[] = []) => {
    const receipt = await wait(await wallet.deployContract({ abi: item.abi, bytecode: item.bytecode, args }));
    expect(receipt.contractAddress).toBeTruthy(); return receipt.contractAddress!;
  };
  const write = async (target: Address, abi: any, functionName: string, args: unknown[] = []) => wait(await wallet.writeContract({ address: target, abi, functionName, args }));
  const read = (target: Address, abi: any, functionName: string, args: unknown[] = []) => client.readContract({ address: target, abi, functionName, args }) as Promise<any>;
  const standard = await deploy(contracts.PitStandardToken, ["Local Token", "LOC", parseUnits("1000", 18), accounts[0]]);
  const advanced = await deploy(contracts.PitAdvancedToken, ["Advanced", "ADV", parseUnits("100", 18), parseUnits("200", 18), accounts[0], accounts[0], true, true, true]);
  const now = (await client.getBlock()).timestamp;
  const lock = await deploy(contracts.PitTokenLock, [standard, accounts[0], now + 100n]);
  const vest = await deploy(contracts.PitTokenVesting, [standard, accounts[0], now + 200n, 100n, now + 250n, parseUnits("10", 18)]);
  await write(standard, contracts.PitStandardToken.abi, "approve", [lock, parseUnits("10", 18)]);
  await write(lock, contracts.PitTokenLock.abi, "fund", [parseUnits("10", 18)]);
  await write(standard, contracts.PitStandardToken.abi, "approve", [vest, parseUnits("10", 18)]);
  await write(vest, contracts.PitTokenVesting.abi, "fund");
  const goto = async (id: string, connect = true) => {
    expect((await page.goto(`/operations/${id}/`))?.status()).toBe(200);
    await expect(page.locator("#phase5-form")).toBeVisible({ timeout: 10_000 });
    if (connect) { await page.getByRole("button", { name: "Connect local wallet" }).click({ timeout: 10_000 }); await expect(page.locator("#wallet-state")).toContainText("Anvil 31337"); }
  };
  const submit = async () => {
    await page.getByRole("button", { name: "Validate and review" }).click();
    await expect(page.locator("#lifecycle")).toHaveText("Reviewed");
    await page.getByRole("button", { name: "Simulate or inspect" }).click();
    await expect(page.locator("#lifecycle")).toHaveText("Simulated and ready");
    await page.getByRole("button", { name: /Confirm local operation|Read balances/ }).click();
    await expect(page.locator("#lifecycle")).toContainText(/Receipt confirmed|Read complete/, { timeout: 60_000 });
  };
  await goto("token-management");
  await page.getByLabel("Contract address").fill(advanced);
  await page.getByLabel("Action").selectOption("mint");
  await page.getByLabel(/Target address for mint/).fill(accounts[0]);
  await page.getByLabel("Amount for mint or burn").fill("1");
  await submit();
  expect(await read(advanced, contracts.PitAdvancedToken.abi, "totalSupply")).toBe(parseUnits("101", 18));

  await write(standard, contracts.PitStandardToken.abi, "approve", [accounts[1], parseUnits("5", 18)]);
  await goto("allowance-manager");
  await page.getByLabel("Contract address").fill(standard);
  await page.getByLabel("Owner address").fill(accounts[0]);
  await page.getByLabel("Spender address").fill(accounts[1]);
  await submit();
  expect(await read(standard, contracts.PitStandardToken.abi, "allowance", [accounts[0], accounts[1]])).toBe(0n);

  await goto("batch-balance-checker", false);
  await page.locator('input[type="file"][data-target="addresses"]').setInputFiles({ name: "local-wallets.csv", mimeType: "text/csv", buffer: Buffer.from(`address\n${accounts[0]}\n${accounts[1]}`) });
  await expect(page.locator("#lifecycle")).toHaveText("CSV loaded locally");
  await page.getByLabel(/ERC-20 token addresses/).fill(standard);
  await submit();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download local CSV or JSON" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("pit-local-balances.csv");

  await goto("native-multisender");
  await page.getByLabel(/Recipients \(address,amount in ETH\)/).fill(`address,amount\n${accounts[2]},0.1\n${accounts[3]},0.2`);
  const nativeBefore = await client.getBalance({ address: accounts[2] });
  await submit();
  expect((await client.getBalance({ address: accounts[2] })) - nativeBefore).toBe(parseUnits("0.1", 18));

  await goto("nft-creator");
  await page.getByLabel("Collection name").fill("PIT Local NFT");
  await page.getByLabel("Symbol").fill("PLN");
  await page.getByLabel("First recipient").fill(accounts[0]);
  await page.getByLabel("First token metadata URI").fill("ipfs://pit-local/1.json");
  await submit();
  const collection = (await page.locator("#result").textContent())?.match(/Collection (0x[0-9a-fA-F]{40})/)?.[1] as Address;
  expect(collection).toBeTruthy();
  await write(collection, contracts.PitNftCollection.abi, "mint", [accounts[0], "ipfs://pit-local/2.json"]);

  await goto("nft-batch-sender");
  page.once("dialog", async (dialog) => { expect(dialog.message()).toContain("Approve only the listed NFT token IDs"); await dialog.accept(); });
  await page.getByLabel("Contract address").fill(collection);
  await page.getByLabel(/Token IDs and recipients/).fill(`tokenId,address\n1,${accounts[1]}\n2,${accounts[2]}`);
  await submit();
  expect((await read(collection, contracts.PitNftCollection.abi, "ownerOf", [1n]) as string).toLowerCase()).toBe(accounts[1].toLowerCase());
  expect((await read(collection, contracts.PitNftCollection.abi, "ownerOf", [2n]) as string).toLowerCase()).toBe(accounts[2].toLowerCase());

  await goto("locker-manager");
  await page.getByLabel("Address").fill(lock);
  await rpc("evm_setNextBlockTimestamp", [Number(now + 101n)]); await rpc("evm_mine");
  await submit();
  expect(await read(lock, contracts.PitTokenLock.abi, "released")).toBe(parseUnits("10", 18));

  await goto("vesting-manager");
  await page.getByLabel("Address").fill(vest);
  await rpc("evm_setNextBlockTimestamp", [Number(now + 301n)]); await rpc("evm_mine");
  await submit();
  expect(await read(vest, contracts.PitTokenVesting.abi, "released")).toBe(parseUnits("10", 18));
  expect(unexpected).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
});

test("missing wallet never enables execution", async ({ page }) => {
  await page.goto("/operations/native-multisender/");
  await page.getByRole("button", { name: "Connect local wallet" }).click();
  await expect(page.locator("#lifecycle")).toHaveText("Connection failed");
  await expect(page.getByRole("button", { name: "Confirm local operation" })).toBeDisabled();
});

test("duplicate recipients and wrong chain fail closed", async ({ page }) => {
  await page.addInitScript((selected) => { (window as any).ethereum = { request: async ({ method }: { method: string }) =>
    method === "eth_requestAccounts" || method === "eth_accounts" ? [selected] : method === "eth_chainId" ? "0x7a69" : null }; }, accounts[0]);
  await page.goto("/operations/native-multisender/");
  await page.getByRole("button", { name: "Connect local wallet" }).click();
  await page.getByLabel(/Recipients \(address,amount in ETH\)/).fill(`address,amount\n${accounts[1]},1\n${accounts[1]},2`);
  await page.getByRole("button", { name: "Validate and review" }).click();
  await expect(page.locator("#result")).toContainText("Duplicate");
  await expect(page.getByRole("button", { name: "Confirm local operation" })).toBeDisabled();
  await page.evaluate(() => { (window as any).ethereum.request = async ({ method }: { method: string }) => method === "eth_chainId" ? "0x2105" : []; });
  await page.getByRole("button", { name: "Validate and review" }).click();
  await expect(page.locator("#result")).toContainText("chain 31337");
});
