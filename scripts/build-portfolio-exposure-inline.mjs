import { createHash } from "node:crypto";
import { buildSync } from "esbuild";
let cached;
export function portfolioExposureInlineScript() {
  if (!cached) {
    const output = buildSync({
      entryPoints: ["src/lib/portfolio-exposure-browser.ts"],
      bundle: true,
      minify: true,
      format: "iife",
      platform: "browser",
      target: "es2022",
      write: false,
      logLevel: "silent",
    }).outputFiles?.[0]?.text;
    if (!output) throw Error("Local portfolio browser bundle missing");
    cached = output.replaceAll(/<\/script/gi, "<\\/script");
  }
  return cached;
}
export function portfolioExposureInlineHash() {
  return `sha256-${createHash("sha256").update(portfolioExposureInlineScript()).digest("base64")}`;
}
