import { createHash } from "node:crypto";
import { buildSync } from "esbuild";

const entries = {
  trade: "src/lib/trade-risk-browser.ts",
  execution: "src/lib/execution-math-browser.ts",
};
const cache = new Map();
export function aiInlineScript(kind) {
  if (!Object.hasOwn(entries, kind))
    throw Error("Unreviewed Phase AI browser script");
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
    if (!output) throw Error("Phase AI browser script missing");
    cache.set(kind, output.replaceAll(/<\/script/gi, "<\\/script"));
  }
  return cache.get(kind);
}
export function aiInlineHash(kind) {
  return `sha256-${createHash("sha256").update(aiInlineScript(kind)).digest("base64")}`;
}
