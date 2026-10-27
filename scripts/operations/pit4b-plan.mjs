import { encodeDeployData, encodeFunctionData, getContractAddress, keccak256, parseUnits } from "viem";
import { readFileSync } from "node:fs";

const artifact = (source, name) => JSON.parse(readFileSync(`out/${source}.sol/${name}.json`, "utf8"));
const minute = (seconds) => (seconds + 59n) / 60n * 60n;
const date = (seconds) => new Date(Number(seconds) * 1000).toISOString().slice(0, 16);

/** Exact reviewed eleven-step browser campaign; no signing or RPC calls. */
export function buildPit4bPlan({ deployment, signer, nonce, timestamp, maxFeePerGasWei, l1ReservePerTxWei, name, symbol, unlockDelay, startDelay, duration, cliffDelay }) {
  if (deployment.chainId !== 84532 || !Number.isSafeInteger(nonce) || nonce < 0 || typeof timestamp !== "bigint" ||
      startDelay <= unlockDelay || duration < 900n || duration % 60n !== 0n || cliffDelay <= 0n || cliffDelay >= duration) throw Error("Invalid campaign plan inputs");
  if (!signer || signer.toLowerCase() === deployment.signer.toLowerCase()) throw Error("Separate browser signer required");
  const unlock = minute(timestamp + unlockDelay), start = minute(timestamp + startDelay), cliff = start + cliffDelay;
  // The first factory transaction creates this disposable token. Its exact
  // address is fixed by the independently checked current factory nonce (3).
  // Reusing it avoids a separate signer, token-funding transaction and custody.
  const factory = deployment.factory.address, sender = deployment.sender.address;
  const token = getContractAddress({ from: factory, nonce: 3n });
  const lock = getContractAddress({ from: signer, nonce: BigInt(nonce + 3) }), vest = getContractAddress({ from: signer, nonce: BigInt(nonce + 7) });
  const recipientA = "0xA945c984d4cD94528D0Ee3eCEe540EE66F1843B0";
  const recipientB = "0xf938C5E7D1e6bf62a2399aE6b14ca13708478ab7";
  const factoryAbi = artifact("PitTokens", "PitTokenFactory").abi;
  const tokenAbi = artifact("PitTokens", "PitStandardToken").abi;
  const senderAbi = artifact("PitMultiSender", "PitMultiSender").abi;
  const lockArtifact = artifact("PitSchedules", "PitTokenLock"), vestArtifact = artifact("PitSchedules", "PitTokenVesting");
  const u = (amount) => parseUnits(amount, 18);
  const steps = [];
  const add = (label, to, data, gasLimit) => steps.push({ nonce: nonce + steps.length, label, to, calldataKeccak: keccak256(data).slice(2), gasLimit });
  add("createStandard", factory, encodeFunctionData({ abi: factoryAbi, functionName: "createStandard", args: [name, symbol, u("10"), signer] }), 650_000);
  add("exact-approval", token, encodeFunctionData({ abi: tokenAbi, functionName: "approve", args: [sender, u("3")] }), 80_000);
  add("send-batch", sender, encodeFunctionData({ abi: senderAbi, functionName: "send", args: [token, [recipientA, recipientB], [u("1"), u("2")]] }), 200_000);
  add("deploy-lock", null, encodeDeployData({ abi: lockArtifact.abi, bytecode: lockArtifact.bytecode.object, args: [token, signer, unlock] }), 900_000);
  add("exact-approval", token, encodeFunctionData({ abi: tokenAbi, functionName: "approve", args: [lock, u("3")] }), 80_000);
  add("fund-schedule", lock, encodeFunctionData({ abi: lockArtifact.abi, functionName: "fund", args: [u("3")] }), 120_000);
  add("release-schedule", lock, encodeFunctionData({ abi: lockArtifact.abi, functionName: "release" }), 100_000);
  add("deploy-vesting", null, encodeDeployData({ abi: vestArtifact.abi, bytecode: vestArtifact.bytecode.object, args: [token, signer, start, duration, cliff, u("4")] }), 1_100_000);
  add("exact-approval", token, encodeFunctionData({ abi: tokenAbi, functionName: "approve", args: [vest, u("4")] }), 80_000);
  add("fund-schedule", vest, encodeFunctionData({ abi: vestArtifact.abi, functionName: "fund" }), 120_000);
  add("release-schedule", vest, encodeFunctionData({ abi: vestArtifact.abi, functionName: "release" }), 100_000);
  const budget = steps.reduce((sum, step) => sum + BigInt(step.gasLimit) * maxFeePerGasWei + l1ReservePerTxWei, 0n);
  const forms = { creator: { name, symbol, supply: "10", recipient: signer }, multisender: { token, csv: `address,amount\n${recipientA},1\n${recipientB},2` }, lock: { token, amount: "3", beneficiary: signer, unlock: date(unlock), address: lock }, vest: { token, amount: "4", beneficiary: signer, start: date(start), cliff: date(cliff), minutes: String(duration / 60n), address: vest } };
  const campaign = { schema: "pit4b.base-sepolia.exact-steps.v2", chainId: 84532, signer, token, startNonce: nonce, expiresAt: Number(start + duration + 3600n), maxFeePerGasWei: String(maxFeePerGasWei), l1ReservePerTxWei: String(l1ReservePerTxWei), maxTotalWei: String(budget), steps, forms };
  return { campaign, forms, expectedCreatedToken: token, unlock, start, cliff, end: start + duration };
}
