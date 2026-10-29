// Phase 9A.1: one reviewed transaction at a time. Remote broadcast requires a fresh
// approval file containing the exact manifest digest; the local mode only uses loopback Anvil.
import { readFileSync, writeFileSync, existsSync, lstatSync, renameSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { decodeEventLog, decodeFunctionData, decodeFunctionResult, encodeFunctionData, keccak256, toBytes } from "viem";
import { manifestSha256, transactionPayload, validateManifest } from "./pit9a1-bound-plan.mjs";
import { assertPrepared, assertSigned, recoveryDecision, status } from "./pit9a1-bound-guard.mjs";

const campaignPath = "deployments/base-sepolia-paid-bound-candidate.json";
const keyFile = `${process.env.HOME}/.foundry/keystores/pit-v2-base-sepolia`;
const passwordFile = `${process.env.HOME}/.config/pit/phase4-keystore-password`;
const localRpc = "http://127.0.0.1:9559";
const remoteRead = "https://sepolia.base.org";
const remoteSend = "https://sepolia-sequencer.base.org";
const localState = process.env.PIT9A1_LOCAL_STATE ?? "/tmp/pit9a1-local-state.json";
const remoteState = "/tmp/pit9a1-testnet-state.json";
const same = (a, b) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const artifact = (source, name) => JSON.parse(readFileSync(`out/${source}.sol/${name}.json`, "utf8"));
const creatorA = artifact("PitPaidTokenCreator", "PitPaidTokenCreator");
const operationsA = artifact("PitPaidOperations", "PitPaidOperations");
const standardA = artifact("PitTokens", "PitStandardToken");
const advancedA = artifact("PitTokens", "PitAdvancedToken");
const lockA = artifact("PitSchedules", "PitTokenLock");
const vestA = artifact("PitSchedules", "PitTokenVesting");
const tokenA = standardA;
const call = (address, abi, functionName, args = []) => ({ to: address, data: encodeFunctionData({ abi, functionName, args }) });
const operationNames = { "paid-standard": "PIT_STANDARD_V1", "paid-advanced": "PIT_ADVANCED_V1",
  "paid-multisend": "PIT_MULTISEND_V1", "paid-lock": "PIT_LOCK_V1", "paid-vesting": "PIT_VESTING_V1" };

function processRun(executable, args, input) {
  const output = spawnSync(executable, args, { input, encoding: "utf8", timeout: 30_000, maxBuffer: 20_000_000 });
  if (output.status !== 0) throw Error(`${executable} failed or timed out; outcome must be checked before retry`);
  return output.stdout.trim();
}
function rpc(endpoint, method, params = []) {
  let raw;
  try {
    raw = processRun("curl", ["-sS", "--fail-with-body", "--max-time", "30", "-H", "content-type: application/json", "--data-binary", "@-", endpoint],
      JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }));
  } catch { throw Error(`RPC ${method} timed out or failed; outcome must be checked before retry`); }
  const parsed = JSON.parse(raw);
  if (parsed.error || parsed.result === undefined) throw Error(`RPC ${method} failed; no automatic retry`);
  return parsed.result;
}
const readCall = (read, address, abi, functionName, args = []) => decodeFunctionResult({ abi, functionName,
  data: read("eth_call", [call(address, abi, functionName, args), "latest"]) });
const assert = (condition, reason) => { if (!condition) throw Error(reason); };
const equal = (actual, expected, label) => assert(actual === expected, `${label} mismatch`);
const addressEqual = (actual, expected, label) => assert(same(actual, expected), `${label} mismatch`);

