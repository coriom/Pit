// Canonical, non-broadcast Phase 9A.1 campaign definition. No key or live transaction is loaded.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { decodeFunctionData, encodeDeployData, encodeFunctionData, getContractAddress, keccak256, toBytes } from "viem";

const S = "0xCb8c794c7B33FeC20C30D970725933bE1fc656C6";
const U = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const R1 = "0xA945c984d4cD94528D0Ee3eCEe540EE66F1843B0";
const R2 = "0xf938C5E7D1e6bf62a2399aE6b14ca13708478ab7";
const C = getContractAddress({ from: S, nonce: 19n });
const O = getContractAddress({ from: S, nonce: 20n });
const T = getContractAddress({ from: C, nonce: 1n });
const A = getContractAddress({ from: C, nonce: 2n });
const L = getContractAddress({ from: O, nonce: 1n });
const V = getContractAddress({ from: O, nonce: 2n });
const UNIT = 10n ** 18n;
const campaignId = keccak256(toBytes("PIT9A1-BASE-SEPOLIA-2026-10-29-BOUND-V1"));
const intent = (id) => keccak256(toBytes(`${campaignId}:${id}`));
const prices = { standard: "100000", advanced: "200000", multiBase: "10000", multiPerRecipient: "5000", multiCap: "50000", lockFee: "50000", vestingFee: "50000" };
const amount = (n) => (n * UNIT).toString();
const fee = (n) => String(n);
const quote = (id, n, prior) => ({ intentId: intent(id), version: "1", maxFeeMicro: fee(n), deadline: { fromReceiptIndex: prior, addSeconds: 900 } });
const step = (id, to, gasCap, extra = {}) => ({ index: actions.length, id, from: S, chainId: 84532, nonce: String(19 + actions.length), to, valueWei: "0", gasLimitCeiling: String(gasCap), ...extra });
const actions = [];
const add = (id, to, gasCap, extra = {}) => actions.push(step(id, to, gasCap, extra));

