import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const testnet = process.env.PIT_OPERATIONS_MODE === "base-sepolia";
if (process.env.PIT_OPERATIONS_MODE && !["local", "base-sepolia"].includes(process.env.PIT_OPERATIONS_MODE)) throw Error("Unsupported operations artifact mode");
const root = testnet ? "dist-operations-sepolia" : "dist-operations";
const allowedConnect = testnet ? "https://sepolia.base.org" : "http://127.0.0.1:8545";
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(relative(root, path).replaceAll("\\", "/"));
  }
}
walk(root);
const expected = ["index.html", "404.html", "operations/token-creator/index.html", "operations/multisender/index.html", "operations/token-locker/index.html", "operations/token-vesting/index.html"].sort();
const html = files.filter((name) => name.endsWith(".html")).sort();
if (JSON.stringify(html) !== JSON.stringify(expected)) throw Error(`Unexpected operation routes: ${html.join(", ")}`);
for (const name of files) if (!expected.includes(name) && name !== "_headers" && name !== "robots.txt" && !/^_astro\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(name)) throw Error(`Unexpected operation artifact: ${name}`);
const headers = readFileSync(join(root, "_headers"), "utf8");
if (!headers.includes(`connect-src ${allowedConnect};`) || !headers.includes("X-Robots-Tag: noindex, nofollow")) throw Error("Unsafe operation headers");
if (testnet ? /http:\/\/127\.0\.0\.1:8545|connect-src [^;]*\s/.test(headers) : /https:\/\//.test(headers)) throw Error("Unexpected operation connect origin");
for (const name of html) {
  const source = readFileSync(join(root, name), "utf8");
  if (!/noindex,nofollow/.test(source) || !source.includes(`connect-src ${allowedConnect};`) || /https:\/\/(?:api\.cow\.fi|api\.hyperliquid|.*\.rpc\.)/.test(source)) throw Error(`Unsafe operation page: ${name}`);
}
if (files.some((name) => /(?:premium-worker|taxlot|\.map$)/i.test(name))) throw Error("Forbidden operation artifact");
const scripts = files.filter((name) => name.endsWith(".js"));
if (scripts.length < 1 || scripts.length > 3) throw Error(`Unexpected operations JavaScript asset count: ${scripts.length}`);
if (testnet) {
  const code = scripts.map((name) => readFileSync(join(root, name), "utf8")).join("\n");
  if (/127\.0\.0\.1:8545|eth_sendTransaction|eth_sendRawTransaction|eth_requestAccounts|walletClient|deployContract|writeContract/.test(code)) throw Error("Wallet or transaction code leaked into read-only testnet preview");
}
console.log(`OPERATIONS ${testnet ? "BASE SEPOLIA" : "LOCAL"} ARTIFACT PASS — ${html.length} HTML routes, ${files.length} files; noindex; ${allowedConnect} CSP; NOT DEPLOYED`);
