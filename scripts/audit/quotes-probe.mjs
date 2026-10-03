import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createProbeFetch, probeExitCode } from "./quote-probe-runtime.mjs";

await mkdir(".astro", { recursive: true });
await build({
  entryPoints: ["src/lib/diagnostic-quotes.ts"],
  outfile: ".astro/quote-probe.mjs",
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
});
const { DIAGNOSTIC_RPC_URL, probeDiagnosticMarket } = await import(
  pathToFileURL(`${process.cwd()}/.astro/quote-probe.mjs`).href
);
const rpcFetch = createProbeFetch(DIAGNOSTIC_RPC_URL);
const output = [];
for (const amountIndex of [0, 1]) {
  try {
    const result = await probeDiagnosticMarket(undefined, amountIndex, {
      rpcFetch,
    });
    output.push(result);
    if (result.status === "COMPARISON_OK") break;
    if (
      result.classes.some(
        (item) => item.classification === "RATE_LIMITED_OR_UNREACHABLE",
      )
    )
      break;
  } catch (error) {
    output.push({
      status: "CONFIG_OR_READ_FAILURE",
      amountIndex,
      error: error instanceof Error ? error.message : String(error),
    });
    break;
  }
}
console.log(
  JSON.stringify(
    { runUtc: new Date().toISOString(), results: output },
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  ),
);
process.exitCode = probeExitCode(output);
