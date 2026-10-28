import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const walletPreview = process.env.PIT_OPERATIONS_MODE === "base-sepolia-wallet";
const testnet = process.env.PIT_OPERATIONS_MODE === "base-sepolia" || walletPreview;
if (process.env.PIT_OPERATIONS_MODE && !["local", "base-sepolia", "base-sepolia-wallet"].includes(process.env.PIT_OPERATIONS_MODE)) throw Error("Unsupported operations artifact mode");
const root = walletPreview ? "dist-operations-sepolia-wallet" : testnet ? "dist-operations-sepolia" : "dist-operations";
const allowedConnect = testnet ? "https://sepolia.base.org" : "http://127.0.0.1:8545 https:";
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(relative(root, path).replaceAll("\\", "/"));
  }
}
walk(root);
const expected = ["index.html", "404.html", "operations/token-creator/index.html", "operations/multisender/index.html", "operations/token-locker/index.html", "operations/token-vesting/index.html",
  ...(!testnet ? ["token-management", "allowance-manager", "batch-balance-checker", "native-multisender", "nft-creator", "nft-batch-sender", "locker-manager", "vesting-manager", "nft-manager", "erc1155-creator", "erc1155-manager", "erc1155-multisender", "metadata-studio", "airdrop-composer"].map((id) => `operations/${id}/index.html`) : [])].sort();
const html = files.filter((name) => name.endsWith(".html")).sort();
if (JSON.stringify(html) !== JSON.stringify(expected)) throw Error(`Unexpected operation routes: ${html.join(", ")}`);
for (const name of files) if (!expected.includes(name) && name !== "_headers" && name !== "robots.txt" && !/^_astro\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(name)) throw Error(`Unexpected operation artifact: ${name}`);
const headers = readFileSync(join(root, "_headers"), "utf8");
if (!headers.includes(`connect-src ${allowedConnect};`) || !headers.includes("X-Robots-Tag: noindex, nofollow")) throw Error("Unsafe operation headers");
if (testnet ? /http:\/\/127\.0\.0\.1:8545|connect-src [^;]*\s/.test(headers) : /https:\/\/(?!ipfs\.io)/.test(headers)) throw Error("Unexpected operation connect origin");
for (const name of html) {
  const source = readFileSync(join(root, name), "utf8");
  if (!/noindex,nofollow/.test(source) || !source.includes(`connect-src ${allowedConnect};`) || /https:\/\/(?:api\.cow\.fi|api\.hyperliquid|.*\.rpc\.)/.test(source)) throw Error(`Unsafe operation page: ${name}`);
}
if (files.some((name) => /(?:premium-worker|taxlot|\.map$)/i.test(name))) throw Error("Forbidden operation artifact");
const scripts = files.filter((name) => name.endsWith(".js"));
if (scripts.length < 1 || scripts.length > (testnet ? 3 : 11)) throw Error(`Unexpected operations JavaScript asset count: ${scripts.length}`);
if (testnet && scripts.some((name) => /LOCAL MOCK USDC|PitPaidTokenCreator|PitPaidOperations/.test(readFileSync(join(root, name), "utf8")))) {
  throw Error("Local payment prototype leaked into a Base Sepolia bundle");
}
if (testnet && !walletPreview) {
  const code = scripts.map((name) => readFileSync(join(root, name), "utf8")).join("\n");
  if (/127\.0\.0\.1:8545|eth_sendTransaction|eth_sendRawTransaction|eth_requestAccounts|walletClient|deployContract|writeContract|LOCAL MOCK USDC|PitPaidTokenCreator|PitPaidOperations/.test(code)) throw Error("Wallet, payment or transaction code leaked into read-only testnet preview");
}
if (walletPreview) {
  const code = scripts.map((name) => readFileSync(join(root, name), "utf8")).join("\n");
  if (!code.includes("eth_requestAccounts") || !code.includes("signing is disabled")) throw Error("Wallet preview did not emit the fail-closed campaign guard");
  if (!process.env.PIT4B_CAMPAIGN_PATH && /eth_sendTransaction|sendTransaction|writeContract/.test(code)) throw Error("Unapproved wallet preview emitted a transaction sender");
  if (/https:\/\/(?:mainnet\.base\.org|api\.cow\.fi|api\.hyperliquid)/.test(code)) throw Error("Forbidden execution endpoint in private wallet preview");
}
console.log(`OPERATIONS ${walletPreview ? "BASE SEPOLIA WALLET LOCALHOST" : testnet ? "BASE SEPOLIA" : "LOCAL"} ARTIFACT PASS — ${html.length} HTML routes, ${files.length} files; noindex; ${allowedConnect} CSP; NOT DEPLOYED`);
