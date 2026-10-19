import { createHash } from "node:crypto";
import { buildSync } from "esbuild";

const entries = {
  converter: "src/lib/token-fee-browser.ts",
  yield: "src/lib/yield-growth-browser.ts",
};
const cache = new Map();
export function ahInlineScript(kind) {
  if (!Object.hasOwn(entries, kind))
    throw Error("Unreviewed local-tool script");
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
    if (!output) throw Error("Local-tool browser bundle missing");
    cache.set(kind, output.replaceAll(/<\/script/gi, "<\\/script"));
  }
  return cache.get(kind);
}
export function ahInlineHash(kind) {
  return `sha256-${createHash("sha256").update(ahInlineScript(kind)).digest("base64")}`;
}
