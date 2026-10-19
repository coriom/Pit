import { createHash } from "node:crypto";
import { buildSync } from "esbuild";
const entries = {
  amm: "src/lib/amm-pool-browser.ts",
  concentrated: "src/lib/concentrated-liquidity-browser.ts",
};
const cache = new Map();
export function amInlineScript(kind) {
  if (!Object.hasOwn(entries, kind))
    throw Error("Unreviewed Phase AM browser script");
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
    if (!output) throw Error("Phase AM browser script missing");
    cache.set(kind, output.replaceAll(/<\/script/gi, "<\\/script"));
  }
  return cache.get(kind);
}
export function amInlineHash(kind) {
  return `sha256-${createHash("sha256").update(amInlineScript(kind)).digest("base64")}`;
}
