// PIT_AUTONOMOUS_SIGNER_TEST_ONLY — never import from src/ or a browser build.
import { readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

export const TEST_OPERATOR = Object.freeze({
  address: "0x29d0B5939dcC4D0492D72ABd1210dEbd6c90cC96",
  chainId: 11155111,
  rpc: "https://ethereum-sepolia-rpc.publicnode.com",
  cowApi: "https://api.cow.fi/sepolia",
  weth: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
  usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  relayer: "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110",
  settlement: "0x9008D19f58AAbD9eD0D60971565AA8510560ab41",
  sellBudget: 5000000000000000n,
  uniswapRouter: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
  uniswapSellCap: 10000000n,
  maxEthValue: 20000000000000000n,
});
const uniswapRouterAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
]);
const keyPath = "/home/corio/.pit/test-operator/key";
const lower = (value) => String(value).toLowerCase();
const same = (a, b) => lower(a) === lower(b);
const configPath = fileURLToPath(new URL("../../src/lib/config.ts", import.meta.url));

// Test-only request-scoped transport. JSON-RPC parameters (including a public
// signed transaction) go through stdin, never a command argument or log.
export function castTransport() {
  return custom({
    async request({ method, params = [] }) {
      if (!/^eth_[A-Za-z0-9]+$/.test(method)) throw Error("AUTONOMOUS_RPC_METHOD");
      return new Promise((resolve, reject) => {
        const child = spawn("cast", ["rpc", "--raw", method, "--rpc-url", TEST_OPERATOR.rpc, "--rpc-timeout", "15"],
          { stdio: ["pipe", "pipe", "ignore"], env: { PATH: process.env.PATH ?? "/usr/bin:/bin" } });
        let output = "";
        let finished = false;
        const fail = () => {
          if (finished) return;
          finished = true;
          reject(Error(`AUTONOMOUS_RPC_FAILED:${method}`));
        };
        const timer = setTimeout(() => { child.kill(); fail(); }, 17000);
        child.on("error", fail);
        child.stdout.on("data", (chunk) => {
          output += chunk.toString();
          if (output.length > 2_000_000) { child.kill(); fail(); }
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          if (finished) return;
          if (code !== 0) return fail();
          try { const result = JSON.parse(output); finished = true; resolve(result); }
          catch { fail(); }
        });
        child.stdin.end(JSON.stringify(params));
      });
    },
  }, { retryCount: 0 });
}

export function assertTestRelease(source = readFileSync(configPath, "utf8")) {
  const fee = [...source.matchAll(/^\s*FEES_ENABLED:\s*(true|false)\s+as\s+boolean\s*,?\s*$/gm)];
  const mainnet = [...source.matchAll(/^\s*MAINNET_ENABLED:\s*(true|false)\s+as\s+boolean\s*,?\s*$/gm)];
  if (fee.length !== 1 || fee[0][1] !== "false" ||
      mainnet.length !== 1 || mainnet[0][1] !== "false")
    throw Error("AUTONOMOUS_RELEASE_GATE");
}

