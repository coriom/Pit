import { createHash } from "node:crypto";
import { buildSync } from "esbuild";

// The manual bridge calculator uses one deterministic inline script. Its exact
// bytes and CSP hash are generated from the same source without network code.
let cached;
export function bridgeCostInlineScript() {
  if (!cached) {
    const output = buildSync({
      entryPoints: ["src/lib/bridge-cost-browser.ts"],
      bundle: true,
      minify: true,
      format: "iife",
      platform: "browser",
      target: "es2022",
      write: false,
      logLevel: "silent",
    }).outputFiles?.[0]?.text;
    if (!output) throw Error("Local bridge-cost browser bundle missing");
    cached = output.replaceAll(/<\/script/gi, "<\\/script");
  }
  return cached;
}
export function bridgeCostInlineHash() {
  return `sha256-${createHash("sha256").update(bridgeCostInlineScript()).digest("base64")}`;
}
