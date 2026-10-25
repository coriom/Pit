import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const names = ["PitTokenFactory", "PitStandardToken", "PitAdvancedToken", "PitMultiSender", "PitTokenLock", "PitTokenVesting"];
const source = { PitTokenFactory: "PitTokens.sol", PitStandardToken: "PitTokens.sol", PitAdvancedToken: "PitTokens.sol", PitMultiSender: "PitMultiSender.sol", PitTokenLock: "PitSchedules.sol", PitTokenVesting: "PitSchedules.sol" };
const data = Object.fromEntries(names.map((name) => {
  const artifact = JSON.parse(readFileSync(join("out", source[name], `${name}.json`), "utf8"));
  if (!Array.isArray(artifact.abi) || !/^0x[0-9a-f]+$/i.test(artifact.bytecode?.object ?? "")) throw Error(`Invalid Forge artifact: ${name}`);
  return [name, { abi: artifact.abi, bytecode: artifact.bytecode.object }];
}));
mkdirSync("src/operations/generated", { recursive: true });
writeFileSync("src/operations/generated/contracts.ts", `// Generated from Forge 0.8.24 artifacts; do not edit by hand.\nexport const contracts = ${JSON.stringify(data)} as const;\n`);
