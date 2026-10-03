import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

await mkdir(".astro", { recursive: true });
await build({
  entryPoints: ["src/lib/diagnostic-quotes.ts"],
  outfile: ".astro/quote-probe.mjs",
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
});
const { probeDiagnosticMarket } = await import(
  pathToFileURL(`${process.cwd()}/.astro/quote-probe.mjs`).href
);
const output = [];
for (const amountIndex of [0, 1]) {
  try {
    const result = await probeDiagnosticMarket(undefined, amountIndex);
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
process.exitCode = output.some((item) => item.status === "COMPARISON_OK")
  ? 0
  : output.some((item) => item.status === "CONFIG_OR_READ_FAILURE")
    ? 3
    : 2;
