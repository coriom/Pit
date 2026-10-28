import { decodeFunctionResult, encodeFunctionData, formatEther, formatUnits, getAddress, parseAbi, type Address, type Hex } from "viem";
import { EXPLORER_CHAINS, quantity, type ExplorerChain, type ExplorerResult, type ExplorerTool, type RpcFetch } from "./explorer-bn";

export const BATCH_TOOL: ExplorerTool = {
  id: "batch-balances",
  title: "Batch balance checker",
  question: "What native, ERC-20, ERC-721 and selected ERC-1155 balances do explicitly listed addresses hold at one sampled block?",
  limitation: "Only supplied contracts and ERC-1155 IDs are queried. NFT ownership is not enumerated; failed reads stay unavailable. Public RPC providers see the submitted addresses.",
  chains: ["ethereum", "base", "base-sepolia"],
  fields: [
    { id: "accounts", label: "Wallet addresses, one per line or address CSV (1–25)", example: "address\n0x…", kind: "textarea", maxLength: 4096 },
    { id: "erc20", label: "ERC-20 contract addresses (0–3)", example: "0x…", kind: "textarea", required: false },
    { id: "erc721", label: "ERC-721 collection addresses (0–2)", example: "0x…", kind: "textarea", required: false },
    { id: "erc1155", label: "ERC-1155 collection and token ID pairs (0–2)", example: "collection,tokenId\n0x…,1", kind: "textarea", required: false },
  ],
};

const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)", "function symbol() view returns (string)"]);
const ERC721 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const ERC1155 = parseAbi(["function balanceOf(address,uint256) view returns (uint256)"]);
const MAX_UINT = (1n << 256n) - 1n;
const MAX_RESPONSE_BYTES = 16_384;

function addressLines(raw: string, max: number, label: string, required = false): Address[] {
  if (raw.length > 4096) throw Error(`${label} input is too large.`);
  let lines = raw.trim() ? raw.trim().split(/\r?\n/).map((line) => line.trim()) : [];
  if (/^(?:address|token|collection)$/i.test(lines[0] ?? "")) lines = lines.slice(1);
  if ((required && lines.length === 0) || lines.length > max || lines.some((line) => !line || line.includes(","))) throw Error(`${label} must contain ${required ? "1" : "0"}–${max} addresses, one per line.`);
  const addresses = lines.map((line) => { try { return getAddress(line); } catch { throw Error(`${label} contains an invalid address or checksum.`); } });
  if (new Set(addresses.map((value) => value.toLowerCase())).size !== addresses.length) throw Error(`${label} contains a duplicate address.`);
  return addresses;
}

function erc1155Lines(raw: string): { collection: Address; tokenId: bigint }[] {
  if (raw.length > 1024) throw Error("ERC-1155 list is too large.");
  let lines = raw.trim() ? raw.trim().split(/\r?\n/).map((line) => line.trim()) : [];
  if (/^collection,tokenId$/i.test(lines[0] ?? "")) lines = lines.slice(1);
  if (lines.length > 2 || lines.some((line) => !line)) throw Error("Use at most two ERC-1155 collection,tokenId pairs.");
  const pairs = lines.map((line) => {
    const parts = line.split(",").map((part) => part.trim());
    if (parts.length !== 2 || !/^(0|[1-9]\d{0,76})$/.test(parts[1])) throw Error("Invalid ERC-1155 collection,tokenId pair.");
    let collection: Address;
    try { collection = getAddress(parts[0]); } catch { throw Error("Invalid ERC-1155 collection address."); }
    const tokenId = BigInt(parts[1]);
    if (tokenId > MAX_UINT) throw Error("ERC-1155 token ID exceeds uint256.");
    return { collection, tokenId };
  });
  if (new Set(pairs.map((pair) => `${pair.collection.toLowerCase()}:${pair.tokenId}`)).size !== pairs.length) throw Error("Duplicate ERC-1155 pair.");
  return pairs;
}

export function parseBatchInput(values: Record<string, string>) {
  const accounts = addressLines(values.accounts ?? "", 25, "Wallet list", true);
  const erc20 = addressLines(values.erc20 ?? "", 3, "ERC-20 list");
  const erc721 = addressLines(values.erc721 ?? "", 2, "ERC-721 list");
  const erc1155 = erc1155Lines(values.erc1155 ?? "");
  const reads = accounts.length * (1 + erc20.length + erc721.length + erc1155.length);
  if (reads > 200) throw Error("Batch exceeds the 200-read public RPC budget.");
  return { accounts, erc20, erc721, erc1155, reads };
}

function safeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/429|-32005|rate.limit|busy/i.test(message)) return "UNAVAILABLE: RPC rate limit";
  if (/timeout|abort|deadline/i.test(message)) return "UNAVAILABLE: RPC timeout";
  if (/decode|malformed|invalid/i.test(message)) return "UNAVAILABLE: malformed contract response";
  return "UNAVAILABLE: RPC or contract read failed";
}

