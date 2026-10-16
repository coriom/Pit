import { createHash } from "node:crypto";
import { buildSync } from "esbuild";

// One deterministic browser script is used both for inline HTML and its exact
// CSP hash. There is no dynamic execution flag, network transport or wallet API.
let cached;
export function swapCostInlineScript() {
  if (!cached) {
    const output = buildSync({
      entryPoints: ["src/lib/swap-cost-browser.ts"],
      bundle: true,
      minify: true,
      format: "iife",
      platform: "browser",
      target: "es2022",
      write: false,
      logLevel: "silent",
    }).outputFiles?.[0]?.text;
    if (!output) throw Error("Local swap-cost browser bundle missing");
    cached = output.replaceAll(/<\/script/gi, "<\\/script");
  }
  return cached;
}

export function swapCostInlineHash() {
  return `sha256-${createHash("sha256").update(swapCostInlineScript()).digest("base64")}`;
}
