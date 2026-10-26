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

/** Public runtime-checked deployment metadata. This does not claim explorer source verification. */
export function validateSepoliaConfig(value) {
  exactKeys(value, ["schema", "chainId", "rpc", "sourceCommit", "signer", "factory", "sender", "standard", "advanced", "lock", "vesting"], "deployment config");
  if (value.schema !== "pit.operations.base-sepolia.runtime-checked.v1" || value.chainId !== 84532 || value.rpc !== SEPOLIA_RPC || value.sourceCommit !== SEPOLIA_SOURCE_COMMIT || value.signer !== SEPOLIA_SIGNER) throw Error("Unreviewed testnet deployment identity");
  const factory = getContractAddress({ from: SEPOLIA_SIGNER, nonce: 0n });
  for (const [label, from, nonce, runtime] of [
    ["factory", SEPOLIA_SIGNER, 0n, "0x4d749b6a74e282c6fd9d17fc3ed9e30637f4c6f73841d55be5dc9de7034f4724"],
    ["sender", SEPOLIA_SIGNER, 1n, "0xa3c229e5a099981a744c4e2fb0db329265a07c914c066e9f3f3a41892dfa9a7d"],
    ["standard", factory, 1n, "0xc198a903c72945fd9328d9bb79c41db177771df07d921d1c5bd97b446ac4aba6"],
    ["advanced", factory, 2n, "0x0f5c2eac88e0032cf4fa3a748af5b65318804dc54a16ca42909623f30ad4aa71"],
    ["lock", SEPOLIA_SIGNER, 10n, "0x34a84512fad243c5d4278851aa5a5a65403bafb64fb33122136a981617bb66b8"],
    ["vesting", SEPOLIA_SIGNER, 13n, "0xd0e3e9cc7b34c8ca0a886566bfffcc98ab9b32c232f37101776befa293ea493f"],
  ]) {
    const item = value[label];
    exactKeys(item, ["address", "deploymentTx", "deploymentBlock", "runtimeKeccak"], label);
    if (!isAddress(item.address, { strict: true }) || item.address !== getContractAddress({ from, nonce })) throw Error(`Unexpected ${label} address`);
    if (!HASH.test(item.deploymentTx) || !HASH.test(item.runtimeKeccak) || !Number.isSafeInteger(item.deploymentBlock) || item.deploymentBlock <= 0) throw Error(`Invalid ${label} receipt metadata`);
    if (item.runtimeKeccak.toLowerCase() !== runtime.toLowerCase()) throw Error(`Unreviewed ${label} runtime`);
  }
  if (value.factory.runtimeKeccak !== reviewedRuntime("PitTokenFactory", "PitTokens") || value.sender.runtimeKeccak !== reviewedRuntime("PitMultiSender", "PitMultiSender")) throw Error("Compiled shared runtime differs from deployed review");
  for (const [first, second] of [["factory", "sender"], ["sender", "standard"], ["standard", "advanced"], ["advanced", "lock"], ["lock", "vesting"]]) {
    if (value[second].deploymentBlock <= value[first].deploymentBlock) throw Error("Impossible deployment order");
  }
  return value;
}
