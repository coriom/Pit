import { createHash } from "node:crypto";
import { buildSync } from "esbuild";

const entries = {
  staking: "src/lib/staking-rewards-browser.ts",
  vesting: "src/lib/vesting-unlocks-browser.ts",
};
const cache = new Map();
export function akInlineScript(kind) {
  if (!Object.hasOwn(entries, kind))
    throw Error("Unreviewed Phase AK browser script");
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
    if (!output) throw Error("Phase AK browser script missing");
    cache.set(kind, output.replaceAll(/<\/script/gi, "<\\/script"));
  }
  return cache.get(kind);
}
export function akInlineHash(kind) {
  return `sha256-${createHash("sha256").update(akInlineScript(kind)).digest("base64")}`;
}
