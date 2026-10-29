// Reproduce the approved campaign from public Base Sepolia RPC only. No signer or send method.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { decodeEventLog, decodeFunctionResult, encodeFunctionData, keccak256, toBytes } from "viem";
import { manifestSha256, transactionPayload, validateManifest } from "./pit9a1-bound-plan.mjs";

const path = "deployments/base-sepolia-paid-execution.json";
const campaign = JSON.parse(readFileSync("deployments/base-sepolia-paid-bound-candidate.json", "utf8"));
const recorded = JSON.parse(readFileSync(path, "utf8"));
const artifact = (source, name) => JSON.parse(readFileSync(`out/${source}.sol/${name}.json`, "utf8"));
const creator = artifact("PitPaidTokenCreator", "PitPaidTokenCreator");
const operations = artifact("PitPaidOperations", "PitPaidOperations");
const token = artifact("PitTokens", "PitStandardToken");
const advanced = artifact("PitTokens", "PitAdvancedToken");
const lock = artifact("PitSchedules", "PitTokenLock");
const vest = artifact("PitSchedules", "PitTokenVesting");
const same = (a, b) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
const check = (yes, label) => { if (!yes) throw Error(label); };
const eq = (a, b, label) => check(a === b, label);
const addr = (a, b, label) => check(same(a, b), label);
function rpc(method, params = []) {
  check(["eth_chainId", "eth_blockNumber", "eth_getBlockByNumber", "eth_getTransactionByHash",
    "eth_getTransactionReceipt", "eth_getCode", "eth_getTransactionCount", "eth_call"].includes(method), "Read-only RPC method");
  const p = spawnSync("curl", ["-sS", "--max-time", "20", "-H", "content-type: application/json",
    "--data-binary", "@-", "https://sepolia.base.org"], { input: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    encoding: "utf8", timeout: 25_000 });
  check(p.status === 0, `RPC unavailable: ${method}`);
  const response = JSON.parse(p.stdout);
  check(!response.error && response.result !== undefined, `RPC error: ${method}`);
  return response.result;
}
let atBlock = "latest";
const read = (address, abi, functionName, args = [], block = atBlock) => decodeFunctionResult({ abi, functionName,
  data: rpc("eth_call", [{ to: address, data: encodeFunctionData({ abi, functionName, args }) }, block]) });
function events(receipt, address, abi, name) {
  return receipt.logs.filter((x) => same(x.address, address)).flatMap((log) => {
    try { const value = decodeEventLog({ abi, topics: log.topics, data: log.data });
      return value.eventName === name ? [value.args] : []; } catch { return []; }
  });
}
function verifyCode(address, a) {
  const actual = rpc("eth_getCode", [address, atBlock]), expected = a.deployedBytecode.object;
  eq(actual.length, expected.length, `Runtime length ${address}`);
  const immutable = new Set();
  for (const refs of Object.values(a.deployedBytecode.immutableReferences ?? {}))
    for (const ref of refs) for (let i = ref.start; i < ref.start + ref.length; i++) immutable.add(i);
  for (let i = 0; i < (actual.length - 2) / 2; i++) if (!immutable.has(i))
    eq(actual.slice(i * 2 + 2, i * 2 + 4).toLowerCase(), expected.slice(i * 2 + 2, i * 2 + 4).toLowerCase(), `Runtime byte ${address}:${i}`);
  return keccak256(actual);
}
validateManifest(campaign);
eq(recorded.manifestSha256, manifestSha256, "Approved manifest digest");
eq(recorded.schema, "pit9a1.public-execution-evidence.v1", "Evidence schema");
eq(recorded.transactions.length, 15, "Fifteen transaction hashes");
eq(Number(BigInt(rpc("eth_chainId"))), 84532, "Base Sepolia chain");
const head = BigInt(rpc("eth_blockNumber"));
const dependencies = [], transactions = [];
let ethSpent = 0n, feesPaid = 0n;
const codes = { "paid-standard": "PIT_STANDARD_V1", "paid-advanced": "PIT_ADVANCED_V1",
  "paid-multisend": "PIT_MULTISEND_V1", "paid-lock": "PIT_LOCK_V1", "paid-vesting": "PIT_VESTING_V1" };