function verifyTemplate(code, a) {
  const template = a.deployedBytecode.object;
  assert(code !== "0x" && code.length === template.length, "Runtime code length mismatch");
  const mutable = new Set();
  for (const refs of Object.values(a.deployedBytecode.immutableReferences ?? {}))
    for (const { start, length } of refs) for (let i = start; i < start + length; i++) mutable.add(i);
  for (let i = 0; i < (code.length - 2) / 2; i++) if (!mutable.has(i))
    assert(code.slice(2 + 2 * i, 4 + 2 * i).toLowerCase() === template.slice(2 + 2 * i, 4 + 2 * i).toLowerCase(), `Runtime code mismatch byte ${i}`);
  return keccak256(code);
}
function verifyBoundCode(campaign, read, completedCount) {
  const getCode = (address) => read("eth_getCode", [address, "latest"]);
  const expected = campaign.paymentCode;
  equal(keccak256(getCode(campaign.paymentToken)), expected.proxyRuntimeKeccak, "Circle proxy runtime");
  const implementation = readCall(read, campaign.paymentToken, [{ type: "function", name: "implementation", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }], "implementation");
  addressEqual(implementation, expected.implementation, "Circle implementation");
  equal(keccak256(getCode(implementation)), expected.implementationRuntimeKeccak, "Circle implementation runtime");
  equal(readCall(read, campaign.paymentToken, tokenA.abi, "decimals"), 6, "Circle decimals");
  for (const item of Object.values(campaign.existingInfrastructure)) equal(keccak256(getCode(item.address)), item.runtimeKeccak, "Existing PIT infrastructure");
  for (const [index, address, a] of [[0, campaign.addresses.paidCreator, creatorA], [1, campaign.addresses.paidOperations, operationsA]]) {
    if (completedCount <= index) { equal(getCode(address), "0x", "Predicted router slot"); continue; }
    verifyTemplate(getCode(address), a);
    addressEqual(readCall(read, address, a.abi, "paymentToken"), campaign.paymentToken, "Payment asset");
    addressEqual(readCall(read, address, a.abi, "feeRecipient"), campaign.feeRecipient, "Fee recipient");
    addressEqual(readCall(read, address, a.abi, "owner"), campaign.priceAdministrator, "Price administrator");
    equal(readCall(read, address, a.abi, "priceVersion"), 1n, "Price version");
    const livePrices = readCall(read, address, a.abi, "prices");
    const priceOutputs = a.abi.find((entry) => entry.type === "function" && entry.name === "prices").outputs;
    for (const [priceIndex, output] of priceOutputs.entries())
      equal(livePrices[priceIndex], BigInt(campaign.pricesMicro[output.name]), `${output.name} price`);
  }
  if (completedCount <= 3) equal(getCode(campaign.addresses.standardToken), "0x", "Predicted standard token slot");
  else verifyTemplate(getCode(campaign.addresses.standardToken), standardA);
  if (completedCount <= 5) equal(getCode(campaign.addresses.advancedToken), "0x", "Predicted advanced token slot");
  else verifyTemplate(getCode(campaign.addresses.advancedToken), advancedA);
  if (completedCount <= 11) equal(getCode(campaign.addresses.lock), "0x", "Predicted lock slot");
  else verifyTemplate(getCode(campaign.addresses.lock), lockA);
  if (completedCount <= 14) equal(getCode(campaign.addresses.vesting), "0x", "Predicted vesting slot");
  else verifyTemplate(getCode(campaign.addresses.vesting), vestA);
}
function snapshot(campaign, action, read) {
  const balance = (token, account) => readCall(read, token, tokenA.abi, "balanceOf", [account]);
  const result = { ethWei: BigInt(read("eth_getBalance", [campaign.signer, "latest"])).toString(),
    merchantUsdc: balance(campaign.paymentToken, campaign.feeRecipient).toString(),
    payerUsdc: balance(campaign.paymentToken, campaign.signer).toString() };
  if (action.kind === "paid-multisend") {
    result.assetPayer = balance(action.token, campaign.signer).toString();
    result.assetRecipients = action.recipients.map((x) => balance(action.token, x.address).toString());
  }
  return result;
}
function event(log, abi, name) { try { const decoded = decodeEventLog({ abi, topics: log.topics, data: log.data }); return decoded.eventName === name ? decoded : null; } catch { return null; } }
function verifyPaid(campaign, action, payload, receipt, pre, read) {
  const abi = action.to === campaign.addresses.paidCreator ? creatorA.abi : operationsA.abi;
  const feeEvents = receipt.logs.filter((x) => same(x.address, action.to)).map((x) => event(x, abi, "FeePaid")).filter(Boolean);
  const opEvents = receipt.logs.filter((x) => same(x.address, action.to)).map((x) => event(x, abi, "OperationExecuted")).filter(Boolean);
  const transfers = receipt.logs.filter((x) => same(x.address, campaign.paymentToken)).map((x) => event(x, tokenA.abi, "Transfer")).filter(Boolean);
  equal(feeEvents.length, 1, "FeePaid event count"); equal(opEvents.length, 1, "OperationExecuted event count");
  const feeEvent = feeEvents[0].args, op = opEvents[0].args, fee = BigInt(action.feeMicro);
  addressEqual(feeEvent.payer, campaign.signer, "Fee payer"); addressEqual(feeEvent.recipient, campaign.feeRecipient, "Fee receiver");
  equal(feeEvent.amount, fee, "Fee amount"); equal(feeEvent.intentId, action.quote.intentId, "Fee intent");
  equal(feeEvent.operation, keccak256(toBytes(operationNames[action.kind])), "Fee operation");
  addressEqual(op.payer, campaign.signer, "Operation payer"); equal(op.intentId, action.quote.intentId, "Operation intent");
  equal(op.operation, feeEvent.operation, "Operation code"); equal(op.requestHash, keccak256(payload.data), "Operation calldata hash");
  equal(transfers.filter((x) => same(x.args.from, campaign.signer) && same(x.args.to, campaign.feeRecipient) && x.args.value === fee).length, 1, "Circle transfer evidence");
  equal(readCall(read, campaign.paymentToken, tokenA.abi, "balanceOf", [campaign.feeRecipient]), BigInt(pre.merchantUsdc) + fee, "Merchant balance delta");
  equal(readCall(read, campaign.paymentToken, tokenA.abi, "balanceOf", [campaign.signer]), BigInt(pre.payerUsdc) - fee, "Payer balance delta");
  equal(readCall(read, action.to, abi, "usedIntent", [campaign.signer, action.quote.intentId]), true, "Intent consumed");
  equal(readCall(read, campaign.paymentToken, tokenA.abi, "allowance", [campaign.signer, action.to]), 0n, "Residual fee allowance");
  if (action.kind === "paid-standard" || action.kind === "paid-advanced") {
    const expected = action.expectedToken, tokenAbi = action.kind === "paid-standard" ? standardA.abi : advancedA.abi;
    addressEqual(op.result, expected, "Created token");
    verifyTemplate(read("eth_getCode", [expected, "latest"]), action.kind === "paid-standard" ? standardA : advancedA);
    equal(readCall(read, expected, tokenAbi, "name"), action.tokenName, "Token name");
    equal(readCall(read, expected, tokenAbi, "symbol"), action.symbol, "Token symbol");
    equal(readCall(read, expected, tokenAbi, "totalSupply"), BigInt(action.supplyRaw), "Token supply");
    equal(readCall(read, expected, tokenAbi, "balanceOf", [action.recipient]), BigInt(action.supplyRaw), "Initial allocation");
    if (action.kind === "paid-advanced") {
      equal(readCall(read, expected, tokenAbi, "cap"), BigInt(action.capRaw), "Advanced supply cap");
      addressEqual(readCall(read, expected, tokenAbi, "defaultAdmin"), action.administrator, "Advanced admin");
      equal(BigInt(readCall(read, expected, tokenAbi, "defaultAdminDelay")), BigInt(action.defaultAdminDelaySeconds), "Admin delay");
      for (const roleName of ["DEFAULT_ADMIN_ROLE", "MINTER_ROLE", "PAUSER_ROLE"])
        equal(readCall(read, expected, tokenAbi, "hasRole", [readCall(read, expected, tokenAbi, roleName), action.administrator]), true, `${roleName} assignment`);
      for (const roleName of ["DEFAULT_ADMIN_ROLE", "MINTER_ROLE", "PAUSER_ROLE"])
        equal(readCall(read, expected, tokenAbi, "hasRole", [readCall(read, expected, tokenAbi, roleName), campaign.addresses.paidCreator]), false, `${roleName} router absence`);
    }
  }
  if (action.kind === "paid-multisend") {
    equal(readCall(read, action.token, standardA.abi, "balanceOf", [campaign.signer]), BigInt(pre.assetPayer) - BigInt(action.totalRaw), "Distribution payer delta");
    for (let i = 0; i < action.recipients.length; i++) equal(readCall(read, action.token, standardA.abi, "balanceOf", [action.recipients[i].address]), BigInt(pre.assetRecipients[i]) + BigInt(action.recipients[i].amountRaw), "Recipient allocation");
    equal(readCall(read, action.token, standardA.abi, "balanceOf", [action.to]), 0n, "Router token custody");
    equal(readCall(read, action.token, standardA.abi, "allowance", [campaign.signer, action.to]), 0n, "Residual distribution allowance");
  }
  if (action.kind === "paid-lock" || action.kind === "paid-vesting") {
    const expected = action.kind === "paid-lock" ? action.expectedLock : action.expectedVesting;
    const scheduleAbi = action.kind === "paid-lock" ? lockA.abi : vestA.abi;
    addressEqual(op.result, expected, "Created schedule");
    addressEqual(readCall(read, expected, scheduleAbi, "token"), action.token, "Schedule asset");
    addressEqual(readCall(read, expected, scheduleAbi, "beneficiary"), action.beneficiary, "Schedule beneficiary");
    equal(readCall(read, action.token, standardA.abi, "balanceOf", [expected]), BigInt(action.amountRaw), "Schedule funding");
    equal(readCall(read, action.token, standardA.abi, "allowance", [campaign.signer, action.to]), 0n, "Residual schedule allowance");
    equal(readCall(read, action.token, standardA.abi, "balanceOf", [action.to]), 0n, "Router schedule custody");
    if (action.kind === "paid-lock") {
      const [, , , unlock] = decodeFunctionData({ abi, data: payload.data }).args;
      equal(BigInt(readCall(read, expected, scheduleAbi, "unlockTime")), unlock, "Lock unlock time");
      equal(readCall(read, expected, scheduleAbi, "deposited"), BigInt(action.amountRaw), "Lock deposited");
    } else {
      const [config] = decodeFunctionData({ abi, data: payload.data }).args;
      equal(BigInt(readCall(read, expected, scheduleAbi, "start")), config.start, "Vesting start");
      equal(BigInt(readCall(read, expected, scheduleAbi, "cliff")), config.cliff, "Vesting cliff");
      equal(BigInt(readCall(read, expected, scheduleAbi, "duration")), config.duration, "Vesting duration");
      equal(readCall(read, expected, scheduleAbi, "allocation"), BigInt(action.amountRaw), "Vesting allocation");
      equal(readCall(read, expected, scheduleAbi, "funded"), true, "Vesting funded");
    }
  }
  return { payer: campaign.signer, feeRecipient: campaign.feeRecipient, feeMicro: fee.toString(), intentId: action.quote.intentId,
    operationCode: feeEvent.operation, result: op.result };
}

