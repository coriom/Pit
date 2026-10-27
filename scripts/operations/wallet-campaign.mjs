import { getContractAddress, isAddress } from "viem";
import { SEPOLIA_SIGNER } from "./sepolia-config.mjs";

const HASH = /^[0-9a-fA-F]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const sameAddress = (value, expected) => typeof value === "string" && isAddress(value, { strict: true }) && value.toLowerCase() === expected.toLowerCase();
function keys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== expected.slice().sort().join(",")) throw Error(`Invalid ${label} fields`);
}

// A campaign is a separate, locally reviewed approval artifact. A source build
// without one contains no transaction authority. Exact calldata hashes bind
// every approved recipient, token amount, constructor and schedule timestamp.
export function validateWalletCampaign(value, deployment) {
  keys(value, ["schema", "chainId", "signer", "token", "startNonce", "expiresAt", "maxFeePerGasWei", "l1ReservePerTxWei", "maxTotalWei", "steps", "forms"], "campaign");
  if (value.schema !== "pit4b.base-sepolia.exact-steps.v2" || value.chainId !== 84532 || !isAddress(value.signer, { strict: true }) || value.signer.toLowerCase() === SEPOLIA_SIGNER.toLowerCase() || deployment?.chainId !== 84532) throw Error("Campaign requires the reviewed browser signer on Base Sepolia");
  const expectedToken = getContractAddress({ from: deployment.factory.address, nonce: 3n });
  if (!isAddress(value.token, { strict: true }) || value.token.toLowerCase() !== expectedToken.toLowerCase()) throw Error("Campaign token is not the next reviewed factory instance");
  if (!Number.isSafeInteger(value.startNonce) || value.startNonce < 0 || value.startNonce > 1_000_000) throw Error("Invalid campaign start nonce");
  if (!Number.isSafeInteger(value.expiresAt) || value.expiresAt < 1_700_000_000 || value.expiresAt > 4_000_000_000) throw Error("Invalid campaign expiration");
  for (const field of ["maxFeePerGasWei", "l1ReservePerTxWei", "maxTotalWei"]) if (typeof value[field] !== "string" || !DECIMAL.test(value[field])) throw Error(`Invalid ${field}`);
  const maxFee = BigInt(value.maxFeePerGasWei), reserve = BigInt(value.l1ReservePerTxWei), total = BigInt(value.maxTotalWei);
  if (maxFee === 0n || maxFee > 100_000_000n || total === 0n || total > 1_000_000_000_000_000n || reserve > 100_000_000_000_000n) throw Error("Campaign fee ceiling outside reviewed bounds");
  if (!Array.isArray(value.steps) || value.steps.length !== 11) throw Error("Phase 4B requires exactly eleven browser transactions");
  const lock = getContractAddress({ from: value.signer, nonce: BigInt(value.startNonce + 3) });
  const vest = getContractAddress({ from: value.signer, nonce: BigInt(value.startNonce + 7) });
  keys(value.forms, ["creator", "multisender", "lock", "vest"], "campaign forms");
  keys(value.forms.creator, ["name", "symbol", "supply", "recipient"], "creator form");
  keys(value.forms.multisender, ["token", "csv"], "multisender form");
  keys(value.forms.lock, ["token", "amount", "beneficiary", "unlock", "address"], "lock form");
  keys(value.forms.vest, ["token", "amount", "beneficiary", "start", "cliff", "minutes", "address"], "vesting form");
  if (typeof value.forms.creator.name !== "string" || value.forms.creator.name.length > 60 || !value.forms.creator.name ||
      typeof value.forms.creator.symbol !== "string" || value.forms.creator.symbol.length > 16 || !value.forms.creator.symbol ||
      value.forms.creator.supply !== "10" || !sameAddress(value.forms.creator.recipient, value.signer) ||
      !sameAddress(value.forms.multisender.token, value.token) ||
      !sameAddress(value.forms.lock.token, value.token) || !sameAddress(value.forms.vest.token, value.token) ||
      !sameAddress(value.forms.lock.beneficiary, value.signer) || !sameAddress(value.forms.vest.beneficiary, value.signer) ||
      !sameAddress(value.forms.lock.address, lock) || !sameAddress(value.forms.vest.address, vest) ||
      value.forms.lock.amount !== "3" || value.forms.vest.amount !== "4" ||
      value.forms.multisender.csv !== "address,amount\n0xA945c984d4cD94528D0Ee3eCEe540EE66F1843B0,1\n0xf938C5E7D1e6bf62a2399aE6b14ca13708478ab7,2" ||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(value.forms.lock.unlock) ||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(value.forms.vest.start) ||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(value.forms.vest.cliff) ||
      !/^[1-9][0-9]{0,4}$/.test(value.forms.vest.minutes)) throw Error("Campaign form inputs differ from the bounded PIT demonstration");
  const expected = [
    ["createStandard", deployment.factory.address], ["exact-approval", value.token],
    ["send-batch", deployment.sender.address], ["deploy-lock", null],
    ["exact-approval", value.token], ["fund-schedule", lock],
    ["release-schedule", lock], ["deploy-vesting", null],
    ["exact-approval", value.token], ["fund-schedule", vest],
    ["release-schedule", vest],
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