for (let i = 0; i < 15; i++) {
  const action = campaign.actions[i], hash = recorded.transactions[i].txHash;
  check(/^0x[0-9a-fA-F]{64}$/.test(hash), `Transaction hash ${i}`);
  const receipt = rpc("eth_getTransactionReceipt", [hash]);
  check(receipt && receipt.status === "0x1" && same(receipt.transactionHash, hash), `Successful receipt ${i}`);
  const block = rpc("eth_getBlockByNumber", [receipt.blockNumber, false]);
  check(block && same(block.hash, receipt.blockHash) && head > BigInt(receipt.blockNumber), `Canonical block ${i}`);
  const tx = rpc("eth_getTransactionByHash", [hash]), exact = transactionPayload(campaign, i, dependencies);
  check(tx && same(tx.from, campaign.signer) && same(tx.to, exact.to)
    && BigInt(tx.chainId) === 84532n && BigInt(tx.nonce) === exact.nonce
    && tx.input === exact.data && BigInt(tx.value) === 0n && BigInt(tx.gas) === exact.gasLimit
    && BigInt(tx.maxFeePerGas) <= BigInt(campaign.limits.maximumFeePerGasWei), `Exact payload ${i}`);
  addr(receipt.to, action.to, `Receipt destination ${i}`);
  if (action.kind === "deploy") addr(receipt.contractAddress, action.expectedAddress, `Creation address ${i}`);
  const cost = BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice) + BigInt(receipt.l1Fee ?? "0x0");
  check(cost <= exact.gasLimit * BigInt(campaign.limits.maximumFeePerGasWei)
    + BigInt(campaign.limits.l1ReservePerTransactionWei), `Cost ceiling ${i}`);
  ethSpent += cost;
  const item = { index: i, id: action.id, txHash: hash, blockNumber: Number(BigInt(receipt.blockNumber)),
    blockHash: receipt.blockHash, gasUsed: BigInt(receipt.gasUsed).toString(),
    effectiveGasPriceWei: BigInt(receipt.effectiveGasPrice).toString(), l1FeeWei: BigInt(receipt.l1Fee ?? "0x0").toString(),
    costWei: cost.toString(), payloadSha256: exact.payloadSha256 };
  if (action.kind === "approve")
    eq(events(receipt, action.token, token.abi, "Approval").filter((x) => same(x.owner, campaign.signer)
      && same(x.spender, action.spender) && x.value === BigInt(action.amountRaw)).length, 1, `Exact approval ${i}`);
  if (action.kind.startsWith("paid-")) {
    const abi = i < 6 ? creator.abi : operations.abi;
    const feeEvents = events(receipt, action.to, abi, "FeePaid");
    const opEvents = events(receipt, action.to, abi, "OperationExecuted");
    const transfers = events(receipt, campaign.paymentToken, token.abi, "Transfer");
    eq(feeEvents.length, 1, `Fee event ${i}`); eq(opEvents.length, 1, `Operation event ${i}`);
    const fee = BigInt(action.feeMicro), f = feeEvents[0], op = opEvents[0];
    addr(f.payer, campaign.signer, `Payer ${i}`); addr(f.recipient, campaign.feeRecipient, `Fee recipient ${i}`);
    eq(f.amount, fee, `Fee amount ${i}`); eq(f.intentId, action.quote.intentId, `Intent ${i}`);
    eq(f.operation, keccak256(toBytes(codes[action.kind])), `Operation code ${i}`);
    addr(op.payer, campaign.signer, `Operation payer ${i}`); eq(op.intentId, f.intentId, `Operation intent ${i}`);
    eq(op.operation, f.operation, `Operation category ${i}`); eq(op.requestHash, keccak256(tx.input), `Calldata hash ${i}`);
    eq(transfers.filter((x) => same(x.from, campaign.signer) && same(x.to, campaign.feeRecipient) && x.value === fee).length,
      1, `Circle Transfer ${i}`);
    feesPaid += fee;
    item.paid = { feeMicro: fee.toString(), payer: f.payer, recipient: f.recipient,
      intentId: f.intentId, operation: f.operation, result: op.result };
    for (const field of ["expectedToken", "expectedLock", "expectedVesting"])
      if (action[field]) addr(op.result, action[field], `Operation result ${i}`);
  }
  transactions.push(item);
  dependencies.push({ canonical: true, blockTimestamp: Number(BigInt(block.timestamp)) });
}
eq(feesPaid, 420000n, "Total service fees");
check(ethSpent <= BigInt(campaign.limits.maximumTotalSpendWei), "Total ETH ceiling");
atBlock = `0x${BigInt(transactions.at(-1).blockNumber).toString(16)}`;
eq(BigInt(rpc("eth_getTransactionCount", [campaign.signer, atBlock])), 34n, "Final nonce");
for (const [address, a] of [[campaign.addresses.paidCreator, creator], [campaign.addresses.paidOperations, operations]]) {
  verifyCode(address, a);
  addr(read(address, a.abi, "paymentToken"), campaign.paymentToken, "Payment token");
  addr(read(address, a.abi, "feeRecipient"), campaign.feeRecipient, "Fee recipient");
  addr(read(address, a.abi, "owner"), campaign.priceAdministrator, "Price administrator");
  eq(read(address, a.abi, "priceVersion"), 1n, "Price version");
  eq(read(campaign.paymentToken, token.abi, "allowance", [campaign.signer, address]), 0n, "Residual fee allowance");
}
for (const [address, a] of [[campaign.addresses.standardToken, token], [campaign.addresses.advancedToken, advanced],
  [campaign.addresses.lock, lock], [campaign.addresses.vesting, vest]]) verifyCode(address, a);
