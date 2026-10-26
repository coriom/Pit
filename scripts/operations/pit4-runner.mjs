// PIT4 controlled testnet runner. It cannot broadcast without the exact operator GO.
// Only public contract data and receipt metadata are written to /tmp/pit4-campaign-state.json.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { keccak256, parseTransaction, recoverTransactionAddress, getContractAddress } from "viem";
import { ACTIONS, CAMPAIGN_INITIAL_BALANCE_WEI, CAMPAIGN_MAX_SPEND_WEI,
  MAX_FEE_PER_GAS_WEI, assertSepoliaBudget } from "./sepolia-budget.mjs";
import { SEPOLIA_SIGNER } from "./sepolia-config.mjs";
import { transactionPlan, verifyState, F, M } from "./pit4-plan.mjs";

const READ_RPC = "https://sepolia.base.org";
const SEND_RPC = "https://sepolia-sequencer.base.org";
const KEYSTORE = `${process.env.HOME}/.foundry/keystores/pit-v2-base-sepolia`;
const PASSWORD_FILE = `${process.env.HOME}/.config/pit/phase4-keystore-password`;
const STATE_FILE = "/tmp/pit4-campaign-state.json";
const oracle = "0x420000000000000000000000000000000000000F";
const sha256 = (hex) => createHash("sha256").update(Buffer.from(hex.slice(2), "hex")).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(executable, args, input) {
  const p = spawnSync(executable, args, { input, encoding: "utf8", timeout: 30_000, maxBuffer: 20 * 1024 * 1024 });
  if (p.status !== 0) throw Error(`${executable} failed (status ${p.status ?? "timeout"}); no automatic retry`);
  return p.stdout.trim();
}

function rpc(endpoint, method, params) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const output = run("curl", ["-sS", "--fail-with-body", "--max-time", "15", "-H", "content-type: application/json", "--data-binary", "@-", endpoint], body);
  const response = JSON.parse(output);
  if (response.error || response.result === undefined) throw Error(`RPC ${method} rejected request (code ${response.error?.code ?? "unknown"}); no automatic retry`);
  return response.result;
}

function read(method, params = []) { return rpc(READ_RPC, method, params); }
function oracleUint(selector, n) {
  return BigInt(read("eth_call", [{ to: oracle, data: `${selector}${n.toString(16).padStart(64, "0")}` }, "latest"]));
}

function planned(index, state, blockTimestamp) {
  if (index >= 2) {
    const plan = transactionPlan(index, state, blockTimestamp);
    if (plan.artifact) {
      const expectedCreation = index === 10
        ? "93a73d60ecb8fd4596d7d3b58c691018c7981d63fd99ed864503bdd714e23706"
        : index === 13
          ? "55d5cf49a9f7c78c5e26a5e3bc267dc358f10919160c384385ca2a7562819a59"
          : undefined;
      if (expectedCreation && sha256(plan.artifact.bytecode.object) !== expectedCreation) throw Error("Schedule creation bytecode differs from approved manifest");
    }
    return { action: ACTIONS[index][0], ...plan };
  }
  const definitions = [
    ["PitTokens", "PitTokenFactory", "c5a1ed67560d786f133a13d78c5ae462eb770fc47af22145e4dcf02e95173003"],
    ["PitMultiSender", "PitMultiSender", "fe4832b285797b5df9a0eccc4a97f661b81e2f23d9fc8c9f4df6ad82cc3525f3"],
  ];
  if (index >= definitions.length) throw Error("Action needs a separately reviewed exact transaction plan");
  const [source, name, approvedCreationHash] = definitions[index];
  const artifact = JSON.parse(readFileSync(`out/${source}.sol/${name}.json`, "utf8"));
  const data = artifact.bytecode.object;
  if (sha256(data) !== approvedCreationHash) throw Error("Creation bytecode differs from approved Phase 3 manifest");
  const address = getContractAddress({ from: SEPOLIA_SIGNER, nonce: BigInt(index) });
  const expectedRuntime = sha256(artifact.deployedBytecode.object);
  if (Object.keys(artifact.deployedBytecode.immutableReferences ?? {}).length) throw Error("Unexpected runtime immutables");
  return { action: ACTIONS[index][0], data, address, expectedRuntime };
}

