// Offline preparation for two deployed payment routers. Never submits source or signs.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { keccak256, stringToHex } from "viem";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const campaign = JSON.parse(readFileSync("deployments/base-sepolia-paid-bound-candidate.json", "utf8"));
const evidence = JSON.parse(readFileSync("deployments/base-sepolia-paid-execution.json", "utf8"));
const reviewed = JSON.parse(readFileSync("deployments/base-sepolia-paid-candidate.json", "utf8"));
if (campaign.chainId !== 84532 || evidence.chainId !== 84532
  || campaign.paymentToken.toLowerCase() !== reviewed.circleListedTestUSDC.toLowerCase()
  || evidence.manifestSha256 !== "685166a28447f3cfecd0a1d1bc1f1f2f3f05061ac2957eb6068a6065475f1a45")
  throw Error("Reviewed campaign identity mismatch");
const output = process.argv[2] ?? "/tmp/pit9b-paid-sourcify-v2";
if (!output.startsWith("/tmp/") || output.includes("..")) throw Error("Payload directory must be under /tmp");
mkdirSync(output, { recursive: true, mode: 0o700 });
const definitions = [
  ["paidCreator", "PitPaidTokenCreator", 0],
  ["paidOperations", "PitPaidOperations", 1],
];
const submissions = [];
for (const [key, name, receiptIndex] of definitions) {
  const identifier = `contracts/src/${name}.sol:${name}`;
  const artifact = JSON.parse(readFileSync(`out/${name}.sol/${name}.json`, "utf8"));
  const meta = artifact.metadata;
  if (meta.compiler?.version !== "0.8.24+commit.e11b9ed9"
    || meta.settings?.optimizer?.enabled !== true || meta.settings?.optimizer?.runs !== 200
    || meta.settings?.evmVersion !== "cancun"
    || meta.settings?.compilationTarget?.[`contracts/src/${name}.sol`] !== name)
    throw Error(`Unexpected compiler settings: ${name}`);
  const creationKeccak = keccak256(artifact.bytecode.object).slice(2);
  const runtimeTemplateKeccak = keccak256(artifact.deployedBytecode.object).slice(2);
  if (creationKeccak !== reviewed.artifacts[name].creationBytecodeKeccak
    || runtimeTemplateKeccak !== reviewed.artifacts[name].runtimeTemplateKeccak)
    throw Error(`Compiled bytecode differs from reviewed candidate: ${name}`);
  const sourceEntries = Object.entries(meta.sources).sort(([a], [b]) => a.localeCompare(b)).map(([path, item]) => {
    if (!/^(?:contracts\/src\/|node_modules\/@openzeppelin\/contracts\/)[A-Za-z0-9_./-]+\.sol$/.test(path))
      throw Error(`Unapproved source path: ${path}`);
    const content = readFileSync(path, "utf8");
    if (keccak256(stringToHex(content)).toLowerCase() !== item.keccak256?.toLowerCase())
      throw Error(`Source changed from artifact: ${path}`);
    if (reviewed.sourceSha256[path] && reviewed.sourceSha256[path] !== sha(content))
      throw Error(`Source changed from reviewed candidate: ${path}`);
    if (/private key|seed phrase|mnemonic|api[_ -]?key|secret/i.test(content)
      && !path.startsWith("node_modules/@openzeppelin/"))
      throw Error(`Review source manually for sensitive material: ${path}`);
    return [path, { content, sha256: sha(content) }];
  });
  const tx = evidence.transactions[receiptIndex];
  if (tx.id !== (receiptIndex === 0 ? "deploy-paid-creator" : "deploy-paid-operations"))
    throw Error(`Wrong deployment receipt: ${name}`);
  const address = campaign.addresses[key];
  const payload = {
    stdJsonInput: {
      language: "Solidity",
      sources: Object.fromEntries(sourceEntries.map(([path, item]) => [path, { content: item.content }])),
      settings: {
        remappings: meta.settings.remappings,
        optimizer: meta.settings.optimizer,
        metadata: meta.settings.metadata,
        evmVersion: meta.settings.evmVersion,
        libraries: meta.settings.libraries,
        outputSelection: { [`contracts/src/${name}.sol`]: { [name]: ["evm.bytecode.object", "evm.deployedBytecode.object"] } },
      },
    },
    compilerVersion: meta.compiler.version,
    contractIdentifier: identifier,
    creationTransactionHash: tx.txHash,
  };
  const body = JSON.stringify(payload);
  writeFileSync(join(output, `${name}.json`), body, { mode: 0o600 });
  submissions.push({
    address, contractIdentifier: identifier, deploymentTx: tx.txHash,
    endpoint: `https://sourcify.dev/server/v2/verify/84532/${address}`,
    compilerVersion: payload.compilerVersion, creationKeccak, runtimeTemplateKeccak,
    payloadSha256: sha(body), payloadBytes: Buffer.byteLength(body),
    sources: sourceEntries.map(([path, item]) => ({ path, sha256: item.sha256 })),
  });
}
const manifest = {
  schema: "pit9b.paid-sourcify-review.v1",
  status: "PREPARED_NOT_PUBLISHED",
  chainId: 84532,
  sourceContractCommit: campaign.sourceContractCommit,
  approvedExecutionManifestSha256: evidence.manifestSha256,
  submissions,
};
const body = JSON.stringify(manifest, null, 2) + "\n";
const reviewedPath = "deployments/base-sepolia-paid-sourcify-v2-review.json";
if (existsSync(reviewedPath) && readFileSync(reviewedPath, "utf8") !== body)
  throw Error("Generated publication manifest differs from committed review");
writeFileSync(join(output, "manifest.json"), body, { mode: 0o600 });
console.log(JSON.stringify({
  status: manifest.status, manifestSha256: sha(body), output,
  payloads: submissions.map(({ address, payloadSha256, payloadBytes }) => ({ address, payloadSha256, payloadBytes })),
}, null, 2));
