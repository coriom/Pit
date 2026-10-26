import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getContractAddress, keccak256 } from "viem";
import { SEPOLIA_RPC, SEPOLIA_SIGNER, SEPOLIA_SOURCE_COMMIT, validateSepoliaConfig } from "../scripts/operations/sepolia-config.mjs";

const reviewed = (source, contract) => keccak256(JSON.parse(readFileSync(`out/${source}.sol/${contract}.json`, "utf8")).deployedBytecode.object);
const fixture = () => ({
  schema: "pit.operations.base-sepolia.verified.v1", chainId: 84532, rpc: SEPOLIA_RPC,
  sourceCommit: SEPOLIA_SOURCE_COMMIT, signer: SEPOLIA_SIGNER,
  factory: { address: getContractAddress({ from: SEPOLIA_SIGNER, nonce: 0n }), deploymentTx: `0x${"a".repeat(64)}`, deploymentBlock: 10, runtimeKeccak: reviewed("PitTokens", "PitTokenFactory") },
  sender: { address: getContractAddress({ from: SEPOLIA_SIGNER, nonce: 1n }), deploymentTx: `0x${"b".repeat(64)}`, deploymentBlock: 11, runtimeKeccak: reviewed("PitMultiSender", "PitMultiSender") },
});

test("testnet configuration accepts only the reviewed source, chain, signer and shared runtime", () => {
  assert.deepEqual(validateSepoliaConfig(fixture()), fixture());
  for (const [path, wrong] of [
    [["chainId"], 8453], [["rpc"], "https://mainnet.base.org"],
    [["sourceCommit"], "0".repeat(40)], [["signer"], "0x0000000000000000000000000000000000000001"],
    [["factory", "address"], "0x0000000000000000000000000000000000000001"],
    [["sender", "runtimeKeccak"], `0x${"0".repeat(64)}`],
    [["factory", "deploymentTx"], "0xdead"], [["factory", "deploymentBlock"], 0],
  ]) {
    const value = fixture(); let item = value;
    for (const key of path.slice(0, -1)) item = item[key];
    item[path.at(-1)] = wrong;
    assert.throws(() => validateSepoliaConfig(value), path.join("."));
  }
  const extra = fixture(); extra.factory.admin = SEPOLIA_SIGNER;
  assert.throws(() => validateSepoliaConfig(extra));
  const reversed = fixture(); reversed.sender.deploymentBlock = 9;
  assert.throws(() => validateSepoliaConfig(reversed));
});
