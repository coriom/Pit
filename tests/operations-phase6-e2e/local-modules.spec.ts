import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
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

test("Phase 6 NFT and ERC-1155 operations confirm real local receipts and state", async ({ page }) => {
  test.setTimeout(180_000);
  const unexpected: string[] = [];
  page.on("request", (request) => { const u = new URL(request.url()); if ((u.hostname !== "127.0.0.1" || ![4419, 8545].includes(Number(u.port))) && u.href !== "https://ipfs.io/ipfs/bafy12345/1.json") unexpected.push(request.url()); });
  await page.addInitScript((selected) => { (window as any).ethereum = { request: async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [selected];
    const response = await fetch("http://127.0.0.1:8545", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const data = await response.json(); if (data.error) throw Error(`Local RPC ${data.error.code}`); return data.result;
  } }; }, accounts[0]);
  const wallet = createWalletClient({ account: accounts[0], chain: foundry, transport: http(rpcUrl) });
  const receipt = await client.waitForTransactionReceipt({ hash: await wallet.deployContract({ abi: contracts.PitNftCollection.abi, bytecode: contracts.PitNftCollection.bytecode, args: ["PIT Six", "P6", accounts[0], 10n] }) });
  expect(receipt.status).toBe("success");
  const nft = receipt.contractAddress!;
  const goto = async (id: string, connect = true) => {
    expect([200, 304]).toContain((await page.goto(`/operations/${id}/`))?.status());
    await expect(page.locator("#phase6-form")).toBeVisible({ timeout: 10_000 });
    if (connect) { await page.getByRole("button", { name: "Connect local wallet" }).click(); await expect(page.locator("#wallet-state")).toContainText("Anvil 31337"); }
  };
  const submit = async (expected = "Simulated and ready") => {
    await page.getByRole("button", { name: "Validate and review" }).click();
    await expect(page.locator("#lifecycle")).toHaveText("Reviewed");
    await page.getByRole("button", { name: "Simulate or inspect" }).click();
    await expect(page.locator("#lifecycle")).toHaveText(expected);
    await page.getByRole("button", { name: "Confirm local operation" }).click();
    await expect(page.locator("#lifecycle")).toHaveText("Confirmed and verified", { timeout: 60_000 });
    await expect(page.locator("#result")).toContainText(/0x[0-9a-fA-F]{64}/);
  };

  await goto("nft-manager");
  await page.getByLabel("ERC-721 collection").fill(nft);
  await page.getByLabel("Action").selectOption("mint");
  await page.getByLabel("Recipient or approved spender").fill(accounts[0]);
  await page.getByLabel("Metadata URI for mint").fill("ipfs://bafy12345/1.json");
  await submit();
  expect((await client.readContract({ address: nft, abi: contracts.PitNftCollection.abi, functionName: "ownerOf", args: [1n] }) as string).toLowerCase()).toBe(accounts[0].toLowerCase());

  await page.route("https://ipfs.io/ipfs/bafy12345/1.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ name: "Reviewed metadata", image: "ipfs://bafy12345/image.png" }), headers: { "access-control-allow-origin": "*" } }));
  await goto("nft-manager");
  await page.getByLabel("ERC-721 collection").fill(nft);
  await page.getByRole("button", { name: "Validate and review" }).click();
  await page.getByRole("button", { name: "Inspect metadata URL" }).click();
  await expect(page.locator("#lifecycle")).toHaveText("Metadata inspected");
  await expect(page.locator("#result")).toContainText("Reviewed metadata");

  await goto("nft-manager");
  await page.getByLabel("ERC-721 collection").fill(nft);
  await page.getByLabel("Action").selectOption("approve");
  await page.getByLabel("Recipient or approved spender").fill(accounts[1]);
  await submit();
  expect((await client.readContract({ address: nft, abi: contracts.PitNftCollection.abi, functionName: "getApproved", args: [1n] }) as string).toLowerCase()).toBe(accounts[1].toLowerCase());

  await goto("erc1155-creator");
  await page.getByLabel("Initial recipient").fill(accounts[0]);
  await submit("Ready for local wallet");
  const text = await page.locator("#result").textContent();
  const collection = text?.match(/Collection (0x[0-9a-fA-F]{40})/)?.[1] as Address;
  expect(collection).toBeTruthy();
  expect(await client.readContract({ address: collection, abi: contracts.Pit1155Collection.abi, functionName: "balanceOf", args: [accounts[0], 1n] })).toBe(10n);

  await goto("erc1155-manager");
  await page.getByLabel("ERC-1155 collection").fill(collection);
  await page.getByLabel("Account to inspect").fill(accounts[0]);
  await page.getByLabel("Action").selectOption("mint");
  await page.getByLabel("Recipient or operator").fill(accounts[0]);
  await page.getByLabel("Units or initial units").fill("2");
  await submit();
  expect(await client.readContract({ address: collection, abi: contracts.Pit1155Collection.abi, functionName: "balanceOf", args: [accounts[0], 1n] })).toBe(12n);

  await goto("erc1155-manager");
  await page.getByLabel("ERC-1155 collection").fill(collection);
  await page.getByLabel("Token ID").fill("2");
  await page.getByLabel("Account to inspect").fill(accounts[0]);
  await page.getByLabel("Action").selectOption("define");
  await page.getByLabel("Units or initial units").fill("1");
  await page.getByLabel("Cap for new ID").fill("3");
  await page.getByLabel("Recipient or operator").fill(accounts[0]);
  await submit();
  expect(await client.readContract({ address: collection, abi: contracts.Pit1155Collection.abi, functionName: "capOf", args: [2n] })).toBe(3n);

  await goto("erc1155-multisender");
  await page.getByLabel("ERC-1155 collection").fill(collection);
  await page.getByLabel(/Token ID, raw units, recipient/).fill(`tokenId,amount,recipient\n1,2,${accounts[1]}\n1,3,${accounts[2]}`);
  await submit("Preflight ready");
  expect(await client.readContract({ address: collection, abi: contracts.Pit1155Collection.abi, functionName: "balanceOf", args: [accounts[1], 1n] })).toBe(2n);
  expect(await client.readContract({ address: collection, abi: contracts.Pit1155Collection.abi, functionName: "balanceOf", args: [accounts[2], 1n] })).toBe(3n);
  expect(unexpected).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
});

test("metadata and airdrop files stay local and invalid input fails closed", async ({ page }) => {
  await page.goto("/operations/metadata-studio/");
  await page.getByLabel(/Local JSON or/).fill('{"name":"Demo","image":"ipfs://bafy12345/demo.png"}');
  await page.getByRole("button", { name: "Validate and review" }).click();
  await page.getByRole("button", { name: "Simulate or inspect" }).click();
  const one = page.waitForEvent("download"); await page.getByRole("button", { name: "Download local result" }).click();
  expect((await one).suggestedFilename()).toBe("metadata.json");
  await page.getByLabel("Mode").selectOption("csv");
  await page.getByLabel(/Local JSON or/).fill("tokenId,name,description,image\n1,Demo,Test,ipfs://bafy12345/demo.png");
  await page.getByRole("button", { name: "Validate and review" }).click();
  await page.getByRole("button", { name: "Simulate or inspect" }).click();
  const two = page.waitForEvent("download"); await page.getByRole("button", { name: "Download local result" }).click();
  expect((await two).suggestedFilename()).toBe("pit-nft-metadata.tar");
  await page.goto("/operations/airdrop-composer/");
  await page.getByLabel("Token decimals").fill("0");
  await page.getByLabel("Total token amount").fill("5");
  await page.getByLabel(/Recipient CSV/).fill(`address\n${accounts[0]}\n${accounts[1]}`);
  await page.getByRole("button", { name: "Validate and review" }).click();
  await page.getByRole("button", { name: "Simulate or inspect" }).click();
  const three = page.waitForEvent("download"); await page.getByRole("button", { name: "Download local result" }).click();
  expect((await three).suggestedFilename()).toBe("pit-airdrop-batches.tar");
  await page.getByLabel(/Recipient CSV/).fill(`address\n${accounts[0]}\n${accounts[0]}`);
  await page.getByRole("button", { name: "Validate and review" }).click();
  await expect(page.locator("#lifecycle")).toHaveText("Invalid or unavailable");
  await expect(page.getByRole("button", { name: "Confirm local operation" })).toBeDisabled();
});