eq(read(campaign.addresses.standardToken, token.abi, "totalSupply"), 10n ** 19n, "Fixed supply");
eq(read(campaign.addresses.advancedToken, advanced.abi, "cap"), 2n * 10n ** 19n, "Advanced cap");
addr(read(campaign.addresses.advancedToken, advanced.abi, "defaultAdmin"), campaign.signer, "Advanced admin");
eq(BigInt(read(campaign.addresses.advancedToken, advanced.abi, "defaultAdminDelay")), 86400n, "Admin delay");
for (const role of ["DEFAULT_ADMIN_ROLE", "MINTER_ROLE", "PAUSER_ROLE"]) {
  const id = read(campaign.addresses.advancedToken, advanced.abi, role);
  eq(read(campaign.addresses.advancedToken, advanced.abi, "hasRole", [id, campaign.signer]), true, `${role} owner`);
  eq(read(campaign.addresses.advancedToken, advanced.abi, "hasRole", [id, campaign.addresses.paidCreator]), false, `${role} router`);
}
const asset = campaign.addresses.standardToken, ops = campaign.addresses.paidOperations;
for (const account of [campaign.actions[8].recipients[0].address, campaign.actions[8].recipients[1].address,
  campaign.addresses.lock, campaign.addresses.vesting])
  eq(read(asset, token.abi, "balanceOf", [account]), 10n ** 18n, `Asset allocation ${account}`);
eq(read(asset, token.abi, "balanceOf", [ops]), 0n, "No router custody");
eq(read(asset, token.abi, "allowance", [campaign.signer, ops]), 0n, "Residual asset allowance");
addr(read(campaign.addresses.lock, lock.abi, "beneficiary"), campaign.signer, "Lock beneficiary");
addr(read(campaign.addresses.vesting, vest.abi, "beneficiary"), campaign.signer, "Vesting beneficiary");
eq(BigInt(read(campaign.addresses.lock, lock.abi, "unlockTime")), BigInt(dependencies[10].blockTimestamp) + 3600n, "Lock unlock");
eq(BigInt(read(campaign.addresses.vesting, vest.abi, "start")), BigInt(dependencies[13].blockTimestamp) + 3600n, "Vesting start");
eq(BigInt(read(campaign.addresses.vesting, vest.abi, "cliff")), BigInt(dependencies[13].blockTimestamp) + 7200n, "Vesting cliff");
eq(BigInt(read(campaign.addresses.vesting, vest.abi, "duration")), 86400n, "Vesting duration");
eq(read(campaign.addresses.vesting, vest.abi, "allocation"), 10n ** 18n, "Vesting allocation");
const before = `0x${(BigInt(transactions[0].blockNumber) - 1n).toString(16)}`;
const payerBefore = read(campaign.paymentToken, token.abi, "balanceOf", [campaign.signer], before);
const recipientBefore = read(campaign.paymentToken, token.abi, "balanceOf", [campaign.feeRecipient], before);
const payerAfter = read(campaign.paymentToken, token.abi, "balanceOf", [campaign.signer]);
const recipientAfter = read(campaign.paymentToken, token.abi, "balanceOf", [campaign.feeRecipient]);
eq(payerBefore - payerAfter, feesPaid, "USDC payer conservation");
eq(recipientAfter - recipientBefore, feesPaid, "USDC recipient conservation");
const result = { schema: recorded.schema, manifestSha256, sourceCommit: "22569479f9ad8a04d4f5e0710302fab9de54056f",
  chainId: 84532, signer: campaign.signer, paymentToken: campaign.paymentToken, feeRecipient: campaign.feeRecipient,
  transactions, aggregate: { count: 15, costWei: ethSpent.toString(), feeMicro: feesPaid.toString(),
    payerUsdcBeforeMicro: payerBefore.toString(), payerUsdcAfterMicro: payerAfter.toString(),
    recipientUsdcBeforeMicro: recipientBefore.toString(), recipientUsdcAfterMicro: recipientAfter.toString() },
  contracts: campaign.addresses, publicSourceVerification: "PENDING_FOR_TWO_PAID_ROUTERS" };
if (process.argv.includes("--write")) writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
else eq(JSON.stringify(recorded), JSON.stringify(result), "Committed evidence differs from public chain");
console.log(JSON.stringify({ status: "PASS_READ_ONLY", count: 15, costWei: ethSpent.toString(), feeMicro: feesPaid.toString() }));