add("deploy-paid-creator", null, 4_800_000, { kind: "deploy", contract: "PitPaidTokenCreator", expectedAddress: C, expectedCreationBytecodeKeccak: "0x02240d2ea58946b7481ee839b20e55727fd5e99ff09d20d39a55f1c14c5a7b01" });
add("deploy-paid-operations", null, 4_300_000, { kind: "deploy", contract: "PitPaidOperations", expectedAddress: O, expectedCreationBytecodeKeccak: "0x6bef82f5ba8eaa4f03630cb154bb658173b5dcca6f84931a086958904951d24c" });
add("approve-usdc-standard", U, 80_000, { kind: "approve", token: U, spender: C, amountRaw: "100000", expectedEvent: "Approval" });
add("create-standard", C, 750_000, { kind: "paid-standard", tokenName: "PIT9A1 Test Standard", symbol: "P9AST", decimals: 18, supplyRaw: amount(10n), recipient: S, fixedSupply: true, feeMicro: "100000", quote: quote("create-standard", 100_000, 2), expectedToken: T, expectedEvent: "OperationExecuted" });
add("approve-usdc-advanced", U, 80_000, { kind: "approve", token: U, spender: C, amountRaw: "200000", expectedEvent: "Approval" });
add("create-advanced", C, 2_100_000, { kind: "paid-advanced", tokenName: "PIT9A1 Test Advanced", symbol: "P9AAD", decimals: 18, supplyRaw: amount(10n), capRaw: amount(20n), recipient: S, administrator: S, minting: true, burning: true, pausing: true, defaultAdminDelaySeconds: 86_400, feeMicro: "200000", quote: quote("create-advanced", 200_000, 4), expectedToken: A, expectedEvent: "OperationExecuted" });
add("approve-usdc-multisend", U, 80_000, { kind: "approve", token: U, spender: O, amountRaw: "20000", expectedEvent: "Approval" });
add("approve-asset-multisend", T, 80_000, { kind: "approve", token: T, spender: O, amountRaw: amount(2n), expectedEvent: "Approval" });
add("multisend-two", O, 250_000, { kind: "paid-multisend", token: T, recipients: [{ address: R1, amountRaw: amount(1n) }, { address: R2, amountRaw: amount(1n) }], totalRaw: amount(2n), payer: S, feeMicro: "20000", quote: quote("multisend-two", 20_000, 7), expectedEvent: "OperationExecuted" });
add("approve-usdc-lock", U, 80_000, { kind: "approve", token: U, spender: O, amountRaw: "50000", expectedEvent: "Approval" });
add("approve-asset-lock", T, 80_000, { kind: "approve", token: T, spender: O, amountRaw: amount(1n), expectedEvent: "Approval" });
add("create-lock", O, 950_000, { kind: "paid-lock", token: T, amountRaw: amount(1n), payer: S, beneficiary: S, unlockTime: { fromReceiptIndex: 10, addSeconds: 3600 }, feeMicro: "50000", quote: quote("create-lock", 50_000, 10), expectedLock: L, expectedEvent: "OperationExecuted" });
add("approve-usdc-vesting", U, 80_000, { kind: "approve", token: U, spender: O, amountRaw: "50000", expectedEvent: "Approval" });
add("approve-asset-vesting", T, 80_000, { kind: "approve", token: T, spender: O, amountRaw: amount(1n), expectedEvent: "Approval" });
add("create-vesting", O, 1_200_000, { kind: "paid-vesting", token: T, amountRaw: amount(1n), payer: S, beneficiary: S, start: { fromReceiptIndex: 13, addSeconds: 3600 }, durationSeconds: 86_400, cliff: { fromReceiptIndex: 13, addSeconds: 7200 }, feeMicro: "50000", quote: quote("create-vesting", 50_000, 13), expectedVesting: V, expectedEvent: "OperationExecuted" });

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  if (typeof value === "number" && !Number.isSafeInteger(value)) throw Error("Unsafe number in manifest");
  if (typeof value === "bigint" || value === undefined || Number.isNaN(value)) throw Error("Noncanonical manifest value");
  return JSON.stringify(value);
}
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const digest = (value) => sha256(canonical(value));
export const manifest = { schema: "pit9a1.bound-campaign.v1", status: "PREPARED_NOT_AUTHORIZED_NO_BROADCAST",
  sourceContractCommit: "b1d8478d14a6033675ea8c0967557a69f12d7765", campaignId,
  chainId: 84532, signer: S, paymentToken: U, feeRecipient: R1, priceAdministrator: S,
  paymentCode: { proxyRuntimeKeccak: "0xedc5281a85c0efecd49999a1ef668390c59b88702f2d4a07029d7f5d63059d6c",
    implementation: "0xd74cc5d436923b8ba2c179b4bCA2841D8A52C5B5",
    implementationRuntimeKeccak: "0x1254951e5483b882fd5def9452f58fe786eb3380c0bf9bb2744fa21a0a97a16c" },
  existingInfrastructure: { factory: { address: "0xE861d10ab302B66f619b15323C96d9F3BbfDc230", runtimeKeccak: "0x4d749b6a74e282c6fd9d17fc3ed9e30637f4c6f73841d55be5dc9de7034f4724" },
    multiSender: { address: "0xf1c076cDF4A3C0bbBc491cF3578CA2F3d99424eA", runtimeKeccak: "0xa3c229e5a099981a744c4e2fb0db329265a07c914c066e9f3f3a41892dfa9a7d" } },
  addresses: { paidCreator: C, paidOperations: O, standardToken: T, advancedToken: A, lock: L, vesting: V },
  pricesMicro: prices, limits: { maximumTransactions: 15, initialNonce: "19", maximumFeePerGasWei: "50000000", maximumTotalSpendWei: "1100000000000000", l1ReservePerTransactionWei: "20000000000000", maximumServiceFeeMicro: "420000" },
  confirmationPolicy: { localFork: 1, baseSepolia: 2 },
  timestampDerivation: "Exact receipt block timestamp plus specified integer seconds; receipt must be canonical before dependent signing",
  actions: actions.map((action) => ({ ...action, postconditionRule: action.kind === "deploy" ? "runtime-and-roles-v1" : action.kind === "approve" ? "exact-allowance-and-event-v1" : "atomic-fee-event-and-state-v1",
    specSha256: digest({ ...action, postconditionRule: action.kind === "deploy" ? "runtime-and-roles-v1" : action.kind === "approve" ? "exact-allowance-and-event-v1" : "atomic-fee-event-and-state-v1" }) })) };
export const manifestSha256 = digest(manifest);