async function boundedJson(response: Response): Promise<any> {
  if (!response.body) throw Error("Malformed RPC response body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_RESPONSE_BYTES) throw Error("RPC response exceeds 16 KiB.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

class BatchRpc {
  readonly chain: ExplorerChain;
  readonly block: Hex;
  private count = 0;
  private readonly deadline = Date.now() + 30_000;
  private constructor(chain: ExplorerChain, block: Hex, private readonly fetcher: RpcFetch) { this.chain = chain; this.block = block; }
  static async open(chain: ExplorerChain, fetcher: RpcFetch): Promise<BatchRpc> {
    if (!BATCH_TOOL.chains.includes(chain)) throw Error("Unsupported batch-balance network.");
    const rpc = new BatchRpc(chain, "0x0", fetcher);
    const id = quantity(await rpc.request("eth_chainId", []));
    if (id !== BigInt(EXPLORER_CHAINS[chain].id)) throw Error("RPC reported the wrong chain ID.");
    const block = await rpc.request("eth_blockNumber", []);
    quantity(block);
    return new BatchRpc(chain, block as Hex, fetcher);
  }
  async request(method: "eth_chainId" | "eth_blockNumber" | "eth_getBalance" | "eth_call", params: unknown[]): Promise<any> {
    if (Date.now() > this.deadline || this.count >= 420) throw Error("RPC deadline or request budget exceeded.");
    for (let attempt = 0; attempt < 2; attempt++) {
      if (Date.now() > this.deadline || ++this.count > 420) throw Error("RPC deadline or request budget exceeded.");
      const id = this.count;
      let response: Response;
      try {
        response = await this.fetcher.call(globalThis, EXPLORER_CHAINS[this.chain].rpc, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }), signal: AbortSignal.timeout(4000),
        });
      } catch (error) {
        if (attempt === 0) { await new Promise((resolve) => setTimeout(resolve, 150)); continue; }
        throw error;
      }
      if ([429, 502, 503, 504].includes(response.status) && attempt === 0) { await new Promise((resolve) => setTimeout(resolve, 150)); continue; }
      if (!response.ok) throw Error(`RPC HTTP ${response.status}.`);
      const payload = await boundedJson(response);
      if (!payload || payload.jsonrpc !== "2.0" || payload.id !== id) throw Error("Malformed RPC envelope.");
      if (payload.error?.code === -32005 && attempt === 0) { await new Promise((resolve) => setTimeout(resolve, 150)); continue; }
      if (payload.error) throw Error(`RPC error ${String(payload.error.code ?? "unknown")}.`);
      if (payload.result === undefined) throw Error("RPC returned no result.");
      return payload.result;
    }
    throw Error("RPC retry limit reached.");
  }
  async call<T>(to: Address, abi: ReturnType<typeof parseAbi>, functionName: string, args: readonly unknown[]): Promise<T> {
    const data = encodeFunctionData({ abi, functionName, args } as any);
    const hex = await this.request("eth_call", [{ to, data }, this.block]);
    if (typeof hex !== "string" || !/^0x[0-9a-f]*$/i.test(hex) || hex.length > 8194) throw Error("Malformed contract read response.");
    return decodeFunctionResult({ abi, functionName, data: hex as Hex } as any) as T;
  }
}

export async function runBatchBalances(values: Record<string, string>, chain: ExplorerChain, fetcher: RpcFetch = fetch, onProgress?: (done: number, total: number) => void): Promise<ExplorerResult[]> {
  const input = parseBatchInput(values);
  const rpc = await BatchRpc.open(chain, fetcher);
  const erc20Meta: { token: Address; decimals: number | null; symbol: string }[] = [];
  for (const token of input.erc20) {
    try {
      const decimals = await rpc.call<number>(token, ERC20, "decimals", []);
      const symbol = await rpc.call<string>(token, ERC20, "symbol", []);
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36 || symbol.length > 32) throw Error("Invalid ERC-20 metadata.");
      erc20Meta.push({ token, decimals, symbol: symbol.replace(/[\u0000-\u001f]/g, "") });
    } catch { erc20Meta.push({ token, decimals: null, symbol: "UNAVAILABLE" }); }
  }
  const tasks: { label: string; run: () => Promise<string> }[] = [];
  for (const account of input.accounts) {
    tasks.push({ label: `${account} · ETH`, run: async () => {
      const raw = quantity(await rpc.request("eth_getBalance", [account, rpc.block]));
      return `${formatEther(raw)} ETH (${raw} wei)`;
    } });
    for (const meta of erc20Meta) tasks.push({ label: `${account} · ERC-20 ${meta.token}`, run: async () => {
      const raw = await rpc.call<bigint>(meta.token, ERC20, "balanceOf", [account]);
      return meta.decimals === null ? `${raw} raw units; metadata unavailable` : `${formatUnits(raw, meta.decimals)} ${meta.symbol} (${raw} raw units, ${meta.decimals} decimals)`;
    } });
    for (const collection of input.erc721) tasks.push({ label: `${account} · ERC-721 ${collection}`, run: async () => `${await rpc.call<bigint>(collection, ERC721, "balanceOf", [account])} tokens; IDs not enumerated` });
    for (const pair of input.erc1155) tasks.push({ label: `${account} · ERC-1155 ${pair.collection} #${pair.tokenId}`, run: async () => `${await rpc.call<bigint>(pair.collection, ERC1155, "balanceOf", [account, pair.tokenId])} units` });
  }
  const rows = new Array<{ label: string; value: string }>(tasks.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next++;
      try { rows[index] = { label: tasks[index].label, value: await tasks[index].run() }; }
      catch (error) { rows[index] = { label: tasks[index].label, value: safeFailure(error) }; }
      onProgress?.(++done, tasks.length);
    }
  }));
  const config = EXPLORER_CHAINS[chain];
  return [{ chain: config.label, chainId: config.id, provider: config.rpc, block: quantity(rpc.block).toString(), rows,
    limitation: `${input.reads} explicit balance reads; ${rows.filter((entry) => entry.value.startsWith("UNAVAILABLE")).length} unavailable. This is not NFT ID discovery or a complete portfolio.` }];
}
