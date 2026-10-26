import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { transactionPlan, verifyState, S, F, M } from "../scripts/operations/pit4-plan.mjs";

test("time-dependent actions reject early or stale chain timestamps before signing", () => {
  const state = { lockUnlock: "1000", vestingStart: "2000" };
  assert.throws(() => transactionPlan(16, state, 999n), /unlock time/);
  assert.doesNotThrow(() => transactionPlan(16, state, 1000n));
  assert.throws(() => transactionPlan(17, state, 2299n), /after cliff/);
  assert.doesNotThrow(() => transactionPlan(17, state, 2300n));
  assert.throws(() => transactionPlan(17, state, 3200n), /before completion/);
  assert.throws(() => transactionPlan(18, state, 3199n), /after completion/);
  assert.doesNotThrow(() => transactionPlan(18, state, 3200n));
});

const url = "http://127.0.0.1:9567";
async function rpc(method, params = []) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const result = await response.json();
  if (result.error) throw Error(`Local Anvil ${method} error ${result.error.code}: ${result.error.message}`);
  return result.result;
}
function rpcSync(method, params = []) {
  const result = spawnSync("curl", ["-sS", "--max-time", "5", "-H", "content-type: application/json", "--data-binary", "@-", url], {
    input: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), encoding: "utf8", timeout: 6_000,
  });
  if (result.status !== 0) throw Error(`Local read ${method} failed`);
  const body = JSON.parse(result.stdout);
  if (body.error) throw Error(`Local read ${method} rejected: ${body.error.code}`);
  return body.result;
}
function runtime(code, artifact) {
  const template = artifact.deployedBytecode.object;
  assert.equal(code.length, template.length);
  const mutable = new Set();
  for (const refs of Object.values(artifact.deployedBytecode.immutableReferences ?? {})) {
    for (const { start, length } of refs) for (let i = start; i < start + length; i++) mutable.add(i);
  }
  for (let i = 0; i < (code.length - 2) / 2; i++) if (!mutable.has(i)) assert.equal(code.slice(2 + i * 2, 4 + i * 2).toLowerCase(), template.slice(2 + i * 2, 4 + i * 2).toLowerCase(), `runtime byte ${i}`);
}

test("exact nineteen-action PIT4 plan executes and reads back on isolated Anvil 84532", { timeout: 90_000 }, async (t) => {
  const anvil = spawn("anvil", ["--host", "127.0.0.1", "--port", "9567", "--chain-id", "84532", "--block-base-fee-per-gas", "5000000", "--gas-price", "6000000", "--silent"], { stdio: "ignore" });
  t.after(() => anvil.kill("SIGTERM"));
  for (let i = 0; i < 50; i++) { try { if (await rpc("eth_chainId") === "0x14a34") break; } catch { /* startup */ } await new Promise((r) => setTimeout(r, 100)); }
  assert.equal(await rpc("eth_chainId"), "0x14a34");
  await rpc("anvil_setBalance", [S, "0xde0b6b3a7640000"]);
  await rpc("anvil_impersonateAccount", [S]);
  const state = {};
  const receipts = [];
  const shared = [
    ["PitTokens", "PitTokenFactory", F], ["PitMultiSender", "PitMultiSender", M],
  ];
  for (let index = 0; index < 19; index++) {
    if (index === 16) { await rpc("evm_setNextBlockTimestamp", [Number(BigInt(state.lockUnlock) + 1n)]); await rpc("evm_mine"); }
    if (index === 17) { await rpc("evm_setNextBlockTimestamp", [Number(BigInt(state.vestingStart) + 600n)]); await rpc("evm_mine"); }
    if (index === 18) { await rpc("evm_setNextBlockTimestamp", [Number(BigInt(state.vestingStart) + 1200n)]); await rpc("evm_mine"); }
    const block = await rpc("eth_getBlockByNumber", ["latest", false]);
    let plan;
    if (index < 2) {
      const [source, name, address] = shared[index];
      const artifact = JSON.parse(readFileSync(`out/${source}.sol/${name}.json`, "utf8"));
      plan = { data: artifact.bytecode.object, expectedAddress: address, artifact };
    } else plan = transactionPlan(index, state, BigInt(block.timestamp));
    const request = { from: S, data: plan.data, gas: "0x5b8d80" };
    if (plan.to) request.to = plan.to;
    const hash = await rpc("eth_sendTransaction", [request]);
    let receipt;
    for (let attempt = 0; attempt < 40; attempt++) {
      receipt = await rpc("eth_getTransactionReceipt", [hash]);
      if (receipt) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(receipt, `action ${index} receipt missing`);
    assert.equal(receipt.status, "0x1", `action ${index} reverted`);
    if (!plan.to) assert.equal(receipt.contractAddress?.toLowerCase(), plan.expectedAddress.toLowerCase());
    if (plan.expectedAddress) runtime(await rpc("eth_getCode", [plan.expectedAddress, "latest"]), plan.artifact);
    if (index >= 2) verifyState(index, plan, state, receipt, rpcSync, runtime);
    receipts.push({ index, gasUsed: Number(BigInt(receipt.gasUsed)) });
  }
  assert.equal(receipts.length, 19);
  assert.equal(await rpc("eth_getTransactionCount", [S, "latest"]), "0x13");
});
