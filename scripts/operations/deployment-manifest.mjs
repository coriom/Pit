import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
if (status) throw Error("A reviewable deployment manifest requires a clean committed worktree.");
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const foundry = readFileSync("foundry.toml", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
if (packageJson.devDependencies["@openzeppelin/contracts"] !== "5.5.0") throw Error("Unexpected OpenZeppelin version.");
if (!/solc = "0\.8\.24"/.test(foundry) || !/optimizer_runs = 200/.test(foundry)) throw Error("Unexpected compiler settings.");

const definitions = [
  ["PitTokenFactory", "PitTokens.sol", "None; events identify the caller and created token."],
  ["PitStandardToken", "PitTokens.sol", "No administrator; constructor mints fixed supply to recipient."],
  ["PitAdvancedToken", "PitTokens.sol", "The factory caller becomes sole delayed-transfer default admin and receives enabled roles."],
  ["PitMultiSender", "PitMultiSender.sol", "No administrator or custody; spend is from msg.sender allowance only."],
  ["PitTokenLock", "PitSchedules.sol", "Immutable beneficiary and token; beneficiary alone may release after unlock."],
  ["PitTokenVesting", "PitSchedules.sol", "Immutable beneficiary and schedule; beneficiary alone may release vested allocation."],
];
const sha256 = (hex) => createHash("sha256").update(Buffer.from(hex.replace(/^0x/, ""), "hex")).digest("hex");
const contracts = definitions.map(([name, file, privilege]) => {
  const artifact = JSON.parse(readFileSync(join("out", file, `${name}.json`), "utf8"));
  const creation = artifact.bytecode.object;
  const runtime = artifact.deployedBytecode.object;
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(creation) || !/^0x(?:[0-9a-fA-F]{2})+$/.test(runtime)) throw Error(`Unlinked or malformed bytecode: ${name}`);
  const immutableReferences = artifact.deployedBytecode.immutableReferences ?? {};
  return {
    name,
    creationBytecodeSha256: sha256(creation),
    runtimeTemplateSha256: sha256(runtime),
    runtimeHasConstructorImmutables: Object.keys(immutableReferences).length > 0,
    constructor: artifact.abi.find((entry) => entry.type === "constructor")?.inputs.map((input) => ({ name: input.name, type: input.type })) ?? [],
    expectedPrivileges: privilege,
  };
});
const manifest = {
  schema: "pit.operations.deployment-candidate.v1",
  sourceCommit,
  chainIdForFutureReview: 84532,
  compiler: "solc 0.8.24",
  optimizer: { enabled: true, runs: 200 },
  openZeppelinContracts: "5.5.0",
  foundryConfigSha256: createHash("sha256").update(foundry).digest("hex"),
  constructorValues: "UNSET: require a separate reviewed deployment envelope for each instance",
  contracts,
  note: "Hashes cover creation bytecode and compiled runtime templates. Immutable constructor values change deployed runtime bytes; compare on-chain code with the reviewed constructor-specific artifact after deployment. This file contains no address, key or signature.",
};
mkdirSync("dist-operations-deployment", { recursive: true });
writeFileSync("dist-operations-deployment/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`LOCAL DEPLOYMENT MANIFEST PASS — commit ${sourceCommit}; ${contracts.length} contracts; no broadcast`);
