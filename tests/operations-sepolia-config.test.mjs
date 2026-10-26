import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateSepoliaConfig } from "../scripts/operations/sepolia-config.mjs";

const fixture = () => JSON.parse(readFileSync("deployments/base-sepolia.json", "utf8"));

test("testnet configuration accepts only the reviewed source, chain, signer and shared runtime", () => {
  assert.deepEqual(validateSepoliaConfig(fixture()), fixture());
  for (const [path, wrong] of [
    [["chainId"], 8453], [["rpc"], "https://mainnet.base.org"],
    [["sourceCommit"], "0".repeat(40)], [["signer"], "0x0000000000000000000000000000000000000001"],
    [["factory", "address"], "0x0000000000000000000000000000000000000001"],
    [["sender", "runtimeKeccak"], `0x${"0".repeat(64)}`],
    [["standard", "address"], "0x0000000000000000000000000000000000000001"],
    [["advanced", "runtimeKeccak"], `0x${"0".repeat(64)}`],
    [["lock", "deploymentTx"], "0xdead"],
    [["vesting", "deploymentBlock"], 0],
    [["factory", "deploymentTx"], "0xdead"], [["factory", "deploymentBlock"], 0],
  ]) {
    const value = fixture(); let item = value;
    for (const key of path.slice(0, -1)) item = item[key];
    item[path.at(-1)] = wrong;
    assert.throws(() => validateSepoliaConfig(value), path.join("."));
  }
  const extra = fixture(); extra.factory.admin = extra.signer;
  assert.throws(() => validateSepoliaConfig(extra));
  const reversed = fixture(); reversed.sender.deploymentBlock = 9;
  assert.throws(() => validateSepoliaConfig(reversed));
});
