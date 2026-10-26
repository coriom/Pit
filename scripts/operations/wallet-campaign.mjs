import { getContractAddress, isAddress } from "viem";
import { SEPOLIA_SIGNER } from "./sepolia-config.mjs";

const HASH = /^[0-9a-fA-F]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
function keys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== expected.slice().sort().join(",")) throw Error(`Invalid ${label} fields`);
}

// A campaign is a separate, locally reviewed approval artifact. A source build
// without one contains no transaction authority. Exact calldata hashes bind
// every approved recipient, token amount, constructor and schedule timestamp.
export function validateWalletCampaign(value, deployment) {
  keys(value, ["schema", "chainId", "signer", "startNonce", "expiresAt", "maxFeePerGasWei", "l1ReservePerTxWei", "maxTotalWei", "steps"], "campaign");
  if (value.schema !== "pit4b.base-sepolia.exact-steps.v1" || value.chainId !== 84532 || !isAddress(value.signer, { strict: true }) || value.signer.toLowerCase() === SEPOLIA_SIGNER.toLowerCase() || deployment?.chainId !== 84532) throw Error("Campaign requires a separate reviewed browser signer on Base Sepolia");
  if (!Number.isSafeInteger(value.startNonce) || value.startNonce < 0 || value.startNonce > 1_000_000) throw Error("Invalid campaign start nonce");
  if (!Number.isSafeInteger(value.expiresAt) || value.expiresAt < 1_700_000_000 || value.expiresAt > 4_000_000_000) throw Error("Invalid campaign expiration");
  for (const field of ["maxFeePerGasWei", "l1ReservePerTxWei", "maxTotalWei"]) if (typeof value[field] !== "string" || !DECIMAL.test(value[field])) throw Error(`Invalid ${field}`);
  const maxFee = BigInt(value.maxFeePerGasWei), reserve = BigInt(value.l1ReservePerTxWei), total = BigInt(value.maxTotalWei);
  if (maxFee === 0n || maxFee > 100_000_000n || total === 0n || total > 1_000_000_000_000_000n || reserve > 100_000_000_000_000n) throw Error("Campaign fee ceiling outside reviewed bounds");
  if (!Array.isArray(value.steps) || value.steps.length !== 12) throw Error("Phase 4B requires exactly twelve browser transactions");
  const lock = getContractAddress({ from: value.signer, nonce: BigInt(value.startNonce + 3) });
  const vest = getContractAddress({ from: value.signer, nonce: BigInt(value.startNonce + 7) });
  const expected = [
    ["createStandard", deployment.factory.address], ["exact-approval", deployment.standard.address],
    ["send-batch", deployment.sender.address], ["deploy-lock", null],
    ["exact-approval", deployment.standard.address], ["fund-schedule", lock],
    ["release-schedule", lock], ["deploy-vesting", null],
    ["exact-approval", deployment.standard.address], ["fund-schedule", vest],
    ["release-schedule", vest], ["release-schedule", vest],
  ];
  let worstCase = 0n;
  for (const [index, step] of value.steps.entries()) {
    keys(step, ["nonce", "label", "to", "calldataKeccak", "gasLimit"], `step ${index}`);
    if (step.nonce !== value.startNonce + index || typeof step.label !== "string" || !/^[a-zA-Z0-9-]{3,40}$/.test(step.label) ||
        step.to !== null && !isAddress(step.to, { strict: true }) || !HASH.test(step.calldataKeccak) ||
        !Number.isSafeInteger(step.gasLimit) || step.gasLimit < 21_000 || step.gasLimit > 4_000_000) throw Error(`Invalid step ${index}`);
    if (step.label !== expected[index][0] || (step.to?.toLowerCase() ?? null) !== (expected[index][1]?.toLowerCase() ?? null)) throw Error(`Unapproved Phase 4B destination or action in step ${index}`);
    worstCase += BigInt(step.gasLimit) * maxFee + reserve;
  }
  if (worstCase > total) throw Error("Aggregate transaction ceilings exceed approved budget");
  return value;
}
