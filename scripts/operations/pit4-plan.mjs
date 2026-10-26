// Exact disposable Phase 4 operations. No private keys, payment assets or live-price inputs.
import { readFileSync } from "node:fs";
import { decodeEventLog, decodeFunctionResult, encodeDeployData, encodeFunctionData, getContractAddress } from "viem";
import { SEPOLIA_SIGNER } from "./sepolia-config.mjs";

const artifact = (source, name) => JSON.parse(readFileSync(`out/${source}.sol/${name}.json`, "utf8"));
const factoryA = artifact("PitTokens", "PitTokenFactory");
const standardA = artifact("PitTokens", "PitStandardToken");
const advancedA = artifact("PitTokens", "PitAdvancedToken");
const senderA = artifact("PitMultiSender", "PitMultiSender");
const lockA = artifact("PitSchedules", "PitTokenLock");
const vestA = artifact("PitSchedules", "PitTokenVesting");
export const S = SEPOLIA_SIGNER;
export const F = getContractAddress({ from: S, nonce: 0n });
export const M = getContractAddress({ from: S, nonce: 1n });
export const T = getContractAddress({ from: F, nonce: 1n });
export const A = getContractAddress({ from: F, nonce: 2n });
export const L = getContractAddress({ from: S, nonce: 10n });
export const V = getContractAddress({ from: S, nonce: 13n });
export const R1 = "0xA945c984d4cD94528D0Ee3eCEe540EE66F1843B0";
export const R2 = "0xf938C5E7D1e6bf62a2399aE6b14ca13708478ab7";
export const UNIT = 10n ** 18n;
export const artifacts = { factoryA, standardA, advancedA, senderA, lockA, vestA };

const call = (address, abi, functionName, args = []) => ({ to: address, data: encodeFunctionData({ abi, functionName, args }) });
const create = (abi, bytecode, args) => ({ to: undefined, data: encodeDeployData({ abi, bytecode, args }) });

export function transactionPlan(index, state, blockTimestamp) {
  if (index < 2 || index > 18) throw Error("Dependent action index outside reviewed plan");
  if (index === 2) return { ...call(F, factoryA.abi, "createStandard", ["PIT4 Test Standard", "P4STD", 1000n * UNIT, S]), expectedAddress: T, artifact: standardA };
  if (index === 3) return { ...call(F, factoryA.abi, "createAdvanced", ["PIT4 Test Advanced", "P4ADV", 100n * UNIT, 150n * UNIT, S, true, true, true]), expectedAddress: A, artifact: advancedA };
  if (index === 4) return call(A, advancedA.abi, "mint", [S, 50n * UNIT]);
  if (index === 5) return call(A, advancedA.abi, "pause");
  if (index === 6) return call(A, advancedA.abi, "unpause");
  if (index === 7) return call(A, advancedA.abi, "burn", [UNIT]);
  if (index === 8) return call(T, standardA.abi, "approve", [M, 30n * UNIT]);
  if (index === 9) return call(M, senderA.abi, "send", [T, [R1, R2], [10n * UNIT, 20n * UNIT]]);
  if (index === 10) {
    if (state.lockUnlock === undefined) state.lockUnlock = String(blockTimestamp + 1200n);
    const unlock = BigInt(state.lockUnlock);
    if (unlock <= blockTimestamp + 900n || unlock > blockTimestamp + 1800n) throw Error("Lock schedule outside approved relative window");
    return { ...create(lockA.abi, lockA.bytecode.object, [T, S, unlock]), expectedAddress: L, artifact: lockA };
  }
  if (index === 11) return call(T, standardA.abi, "approve", [L, 25n * UNIT]);
  if (index === 12) return call(L, lockA.abi, "fund", [25n * UNIT]);
  if (index === 13) {
    if (state.vestingStart === undefined) state.vestingStart = String(blockTimestamp + 1200n);
    const start = BigInt(state.vestingStart);
    if (start <= blockTimestamp + 900n || start > blockTimestamp + 1800n) throw Error("Vesting start outside approved relative window");
    return { ...create(vestA.abi, vestA.bytecode.object, [T, S, start, 1200n, start + 300n, 100n * UNIT]), expectedAddress: V, artifact: vestA };
  }
  if (index === 14) return call(T, standardA.abi, "approve", [V, 100n * UNIT]);
  if (index === 15) return call(V, vestA.abi, "fund");
  if (index === 16) {
    if (blockTimestamp < BigInt(state.lockUnlock)) throw Error("Lock has not reached its on-chain unlock time");
    return call(L, lockA.abi, "release");
  }
  if (index === 17) {
    const start = BigInt(state.vestingStart);
    if (blockTimestamp < start + 300n || blockTimestamp >= start + 1200n) throw Error("Partial vesting release must be after cliff and before completion");
    return call(V, vestA.abi, "release");
  }
  if (index === 18) {
    if (blockTimestamp < BigInt(state.vestingStart) + 1200n) throw Error("Final vesting release must be after completion");
    return call(V, vestA.abi, "release");
  }
  throw Error("Unapproved action");
}

function read(rpc, address, abi, functionName, args = []) {
  const data = encodeFunctionData({ abi, functionName, args });
  const result = rpc("eth_call", [{ to: address, data }, "latest"]);
  return decodeFunctionResult({ abi, functionName, data: result });
}

function assert(actual, expected, label) {
  if (actual !== expected) throw Error(`${label} readback mismatch`);
}