function save(path, state) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
}
function load(path, campaign) {
  const state = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { schema: "pit9a1.execution-state.v1", manifestSha256, signer: campaign.signer,
    nextIndex: 0, spentWei: "0", receipts: [], evidence: [] };
  assert(state.manifestSha256 === manifestSha256 && same(state.signer, campaign.signer)
    && state.nextIndex === state.receipts.length, "Execution state differs from approved campaign");
  assert(state.nextIndex <= campaign.actions.length && state.evidence.length <= state.receipts.length, "Invalid execution state length");
  return state;
}
function verifyReceiptChain(campaign, state, read) {
  const dependencies = [];
  let verifiedSpend = 0n;
  for (const item of state.receipts) {
    const action = campaign.actions[item.index];
    assert(action && item.index === dependencies.length && item.id === action.id,
      "Persisted receipt order differs from approved campaign");
    const block = read("eth_getBlockByNumber", [`0x${BigInt(item.blockNumber).toString(16)}`, false]);
    assert(block && same(block.hash, item.blockHash), "Previously confirmed receipt is noncanonical");
    const receipt = read("eth_getTransactionReceipt", [item.txHash]);
    assert(receipt && receipt.status === "0x1" && same(receipt.blockHash, item.blockHash)
      && BigInt(receipt.blockNumber) === BigInt(item.blockNumber), "Persisted receipt evidence differs from chain");
    assert(BigInt(receipt.gasUsed) === BigInt(item.gasUsed)
      && BigInt(receipt.effectiveGasPrice) === BigInt(item.effectiveGasPrice),
    "Persisted gas evidence differs from chain");
    const lowerBound = BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice)
      + BigInt(receipt.l1Fee ?? "0x0");
    assert(BigInt(item.actualCostWei) >= lowerBound
      && BigInt(item.actualCostWei) <= BigInt(item.gasUsed) * BigInt(campaign.limits.maximumFeePerGasWei)
        + BigInt(campaign.limits.l1ReservePerTransactionWei), "Persisted spend outside receipt bounds");
    verifiedSpend += BigInt(item.actualCostWei);
    const tx = read("eth_getTransactionByHash", [item.txHash]);
    const exact = transactionPayload(campaign, item.index, dependencies);
    assert(tx && same(tx.from, campaign.signer) && BigInt(tx.chainId) === BigInt(campaign.chainId)
      && BigInt(tx.nonce) === exact.nonce && same(tx.to, exact.to) && BigInt(tx.value) === exact.value
      && tx.input === exact.data && keccak256(tx.input) === item.dataKeccak
      && exact.payloadSha256 === item.payloadSha256
      && BigInt(tx.gas) === exact.gasLimit && BigInt(tx.maxFeePerGas) <= BigInt(campaign.limits.maximumFeePerGasWei),
      "Persisted transaction payload differs from approved campaign");
    assert(Number(BigInt(block.timestamp)) === item.blockTimestamp,
      "Persisted dependency timestamp differs from canonical block");
    dependencies.push({ canonical: true, blockTimestamp: item.blockTimestamp });
  }
  assert(verifiedSpend === BigInt(state.spentWei), "Aggregate spent budget differs from confirmed receipts");
}
function receiptDependencies(state) { return state.receipts.map((x) => ({ canonical: true, blockTimestamp: x.blockTimestamp })); }
function localOrRemote(mode) {
  if (mode === "--local-rehearsal" || mode === "--local-recover" || mode === "--local-audit") return { readRpc: localRpc, sendRpc: localRpc, statePath: localState, local: true };
  if (mode === "--testnet-step" || mode === "--testnet-recover" || mode === "--testnet-preflight") return { readRpc: remoteRead, sendRpc: remoteSend, statePath: remoteState, local: false };
  throw Error("Unsupported mode; no broadcast");
}
function approved(mode, args) {
  if (mode === "--testnet-preflight" || mode === "--testnet-recover" || mode.startsWith("--local-")) return;
  const flag = args.indexOf("--approval-file");
  const file = args[flag + 1];
  const fileInfo = file?.startsWith("/tmp/") && existsSync(file) ? lstatSync(file) : null;
  if (flag < 0 || !fileInfo?.isFile() || fileInfo.mode & 0o077)
    throw Error("Protected manifest-bound approval file missing");
  if (readFileSync(file, "utf8").trim() !== `GO PIT9A TESTNET ${manifestSha256}`)
    throw Error("Fresh manifest-bound operator approval missing");
}

