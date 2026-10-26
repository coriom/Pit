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
  await page.getByLabel("Token name").fill(fixture.forms.creator.name);
  await page.getByLabel("Symbol").fill(fixture.forms.creator.symbol);
  await page.getByLabel("Initial supply (18 decimals)").fill(fixture.forms.creator.supply);
  await page.getByLabel("Initial recipient").fill(fixture.forms.creator.recipient);
  await page.getByRole("button", { name: "Validate and review" }).click();
  await step("createStandard");
  await expect(page.locator("#result")).toContainText("Created token");

  await goto("multisender");
  await page.getByLabel("Reviewed demonstration token").fill(fixture.forms.multisender.token);
  await page.getByLabel(/Recipients \(CSV/).fill(fixture.forms.multisender.csv);
  await page.getByRole("button", { name: "Validate and review" }).click();
  await step("exact-approval");
  await repeatStep("send-batch");
  await expect(page.locator("#result")).toContainText("sender debit matches");

  await goto("token-locker");
  await page.getByLabel("Reviewed demonstration token").fill(fixture.forms.lock.token);
  await page.getByLabel("Amount in token units").fill(fixture.forms.lock.amount);
  await page.getByLabel("Beneficiary address").fill(fixture.forms.lock.beneficiary);
  await page.getByLabel("Unlock date and time (UTC)").fill(fixture.forms.lock.unlock);
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
  await page.getByLabel("Reviewed demonstration token").fill(fixture.forms.vest.token);
  await page.getByLabel("Amount in token units").fill(fixture.forms.vest.amount);
  await page.getByLabel("Beneficiary address").fill(fixture.forms.vest.beneficiary);
  await page.getByLabel("Start date and time (UTC)").fill(fixture.forms.vest.start);
  await page.getByLabel("Duration in whole minutes").fill(fixture.forms.vest.minutes);
  await page.getByLabel("Cliff date and time (UTC, optional)").fill(fixture.forms.vest.cliff);
  await page.getByRole("button", { name: "Validate and review" }).click();
  await step("deploy-vesting");
  await repeatStep("exact-approval");
  await repeatStep("fund-schedule");
  await page.getByRole("button", { name: "Simulate release" }).click();
  await expect(page.locator("#lifecycle")).toHaveText("Release unavailable");
  const cliff = Date.parse(`${fixture.forms.vest.cliff}:00Z`) / 1000;
  await rpc("evm_setNextBlockTimestamp", [cliff + 1]); await rpc("evm_mine");
  await page.getByRole("button", { name: "Simulate release" }).click();
  await page.getByRole("button", { name: "Confirm release in wallet" }).click();
  await expect(page.locator("#lifecycle")).toHaveText("Release confirmed · state checked");
  const start = Date.parse(`${fixture.forms.vest.start}:00Z`) / 1000;
  await rpc("evm_setNextBlockTimestamp", [start + 3600 + 1]); await rpc("evm_mine");
  await page.getByRole("button", { name: "Simulate release" }).click();
  await page.getByRole("button", { name: "Confirm release in wallet" }).click();
  await expect(page.locator("#lifecycle")).toHaveText("Release confirmed · state checked");
  expect(await publicClient.getTransactionCount({ address: fixture.campaign.signer })).toBe(12);
  expect(await publicClient.readContract({ address: fixture.forms.vest.token, abi: tokenAbi, functionName: "balanceOf", args: [fixture.forms.vest.address] })).toBe(0n);
  expect(unexpected).toEqual([]);
});