/** @param {any} tx @param {any} [uniswapSpec] */
export function assertReviewedTransaction(tx, uniswapSpec = null) {
  assertTestRelease();
  if (!same(tx.from, TEST_OPERATOR.address) ||
      (tx.chainId !== undefined && Number(tx.chainId) !== TEST_OPERATOR.chainId))
    throw Error("AUTONOMOUS_TRANSACTION_CONTEXT");
  const value = BigInt(tx.value ?? 0);
  if (value < 0n || value > TEST_OPERATOR.maxEthValue)
    throw Error("AUTONOMOUS_VALUE_CAP");
  const data = lower(tx.data ?? tx.input ?? "0x");
  if (uniswapSpec?.action === "approve" && same(tx.to, TEST_OPERATOR.usdc) && value === 0n) {
    const expected = lower(encodeFunctionData({ abi: erc20Abi, functionName: "approve",
      args: [TEST_OPERATOR.uniswapRouter, TEST_OPERATOR.uniswapSellCap] }));
    if (data !== expected) throw Error("AUTONOMOUS_UNISWAP_APPROVAL_INTENT");
    return "uniswap-approve";
  }
  if (uniswapSpec?.action === "swap" && same(tx.to, TEST_OPERATOR.uniswapRouter) && value === 0n) {
    if (Date.now() >= uniswapSpec.expiresAt || data !== uniswapSpec.data)
      throw Error("AUTONOMOUS_UNISWAP_SWAP_INTENT");
    const decoded = decodeFunctionData({ abi: uniswapRouterAbi, data });
    const p = decoded.args?.[0];
    if (decoded.functionName !== "exactInputSingle" || !same(p.tokenIn, TEST_OPERATOR.usdc) ||
        !same(p.tokenOut, TEST_OPERATOR.weth) || !same(p.recipient, TEST_OPERATOR.address) ||
        p.fee !== 500 || p.amountIn !== TEST_OPERATOR.uniswapSellCap ||
        p.amountOutMinimum !== uniswapSpec.minimumBuy || p.sqrtPriceLimitX96 !== 0n)
      throw Error("AUTONOMOUS_UNISWAP_SWAP_INTENT");
    return "uniswap-swap";
  }
  if (!same(tx.to, TEST_OPERATOR.weth)) throw Error("AUTONOMOUS_TRANSACTION_CONTEXT");
  if (data === "0xd0e30db0" && value === TEST_OPERATOR.sellBudget)
    return "deposit";
  if (value !== 0n) throw Error("AUTONOMOUS_CALLDATA");
  let decoded;
  try { decoded = decodeFunctionData({ abi: erc20Abi, data }); }
  catch { throw Error("AUTONOMOUS_CALLDATA"); }
  if (decoded.functionName !== "approve" ||
      !same(decoded.args[0], TEST_OPERATOR.relayer) ||
      decoded.args[1] !== TEST_OPERATOR.sellBudget ||
      data !== lower(encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [TEST_OPERATOR.relayer, TEST_OPERATOR.sellBudget],
      })))
    throw Error("AUTONOMOUS_APPROVAL_INTENT");
  return "approve";
}

export function loadTestAccount() {
  assertTestRelease();
  const file = statSync(keyPath);
  if (!file.isFile() || (file.mode & 0o777) !== 0o600)
    throw Error("AUTONOMOUS_SECRET_PERMISSIONS");
  const material = readFileSync(keyPath, "utf8").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(material))
    throw Error("AUTONOMOUS_SECRET_FORMAT");
  const account = privateKeyToAccount(material);
  if (!same(account.address, TEST_OPERATOR.address))
    throw Error("AUTONOMOUS_ADDRESS_MISMATCH");
  return account;
}