async function finish(campaign, state, path, read, index, receipt, requiredConfirmations) {
  const pending = state.pending;
  assert(pending && pending.index === index && same(pending.txHash, receipt.transactionHash), "Pending transaction mismatch");
  const block = read("eth_getBlockByNumber", [receipt.blockNumber, false]);
  assert(block && same(block.hash, receipt.blockHash), "Transaction receipt noncanonical");
  assert(BigInt(read("eth_blockNumber")) >= BigInt(receipt.blockNumber) + BigInt(requiredConfirmations) - 1n,
    "Receipt needs more canonical confirmations; pending state retained");
  assert(receipt.status === "0x1", "Transaction reverted; fee state reverted, gas spent; campaign halted");
  const action = campaign.actions[index];
  const payload = transactionPayload(campaign, index, receiptDependencies(state));
  equal(payload.dataKeccak, pending.dataKeccak, "Submitted calldata digest");
  equal(payload.payloadSha256, pending.payloadSha256, "Submitted full payload digest");
  addressEqual(receipt.to, action.to, "Receipt destination");
  if (action.kind === "deploy") addressEqual(receipt.contractAddress, action.expectedAddress, "Deployment address");
  let paid;
  if (action.kind.startsWith("paid-")) paid = verifyPaid(campaign, action, payload, receipt, pending.pre, read);
  if (action.kind === "approve") {
    const approvals = receipt.logs.filter((x) => same(x.address, action.token)).map((x) => event(x, tokenA.abi, "Approval")).filter(Boolean);
    equal(approvals.filter((x) => same(x.args.owner, campaign.signer) && same(x.args.spender, action.spender)
      && x.args.value === BigInt(action.amountRaw)).length, 1, "Exact Approval event");
    equal(readCall(read, action.token, tokenA.abi, "allowance", [campaign.signer, action.spender]), BigInt(action.amountRaw), "Exact approval");
  }
  const after = BigInt(read("eth_getBalance", [campaign.signer, "latest"]));
  const spent = BigInt(pending.pre.ethWei) - after;
  assert(spent >= 0n && spent <= BigInt(pending.reserveWei), "Actual ETH spend exceeds approved per-step reserve");
  const total = BigInt(state.spentWei) + spent;
  assert(total <= BigInt(campaign.limits.maximumTotalSpendWei), "Aggregate ETH budget exceeded");
  equal(BigInt(read("eth_getTransactionCount", [campaign.signer, "latest"])), BigInt(action.nonce) + 1n, "Postflight nonce");
  state.receipts.push({ index, id: action.id, txHash: pending.txHash, blockNumber: Number(BigInt(receipt.blockNumber)),
    blockHash: receipt.blockHash, blockTimestamp: Number(BigInt(block.timestamp)), gasUsed: BigInt(receipt.gasUsed).toString(),
    effectiveGasPrice: BigInt(receipt.effectiveGasPrice).toString(), actualCostWei: spent.toString(),
    dataKeccak: payload.dataKeccak, payloadSha256: payload.payloadSha256,
    ...(paid ? { paid } : {}), ...(receipt.contractAddress ? { contractAddress: receipt.contractAddress } : {}) });
  if (paid) state.evidence.push({ chainId: 84532, index, txHash: pending.txHash, blockHash: receipt.blockHash, blockNumber: Number(BigInt(receipt.blockNumber)), ...paid });
  state.nextIndex++; state.spentWei = total.toString(); delete state.pending;
  verifyBoundCode(campaign, read, state.nextIndex);
  save(path, state);
  console.log(JSON.stringify({ index, id: action.id, txHash: pending.txHash, blockNumber: Number(BigInt(receipt.blockNumber)), actualCostWei: spent.toString(), paidFeeMicro: paid?.feeMicro ?? "0" }));
}

