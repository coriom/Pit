import { getAddress, namehash, parseAbi } from "viem";
import { EXPLORER_CHAINS, ExplorerRpc, quantity, type ExplorerChain, type ExplorerResult, type ExplorerTool, type RpcFetch } from "./explorer-bn";

// Chain-scoped addresses from the protocols' own deployment registries. These
// inspectors read state; they never construct an executable transaction.
const V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const V3_POSITIONS = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const AAVE_POOL = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";
const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const ZERO = "0x0000000000000000000000000000000000000000";
const POOL = parseAbi([
  "function token0() view returns (address)", "function token1() view returns (address)",
  "function fee() view returns (uint24)", "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
]);
const FACTORY = parseAbi(["function getPool(address,address,uint24) view returns (address)"]);
const TOKEN = parseAbi(["function decimals() view returns (uint8)"]);
const POSITION = parseAbi([
  "function ownerOf(uint256) view returns (address)",
  "function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
]);
const AAVE = parseAbi([
  "function getReservesList() view returns (address[])",
  "function getReserveNormalizedIncome(address) view returns (uint256)",
  "function getReserveNormalizedVariableDebt(address) view returns (uint256)",
]);
const VAULT = parseAbi([
  "function asset() view returns (address)", "function decimals() view returns (uint8)",
  "function totalAssets() view returns (uint256)", "function totalSupply() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
]);
const REGISTRY = parseAbi(["function resolver(bytes32) view returns (address)"]);
const RESOLVER = parseAbi(["function addr(bytes32) view returns (address)"]);
const FEED = parseAbi([
  "function decimals() view returns (uint8)", "function description() view returns (string)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
]);
const POOL_FIELD = { id: "pool", label: "Uniswap v3 pool address on Ethereum", example: "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640" };
const ASSET_FIELD = { id: "asset", label: "Aave reserve asset contract on Ethereum", example: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" };
export const BQ_TOOLS: readonly ExplorerTool[] = [
  { id: "uniswap-v3-pool", title: "Uniswap v3 pool state inspector", question: "What reserves-independent price state and liquidity does a factory-registered pool report?", limitation: "Marginal spot is not an executable quote. Tick, liquidity and fee tier exclude route, slippage, gas and pending changes.", chains: ["ethereum"], fields: [POOL_FIELD] },
  { id: "uniswap-v3-position", title: "Uniswap v3 LP position state", question: "What owner, range and recorded liquidity does a position NFT report?", limitation: "tokensOwed excludes fees not yet accounted into the position; value, full fees and withdrawal amounts are not computed.", chains: ["ethereum"], fields: [{ id: "tokenId", label: "Position NFT token ID", example: "1" }] },
  { id: "aave-reserve-index", title: "Aave v3 reserve index inspector", question: "What normalized income and variable-debt indexes does one listed Aave reserve report?", limitation: "Indexes are ray-scaled accumulators, not APR, APY, balances or a borrowing offer.", chains: ["ethereum"], fields: [ASSET_FIELD] },
  { id: "erc4626-vault-state", title: "ERC-4626 vault accounting inspector", question: "What asset, shares and convertToAssets result does a selected vault self-report?", limitation: "Methods are self-reported. convertToAssets can differ from a redeem quote, and no yield or safety is inferred.", chains: ["ethereum"], fields: [{ id: "vault", label: "ERC-4626 vault address on Ethereum", example: "0x028eC7330ff87667b6dfb0D94b954c820195336c" }, { id: "shares", label: "Raw share units to convert (whole integer)", example: "1000000000000000000" }] },
  { id: "chainlink-feed", title: "Chainlink data-feed freshness inspector", question: "What latest round and update age does a named Ethereum feed report?", limitation: "A feed observation is not a guaranteed current market price; check heartbeat, deviation and feed documentation separately.", chains: ["ethereum"], fields: [{ id: "feed", label: "Chainlink ENS feed", example: "eth-usd.data.eth", kind: "select", options: ["eth-usd.data.eth", "usdc-usd.data.eth"] }, { id: "maxAge", label: "Maximum acceptable age in seconds", example: "3600" }] },
];
export const BQ_IDS = BQ_TOOLS.map((tool) => tool.id);
function address(value: string): `0x${string}` {
  if (value.length !== 42) throw Error("Address must be 20 hex bytes.");
  try { return getAddress(value); } catch { throw Error("Invalid address or mixed-case checksum."); }
}
function uint(value: string, max: bigint): bigint {
  if (!/^(0|[1-9][0-9]{0,76})$/.test(value)) throw Error("Expected a bounded whole integer.");
  const number = BigInt(value);
  if (number > max) throw Error("Integer exceeds supported bound.");
  return number;
}
function row(label: string, value: unknown) { return { label, value: String(value) }; }
function result(rpc: ExplorerRpc, rows: ExplorerResult["rows"], limitation: string): ExplorerResult {
  const chain = EXPLORER_CHAINS[rpc.chain];
  return { chain: chain.label, chainId: chain.id, provider: chain.rpc, block: quantity(rpc.block).toString(), rows, limitation };
}
function fixedRatio(numerator: bigint, denominator: bigint, places = 18): string {
  if (denominator <= 0n || numerator < 0n) throw Error("Invalid ratio.");
  const scaled = numerator * 10n ** BigInt(places) / denominator;
  return `${scaled / 10n ** BigInt(places)}.${(scaled % 10n ** BigInt(places)).toString().padStart(places, "0")}`;
}
export async function runBqTool(id: string, values: Record<string, string>, chain: ExplorerChain, fetcher: RpcFetch = fetch): Promise<ExplorerResult[]> {
  const tool = BQ_TOOLS.find((entry) => entry.id === id);
  if (!tool || !tool.chains.includes(chain)) throw Error("Tool or network is unsupported.");
  for (const field of tool.fields) if (!values[field.id] || values[field.id].length > 256) throw Error(`${field.label} is required and must be bounded.`);
  // Reject malformed user input before the first network request.
  const pool = id === "uniswap-v3-pool" ? address(values.pool.trim()) : undefined;
  const tokenId = id === "uniswap-v3-position" ? uint(values.tokenId.trim(), (1n << 256n) - 1n) : undefined;
  const asset = id === "aave-reserve-index" ? address(values.asset.trim()) : undefined;
  const vault = id === "erc4626-vault-state" ? address(values.vault.trim()) : undefined;
  const shares = id === "erc4626-vault-state" ? uint(values.shares.trim(), (1n << 128n) - 1n) : undefined;
  const feedName = id === "chainlink-feed" ? values.feed.trim() : undefined;
  if (feedName && !["eth-usd.data.eth", "usdc-usd.data.eth"].includes(feedName)) throw Error("Feed is outside the reviewed allowlist.");
  const maxAge = id === "chainlink-feed" ? uint(values.maxAge.trim(), 86400n * 30n) : undefined;
  if (maxAge === 0n) throw Error("Maximum age must be positive.");
  const rpc = await ExplorerRpc.open(chain, fetcher);
  const rows: ExplorerResult["rows"] = [];
  switch (id) {
    case "uniswap-v3-pool": {
      const [token0, token1, fee, liquidity, slot] = await Promise.all([
        rpc.call<`0x${string}`>(pool!, POOL, "token0", []), rpc.call<`0x${string}`>(pool!, POOL, "token1", []),
        rpc.call<number>(pool!, POOL, "fee", []), rpc.call<bigint>(pool!, POOL, "liquidity", []),
        rpc.call<readonly [bigint, number, number, number, number, number, boolean]>(pool!, POOL, "slot0", []),
      ]);
      if (!Number.isInteger(fee) || fee < 0 || fee > 1000000 || token0.toLowerCase() === token1.toLowerCase() || slot[0] <= 0n) throw Error("Malformed pool state.");
      const registered = await rpc.call<`0x${string}`>(V3_FACTORY, FACTORY, "getPool", [token0, token1, fee]);
      if (registered.toLowerCase() !== pool!.toLowerCase()) throw Error("Pool is not registered at the reviewed Ethereum Uniswap v3 factory.");
      const [decimals0, decimals1] = await Promise.all([rpc.call<number>(token0, TOKEN, "decimals", []), rpc.call<number>(token1, TOKEN, "decimals", [])]);
      if (![decimals0, decimals1].every((n) => Number.isInteger(n) && n >= 0 && n <= 36)) throw Error("Token precision outside reviewed range.");
      const numerator = slot[0] * slot[0] * 10n ** BigInt(decimals0);
      const denominator = (1n << 192n) * 10n ** BigInt(decimals1);
      rows.push(row("Factory-registered pool", pool), row("Token0 contract and decimals", `${token0} · ${decimals0}`), row("Token1 contract and decimals", `${token1} · ${decimals1}`), row("Fee tier, hundredths of a basis point", fee), row("In-range liquidity parameter, raw", liquidity), row("sqrtPriceX96, raw", slot[0]), row("Tick", slot[1]), row("Marginal token1 per token0, truncated to 18 decimals", fixedRatio(numerator, denominator)), row("Exact normalized price numerator", numerator), row("Exact normalized price denominator", denominator));
      break;
    }
    case "uniswap-v3-position": {
      const owner = await rpc.call<`0x${string}`>(V3_POSITIONS, POSITION, "ownerOf", [tokenId]);
      const position = await rpc.call<readonly [bigint, `0x${string}`, `0x${string}`, `0x${string}`, number, number, number, bigint, bigint, bigint, bigint, bigint]>(V3_POSITIONS, POSITION, "positions", [tokenId]);
      if (position[5] >= position[6] || position[2] === ZERO || position[3] === ZERO) throw Error("Malformed position range or token identity.");
      rows.push(row("Position manager", V3_POSITIONS), row("NFT token ID", tokenId), row("Owner at sampled block", owner), row("Token0", position[2]), row("Token1", position[3]), row("Fee tier, hundredths of a basis point", position[4]), row("Lower tick", position[5]), row("Upper tick", position[6]), row("Liquidity, raw", position[7]), row("Recorded tokensOwed0, raw", position[10]), row("Recorded tokensOwed1, raw", position[11]));
      break;
    }
    case "aave-reserve-index": {
      const reserves = await rpc.call<readonly `0x${string}`[]>(AAVE_POOL, AAVE, "getReservesList", []);
      if (!Array.isArray(reserves) || reserves.length > 100 || !reserves.some((item) => item.toLowerCase() === asset!.toLowerCase())) throw Error("Asset is not a listed reserve at this sampled Aave v3 pool.");
      const [income, debt] = await Promise.all([rpc.call<bigint>(AAVE_POOL, AAVE, "getReserveNormalizedIncome", [asset]), rpc.call<bigint>(AAVE_POOL, AAVE, "getReserveNormalizedVariableDebt", [asset])]);
      if (income === 0n || debt === 0n) throw Error("Reserve index unavailable.");
      rows.push(row("Aave v3 Ethereum pool", AAVE_POOL), row("Listed asset", asset), row("Normalized income index, raw ray (1e27)", income), row("Normalized variable debt index, raw ray (1e27)", debt));
      break;
    }
    case "erc4626-vault-state": {
      const [underlying, decimals, totalAssets, supply, converted] = await Promise.all([
        rpc.call<`0x${string}`>(vault!, VAULT, "asset", []), rpc.call<number>(vault!, VAULT, "decimals", []),
        rpc.call<bigint>(vault!, VAULT, "totalAssets", []), rpc.call<bigint>(vault!, VAULT, "totalSupply", []),
        rpc.call<bigint>(vault!, VAULT, "convertToAssets", [shares]),
      ]);
      if (underlying === ZERO || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw Error("Vault returned unsupported asset or share decimals.");
      rows.push(row("Vault", vault), row("Reported underlying asset", underlying), row("Share decimals", decimals), row("Total assets, raw underlying units", totalAssets), row("Total supply, raw share units", supply), row("Input shares, raw", shares), row("convertToAssets result, raw underlying units", converted));
      break;
    }
    case "chainlink-feed": {
      const node = namehash(feedName!);
      const resolver = await rpc.call<`0x${string}`>(ENS_REGISTRY, REGISTRY, "resolver", [node]);
      if (resolver === ZERO) throw Error("The selected feed ENS name has no resolver.");
      const aggregator = await rpc.call<`0x${string}`>(resolver, RESOLVER, "addr", [node]);
      if (aggregator === ZERO) throw Error("The selected feed ENS name has no address record.");
      const [decimals, description, round, block] = await Promise.all([
        rpc.call<number>(aggregator, FEED, "decimals", []), rpc.call<string>(aggregator, FEED, "description", []),
        rpc.call<readonly [bigint, bigint, bigint, bigint, bigint]>(aggregator, FEED, "latestRoundData", []),
        rpc.rpc("eth_getBlockByNumber", [rpc.block, false]),
      ]);
      if (block?.number !== rpc.block) throw Error("Feed block context mismatch.");
      const observedAt = quantity(block?.timestamp);
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36 || description.length > 128 || round[1] <= 0n || round[3] === 0n || round[3] > observedAt || round[4] < round[0]) throw Error("Feed response is invalid or incomplete.");
      const age = observedAt - round[3];
      rows.push(row("ENS feed name", feedName), row("Resolved feed contract", aggregator), row("Feed description", description), row("Answer, raw signed integer", round[1]), row("Answer decimals", decimals), row("Round ID", round[0]), row("Updated at, Unix seconds", round[3]), row("Sampled block timestamp, Unix seconds", observedAt), row("Age at sampled block, seconds", age), row("Within user-selected age threshold", age <= maxAge!));
      break;
    }
    default: throw Error("Unsupported tool.");
  }
  return [result(rpc, rows, tool.limitation)];
}
