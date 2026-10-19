import { createHash } from "node:crypto";
import { buildSync } from "esbuild";

const entries = {
  collateral: "src/lib/collateral-health-browser.ts",
  borrowing: "src/lib/borrowing-cost-browser.ts",
};
const cache = new Map();
export function alInlineScript(kind) {
  if (!Object.hasOwn(entries, kind))
    throw Error("Unreviewed Phase AL browser script");
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
    if (!output) throw Error("Phase AL browser script missing");
    cache.set(kind, output.replaceAll(/<\/script/gi, "<\\/script"));
  }
  return cache.get(kind);
}
export function alInlineHash(kind) {
  return `sha256-${createHash("sha256").update(alInlineScript(kind)).digest("base64")}`;
}