/** Node-only EIP-1193 bridge. Nothing here is sent to page JavaScript. */
export function createTestProvider({ account = loadTestAccount(), transport = castTransport(), allowTransactions = false, allowOrderSigning = false } = {}) {
  assertTestRelease();
  if (!same(account.address, TEST_OPERATOR.address))
    throw Error("AUTONOMOUS_ADDRESS_MISMATCH");
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient = createWalletClient({ chain: sepolia, account, transport });
  let sent = false;
  let signed = false;
  let orderSpec = null;
  let uniswapSpec = null;
  const readMethods = new Set([
    "eth_blockNumber", "eth_call", "eth_estimateGas", "eth_feeHistory",
    "eth_gasPrice", "eth_getBalance", "eth_getBlockByNumber", "eth_getCode",
    "eth_getLogs", "eth_getTransactionByHash", "eth_getTransactionCount",
    "eth_getTransactionReceipt", "eth_maxPriorityFeePerGas",
  ]);
  const request = async ({ method, params = [] }) => {
    assertTestRelease();
    if (await publicClient.getChainId() !== TEST_OPERATOR.chainId)
      throw Error("AUTONOMOUS_WRONG_CHAIN");
    if (method === "eth_chainId") return "0xaa36a7";
    if (method === "eth_accounts" || method === "eth_requestAccounts")
      return [TEST_OPERATOR.address];
    if (method === "wallet_switchEthereumChain") {
      if (Number(params[0]?.chainId) !== TEST_OPERATOR.chainId)
        throw Error("AUTONOMOUS_WRONG_CHAIN");
      return null;
    }
    if (readMethods.has(method)) return transport({ chain: sepolia }).request({ method, params });
    if (method === "eth_sendTransaction") {
      if (!allowTransactions) throw Error("AUTONOMOUS_TRANSACTION_NOT_ARMED");
      if (sent) throw Error("AUTONOMOUS_NO_TRANSACTION_RETRY");
      const tx = params[0];
      assertReviewedTransaction(tx, uniswapSpec);
      sent = true; // Set before broadcast; ambiguity must never trigger a retry.
      return walletClient.sendTransaction({
        account, chain: sepolia, to: tx.to,
        data: tx.data ?? tx.input, value: BigInt(tx.value ?? 0),
      });
    }
    if (method === "eth_signTypedData_v4") {
      if (!orderSpec || signed) throw Error("AUTONOMOUS_ORDER_NOT_AUTHORIZED");
      const [from, raw] = params;
      if (!same(from, TEST_OPERATOR.address)) throw Error("AUTONOMOUS_ORDER_ACCOUNT");
      const typed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (typed.primaryType !== "Order" ||
          typed.domain?.name !== "Gnosis Protocol" ||
          typed.domain?.version !== "v2" ||
          Number(typed.domain?.chainId) !== TEST_OPERATOR.chainId ||
          !same(typed.domain?.verifyingContract, TEST_OPERATOR.settlement) ||
          !same(typed.message?.sellToken, TEST_OPERATOR.weth) ||
          !same(typed.message?.buyToken, TEST_OPERATOR.usdc) ||
          !same(typed.message?.receiver, TEST_OPERATOR.address) ||
          BigInt(typed.message?.sellAmount ?? 0) !== TEST_OPERATOR.sellBudget ||
          BigInt(typed.message?.buyAmount ?? 0) !== orderSpec.minimumBuy ||
          BigInt(typed.message?.feeAmount ?? -1) !== 0n ||
          !same(typed.message?.appData, orderSpec.appDataHash) ||
          typed.message?.kind !== "sell" ||
          typed.message?.partiallyFillable !== false ||
          typed.message?.sellTokenBalance !== "erc20" ||
          typed.message?.buyTokenBalance !== "erc20" ||
          Number(typed.message?.validTo) <= Math.floor(Date.now()/1000) ||
          Number(typed.message?.validTo) > Math.floor(Date.now()/1000)+1200)
        throw Error("AUTONOMOUS_ORDER_INTENT");
      signed = true;
      return account.signTypedData(typed);
    }
    throw Error("AUTONOMOUS_METHOD_DENIED");
  };
  return {
    request,
    // Only the controlling Node harness may arm one reviewed order.
    armReviewedOrder(spec) {
      assertTestRelease();
      if (!allowOrderSigning) throw Error("AUTONOMOUS_ORDER_SIGNING_DISABLED");
      if (signed || orderSpec ||
          !/^0x[0-9a-fA-F]{64}$/.test(spec?.appDataHash ?? "") ||
          BigInt(spec?.minimumBuy ?? 0) <= 0n ||
          !Number.isSafeInteger(spec?.quoteId) ||
          spec.quoteId <= 0 ||
          spec.verified !== true ||
          Date.parse(spec.expiresAt) <= Date.now())
        throw Error("AUTONOMOUS_ORDER_ARMING");
      orderSpec = { appDataHash: spec.appDataHash, minimumBuy: BigInt(spec.minimumBuy), quoteId: spec.quoteId };
    },
    armReviewedUniswap(spec) {
      assertTestRelease();
      if (!allowTransactions || sent || uniswapSpec || !["approve", "swap"].includes(spec?.action))
        throw Error("AUTONOMOUS_UNISWAP_ARMING");
      if (spec.action === "approve") {
        uniswapSpec = { action: "approve" };
        return;
      }
      const minimumBuy = BigInt(spec.minimumBuy ?? 0);
      const expectedBuy = BigInt(spec.expectedBuy ?? 0);
      if (minimumBuy <= 0n || minimumBuy > expectedBuy ||
          !Number.isSafeInteger(spec.expiresAt) || spec.expiresAt <= Date.now() ||
          spec.expiresAt > Date.now() + 30000)
        throw Error("AUTONOMOUS_UNISWAP_ARMING");
      const data = lower(encodeFunctionData({ abi: uniswapRouterAbi,
        functionName: "exactInputSingle", args: [{
          tokenIn: TEST_OPERATOR.usdc, tokenOut: TEST_OPERATOR.weth,
          fee: 500, recipient: TEST_OPERATOR.address,
          amountIn: TEST_OPERATOR.uniswapSellCap,
          amountOutMinimum: minimumBuy, sqrtPriceLimitX96: 0n,
        }],
      }));
      uniswapSpec = { action: "swap", data, minimumBuy, expiresAt: spec.expiresAt };
    },
    get sent() { return sent; },
    get signed() { return signed; },
  };
}
