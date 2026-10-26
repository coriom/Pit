// Local-only preparation. This script never calls Sourcify or broadcasts a transaction.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
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
  const child = spawnSync("forge", ["verify-contract", "--show-standard-json-input", "--compiler-version", "0.8.24+commit.e11b9ed9", "--num-of-optimizations", "200", item.address, identifier], { encoding: "utf8", timeout: 30_000, maxBuffer: 4_000_000 });
  if (child.status !== 0) throw Error(`Could not prepare ${label} standard JSON input`);
  const input = JSON.parse(child.stdout);
  if (input.language !== "Solidity" || input.settings?.optimizer?.runs !== 200 || input.settings?.evmVersion !== "cancun" || !input.sources) throw Error(`Unexpected ${label} compiler settings`);
  const sources = Object.entries(input.sources).map(([path, entry]) => {
    if (!/^(?:contracts\/src\/|node_modules\/@openzeppelin\/contracts\/)[A-Za-z0-9_./-]+\.sol$/.test(path) || typeof entry.content !== "string") throw Error(`Unapproved source in ${label} payload`);
    if (readFileSync(path, "utf8") !== entry.content) throw Error(`Source changed during ${label} payload preparation`);
    return { path, sha256: sha256(entry.content) };
  });
  const payload = {
    stdJsonInput: input,
    compilerVersion: "0.8.24+commit.e11b9ed9",
    contractIdentifier: identifier,
    creationTransactionHash: `0x${item.deploymentTx}`,
  };
  const body = JSON.stringify(payload);
  writeFileSync(join(out, `${label}.json`), body, { mode: 0o600, flag: "w" });
  summary.push({ label, address: item.address, contractIdentifier: identifier, compilerVersion: payload.compilerVersion, sources, payloadSha256: sha256(body), bytes: Buffer.byteLength(body), endpoint: `https://sourcify.dev/server/v2/verify/84532/${item.address}` });
}
writeFileSync(join(out, "summary.json"), JSON.stringify({ schema: "pit4b.sourcify-v2.review.v1", chainId: 84532, sourceCommit: config.sourceCommit, submissions: summary }, null, 2), { mode: 0o600, flag: "w" });
console.log(JSON.stringify({ status: "PREPARED_LOCALLY_NOT_SUBMITTED", count: summary.length, output: out, payloads: summary.map(({ label, address, payloadSha256, bytes }) => ({ label, address, payloadSha256, bytes })) }, null, 2));
