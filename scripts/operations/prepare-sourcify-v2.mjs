// Local-only preparation. This script never calls Sourcify or broadcasts a transaction.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { keccak256, stringToHex } from "viem";
import { validateSepoliaConfig } from "./sepolia-config.mjs";

const config = validateSepoliaConfig(JSON.parse(readFileSync("deployments/base-sepolia.json", "utf8")));
const out = process.argv[2] ?? "/tmp/pit4b-sourcify-v2";
if (!out.startsWith("/tmp/") || out.includes("..")) throw Error("Sourcify review payloads must stay under /tmp");
mkdirSync(out, { recursive: true, mode: 0o700 });
const contracts = [
  ["factory", "contracts/src/PitTokens.sol:PitTokenFactory"],
  ["sender", "contracts/src/PitMultiSender.sol:PitMultiSender"],
  ["standard", "contracts/src/PitTokens.sol:PitStandardToken"],
  ["advanced", "contracts/src/PitTokens.sol:PitAdvancedToken"],
  ["lock", "contracts/src/PitSchedules.sol:PitTokenLock"],
  ["vesting", "contracts/src/PitSchedules.sol:PitTokenVesting"],
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const summary = [];
for (const [label, identifier] of contracts) {
  const item = config[label];
  const [sourcePath, contractName] = identifier.split(":");
  const artifact = JSON.parse(readFileSync(`out/${sourcePath.split("/").at(-1)}/${contractName}.json`, "utf8"));
  const meta = artifact.metadata;
  if (meta.compiler?.version !== "0.8.24+commit.e11b9ed9" || meta.settings?.optimizer?.runs !== 200
    || meta.settings?.evmVersion !== "cancun" || meta.settings?.compilationTarget?.[sourcePath] !== contractName)
    throw Error(`Unexpected ${label} compiler metadata`);
  const sources = Object.entries(meta.sources).map(([path, source]) => {
    if (!/^(?:contracts\/src\/|node_modules\/@openzeppelin\/contracts\/)[A-Za-z0-9_./-]+\.sol$/.test(path))
      throw Error(`Unapproved source in ${label} payload`);
    const content = readFileSync(path, "utf8");
    if (keccak256(stringToHex(content)).toLowerCase() !== source.keccak256?.toLowerCase())
      throw Error(`${label} source differs from reviewed artifact metadata: ${path}`);
    return [path, { content, sha256: sha256(content) }];
  });
  const input = {
    language: "Solidity",
    sources: Object.fromEntries(sources.map(([path, source]) => [path, { content: source.content }])),
    settings: { remappings: meta.settings.remappings, optimizer: meta.settings.optimizer,
      metadata: meta.settings.metadata, evmVersion: meta.settings.evmVersion,
      libraries: meta.settings.libraries, outputSelection: { [sourcePath]: { [contractName]: ["evm.bytecode.object", "evm.deployedBytecode.object"] } } },
  };
  const reviewedCreation = config[label]?.creationBytecodeHash;
  if (reviewedCreation && keccak256(artifact.bytecode.object).slice(2).toLowerCase() !== reviewedCreation.toLowerCase())
    throw Error(`${label} creation bytecode differs from reviewed manifest`);
  const payload = {
    stdJsonInput: input,
    compilerVersion: "0.8.24+commit.e11b9ed9",
    contractIdentifier: identifier,
    creationTransactionHash: `0x${item.deploymentTx}`,
  };
  const body = JSON.stringify(payload);
  writeFileSync(join(out, `${label}.json`), body, { mode: 0o600, flag: "w" });
  summary.push({ label, address: item.address, contractIdentifier: identifier, compilerVersion: payload.compilerVersion,
    sources: sources.map(([path, source]) => ({ path, sha256: source.sha256 })), creationKeccak: keccak256(artifact.bytecode.object).slice(2),
    runtimeTemplateKeccak: keccak256(artifact.deployedBytecode.object).slice(2),
    payloadSha256: sha256(body), bytes: Buffer.byteLength(body), endpoint: `https://sourcify.dev/server/v2/verify/84532/${item.address}` });
}
writeFileSync(join(out, "summary.json"), JSON.stringify({ schema: "pit9a.sourcify-v2.review.v1", chainId: 84532, sourceCommit: config.sourceCommit,
  validation: "Source hashes matched Foundry artifact metadata; independent local recompilation timed out and is not claimed", submissions: summary }, null, 2), { mode: 0o600, flag: "w" });
console.log(JSON.stringify({ status: "PREPARED_LOCALLY_NOT_SUBMITTED", count: summary.length, output: out, payloads: summary.map(({ label, address, payloadSha256, bytes }) => ({ label, address, payloadSha256, bytes })) }, null, 2));