const artifact = (source, name) => JSON.parse(readFileSync(`out/${source}.sol/${name}.json`, "utf8"));
const creatorA = () => artifact("PitPaidTokenCreator", "PitPaidTokenCreator");
const operationsA = () => artifact("PitPaidOperations", "PitPaidOperations");
const erc20A = () => artifact("PitTokens", "PitStandardToken");
function timestamp(spec, receipts) {
  const receipt = receipts[spec.fromReceiptIndex];
  if (!receipt || receipt.canonical !== true || !Number.isSafeInteger(receipt.blockTimestamp)) throw Error("Canonical dependency receipt missing");
  return BigInt(receipt.blockTimestamp) + BigInt(spec.addSeconds);
}
function quoteArgs(spec, receipts) {
  return { intentId: spec.intentId, version: BigInt(spec.version), maxFee: BigInt(spec.maxFeeMicro), deadline: timestamp(spec.deadline, receipts) };
}
export function transactionPayload(campaign, index, receipts = []) {
  validateManifest(campaign);
  const action = campaign.actions[index];
  if (!action) throw Error("Action outside campaign");
  const q = action.quote ? quoteArgs(action.quote, receipts) : undefined;
  let data;
  if (action.kind === "deploy") {
    const a = action.contract === "PitPaidTokenCreator" ? creatorA() : operationsA();
    if (keccak256(a.bytecode.object).toLowerCase() !== action.expectedCreationBytecodeKeccak.toLowerCase()) throw Error("Creation bytecode differs from approved manifest");
    const p = campaign.pricesMicro;
    const pricesArg = Object.fromEntries(Object.entries(p).map(([key, value]) => [key, BigInt(value)]));
    data = encodeDeployData({ abi: a.abi, bytecode: a.bytecode.object, args: [campaign.paymentToken, campaign.feeRecipient, campaign.priceAdministrator, pricesArg] });
  } else if (action.kind === "approve") data = encodeFunctionData({ abi: erc20A().abi, functionName: "approve", args: [action.spender, BigInt(action.amountRaw)] });
  else if (action.kind === "paid-standard") data = encodeFunctionData({ abi: creatorA().abi, functionName: "createStandard", args: [action.tokenName, action.symbol, BigInt(action.supplyRaw), action.recipient, q] });
  else if (action.kind === "paid-advanced") data = encodeFunctionData({ abi: creatorA().abi, functionName: "createAdvanced", args: [{ name: action.tokenName, symbol: action.symbol, supply: BigInt(action.supplyRaw), cap: BigInt(action.capRaw), recipient: action.recipient, minting: action.minting, burning: action.burning, pausing: action.pausing }, q] });
  else if (action.kind === "paid-multisend") data = encodeFunctionData({ abi: operationsA().abi, functionName: "multiSend", args: [action.token, action.recipients.map((x) => x.address), action.recipients.map((x) => BigInt(x.amountRaw)), q] });
  else if (action.kind === "paid-lock") data = encodeFunctionData({ abi: operationsA().abi, functionName: "createLock", args: [action.token, BigInt(action.amountRaw), action.beneficiary, timestamp(action.unlockTime, receipts), q] });
  else if (action.kind === "paid-vesting") data = encodeFunctionData({ abi: operationsA().abi, functionName: "createVesting", args: [{ token: action.token, amount: BigInt(action.amountRaw), beneficiary: action.beneficiary, start: timestamp(action.start, receipts), duration: BigInt(action.durationSeconds), cliff: timestamp(action.cliff, receipts) }, q] });
  else throw Error("Unapproved action kind");
  const abi = action.kind === "approve" ? erc20A().abi : action.kind.startsWith("paid-") ? (index < 6 ? creatorA().abi : operationsA().abi) : null;
  if (abi) {
    const decoded = decodeFunctionData({ abi, data });
    if (decoded.functionName !== ({ approve: "approve", "paid-standard": "createStandard", "paid-advanced": "createAdvanced", "paid-multisend": "multiSend", "paid-lock": "createLock", "paid-vesting": "createVesting" })[action.kind]) throw Error("Encoded selector mismatch");
  }
  const payloadSha256 = digest({ from: campaign.signer, chainId: campaign.chainId, nonce: action.nonce,
    to: action.to, valueWei: action.valueWei, gasLimit: action.gasLimitCeiling,
    maxFeePerGasWei: campaign.limits.maximumFeePerGasWei, data });
  return { from: campaign.signer, chainId: campaign.chainId, nonce: BigInt(action.nonce), to: action.to, value: 0n,
    gasLimit: BigInt(action.gasLimitCeiling), data, dataKeccak: keccak256(data), payloadSha256,
    actionSpecSha256: action.specSha256 };
}
export function validateManifest(input) {
  if (digest(input) !== manifestSha256 || canonical(input) !== canonical(manifest)) throw Error("Manifest hash or content mismatch");
  if (input.actions.length !== 15 || input.actions.some((x, i) => x.index !== i || x.nonce !== String(19 + i) || x.chainId !== 84532 || x.from !== S || x.specSha256 !== digest(Object.fromEntries(Object.entries(x).filter(([key]) => key !== "specSha256"))))) throw Error("Campaign sequence mismatch");
  if (input.actions.filter((x) => x.kind === "approve").length !== 8 || input.actions.filter((x) => x.kind.startsWith("paid-")).length !== 5
    || input.actions.filter((x) => x.feeMicro).reduce((n, x) => n + BigInt(x.feeMicro), 0n) !== BigInt(input.limits.maximumServiceFeeMicro)
    || input.actions[8].recipients.reduce((n, x) => n + BigInt(x.amountRaw), 0n) !== BigInt(input.actions[8].totalRaw)) throw Error("Campaign financial conservation mismatch");
  return true;
}
if (process.argv[1]?.endsWith("pit9a1-bound-plan.mjs")) {
  const path = "deployments/base-sepolia-paid-bound-candidate.json";
  const bytes = canonical(manifest);
  if (process.argv.includes("--write")) writeFileSync(path, bytes);
  else if (readFileSync(path, "utf8") !== bytes) throw Error("Bound manifest differs from reviewed generator");
  console.log(`PIT9A1 BOUND PLAN ${manifestSha256}: ${actions.length} exact actions; no broadcast`);
}
