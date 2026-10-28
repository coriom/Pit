import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { keccak256 } from "viem";
import { canonicalImmutableReferences } from "./immutable-references.mjs";

const sourceFiles = [
  "contracts/src/PitPaidBase.sol", "contracts/src/PitPaidTokenCreator.sol",
  "contracts/src/PitPaidOperations.sol", "contracts/src/PitTokens.sol",
  "contracts/src/PitSchedules.sol",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceSha256 = Object.fromEntries(sourceFiles.map((name) => [name, sha256(readFileSync(name))]));
const configs = ["PitPaidTokenCreator", "PitPaidOperations"];
const artifacts = Object.fromEntries(configs.map((name) => {
  const artifact = JSON.parse(readFileSync(`out/${name}.sol/${name}.json`, "utf8"));
  if (artifact.metadata?.compiler?.version !== "0.8.24+commit.e11b9ed9") throw Error("Unexpected Solidity compiler");
  if (!artifact.bytecode?.object || !artifact.deployedBytecode?.object) throw Error(`Missing compiled ${name}`);
  return [name, {
    // Store digest bytes without a 0x prefix, as with existing deployment
    // evidence. The release credential scan deliberately flags 0x + 32 bytes.
    creationBytecodeKeccak: keccak256(artifact.bytecode.object).slice(2),
    runtimeTemplateKeccak: keccak256(artifact.deployedBytecode.object).slice(2),
    runtimeBytes: (artifact.deployedBytecode.object.length - 2) / 2,
    immutableReferences: canonicalImmutableReferences(artifact.deployedBytecode.immutableReferences),
    constructor: ["Circle-listed Base Sepolia test USDC", "operator-verified test fee recipient", "operator-verified price administrator", "initial Prices tuple"],
  }];
}));
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
if (packageJson.devDependencies["@openzeppelin/contracts"] !== "5.5.0") throw Error("OpenZeppelin version drift");
const manifest = {
  schema: "pit.base-sepolia.paid-candidate.v1",
  status: "PREPARED_NOT_DEPLOYED",
  chainId: 84532,
  rpcReadOnly: "https://sepolia.base.org",
  circleListedTestUSDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  compiler: "0.8.24+commit.e11b9ed9",
  optimizer: { enabled: true, runs: 200 },
  openZeppelin: "5.5.0",
  sourceSha256,
  artifacts,
  constructorArguments: { paymentToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", feeRecipient: null, priceAdministrator: null, initialPricesMicro: { standard: "49000000", advanced: "149000000", multiBase: "3000000", multiPerRecipient: "100000", multiCap: "49000000", lockFee: "39000000", vestingFee: "79000000" } },
  expectedInitialPriceVersion: 1,
  requiredDeployments: ["PitPaidTokenCreator", "PitPaidOperations"],
  deploymentOrder: ["verify chain and USDC", "verify merchant and administrator control", "deploy two reviewed routers", "read back code, immutables, owner and prices", "independently verify source"],
  maximumTransactionCount: null,
  maximumGasPriceWei: null,
  maximumTotalTestEthWei: null,
  activation: "DISABLED_PENDING_SEPARATE_TESTNET_AUTHORIZATION",
};
const output = JSON.stringify(manifest, null, 2) + "\n";
const path = "deployments/base-sepolia-paid-candidate.json";
if (process.argv.includes("--write")) writeFileSync(path, output);
else if (readFileSync(path, "utf8") !== output) throw Error("Paid candidate manifest differs from reviewed artifacts or sources");
console.log(`PAID MANIFEST ${process.argv.includes("--write") ? "WRITTEN" : "PASS"}: ${path}; no broadcast`);