function verifyRuntime(code, artifact) {
  const template = artifact.deployedBytecode.object;
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(code) || code.length !== template.length) throw Error("On-chain runtime length mismatch");
  const mutable = new Set();
  for (const references of Object.values(artifact.deployedBytecode.immutableReferences ?? {})) {
    for (const { start, length } of references) for (let i = start; i < start + length; i++) mutable.add(i);
  }
  for (let i = 0; i < (code.length - 2) / 2; i++) {
    if (mutable.has(i)) continue;
    if (code.slice(2 + 2 * i, 4 + 2 * i).toLowerCase() !== template.slice(2 + 2 * i, 4 + 2 * i).toLowerCase()) throw Error(`On-chain runtime mismatch at byte ${i}`);
  }
  return sha256(code);
}

async function main() {
  if (process.env.PIT4_GO !== "GO PIT4 BASE SEPOLIA") throw Error("Exact operator GO missing");
  const index = Number(process.argv[2]);
  if (!Number.isInteger(index) || index < 0 || index >= ACTIONS.length) throw Error("Action index outside approved campaign");
  const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {
    nextIndex: 0, previousBalanceWei: CAMPAIGN_INITIAL_BALANCE_WEI.toString(), receipts: [],
  };
  if (state.nextIndex !== index || state.pending) throw Error("Campaign state or previous transaction is unresolved");
  const chainId = Number(BigInt(read("eth_chainId")));
  const latestBlock = read("eth_getBlockByNumber", ["latest", false]);
  const plan = planned(index, state, BigInt(latestBlock.timestamp));
  const latestNonce = BigInt(read("eth_getTransactionCount", [SEPOLIA_SIGNER, "latest"]));
  const pendingNonce = BigInt(read("eth_getTransactionCount", [SEPOLIA_SIGNER, "pending"]));
  const balance = BigInt(read("eth_getBalance", [SEPOLIA_SIGNER, "latest"]));
  const keystoreAddress = run("cast", ["wallet", "address", "--keystore", KEYSTORE, "--password-file", PASSWORD_FILE]);
  if (keystoreAddress !== SEPOLIA_SIGNER || latestNonce !== pendingNonce) throw Error("Signer or pending nonce mismatch");
  for (const [address, source, contract] of [[F, "PitTokens", "PitTokenFactory"], [M, "PitMultiSender", "PitMultiSender"]]) {
    if ((address === F && index === 0) || (address === M && index <= 1)) continue;
    const artifact = JSON.parse(readFileSync(`out/${source}.sol/${contract}.json`, "utf8"));
    verifyRuntime(read("eth_getCode", [address, "latest"]), artifact);
  }
  if (plan.expectedAddress && read("eth_getCode", [plan.expectedAddress, "latest"]) !== "0x") throw Error("Predicted new contract address already contains code");
  const txRequest = { from: SEPOLIA_SIGNER, data: plan.data, value: "0x0" };
  if (plan.to) txRequest.to = plan.to;
  const estimate = BigInt(read("eth_estimateGas", [txRequest]));
  const currentGasPrice = BigInt(read("eth_gasPrice"));
  if (currentGasPrice > MAX_FEE_PER_GAS_WEI) throw Error("Current gas price exceeds approved ceiling");
  const gasLimit = ACTIONS[index][1];
  const unsignedBytes = BigInt((plan.data.length - 2) / 2 + 500);
  const l1UpperBoundWei = oracleUint("0xf1c7a58b", unsignedBytes);
  const operatorFeeWei = oracleUint("0x275aedd2", gasLimit);
  const bound = assertSepoliaBudget({ index, action: plan.action, chainId, signer: SEPOLIA_SIGNER, nonce: latestNonce,
    initialBalanceWei: CAMPAIGN_INITIAL_BALANCE_WEI, currentBalanceWei: balance,
    previousBalanceWei: BigInt(state.previousBalanceWei), estimatedGas: estimate,
    maxFeePerGasWei: MAX_FEE_PER_GAS_WEI, l1UpperBoundWei, operatorFeeWei });
  // No CLI fallback may choose a different RPC, chain, signer, nonce, calldata or fee.
  const raw = run("cast", ["mktx", "--rpc-url", READ_RPC, "--chain", "84532", "--keystore", KEYSTORE,
    "--password-file", PASSWORD_FILE, "--gas-limit", String(bound.gasLimit), "--gas-price", String(MAX_FEE_PER_GAS_WEI),
    "--priority-gas-price", "1000000", "--nonce", String(index), ...(plan.to ? [plan.to, plan.data] : ["--create", plan.data])]);
  if (!/^0x[0-9a-fA-F]+$/.test(raw)) throw Error("Malformed signed transaction");
  const parsed = parseTransaction(raw);
  const recovered = await recoverTransactionAddress({ serializedTransaction: raw });
  if (recovered.toLowerCase() !== SEPOLIA_SIGNER.toLowerCase() || parsed.chainId !== 84532 || parsed.nonce !== index
    || parsed.gas !== gasLimit || parsed.maxFeePerGas !== MAX_FEE_PER_GAS_WEI
    || parsed.maxPriorityFeePerGas !== 1_000_000n
    || (parsed.to ?? "").toLowerCase() !== (plan.to ?? "").toLowerCase()
    || parsed.data !== plan.data || (parsed.value ?? 0n) !== 0n) {
    throw Error("Signed transaction differs from reviewed action");
  }
  const txHash = keccak256(raw);
  state.pending = { index, action: plan.action, txHash, expectedAddress: plan.expectedAddress ?? plan.address ?? null };
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  const acceptedHash = rpc(SEND_RPC, "eth_sendRawTransaction", [raw]);
  if (acceptedHash.toLowerCase() !== txHash.toLowerCase()) throw Error("Sequencer returned an unexpected transaction hash");
  let receipt;
  for (let attempt = 0; attempt < 60; ++attempt) {
    receipt = read("eth_getTransactionReceipt", [txHash]);
    if (receipt) break;
    await sleep(2000);
  }
  if (!receipt || receipt.status !== "0x1") throw Error("Receipt missing or reverted");
  if (plan.to === undefined && receipt.contractAddress?.toLowerCase() !== (plan.expectedAddress ?? plan.address).toLowerCase()) throw Error("Unexpected deployment address");
  const newContractAddress = plan.expectedAddress ?? plan.address;
  const runtimeHash = newContractAddress
    ? (plan.artifact ? verifyRuntime(read("eth_getCode", [newContractAddress, "latest"]), plan.artifact) : sha256(read("eth_getCode", [newContractAddress, "latest"])))
    : null;
  if (plan.expectedRuntime && runtimeHash !== plan.expectedRuntime) throw Error("On-chain runtime bytecode mismatch");
  if (index >= 2) verifyState(index, plan, state, receipt, read, verifyRuntime);
  const after = BigInt(read("eth_getBalance", [SEPOLIA_SIGNER, "latest"]));
  const actualCost = balance - after;
  if (actualCost < 0n || actualCost > bound.worstCaseWei || CAMPAIGN_INITIAL_BALANCE_WEI - after > CAMPAIGN_MAX_SPEND_WEI) throw Error("Actual spending exceeded the approved bound");
  const afterNonce = BigInt(read("eth_getTransactionCount", [SEPOLIA_SIGNER, "latest"]));
  if (afterNonce !== latestNonce + 1n) throw Error("Post-receipt nonce mismatch");
  state.receipts.push({ index, action: plan.action, txHash, blockNumber: Number(BigInt(receipt.blockNumber)),
    address: newContractAddress ?? plan.to, gasUsed: BigInt(receipt.gasUsed).toString(),
    effectiveGasPrice: BigInt(receipt.effectiveGasPrice).toString(), actualCostWei: actualCost.toString(),
    runtimeSha256: runtimeHash });
  state.nextIndex = index + 1;
  state.previousBalanceWei = after.toString();
  delete state.pending;
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(state.receipts.at(-1)));
}

main().catch((error) => { console.error(`PIT4 HALT: ${error.message}`); process.exitCode = 1; });