export function verifyState(index, plan, state, receipt, rpc, verifyRuntime) {
  const code = (address, artifact) => verifyRuntime(rpc("eth_getCode", [address, "latest"]), artifact);
  if (index === 2 || index === 3) {
    const found = receipt.logs.map((log) => { try { return decodeEventLog({ abi: factoryA.abi, topics: log.topics, data: log.data }); } catch { return undefined; } }).find((event) => event?.eventName === "TokenCreated");
    if (!found || found.args.creator.toLowerCase() !== S.toLowerCase() || found.args.token.toLowerCase() !== plan.expectedAddress.toLowerCase() || found.args.advanced !== (index === 3)) throw Error("TokenCreated event differs from approved identity");
    code(plan.expectedAddress, plan.artifact);
    const abi = plan.artifact.abi;
    assert(read(rpc, plan.expectedAddress, abi, "name"), index === 2 ? "PIT4 Test Standard" : "PIT4 Test Advanced", "name");
    assert(read(rpc, plan.expectedAddress, abi, "symbol"), index === 2 ? "P4STD" : "P4ADV", "symbol");
    assert(read(rpc, plan.expectedAddress, abi, "decimals"), 18, "decimals");
    assert(read(rpc, plan.expectedAddress, abi, "totalSupply"), (index === 2 ? 1000n : 100n) * UNIT, "supply");
    assert(read(rpc, plan.expectedAddress, abi, "balanceOf", [S]), (index === 2 ? 1000n : 100n) * UNIT, "recipient balance");
    if (index === 3) {
      assert(read(rpc, A, advancedA.abi, "cap"), 150n * UNIT, "cap");
      assert(read(rpc, A, advancedA.abi, "defaultAdmin").toLowerCase(), S.toLowerCase(), "default admin");
      assert(read(rpc, A, advancedA.abi, "defaultAdminDelay"), 86400, "admin delay");
      for (const role of ["DEFAULT_ADMIN_ROLE", "MINTER_ROLE", "PAUSER_ROLE"]) {
        assert(read(rpc, A, advancedA.abi, "hasRole", [read(rpc, A, advancedA.abi, role), S]), true, role);
      }
    }
  }
  if (index === 4) assert(read(rpc, A, advancedA.abi, "totalSupply"), 150n * UNIT, "minted supply");
  if (index === 5) assert(read(rpc, A, advancedA.abi, "paused"), true, "paused state");
  if (index === 6) assert(read(rpc, A, advancedA.abi, "paused"), false, "unpaused state");
  if (index === 7) assert(read(rpc, A, advancedA.abi, "totalSupply"), 149n * UNIT, "burned supply");
  if (index === 8) assert(read(rpc, T, standardA.abi, "allowance", [S, M]), 30n * UNIT, "batch allowance");
  if (index === 9) {
    assert(read(rpc, T, standardA.abi, "balanceOf", [R1]), 10n * UNIT, "recipient A balance");
    assert(read(rpc, T, standardA.abi, "balanceOf", [R2]), 20n * UNIT, "recipient B balance");
    assert(read(rpc, T, standardA.abi, "balanceOf", [S]), 970n * UNIT, "sender balance");
    assert(read(rpc, T, standardA.abi, "allowance", [S, M]), 0n, "batch residual allowance");
    assert(read(rpc, T, standardA.abi, "balanceOf", [M]), 0n, "MultiSender custody");
  }
  if (index === 10 || index === 13) {
    code(plan.expectedAddress, plan.artifact);
    const abi = plan.artifact.abi;
    assert(read(rpc, plan.expectedAddress, abi, "token").toLowerCase(), T.toLowerCase(), "schedule token");
    assert(read(rpc, plan.expectedAddress, abi, "beneficiary").toLowerCase(), S.toLowerCase(), "beneficiary");
    if (index === 10) assert(read(rpc, L, abi, "unlockTime"), BigInt(state.lockUnlock), "unlock time");
    else {
      assert(read(rpc, V, abi, "start"), BigInt(state.vestingStart), "vesting start");
      assert(read(rpc, V, abi, "duration"), 1200n, "vesting duration");
      assert(read(rpc, V, abi, "cliff"), BigInt(state.vestingStart) + 300n, "vesting cliff");
      assert(read(rpc, V, abi, "allocation"), 100n * UNIT, "vesting allocation");
    }
  }
  if (index === 11) assert(read(rpc, T, standardA.abi, "allowance", [S, L]), 25n * UNIT, "lock allowance");
  if (index === 12) {
    assert(read(rpc, L, lockA.abi, "deposited"), 25n * UNIT, "lock deposit");
    assert(read(rpc, T, standardA.abi, "balanceOf", [L]), 25n * UNIT, "lock balance");
    assert(read(rpc, T, standardA.abi, "allowance", [S, L]), 0n, "lock residual allowance");
  }
  if (index === 14) assert(read(rpc, T, standardA.abi, "allowance", [S, V]), 100n * UNIT, "vesting allowance");
  if (index === 15) {
    assert(read(rpc, V, vestA.abi, "funded"), true, "vesting funded state");
    assert(read(rpc, T, standardA.abi, "balanceOf", [V]), 100n * UNIT, "vesting balance");
    assert(read(rpc, T, standardA.abi, "allowance", [S, V]), 0n, "vesting residual allowance");
  }
  if (index === 16) {
    assert(read(rpc, L, lockA.abi, "released"), 25n * UNIT, "lock released");
    assert(read(rpc, T, standardA.abi, "balanceOf", [L]), 0n, "lock remaining balance");
  }
  if (index === 17 || index === 18) {
    const released = read(rpc, V, vestA.abi, "released");
    if (index === 17 && !(released > 0n && released < 100n * UNIT)) throw Error("Partial vesting release unavailable");
    if (index === 18) assert(released, 100n * UNIT, "final vesting release");
    assert(read(rpc, T, standardA.abi, "balanceOf", [V]) + released, 100n * UNIT, "vesting conservation");
  }
}
