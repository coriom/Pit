import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const names = ["PitTokenFactory", "PitStandardToken", "PitAdvancedToken", "PitMultiSender", "PitTokenLock", "PitTokenVesting", "PitNativeMultiSender", "PitNftCollection", "PitNftBatchSender", "Pit1155Collection", "Pit1155BatchSender"];
const source = { PitTokenFactory: "PitTokens.sol", PitStandardToken: "PitTokens.sol", PitAdvancedToken: "PitTokens.sol", PitMultiSender: "PitMultiSender.sol", PitTokenLock: "PitSchedules.sol", PitTokenVesting: "PitSchedules.sol", PitNativeMultiSender: "PitNativeMultiSender.sol", PitNftCollection: "PitNfts.sol", PitNftBatchSender: "PitNfts.sol", Pit1155Collection: "Pit1155.sol", Pit1155BatchSender: "Pit1155.sol" };
const data = Object.fromEntries(names.map((name) => {
  const artifact = JSON.parse(readFileSync(join("out", source[name], `${name}.json`), "utf8"));
  if (!Array.isArray(artifact.abi) || !/^0x[0-9a-f]+$/i.test(artifact.bytecode?.object ?? "")) throw Error(`Invalid Forge artifact: ${name}`);
  return [name, { abi: artifact.abi, bytecode: artifact.bytecode.object }];
}));
const scheduleRuntime = Object.fromEntries(["PitTokenLock", "PitTokenVesting", "PitAdvancedToken", "PitNftCollection", "Pit1155Collection", "Pit1155BatchSender"].map((name) => {
  const sourceName = source[name];
  const artifact = JSON.parse(readFileSync(join("out", sourceName, `${name}.json`), "utf8"));
  return [name, { code: artifact.deployedBytecode.object, immutableReferences: artifact.deployedBytecode.immutableReferences ?? {} }];
}));
mkdirSync("src/operations/generated", { recursive: true });
writeFileSync("src/operations/generated/contracts.ts", `// Generated from Forge 0.8.24 artifacts; do not edit by hand.\nexport const contracts = ${JSON.stringify(data)} as const;\n`);
const schedulePath = "src/operations/generated/schedule-runtime.ts";
let unchangedRuntime = false;
try {
  const previous = JSON.parse(readFileSync(schedulePath, "utf8").split("export const scheduleRuntime = ")[1].split(" as const;")[0]);
  // Forge can renumber immutable AST identifiers when unrelated contracts are
  // added. Their byte ranges, rather than those identifiers, define the guard.
  unchangedRuntime = Object.keys(scheduleRuntime).every((name) => previous[name]?.code === scheduleRuntime[name].code
    && JSON.stringify(Object.values(previous[name].immutableReferences)) === JSON.stringify(Object.values(scheduleRuntime[name].immutableReferences)));
} catch { /* First generation or changed file format. */ }
if (!unchangedRuntime) writeFileSync(schedulePath, `// Generated from reviewed Forge 0.8.24 artifacts; do not edit by hand.\nexport const scheduleRuntime = ${JSON.stringify(scheduleRuntime)} as const;\n`);