async function step(campaign, state, config, index) {
  const read = (method, params) => rpc(config.readRpc, method, params);
  if (state.pending || state.nextIndex !== index) throw Error("Unresolved or out-of-order action; use recovery, never auto-resubmit");
  verifyReceiptChain(campaign, state, read);
  verifyBoundCode(campaign, read, index);
  const action = campaign.actions[index];
  if (!action) throw Error("Action not in approved campaign");
  const payload = transactionPayload(campaign, index, receiptDependencies(state));
  const signer = processRun("cast", ["wallet", "address", "--keystore", keyFile, "--password-file", passwordFile]);
  const pre = snapshot(campaign, action, read);
  const tx = { from: campaign.signer, data: payload.data, value: "0x0", ...(payload.to ? { to: payload.to } : {}) };
  const estimate = BigInt(read("eth_estimateGas", [tx]));
  read("eth_call", [tx, "latest"]); // simulate again immediately before signing
  const ctx = { completedCount: index, chainId: Number(BigInt(read("eth_chainId"))), signer, nonce: BigInt(read("eth_getTransactionCount", [campaign.signer, "latest"])),
    pendingNonce: BigInt(read("eth_getTransactionCount", [campaign.signer, "pending"])), gasEstimate: estimate,
    currentGasPrice: BigInt(read("eth_gasPrice")), maxFeePerGas: BigInt(campaign.limits.maximumFeePerGasWei),
    signerEthWei: BigInt(pre.ethWei), spentWei: BigInt(state.spentWei), pending: false };
  const exact = assertPrepared(campaign, manifestSha256, index, receiptDependencies(state), ctx, payload);
  // Base L1 and operator fees are not hidden inside L2 gas; bind their upper estimates too.
  const oracle = "0x420000000000000000000000000000000000000F";
  const oracleRead = (selector, amount) => BigInt(read("eth_call", [{ to: oracle, data: `${selector}${amount.toString(16).padStart(64, "0")}` }, "latest"]));
  const l1 = oracleRead("0xf1c7a58b", BigInt((payload.data.length - 2) / 2 + 500));
  const operator = oracleRead("0x275aedd2", exact.gasLimit);
  assert(l1 + operator <= BigInt(campaign.limits.l1ReservePerTransactionWei), "Base L1 or operator fee exceeds per-step reserve");
  const raw = processRun("cast", ["mktx", "--rpc-url", config.readRpc, "--chain", String(campaign.chainId), "--keystore", keyFile,
    "--password-file", passwordFile, "--gas-limit", exact.gasLimit.toString(), "--gas-price", exact.maxFeePerGas.toString(),
    "--priority-gas-price", "1000000", "--nonce", String(exact.nonce), ...(payload.to ? [payload.to, payload.data] : ["--create", payload.data])]);
  const txHash = await assertSigned(raw, exact);
  state.pending = { index, nonce: action.nonce, txHash, dataKeccak: exact.dataKeccak,
    payloadSha256: exact.payloadSha256, reserveWei: exact.reserveWei.toString(), pre,
    submission: status.SUBMISSION_UNCERTAIN };
  save(config.statePath, state); // persist before any send; a timeout cannot cause automatic replay
  const acceptedHash = rpc(config.sendRpc, "eth_sendRawTransaction", [raw]);
  addressEqual(acceptedHash, txHash, "RPC transaction hash");
  let receipt;
  for (let attempt = 0; attempt < 60; attempt++) {
    receipt = read("eth_getTransactionReceipt", [txHash]);
    if (receipt) break;
    await sleep(2000);
  }
  if (!receipt) throw Error("Receipt unavailable; pending state retained; reconcile before any retry");
  if (!config.local) {
    for (let attempt = 0; attempt < 30; attempt++) {
      if (BigInt(read("eth_blockNumber")) >= BigInt(receipt.blockNumber) + BigInt(campaign.confirmationPolicy.baseSepolia) - 1n) break;
      await sleep(2000);
    }
  }
  await finish(campaign, state, config.statePath, read, index, receipt,
    config.local ? campaign.confirmationPolicy.localFork : campaign.confirmationPolicy.baseSepolia);
}

