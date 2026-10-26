import { readFileSync } from "node:fs";
import { getContractAddress, isAddress, keccak256 } from "viem";

export const SEPOLIA_SOURCE_COMMIT = "a9dc1c48c0a8bffb202cb3f201a2d5d791e2912d";
export const SEPOLIA_SIGNER = "0xCb8c794c7B33FeC20C30D970725933bE1fc656C6";
export const SEPOLIA_RPC = "https://sepolia.base.org";
const HASH = /^0x[0-9a-fA-F]{64}$/;

function exactKeys(value, names, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error(`Invalid ${label}`);
  if (Object.keys(value).sort().join(",") !== [...names].sort().join(",")) throw Error(`Unexpected ${label} fields`);
}

function reviewedRuntime(name, source) {
  const artifact = JSON.parse(readFileSync(`out/${source}.sol/${name}.json`, "utf8"));
  const code = artifact.deployedBytecode.object;
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(code)) throw Error(`Unlinked ${name} runtime`);
  if (Object.keys(artifact.deployedBytecode.immutableReferences ?? {}).length) throw Error(`Unexpected ${name} immutables`);
  return keccak256(code);
}

/** Public, verified deployment metadata only. A testnet build fails closed until receipts and code are reviewed. */
export function validateSepoliaConfig(value) {
  exactKeys(value, ["schema", "chainId", "rpc", "sourceCommit", "signer", "factory", "sender"], "deployment config");
  if (value.schema !== "pit.operations.base-sepolia.verified.v1" || value.chainId !== 84532 || value.rpc !== SEPOLIA_RPC || value.sourceCommit !== SEPOLIA_SOURCE_COMMIT || value.signer !== SEPOLIA_SIGNER) throw Error("Unreviewed testnet deployment identity");
  for (const [label, nonce, source, contract] of [
    ["factory", 0n, "PitTokens", "PitTokenFactory"],
    ["sender", 1n, "PitMultiSender", "PitMultiSender"],
  ]) {
    const item = value[label];
    exactKeys(item, ["address", "deploymentTx", "deploymentBlock", "runtimeKeccak"], label);
    if (!isAddress(item.address, { strict: true }) || item.address !== getContractAddress({ from: SEPOLIA_SIGNER, nonce })) throw Error(`Unexpected ${label} address`);
    if (!HASH.test(item.deploymentTx) || !HASH.test(item.runtimeKeccak) || !Number.isSafeInteger(item.deploymentBlock) || item.deploymentBlock <= 0) throw Error(`Invalid ${label} receipt metadata`);
    if (item.runtimeKeccak.toLowerCase() !== reviewedRuntime(contract, source).toLowerCase()) throw Error(`Unreviewed ${label} runtime`);
  }
  if (value.sender.deploymentBlock < value.factory.deploymentBlock) throw Error("Impossible deployment order");
  return value;
}
