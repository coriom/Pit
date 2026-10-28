import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Separate local-only bundle. Never import this file from Toolbox, Explorer or testnet previews.
const names = ["PitPaidOperations", "PitPaidTokenCreator", "PitMockUSDC"];
const artifacts = Object.fromEntries(names.map((name) => {
  const artifact = JSON.parse(readFileSync(join("out", `${name}.sol`, `${name}.json`), "utf8"));
  if (!Array.isArray(artifact.abi) || !/^0x[0-9a-f]+$/i.test(artifact.bytecode?.object ?? "")) {
    throw Error(`Invalid Forge artifact: ${name}`);
  }
  const runtimeBytes = (artifact.deployedBytecode?.object?.length ?? 0) / 2 - 1;
  if (!Number.isInteger(runtimeBytes) || runtimeBytes < 1 || runtimeBytes > 24_576) {
    throw Error(`Local paid contract exceeds EIP-170 runtime size: ${name}`);
  }
  return [name, {
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    runtime: artifact.deployedBytecode.object,
    immutableReferences: artifact.deployedBytecode.immutableReferences ?? {},
  }];
}));
writeFileSync("src/operations/generated/paid-local.ts", `// Generated from local Forge artifacts. Never configure a real USDC address here.\nexport const paidLocalArtifacts = ${JSON.stringify(artifacts)} as const;\n`);