async function recover(campaign, state, config) {
  const read = (method, params) => rpc(config.readRpc, method, params);
  if (!state.pending) throw Error("No pending transaction to reconcile");
  const p = state.pending;
  const receipt = read("eth_getTransactionReceipt", [p.txHash]);
  const chain = { nonce: BigInt(read("eth_getTransactionCount", [campaign.signer, "latest"])),
    transactionPresent: !!read("eth_getTransactionByHash", [p.txHash]),
    receipt: receipt ? { transactionHash: receipt.transactionHash, status: receipt.status === "0x1" ? "success" : "reverted",
      canonical: !!read("eth_getBlockByNumber", [receipt.blockNumber, false]) &&
        same(read("eth_getBlockByNumber", [receipt.blockNumber, false]).hash, receipt.blockHash) } : null };
  const result = recoveryDecision(p, chain);
  if (result !== status.MINED_SUCCESS) throw Error(`Recovery halted: ${result}; no automatic resubmission`);
  await finish(campaign, state, config.statePath, read, p.index, receipt,
    config.local ? campaign.confirmationPolicy.localFork : campaign.confirmationPolicy.baseSepolia);
}

async function main() {
  const mode = process.argv[2];
  if (mode === "--local-check-manifest") {
    const file = process.argv[3];
    if (!file?.startsWith("/tmp/")) throw Error("Local manifest check requires a /tmp file");
    validateManifest(JSON.parse(readFileSync(file, "utf8")));
    console.log(`PIT9A1 manifest valid: ${manifestSha256}; no signing or broadcast`);
    return;
  }
  const config = localOrRemote(mode);
  if (config.local && (!localState.startsWith("/tmp/") || config.sendRpc !== localRpc)) throw Error("Local rehearsal must stay on loopback");
  approved(mode, process.argv);
  const campaign = JSON.parse(readFileSync(campaignPath, "utf8"));
  validateManifest(campaign);
  const state = load(config.statePath, campaign);
  if (mode === "--testnet-preflight" || mode === "--local-audit") {
    const read = (method, params) => rpc(config.readRpc, method, params);
    verifyReceiptChain(campaign, state, read); verifyBoundCode(campaign, read, state.nextIndex);
    const deploymentEstimates = mode === "--testnet-preflight" && state.nextIndex === 0
      ? [0, 1].map((index) => {
        const payload = transactionPayload(campaign, index);
        try { return BigInt(read("eth_estimateGas", [{ from: campaign.signer, data: payload.data, value: "0x0" }])).toString(); }
        catch { return null; }
      }) : undefined;
    console.log(JSON.stringify({ manifestSha256, chainId: Number(BigInt(read("eth_chainId"))),
      nonce: Number(BigInt(read("eth_getTransactionCount", [campaign.signer, "latest"]))),
      signerEthWei: BigInt(read("eth_getBalance", [campaign.signer, "latest"])).toString(),
      signerTestUsdcMicro: readCall(read, campaign.paymentToken, tokenA.abi, "balanceOf", [campaign.signer]).toString(),
      nextIndex: state.nextIndex, spentWei: state.spentWei,
      paidFeeMicro: state.evidence.reduce((total, entry) => total + BigInt(entry.feeMicro), 0n).toString(),
      ...(deploymentEstimates ? { deploymentGasEstimates: deploymentEstimates } : {}),
      noBroadcast: true }));
  } else if (mode.endsWith("recover")) await recover(campaign, state, config);
  else if (config.local) { while (state.nextIndex < campaign.actions.length) await step(campaign, state, config, state.nextIndex); }
  else {
    const index = Number(process.argv[3]);
    if (!Number.isInteger(index)) throw Error("Explicit step index required");
    await step(campaign, state, config, index);
  }
}
main().catch((error) => { console.error(`PIT9A1 HALT: ${error.message}`); process.exitCode = 1; });
