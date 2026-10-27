import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";

const fixture = JSON.parse(readFileSync("/tmp/pit4b-anvil-fixture.json", "utf8"));
const rpcUrl = "http://127.0.0.1:8555";
const publicClient = createPublicClient({ transport: http(rpcUrl, { retryCount: 0 }) });
const rpc = async (method: string, params: unknown[] = []) => {
  const response = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const data = await response.json();
  if (data.error) throw Error(`Local fork RPC ${method}: ${data.error.code}`);
  return data.result;
};
const tokenAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);

test("four full wallet UI journeys send real transactions only to an isolated Anvil fork", async ({ page }) => {
  // The provider is a controlled EIP-1193 test adapter backed by Anvil's
  // impersonated account. It is NOT a real browser wallet extension.
  test.setTimeout(420_000);
  expect(await rpc("eth_chainId")).toBe("0x14a34");
  await page.exposeBinding("pitForkRequest", async (_, request: { method: string; params?: unknown[] }) => rpc(request.method, request.params));
  await page.addInitScript((signer) => {
    const provider = { request: (request: { method: string; params?: unknown[] }) =>
      request.method === "eth_accounts" || request.method === "eth_requestAccounts" ? [signer] : (window as any).pitForkRequest(request), on: () => undefined };
    window.addEventListener("eip6963:requestProvider", () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { name: "Isolated Anvil Fork" }, provider } })));
  }, fixture.campaign.signer);
  const unexpected: string[] = [];
  page.on("request", (request) => { if (!request.url().startsWith("http://127.0.0.1:4417/") && !request.url().startsWith("https://sepolia.base.org/")) unexpected.push(request.url()); });
  await page.route("https://sepolia.base.org/**", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" } });
    const body = route.request().postDataJSON();
    if (body.method === "eth_maxPriorityFeePerGas") return route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result: "0xf4240" }) });
    const response = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    await route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: await response.text() });
  });
  const goto = async (id: string) => {
    expect((await page.goto(`/operations/${id}/`))?.status()).toBe(200);
    await page.getByLabel("Provider").selectOption({ label: "Isolated Anvil Fork" });
    await page.getByRole("button", { name: "Connect wallet" }).click();
    await expect(page.locator("#wallet-state")).toContainText("Base Sepolia 84532");
  };
  const step = async (expected: string) => {
    await page.getByRole("button", { name: "Simulate next step" }).click();
    await expect(page.locator("#lifecycle")).toHaveText("Ready for wallet confirmation", { timeout: 45_000 });
    await expect(page.locator("#result")).toContainText(expected);
    await page.getByRole("button", { name: "Confirm in wallet" }).click();
    await expect(page.locator("#lifecycle")).toHaveText("Receipt confirmed · state checked", { timeout: 60_000 });
  };
  const repeatStep = async (expected: string) => {
    await page.getByRole("button", { name: "Simulate next step" }).click();
    await expect(page.locator("#result")).toContainText(expected);
    await page.getByRole("button", { name: "Confirm in wallet" }).click();
    await expect(page.locator("#lifecycle")).toHaveText("Receipt confirmed · state checked", { timeout: 60_000 });
  };
  await goto("token-creator");
  await expect(page.getByLabel("Token name")).toHaveValue(fixture.forms.creator.name);
  await expect(page.getByLabel("Symbol")).toHaveValue(fixture.forms.creator.symbol);
  await expect(page.getByLabel("Initial supply (18 decimals)")).toHaveValue(fixture.forms.creator.supply);
  await expect(page.getByLabel("Initial recipient")).toHaveValue(fixture.forms.creator.recipient);
  await page.getByRole("button", { name: "Validate and review" }).click();
  await step("createStandard");
  await expect(page.locator("#result")).toContainText("Created token");

  await goto("multisender");
  await expect(page.getByLabel("Reviewed demonstration token")).toHaveValue(fixture.forms.multisender.token);
  await expect(page.getByLabel(/Recipients \(CSV/)).toHaveValue(fixture.forms.multisender.csv);
  await page.getByRole("button", { name: "Validate and review" }).click();
  await step("exact-approval");
  await repeatStep("send-batch");
  await expect(page.locator("#result")).toContainText("sender debit matches");

  await goto("token-locker");
  await expect(page.getByLabel("Reviewed demonstration token")).toHaveValue(fixture.forms.lock.token);
  await expect(page.getByLabel("Amount in token units")).toHaveValue(fixture.forms.lock.amount);
  await expect(page.getByLabel("Beneficiary address")).toHaveValue(fixture.forms.lock.beneficiary);
  await expect(page.getByLabel("Unlock date and time (UTC)")).toHaveValue(fixture.forms.lock.unlock);
  await page.getByRole("button", { name: "Validate and review" }).click();
  await step("deploy-lock");
  await repeatStep("exact-approval");
  await repeatStep("fund-schedule");
  await expect(page.locator("#result")).toContainText("holds exactly");
  await page.getByRole("button", { name: "Simulate release" }).click();
  await expect(page.locator("#lifecycle")).toHaveText("Release unavailable");
  const unlock = Date.parse(`${fixture.forms.lock.unlock}:00Z`) / 1000;
  await rpc("evm_setNextBlockTimestamp", [unlock + 1]); await rpc("evm_mine");
  await page.getByRole("button", { name: "Simulate release" }).click();
  await page.getByRole("button", { name: "Confirm release in wallet" }).click();
  await expect(page.locator("#lifecycle")).toHaveText("Release confirmed · state checked");

  await goto("token-vesting");
  await expect(page.getByLabel("Reviewed demonstration token")).toHaveValue(fixture.forms.vest.token);
  await expect(page.getByLabel("Amount in token units")).toHaveValue(fixture.forms.vest.amount);
  await expect(page.getByLabel("Beneficiary address")).toHaveValue(fixture.forms.vest.beneficiary);
  await expect(page.getByLabel("Start date and time (UTC)")).toHaveValue(fixture.forms.vest.start);
  await expect(page.getByLabel("Duration in whole minutes")).toHaveValue(fixture.forms.vest.minutes);
  await expect(page.getByLabel("Cliff date and time (UTC, optional)")).toHaveValue(fixture.forms.vest.cliff);
  await page.getByRole("button", { name: "Validate and review" }).click();
  await step("deploy-vesting");
  await repeatStep("exact-approval");
  await repeatStep("fund-schedule");
  await page.getByRole("button", { name: "Simulate release" }).click();
  await expect(page.locator("#lifecycle")).toHaveText("Release unavailable");
  // One mature vesting release proves the complete browser lifecycle with
  // fewer confirmations; partial-vesting math remains covered by Foundry.
  const start = Date.parse(`${fixture.forms.vest.start}:00Z`) / 1000;
  await rpc("evm_setNextBlockTimestamp", [start + 3600 + 1]); await rpc("evm_mine");
  await page.getByRole("button", { name: "Simulate release" }).click();
  await page.getByRole("button", { name: "Confirm release in wallet" }).click();
  await expect(page.locator("#lifecycle")).toHaveText("Release confirmed · state checked");
  expect(await publicClient.getTransactionCount({ address: fixture.campaign.signer })).toBe(11);
  expect(await publicClient.readContract({ address: fixture.forms.vest.token, abi: tokenAbi, functionName: "balanceOf", args: [fixture.forms.vest.address] })).toBe(0n);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download public receipt list" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("pit4b-public-receipts.json");
  const exported = JSON.parse(await (await import("node:fs/promises")).readFile(await download.path(), "utf8"));
  expect(exported).toMatchObject({ schema: "pit4b.public-receipts.v1", chainId: 84532, signer: fixture.campaign.signer, token: fixture.campaign.token });
  expect(exported.hashes).toHaveLength(11);
  for (const hash of exported.hashes) expect(hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  expect(unexpected).toEqual([]);
});
