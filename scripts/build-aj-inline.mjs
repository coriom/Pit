import { createHash } from "node:crypto";
import { buildSync } from "esbuild";

const entries = {
  rebalance: "src/lib/portfolio-rebalance-browser.ts",
  performance: "src/lib/performance-drawdown-browser.ts",
};
const cache = new Map();
export function ajInlineScript(kind) {
  if (!Object.hasOwn(entries, kind))
    throw Error("Unreviewed Phase AJ browser script");
  if (!cache.has(kind)) {
    const output = buildSync({
      entryPoints: [entries[kind]],
      bundle: true,
      minify: true,
      format: "iife",
      platform: "browser",
      target: "es2022",
      write: false,
      logLevel: "silent",
    }).outputFiles?.[0]?.text;
    if (!output) throw Error("Phase AJ browser script missing");
    cache.set(kind, output.replaceAll(/<\/script/gi, "<\\/script"));
  }
  return cache.get(kind);
}
export function ajInlineHash(kind) {
  return `sha256-${createHash("sha256").update(ajInlineScript(kind)).digest("base64")}`;
}
