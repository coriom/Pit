// Independent read-only postflight for the six reviewed Base Sepolia contracts.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { decodeFunctionResult, encodeFunctionData, keccak256 } from "viem";
import { SEPOLIA_SIGNER, SEPOLIA_RPC, validateSepoliaConfig } from "./sepolia-config.mjs";

const config = validateSepoliaConfig(JSON.parse(readFileSync("deployments/base-sepolia.json", "utf8")));
const campaign = JSON.parse(readFileSync("deployments/base-sepolia-receipts.json", "utf8"));
if (campaign.chainId !== 84532 || campaign.signer !== SEPOLIA_SIGNER || !Array.isArray(campaign.receipts) || campaign.receipts.length !== 19) throw Error("Incomplete campaign receipt record");
const unit = 10n ** 18n;
function rpc(method, params = []) {
  const request = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const child = spawnSync("curl", ["-sS", "--max-time", "15", "-H", "content-type: application/json", "--data-binary", "@-", SEPOLIA_RPC], { input: request, encoding: "utf8", timeout: 20_000, maxBuffer: 2_000_000 });
  if (child.status !== 0) throw Error(`RPC ${method} unavailable`);
  const response = JSON.parse(child.stdout);
  if (response.error || response.result === undefined) throw Error(`RPC ${method} error ${response.error?.code ?? "unknown"}`);
  return response.result;
}
const artifact = (source, contract) => JSON.parse(readFileSync(`out/${source}.sol/${contract}.json`, "utf8"));
const token = artifact("PitTokens", "PitStandardToken");
const advanced = artifact("PitTokens", "PitAdvancedToken");
const lock = artifact("PitSchedules", "PitTokenLock");
const vest = artifact("PitSchedules", "PitTokenVesting");
function get(address, abi, functionName, args = []) {
  const data = encodeFunctionData({ abi, functionName, args });
  return decodeFunctionResult({ abi, functionName, data: rpc("eth_call", [{ to: address, data }, "latest"]) });
}
function equal(actual, expected, label) {
  if (actual !== expected) throw Error(`${label} mismatch`);
}
const chain = Number(BigInt(rpc("eth_chainId")));
equal(chain, 84532, "chain");
const block = rpc("eth_getBlockByNumber", ["latest", false]);
let totalActualCostWei = 0n;
for (let index = 0; index < campaign.receipts.length; index++) {
  const row = campaign.receipts[index];
  equal(row.index, index, "campaign receipt order");
  if (!/^[0-9a-fA-F]{64}$/.test(row.txHash)) throw Error(`Invalid action ${index} transaction digest`);
  const receipt = rpc("eth_getTransactionReceipt", [`0x${row.txHash}`]);
  equal(receipt?.status, "0x1", `action ${index} receipt`);
  equal(Number(BigInt(receipt.blockNumber)), row.blockNumber, `action ${index} block`);
  equal(BigInt(receipt.gasUsed), BigInt(row.gasUsed), `action ${index} gas used`);
  totalActualCostWei += BigInt(row.actualCostWei);
}
if (totalActualCostWei > 900_000_000_000_000n) throw Error("Campaign cost exceeds approved maximum");
for (const [index, label] of [[0, "factory"], [1, "sender"], [2, "standard"], [3, "advanced"], [10, "lock"], [13, "vesting"]]) {
  equal(campaign.receipts[index].txHash.toLowerCase(), config[label].deploymentTx.toLowerCase(), `${label} manifest transaction`);
}
equal(BigInt(rpc("eth_getBalance", [SEPOLIA_SIGNER, "latest"])), 1_000_000_000_000_000n - totalActualCostWei, "signer campaign balance conservation");
const codeHashes = {};
for (const label of ["factory", "sender", "standard", "advanced", "lock", "vesting"]) {
  const item = config[label];
  const code = rpc("eth_getCode", [item.address, "latest"]);
  if (code === "0x") throw Error(`${label} code missing`);
  equal(keccak256(code).slice(2).toLowerCase(), item.runtimeKeccak.toLowerCase(), `${label} runtime`);
  const receipt = rpc("eth_getTransactionReceipt", [`0x${item.deploymentTx}`]);
  equal(receipt?.status, "0x1", `${label} deployment receipt`);
  codeHashes[label] = item.runtimeKeccak;
}
const signer = SEPOLIA_SIGNER;
const standardAddress = config.standard.address;
const advancedAddress = config.advanced.address;
equal(get(standardAddress, token.abi, "totalSupply"), 1000n * unit, "standard supply");
equal(get(standardAddress, token.abi, "balanceOf", [signer]), 970n * unit, "signer standard balance");
equal(get(advancedAddress, advanced.abi, "totalSupply"), 149n * unit, "advanced supply");
equal(get(advancedAddress, advanced.abi, "cap"), 150n * unit, "advanced cap");
equal(get(advancedAddress, advanced.abi, "defaultAdmin").toLowerCase(), signer.toLowerCase(), "advanced admin");
equal(get(advancedAddress, advanced.abi, "defaultAdminDelay"), 86400, "advanced admin delay");
equal(get(advancedAddress, advanced.abi, "paused"), false, "advanced paused state");
for (const role of ["DEFAULT_ADMIN_ROLE", "MINTER_ROLE", "PAUSER_ROLE"]) {
  equal(get(advancedAddress, advanced.abi, "hasRole", [get(advancedAddress, advanced.abi, role), signer]), true, `${role} signer assignment`);
}
for (const [address, amount] of [["0xA945c984d4cD94528D0Ee3eCEe540EE66F1843B0", 10n], ["0xf938C5E7D1e6bf62a2399aE6b14ca13708478ab7", 20n]]) {
  equal(get(standardAddress, token.abi, "balanceOf", [address]), amount * unit, "distribution recipient");
}
equal(get(standardAddress, token.abi, "balanceOf", [config.sender.address]), 0n, "MultiSender custody");
equal(get(standardAddress, token.abi, "allowance", [signer, config.sender.address]), 0n, "MultiSender allowance");
equal(get(config.lock.address, lock.abi, "token").toLowerCase(), standardAddress.toLowerCase(), "lock token");
equal(get(config.lock.address, lock.abi, "beneficiary").toLowerCase(), signer.toLowerCase(), "lock beneficiary");
equal(get(config.lock.address, lock.abi, "deposited"), 25n * unit, "lock funded amount");
equal(get(config.lock.address, lock.abi, "released"), 25n * unit, "lock released amount");
equal(get(standardAddress, token.abi, "balanceOf", [config.lock.address]), 0n, "lock remaining balance");
equal(get(config.vesting.address, vest.abi, "token").toLowerCase(), standardAddress.toLowerCase(), "vesting token");
equal(get(config.vesting.address, vest.abi, "beneficiary").toLowerCase(), signer.toLowerCase(), "vesting beneficiary");
equal(get(config.vesting.address, vest.abi, "allocation"), 100n * unit, "vesting allocation");
equal(get(config.vesting.address, vest.abi, "funded"), true, "vesting funded state");
equal(get(config.vesting.address, vest.abi, "released"), 100n * unit, "vesting released amount");
equal(get(standardAddress, token.abi, "balanceOf", [config.vesting.address]), 0n, "vesting remaining balance");
const nonce = Number(BigInt(rpc("eth_getTransactionCount", [signer, "latest"])));
equal(nonce, 19, "campaign transaction count");
equal(Number(BigInt(rpc("eth_getTransactionCount", [signer, "pending"]))), 19, "pending nonce");
console.log(JSON.stringify({ status: "PASS", chainId: chain, block: Number(BigInt(block.number)), signer, nonce, receiptCount: 19, totalActualCostWei: totalActualCostWei.toString(), codeHashes, standardSupply: "1000e18", advancedSupply: "149e18", lockReleased: "25e18", vestingReleased: "100e18", allRecipientAndRoleChecks: true }, null, 2));
