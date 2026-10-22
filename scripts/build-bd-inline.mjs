import {createHash} from "node:crypto";import {buildSync} from "esbuild";let cache;
export function bdInlineScript(){if(!cache){const script=buildSync({entryPoints:["src/lib/bd-browser.ts"],bundle:true,minify:true,format:"iife",platform:"browser",target:"es2022",write:false,logLevel:"silent"}).outputFiles?.[0]?.text;if(!script)throw Error("BD browser script missing");cache=script.replaceAll(/<\/script/gi,"<\\/script");}return cache;}
export function bdInlineHash(){return `sha256-${createHash("sha256").update(bdInlineScript()).digest("base64")}`;}
