import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  isAddress,
  parseAbi,
  zeroAddress,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { sepolia } from "viem/chains";
import { config } from "./config";
import {
  PreflightError,
  requirePredicate,
  verifyAccountingStorage,
  verifyWallet,
} from "./execution-preflight";
import {
  UNISWAP_V3_SEPOLIA_FACTORY,
  UNISWAP_V3_SEPOLIA_QUOTER_V2,
  uniswapV3QuoteProvider,
} from "./uniswap-quote";
import { type NormalizedQuote } from "./swap-quotes";

// ISwapRouter02 inherits IV3SwapRouter. Its exactInputSingle tuple has no
// deadline; a fresh original quote and amountOutMinimum supply the guards.
// https://github.com/Uniswap/swap-router-contracts/blob/main/contracts/interfaces/IV3SwapRouter.sol
export const UNISWAP_SEPOLIA = Object.freeze({
  chainId: 11155111,
  router: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" as Address,
  factory: UNISWAP_V3_SEPOLIA_FACTORY,
  quoter: UNISWAP_V3_SEPOLIA_QUOTER_V2,
  weth: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14" as Address,
  usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address,
  fee: 500,
  slippageBps: 50n,
});
// Phase Z live acceptance stopped before approval. Keep ordinary execution
// unreachable until a separately reviewed live run confirms receipt/accounting.
export const UNISWAP_EXECUTION_ACCEPTED = false;
export const swapRouter02Abi = parseAbi([
  "function factory() view returns (address)",
  "function WETH9() view returns (address)",
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
]);
const factoryAbi = parseAbi([
  "function getPool(address tokenA,address tokenB,uint24 fee) view returns (address)",
]);
const poolAbi = parseAbi([
  "function factory() view returns (address)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
]);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export type UniswapExecutionQuote = Readonly<{
  owner: Address;
  chainId: 11155111;
  router: Address;
  pool: Address;
  sellToken: Address;
  buyToken: Address;
  sellAmount: bigint;
  expectedBuy: bigint;
  minimumBuy: bigint;
  obtainedAt: number;
  expiresAt: number;
  normalized: NormalizedQuote;
}>;
type Context = {
  wallet: WalletClient;
  fingerprint: string;
  approvalAttempted: boolean;
  swapAttempted: boolean;
};
const executions = new WeakMap<UniswapExecutionQuote, Context>();
const current = new WeakMap<WalletClient, UniswapExecutionQuote>();

