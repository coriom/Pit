import {createHash} from "node:crypto";
import {buildSync} from "esbuild";
let cache;
export function bcInlineScript(){if(!cache){const script=buildSync({entryPoints:["src/lib/bc-browser.ts"],bundle:true,minify:true,format:"iife",platform:"browser",target:"es2022",write:false,logLevel:"silent"}).outputFiles?.[0]?.text;if(!script)throw Error("BC browser script missing");cache=script.replaceAll(/<\/script/gi,"<\\/script");}return cache;}
export function bcInlineHash(){return `sha256-${createHash("sha256").update(bcInlineScript()).digest("base64")}`;}
