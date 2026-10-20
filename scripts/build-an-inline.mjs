import { createHash } from "node:crypto";
import { buildSync } from "esbuild";
const entries = {
  evm: "src/lib/evm-data-inspector-browser.ts",
  csv: "src/lib/crypto-data-workshop-browser.ts",
};
const cache = new Map();
export function anInlineScript(kind) {
  if (!Object.hasOwn(entries, kind))
    throw Error("Unreviewed Phase AN browser script");
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
    if (!output) throw Error("Phase AN browser script missing");
    cache.set(kind, output.replaceAll(/<\/script/gi, "<\\/script"));
  }
  return cache.get(kind);
}
export function anInlineHash(kind) {
  return `sha256-${createHash("sha256").update(anInlineScript(kind)).digest("base64")}`;
}
