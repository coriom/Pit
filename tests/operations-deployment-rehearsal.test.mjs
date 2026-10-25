import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";

const port = 9546;
const url = `http://127.0.0.1:${port}`;
async function rpc(method, params = []) {
  const response = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(5000),
  });
  const body = await response.json();
  if (body.error) throw Error(`Local RPC error ${body.error.code}`);
  return body.result;
}

async function withAnvil(chainId, callback) {
  const child = spawn("anvil", ["--host", "127.0.0.1", "--port", String(port), "--chain-id", String(chainId), "--accounts", "2", "--silent"], { stdio: "ignore" });
  try {
    for (let i = 0; i < 50; ++i) {
      try { if (Number(BigInt(await rpc("eth_chainId"))) === chainId) break; } catch { /* startup */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(Number(BigInt(await rpc("eth_chainId"))), chainId);
    await callback();
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

test("Foundry deployment plan simulates on Anvil without broadcasting and rejects a wrong chain", { timeout: 45_000 }, async () => {
  await withAnvil(31337, async () => {
    const before = await rpc("eth_blockNumber");
    const run = spawnSync("forge", ["script", "contracts/script/PrepareDeployment.s.sol:PrepareDeployment", "--rpc-url", url], { encoding: "utf8", timeout: 30_000 });
    assert.equal(run.status, 0, run.stderr.slice(-1200));
    assert.match(run.stdout, /ONCHAIN EXECUTION COMPLETE|SIMULATION COMPLETE|Script ran successfully/i);
    assert.equal(await rpc("eth_blockNumber"), before, "dry run must not mine a block");
    const [account] = await rpc("eth_accounts");
    assert.equal(await rpc("eth_getTransactionCount", [account, "latest"]), "0x0", "dry run must not use an account nonce");
  });
  await withAnvil(31338, async () => {
    const run = spawnSync("forge", ["script", "contracts/script/PrepareDeployment.s.sol:PrepareDeployment", "--rpc-url", url], { encoding: "utf8", timeout: 30_000 });
    assert.notEqual(run.status, 0, "unreviewed chain must be rejected");
    assert.equal(await rpc("eth_blockNumber"), "0x0");
  });
});