function assertRelease() {
  requirePredicate(config.FEES_ENABLED === false, "FEES_ENABLED");
  requirePredicate(config.MAINNET_ENABLED === false, "MAINNET_ENABLED");
}
function assertPair(sell: string, buy: string) {
  requirePredicate(isAddress(sell) && isAddress(buy), "UNSUPPORTED_ASSETS");
  requirePredicate(
    (same(sell, UNISWAP_SEPOLIA.usdc) && same(buy, UNISWAP_SEPOLIA.weth)) ||
      (same(sell, UNISWAP_SEPOLIA.weth) && same(buy, UNISWAP_SEPOLIA.usdc)),
    "UNSUPPORTED_ASSETS",
  );
}
function fingerprint(q: UniswapExecutionQuote) {
  return [q.owner, q.chainId, q.router, q.pool, q.sellToken, q.buyToken,
    q.sellAmount, q.expectedBuy, q.minimumBuy, q.obtainedAt, q.expiresAt,
    q.normalized.sellAmount, q.normalized.buyAmount,
    q.normalized.singlePoolAddress, q.normalized.quotedAtMs,
    q.normalized.expiresAtMs, q.normalized.protocolFee.ratePpm,
    q.normalized.pitFeeBuyAmount].map(String).join("|");
}
function publicClient(wallet: WalletClient) {
  return createPublicClient({
    chain: sepolia,
    transport: custom({ request: wallet.request }),
  });
}
export function uniswapSwapData(q: UniswapExecutionQuote): Hex {
  const data = encodeFunctionData({
    abi: swapRouter02Abi,
    functionName: "exactInputSingle",
    args: [{ tokenIn: q.sellToken, tokenOut: q.buyToken,
      fee: UNISWAP_SEPOLIA.fee, recipient: q.owner,
      amountIn: q.sellAmount, amountOutMinimum: q.minimumBuy,
      sqrtPriceLimitX96: 0n }],
  });
  const decoded = decodeFunctionData({ abi: swapRouter02Abi, data });
  if (decoded.functionName !== "exactInputSingle" ||
      !same(decoded.args[0].tokenIn, q.sellToken) ||
      !same(decoded.args[0].tokenOut, q.buyToken) ||
      decoded.args[0].fee !== UNISWAP_SEPOLIA.fee ||
      !same(decoded.args[0].recipient, q.owner) ||
      decoded.args[0].amountIn !== q.sellAmount ||
      decoded.args[0].amountOutMinimum !== q.minimumBuy ||
      decoded.args[0].sqrtPriceLimitX96 !== 0n)
    throw new PreflightError("INVALID_EXECUTION_QUOTE");
  return data;
}
async function inspectEnvironment(wallet: WalletClient, sell: Address, buy: Address) {
  assertRelease();
  requirePredicate(!!wallet.account, "DISCONNECTED");
  requirePredicate(wallet.chain?.id === UNISWAP_SEPOLIA.chainId, "WRONG_CHAIN");
  await verifyWallet(wallet);
  const client = publicClient(wallet);
  requirePredicate((await client.getChainId()) === UNISWAP_SEPOLIA.chainId, "WRONG_CHAIN");
  await verifyAccountingStorage();
  assertPair(sell, buy);
  const [routerCode, quoterCode, factoryCode, sellCode, buyCode, routerFactory,
    routerWeth, pool] = await Promise.all([
    client.getCode({ address: UNISWAP_SEPOLIA.router }),
    client.getCode({ address: UNISWAP_SEPOLIA.quoter }),
    client.getCode({ address: UNISWAP_SEPOLIA.factory }),
    client.getCode({ address: sell }),
    client.getCode({ address: buy }),
    client.readContract({ address: UNISWAP_SEPOLIA.router, abi: swapRouter02Abi, functionName: "factory" }),
    client.readContract({ address: UNISWAP_SEPOLIA.router, abi: swapRouter02Abi, functionName: "WETH9" }),
    client.readContract({ address: UNISWAP_SEPOLIA.factory, abi: factoryAbi,
      functionName: "getPool", args: [sell, buy, UNISWAP_SEPOLIA.fee] }),
  ]);
  requirePredicate([routerCode, quoterCode, factoryCode, sellCode, buyCode].every(
    (code) => !!code && code !== "0x"), "COW_CONFIGURATION");
  requirePredicate(same(routerFactory, UNISWAP_SEPOLIA.factory) &&
    same(routerWeth, UNISWAP_SEPOLIA.weth) && pool !== zeroAddress,
    "UNISWAP_CONFIGURATION");
  const [poolCode, poolFactory, token0, token1, fee, liquidity, slot0] = await Promise.all([
    client.getCode({ address: pool }),
    client.readContract({ address: pool, abi: poolAbi, functionName: "factory" }),
    client.readContract({ address: pool, abi: poolAbi, functionName: "token0" }),
    client.readContract({ address: pool, abi: poolAbi, functionName: "token1" }),
    client.readContract({ address: pool, abi: poolAbi, functionName: "fee" }),
    client.readContract({ address: pool, abi: poolAbi, functionName: "liquidity" }),
    client.readContract({ address: pool, abi: poolAbi, functionName: "slot0" }),
  ]);
  requirePredicate(!!poolCode && poolCode !== "0x" &&
    same(poolFactory, UNISWAP_SEPOLIA.factory) && fee === UNISWAP_SEPOLIA.fee &&
    ((same(token0, sell) && same(token1, buy)) ||
      (same(token0, buy) && same(token1, sell))) &&
    liquidity > 0n && slot0[0] > 0n && slot0[6] === true,
    "UNISWAP_CONFIGURATION");
  return { client, pool };
}
export function invalidateUniswapQuote(q: UniswapExecutionQuote | undefined) {
  if (!q) return;
  const context = executions.get(q);
  if (context && current.get(context.wallet) === q) current.delete(context.wallet);
  executions.delete(q);
}
export async function quoteUniswapExecution(wallet: WalletClient, sell: string, buy: string, amount: string) {
  requirePredicate(UNISWAP_EXECUTION_ACCEPTED, "UNISWAP_NOT_ACCEPTED");
  if (!isAddress(sell) || !isAddress(buy)) throw new PreflightError("UNSUPPORTED_ASSETS");
  const prior = current.get(wallet);
  invalidateUniswapQuote(prior);
  const { client, pool } = await inspectEnvironment(wallet, sell, buy);
  const normalized = await uniswapV3QuoteProvider(undefined, [500]).quote({
    chainId: UNISWAP_SEPOLIA.chainId, sellToken: sell, buyToken: buy,
    sellAmountText: amount, direction: "exact-in",
  });
  requirePredicate(same(normalized.singlePoolAddress ?? "", pool) &&
    normalized.protocolFee.ratePpm === UNISWAP_SEPOLIA.fee &&
    normalized.buyAmount > 0n && normalized.pitFeeBuyAmount === 0n,
    "INVALID_EXECUTION_QUOTE");
  const balance = await client.readContract({ address: sell, abi: erc20Abi,
    functionName: "balanceOf", args: [wallet.account!.address] });
  requirePredicate(balance >= normalized.sellAmount, "INSUFFICIENT_BALANCE");
  const minimumBuy = normalized.buyAmount * (10000n - UNISWAP_SEPOLIA.slippageBps) / 10000n;
  requirePredicate(minimumBuy > 0n && minimumBuy <= normalized.buyAmount,
    "INVALID_EXECUTION_QUOTE");
  const retainedNormalized = Object.freeze({ ...normalized,
    protocolFee: Object.freeze({ ...normalized.protocolFee }) });
  const q: UniswapExecutionQuote = Object.freeze({
    owner: wallet.account!.address, chainId: UNISWAP_SEPOLIA.chainId,
    router: UNISWAP_SEPOLIA.router, pool, sellToken: sell, buyToken: buy,
    sellAmount: normalized.sellAmount, expectedBuy: normalized.buyAmount,
    minimumBuy, obtainedAt: normalized.quotedAtMs,
    expiresAt: normalized.expiresAtMs, normalized: retainedNormalized,
  });
  executions.set(q, { wallet, fingerprint: fingerprint(q), approvalAttempted: false, swapAttempted: false });
  current.set(wallet, q);
  return q;
}
export async function inspectUniswapExecution(q: UniswapExecutionQuote) {
  requirePredicate(!!q && typeof q === "object", "INVALID_EXECUTION_QUOTE");
  const context = executions.get(q);
  requirePredicate(!!context && current.get(context.wallet) === q &&
    fingerprint(q) === context.fingerprint &&
    same(q.router, UNISWAP_SEPOLIA.router) && q.chainId === 11155111,
    "INVALID_EXECUTION_QUOTE");
  requirePredicate(UNISWAP_EXECUTION_ACCEPTED, "UNISWAP_NOT_ACCEPTED");
  requirePredicate(Date.now() < q.expiresAt &&
    Date.now() - q.obtainedAt < 30000, "QUOTE_EXPIRED");
  const { client, pool } = await inspectEnvironment(context.wallet, q.sellToken, q.buyToken);
  requirePredicate(same(pool, q.pool), "INVALID_EXECUTION_QUOTE");
  const [balance, allowance, eth, gasPrice] = await Promise.all([
    client.readContract({ address: q.sellToken, abi: erc20Abi, functionName: "balanceOf", args: [q.owner] }),
    client.readContract({ address: q.sellToken, abi: erc20Abi, functionName: "allowance", args: [q.owner, q.router] }),
    client.getBalance({ address: q.owner }), client.getGasPrice(),
  ]);
  requirePredicate(balance >= q.sellAmount, "INSUFFICIENT_BALANCE");
  const data = uniswapSwapData(q);
  const gasEstimate = allowance >= q.sellAmount
    ? await client.estimateGas({ account: q.owner, to: q.router, data, value: 0n })
    : await client.estimateContractGas({ account: q.owner, address: q.sellToken,
        abi: erc20Abi, functionName: "approve", args: [q.router, q.sellAmount] });
  requirePredicate(eth >= gasEstimate * gasPrice * 2n, "INSUFFICIENT_BALANCE");
  requirePredicate(current.get(context.wallet) === q &&
    Date.now() < q.expiresAt, "QUOTE_EXPIRED");
  return { context, client, balance, allowance, eth, gasPrice, gasEstimate, data };
}
export async function approveUniswap(q: UniswapExecutionQuote) {
  const state = await inspectUniswapExecution(q);
  if (state.allowance >= q.sellAmount) return null;
  requirePredicate(!state.context.approvalAttempted, "INVALID_EXECUTION_QUOTE");
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve",
    args: [q.router, q.sellAmount] });
  const decoded = decodeFunctionData({ abi: erc20Abi, data });
  requirePredicate(decoded.functionName === "approve" &&
    same(decoded.args[0], q.router) && decoded.args[1] === q.sellAmount,
    "INVALID_EXECUTION_QUOTE");
  state.context.approvalAttempted = true; // ambiguity never causes an automatic retry
  const hash = await state.context.wallet.sendTransaction({
    account: state.context.wallet.account!, chain: sepolia,
    to: q.sellToken, data, value: 0n,
  });
  const receipt = await state.client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Uniswap approval reverted");
  const tx = await state.client.getTransaction({ hash });
  requirePredicate(same(tx.from, q.owner) && same(tx.to ?? "", q.sellToken) &&
    tx.value === 0n && tx.input === data &&
    (await state.client.readContract({ address: q.sellToken, abi: erc20Abi,
      functionName: "allowance", args: [q.owner, q.router] })) >= q.sellAmount,
    "INVALID_EXECUTION_QUOTE");
  invalidateUniswapQuote(q); // approval changes state; obtain a new execution quote
  return hash;
}
export async function submitUniswap(q: UniswapExecutionQuote) {
  const state = await inspectUniswapExecution(q);
  requirePredicate(state.allowance >= q.sellAmount, "INVALID_EXECUTION_QUOTE");
  requirePredicate(!state.context.swapAttempted, "INVALID_EXECUTION_QUOTE");
  state.context.swapAttempted = true; // one broadcast, no automatic retry
  const hash = await state.context.wallet.sendTransaction({
    account: state.context.wallet.account!, chain: sepolia,
    to: q.router, data: state.data, value: 0n,
  });
  const receipt = await state.client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Uniswap swap reverted");
  const tx = await state.client.getTransaction({ hash });
  requirePredicate(same(tx.from, q.owner) && same(tx.to ?? "", q.router) &&
    tx.value === 0n && tx.input === state.data, "INVALID_EXECUTION_QUOTE");
  invalidateUniswapQuote(q);
  return { hash, receipt, client: state.client };
}
