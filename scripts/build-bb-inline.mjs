import { createHash } from "node:crypto";
import { buildSync } from "esbuild";
let cache;
export function bbInlineScript() {
  if (!cache) {
    const output=buildSync({entryPoints:["src/lib/bb-browser.ts"],bundle:true,minify:true,format:"iife",platform:"browser",target:"es2022",write:false,logLevel:"silent"}).outputFiles?.[0]?.text;
    if (!output) throw Error("BB browser script missing");
    cache=output.replaceAll(/<\/script/gi,"<\\/script");
  }
  return cache;
}
export function bbInlineHash() { return `sha256-${createHash("sha256").update(bbInlineScript()).digest("base64")}`; }
