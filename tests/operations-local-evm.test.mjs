import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, decodeEventLog, parseUnits } from "viem";
import { foundry } from "viem/chains";

const url = "http://127.0.0.1:9545";
const artifact = (source, name) => JSON.parse(readFileSync(`out/${source}.sol/${name}.json`, "utf8"));
const factoryA = artifact("PitTokens", "PitTokenFactory");
const tokenA = artifact("PitTokens", "PitStandardToken");
const advancedA = artifact("PitTokens", "PitAdvancedToken");
const senderA = artifact("PitMultiSender", "PitMultiSender");
const lockA = artifact("PitSchedules", "PitTokenLock");
const vestA = artifact("PitSchedules", "PitTokenVesting");
const rpc = async (method, params = []) => {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const data = await response.json();
  if (data.error) throw Error(`Local Anvil RPC error ${data.error.code}`);
  return data.result;
};

test("all four operations execute on ephemeral Anvil with real receipts and readbacks", { timeout: 90_000 }, async (t) => {
  const anvil = spawn("anvil", ["--host", "127.0.0.1", "--port", "9545", "--chain-id", "31337", "--accounts", "5", "--silent"], { stdio: "ignore" });
  t.after(() => anvil.kill("SIGTERM"));
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if (await rpc("eth_chainId") === "0x7a69") break; } catch { /* local startup */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(await rpc("eth_chainId"), "0x7a69");
  const [creator, recipient, beneficiary] = await rpc("eth_accounts");
  const publicClient = createPublicClient({ chain: foundry, transport: http(url) });
  const wallet = createWalletClient({ account: creator, chain: foundry, transport: http(url) });
  const wait = async (hash) => { const receipt = await publicClient.waitForTransactionReceipt({ hash }); assert.equal(receipt.status, "success"); return receipt; };
  const deploy = async (item, args = []) => {
    const receipt = await wait(await wallet.deployContract({ abi: item.abi, bytecode: item.bytecode.object, args }));
    assert.ok(receipt.contractAddress); return receipt;
  };
  const write = async (address, abi, functionName, args = []) => {
    await publicClient.simulateContract({ address, abi, functionName, args, account: creator });
    return wait(await wallet.writeContract({ address, abi, functionName, args }));
  };
  const read = (address, abi, functionName, args = []) => publicClient.readContract({ address, abi, functionName, args });

  const factoryDeployment = await deploy(factoryA);
  const factory = factoryDeployment.contractAddress;
  const standardReceipt = await write(factory, factoryA.abi, "createStandard", ["Local Test", "LOC", parseUnits("1000", 18), creator]);
  const created = standardReceipt.logs.map((log) => { try { return decodeEventLog({ abi: factoryA.abi, data: log.data, topics: log.topics }); } catch { return undefined; } }).find((event) => event?.eventName === "TokenCreated");
  const token = created?.args.token;
  assert.ok(token);
  assert.equal(await read(token, tokenA.abi, "totalSupply"), parseUnits("1000", 18));
  assert.equal(await read(token, tokenA.abi, "balanceOf", [creator]), parseUnits("1000", 18));

  const advancedReceipt = await write(factory, factoryA.abi, "createAdvanced", ["Advanced", "ADV", 100n, 150n, creator, true, true, true]);
  const advancedEvent = advancedReceipt.logs.map((log) => { try { return decodeEventLog({ abi: factoryA.abi, data: log.data, topics: log.topics }); } catch { return undefined; } }).find((event) => event?.eventName === "TokenCreated");
  const advanced = advancedEvent?.args.token;
  assert.ok(advanced);
  assert.equal(await read(advanced, advancedA.abi, "hasRole", [await read(advanced, advancedA.abi, "DEFAULT_ADMIN_ROLE"), creator]), true);
  await write(advanced, advancedA.abi, "mint", [creator, 50n]);
  assert.equal(await read(advanced, advancedA.abi, "totalSupply"), 150n);
  await assert.rejects(publicClient.simulateContract({ address: advanced, abi: advancedA.abi, functionName: "mint", args: [creator, 1n], account: creator }));

  const senderDeployment = await deploy(senderA);
  const sender = senderDeployment.contractAddress;
  const recipients = [recipient, beneficiary], amounts = [parseUnits("10", 18), parseUnits("20", 18)];
  await write(token, tokenA.abi, "approve", [sender, amounts[0] + amounts[1]]);
  const sent = await write(sender, senderA.abi, "send", [token, recipients, amounts]);
  assert.equal(await read(token, tokenA.abi, "balanceOf", [recipient]), amounts[0]);
  assert.equal(await read(token, tokenA.abi, "balanceOf", [beneficiary]), amounts[1]);
  assert.equal(await read(token, tokenA.abi, "allowance", [creator, sender]), 0n);
  const manyRecipients = Array.from({ length: 100 }, (_, i) => `0x${(i + 1000).toString(16).padStart(40, "0")}`);
  await write(token, tokenA.abi, "approve", [sender, 100n]);
  const fullBatch = await write(sender, senderA.abi, "send", [token, manyRecipients, Array(100).fill(1n)]);
  assert.equal(await read(token, tokenA.abi, "balanceOf", [manyRecipients[99]]), 1n);
  const blockGasLimit = (await publicClient.getBlock()).gasLimit;
  assert.ok(fullBatch.gasUsed < blockGasLimit / 2n);

  const now = (await publicClient.getBlock()).timestamp;
  const lockDeployment = await deploy(lockA, [token, beneficiary, now + 100n]);
  const lock = lockDeployment.contractAddress;
  await write(token, tokenA.abi, "approve", [lock, parseUnits("25", 18)]);
  await write(lock, lockA.abi, "fund", [parseUnits("25", 18)]);
  await assert.rejects(publicClient.simulateContract({ address: lock, abi: lockA.abi, functionName: "release", account: beneficiary }));
  await rpc("evm_setNextBlockTimestamp", [Number(now + 100n)]); await rpc("evm_mine");
  const releaseWallet = createWalletClient({ account: beneficiary, chain: foundry, transport: http(url) });
  const lockRelease = await wait(await releaseWallet.writeContract({ address: lock, abi: lockA.abi, functionName: "release" }));
  assert.equal(await read(token, tokenA.abi, "balanceOf", [beneficiary]), parseUnits("45", 18));

  const next = (await publicClient.getBlock()).timestamp;
  const vestDeployment = await deploy(vestA, [token, beneficiary, next + 100n, 100n, next + 150n, 101n]);
  const vest = vestDeployment.contractAddress;
  await write(token, tokenA.abi, "approve", [vest, 101n]); await write(vest, vestA.abi, "fund");
  await rpc("evm_setNextBlockTimestamp", [Number(next + 150n)]); await rpc("evm_mine");
  assert.equal(await read(vest, vestA.abi, "releasable"), 50n);
  await wait(await releaseWallet.writeContract({ address: vest, abi: vestA.abi, functionName: "release" }));
  await rpc("evm_setNextBlockTimestamp", [Number(next + 200n)]); await rpc("evm_mine");
  await wait(await releaseWallet.writeContract({ address: vest, abi: vestA.abi, functionName: "release" }));
  assert.equal(await read(vest, vestA.abi, "released"), 101n);
  assert.equal(await read(token, tokenA.abi, "balanceOf", [beneficiary]), parseUnits("45", 18) + 101n);
  console.log(JSON.stringify({ localChain: 31337, factoryDeploymentGas: factoryDeployment.gasUsed.toString(), standardCreationGas: standardReceipt.gasUsed.toString(), advancedCreationGas: advancedReceipt.gasUsed.toString(), senderDeploymentGas: senderDeployment.gasUsed.toString(), twoRecipientGas: sent.gasUsed.toString(), hundredRecipientGas: fullBatch.gasUsed.toString(), blockGasLimit: blockGasLimit.toString(), lockDeploymentGas: lockDeployment.gasUsed.toString(), lockReleaseGas: lockRelease.gasUsed.toString(), vestDeploymentGas: vestDeployment.gasUsed.toString(), vestingReleasedRaw: "101" }));
});
