import { decodeFunctionResult, encodeFunctionData, getAddress, keccak256, namehash, parseAbi, toBytes } from "viem";

export const EXPLORER_CHAINS = {
  ethereum: { id: 1, label: "Ethereum mainnet", rpc: "https://eth.drpc.org/" },
  base: { id: 8453, label: "Base mainnet", rpc: "https://base.drpc.org/" },
  "base-sepolia": { id: 84532, label: "Base Sepolia", rpc: "https://sepolia.base.org" },
} as const;
export type ExplorerChain = keyof typeof EXPLORER_CHAINS;
export type ExplorerField = { id: string; label: string; example: string; kind?: "textarea" | "select"; options?: readonly string[]; maxLength?: number; required?: boolean };
export type ExplorerTool = { id: string; title: string; question: string; limitation: string; fields: readonly ExplorerField[]; chains: readonly ExplorerChain[] };
const address = (label: string): ExplorerField => ({ id: label, label: label.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`), example: "0x0000000000000000000000000000000000000000" });
export const BN_TOOLS: readonly ExplorerTool[] = [
  { id: "native-balance", title: "Multi-chain native balance checker", question: "What native-token balance does a supplied address hold on Ethereum and Base?", limitation: "Reads one address on two chains at sampled blocks; it does not discover other chains or tokens.", chains: ["ethereum", "base"], fields: [address("account")] },
  { id: "selected-erc20-balances", title: "Selected ERC-20 balance reader", question: "What balances does an address hold in up to five explicitly named token contracts?", limitation: "Only listed contracts are examined. A zero result is not a complete portfolio.", chains: ["ethereum", "base"], fields: [address("account"), { id: "tokens", label: "Token contract addresses, one per line (maximum five)", example: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", kind: "textarea" }] },
  { id: "selected-erc20-allowances", title: "Selected ERC-20 allowance checker", question: "What allowance does one token give one specified spender?", limitation: "Only this token/spender pair is checked. This is not universal approval coverage.", chains: ["ethereum", "base"], fields: [address("account"), address("token"), address("spender")] },
  { id: "nft-approval", title: "NFT approval inspector", question: "Who is approved for one ERC-721 token, and is a chosen operator approved for all?", limitation: "Checks one ERC-721 collection, token ID and operator. Other collections and ERC-1155 approvals are outside this read.", chains: ["ethereum", "base"], fields: [address("owner"), address("collection"), address("operator"), { id: "tokenId", label: "Token ID (whole number)", example: "1" }] },
  { id: "ens-resolver", title: "ENS resolver inspector", question: "Which resolver and Ethereum address are currently recorded for one .eth name?", limitation: "Ethereum L1 registry and simple on-chain addr(bytes32) only; off-chain/CCIP and other coin records are unsupported.", chains: ["ethereum"], fields: [{ id: "name", label: "ASCII .eth name", example: "vitalik.eth" }] },
  { id: "nft-ownership", title: "NFT ownership verifier", question: "Who owns an ERC-721 token or how many ERC-1155 units does an address hold?", limitation: "Reads one explicit collection and token ID. A failed standard call is unsupported, not proof of non-ownership.", chains: ["ethereum", "base"], fields: [address("collection"), address("account"), { id: "tokenId", label: "Token ID (whole number)", example: "1" }, { id: "standard", label: "Token standard", example: "ERC-721", kind: "select", options: ["ERC-721", "ERC-1155"] }] },
  { id: "account-code", title: "Account code inspector", question: "Does an address have deployed bytecode, and is the standard proxy implementation slot populated?", limitation: "Code and a proxy slot do not prove that an account is safe, smart-account-compatible or controlled by a particular owner.", chains: ["ethereum", "base"], fields: [address("account")] },
  { id: "wallet-nonce", title: "Wallet nonce inspector", question: "What is the latest confirmed transaction count for an address?", limitation: "The confirmed transaction count is not an ERC-4337 or pending-mempool nonce.", chains: ["ethereum", "base"], fields: [address("account")] },
];
export const BN_IDS = BN_TOOLS.map((tool) => tool.id);

export type ExplorerResult = { chain: string; chainId: number; provider: string; block: string; rows: { label: string; value: string }[]; limitation: string };
export type RpcFetch = typeof fetch;
const METHODS = new Set(["eth_chainId", "eth_blockNumber", "eth_getBalance", "eth_call", "eth_getCode", "eth_getStorageAt", "eth_getTransactionCount", "eth_getTransactionByHash", "eth_getTransactionReceipt", "eth_getBlockByNumber", "eth_gasPrice", "eth_maxPriorityFeePerGas"]);
const MAX_RESPONSE_BYTES = 65536;
const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
function eip1967Slot(name: string): `0x${string}` {
  return `0x${(BigInt(keccak256(toBytes(`eip1967.proxy.${name}`))) - 1n).toString(16).padStart(64, "0")}`;
}
export const EIP1967_SLOTS = { implementation: eip1967Slot("implementation"), admin: eip1967Slot("admin"), beacon: eip1967Slot("beacon") } as const;
const IMPLEMENTATION_SLOT = EIP1967_SLOTS.implementation;
const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)", "function symbol() view returns (string)", "function allowance(address,address) view returns (uint256)"]);
const ERC721 = parseAbi(["function getApproved(uint256) view returns (address)", "function isApprovedForAll(address,address) view returns (bool)", "function ownerOf(uint256) view returns (address)"]);
const ERC1155 = parseAbi(["function balanceOf(address,uint256) view returns (uint256)"]);
const REGISTRY = parseAbi(["function resolver(bytes32) view returns (address)"]);
const RESOLVER = parseAbi(["function addr(bytes32) view returns (address)"]);

function checkedAddress(value: string): `0x${string}` {
  if (value.length !== 42) throw Error("Address must contain exactly 20 hex bytes.");
  try { return getAddress(value); } catch { throw Error("Invalid EVM address or mixed-case checksum."); }
}
function checkedId(value: string): bigint {
  if (!/^(0|[1-9]\d{0,76})$/.test(value)) throw Error("Token ID must be a bounded nonnegative whole number.");
  const result = BigInt(value);
  if (result > (1n << 256n) - 1n) throw Error("Token ID exceeds uint256.");
  return result;
}
function checkedTokens(value: string): `0x${string}`[] {
  const lines = value.trim().split(/\r?\n/).map((line) => line.trim());
  if (lines.length < 1 || lines.length > 5 || lines.some((line) => !line)) throw Error("Enter one to five token contract addresses.");
  return lines.map(checkedAddress);
}
async function readBounded(response: Response): Promise<string> {
  if (!response.body) throw Error("RPC response has no body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_RESPONSE_BYTES) throw Error("RPC response exceeds 64 KiB safety limit.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(combined);
}
export class ExplorerRpc {
  readonly chain: ExplorerChain;
  readonly fetcher: RpcFetch;
  readonly block: `0x${string}`;
  private calls = 0;
  private constructor(chain: ExplorerChain, fetcher: RpcFetch, block: `0x${string}`) { this.chain = chain; this.fetcher = fetcher; this.block = block; }
  static async open(chain: ExplorerChain, fetcher: RpcFetch = fetch): Promise<ExplorerRpc> {
    const config = EXPLORER_CHAINS[chain];
    if (!config) throw Error("Unsupported chain.");
    const bootstrap = new ExplorerRpc(chain, fetcher, "0x0");
    const chainId = await bootstrap.rpc("eth_chainId", []);
    if (BigInt(chainId) !== BigInt(config.id)) throw Error("RPC reported the wrong chain ID.");
    const block = await bootstrap.rpc("eth_blockNumber", []);
    if (typeof block !== "string" || !/^0x[0-9a-f]+$/i.test(block)) throw Error("RPC returned an invalid block number.");
    return new ExplorerRpc(chain, fetcher, block as `0x${string}`);
  }
  async rpc(method: string, params: unknown[]): Promise<any> {
    if (!METHODS.has(method) || ++this.calls > 20) throw Error("RPC method or request budget rejected.");
    const id = this.calls;
    const fetcher = this.fetcher;
    const response = await fetcher(EXPLORER_CHAINS[this.chain].rpc, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error(`RPC HTTP ${response.status}; retry later without changing provider.`);
    const payload = JSON.parse(await readBounded(response));
    if (!payload || typeof payload !== "object" || payload.jsonrpc !== "2.0" || payload.id !== id) throw Error("Malformed RPC envelope.");
    if (payload.error) throw Error(`RPC rejected the read: ${String(payload.error.code ?? "unknown")}.`);
    if (payload.result === undefined) throw Error("RPC returned no result.");
    return payload.result;
  }
  async call<T>(to: `0x${string}`, abi: ReturnType<typeof parseAbi>, functionName: string, args: readonly unknown[]): Promise<T> {
    const data = encodeFunctionData({ abi, functionName, args } as any);
    const hex = await this.rpc("eth_call", [{ to, data }, this.block]);
    if (typeof hex !== "string" || !/^0x[0-9a-f]*$/i.test(hex) || hex.length > 32770) throw Error("Malformed contract read response.");
    return decodeFunctionResult({ abi, functionName, data: hex as `0x${string}` } as any) as T;
  }
}
export function quantity(hex: unknown): bigint {
  if (typeof hex !== "string" || !/^0x[0-9a-f]+$/i.test(hex) || hex.length > 66) throw Error("RPC returned an invalid quantity.");
  return BigInt(hex);
}
function row(label: string, value: unknown) { return { label, value: String(value) }; }
function result(rpc: ExplorerRpc, rows: { label: string; value: string }[], limitation: string): ExplorerResult {
  const chain = EXPLORER_CHAINS[rpc.chain];
  return { chain: chain.label, chainId: chain.id, provider: chain.rpc, block: quantity(rpc.block).toString(), rows, limitation };
}
export async function runBnTool(id: string, values: Record<string, string>, chain: ExplorerChain, fetcher: RpcFetch = fetch): Promise<ExplorerResult[]> {
  const tool = BN_TOOLS.find((entry) => entry.id === id);
  if (!tool || !tool.chains.includes(chain)) throw Error("Tool or network is unsupported.");
  for (const field of tool.fields) if (!values[field.id] || values[field.id].length > 1024) throw Error(`${field.label} is required and must be bounded.`);
  // Validate all user inputs before transmitting any address or contract to the RPC provider.
  const input: Record<string, string | bigint | `0x${string}`[]> = {};
  for (const field of tool.fields) {
    const value = values[field.id].trim();
    input[field.id] = field.id === "tokens" ? checkedTokens(value) : ["account", "owner", "token", "spender", "collection", "operator"].includes(field.id) ? checkedAddress(value) : field.id === "tokenId" ? checkedId(value) : value;
  }
  if (id === "ens-resolver" && !/^(?:[a-z0-9-]{1,63}\.){1,4}eth$/.test(String(input.name))) throw Error("Use a bounded ASCII .eth name for this simple resolver.");
  if (id === "nft-ownership" && input.standard !== "ERC-721" && input.standard !== "ERC-1155") throw Error("Unsupported NFT standard.");
  const requestedChains: ExplorerChain[] = id === "native-balance" ? ["ethereum", "base"] : [chain];
  const output: ExplorerResult[] = [];
  for (const selected of requestedChains) {
    const rpc = await ExplorerRpc.open(selected, fetcher);
    const block = rpc.block;
    let rows: { label: string; value: string }[] = [];
    switch (id) {
      case "native-balance": rows = [row("Balance, raw wei", quantity(await rpc.rpc("eth_getBalance", [input.account, block])).toString())]; break;
      case "selected-erc20-balances": {
        for (const token of input.tokens as `0x${string}`[]) {
          const [raw, decimals] = await Promise.all([
            rpc.call<bigint>(token, ERC20, "balanceOf", [input.account]),
            rpc.call<number>(token, ERC20, "decimals", []),
          ]);
          if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw Error("Token decimals outside reviewed range.");
          rows.push(row(`${token} balance, raw base units (${decimals} decimals)`, raw.toString()));
        }
        break;
      }
      case "selected-erc20-allowances": {
        const token = input.token as `0x${string}`;
        const [raw, decimals] = await Promise.all([
          rpc.call<bigint>(token, ERC20, "allowance", [input.account, input.spender]),
          rpc.call<number>(token, ERC20, "decimals", []),
        ]);
        if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw Error("Token decimals outside reviewed range.");
        rows = [row("Token contract", token), row("Spender", input.spender), row(`Allowance, raw base units (${decimals} decimals)`, raw.toString())];
        break;
      }
      case "nft-approval": {
        const collection = input.collection as `0x${string}`;
        const [approved, all] = await Promise.all([
          rpc.call<`0x${string}`>(collection, ERC721, "getApproved", [input.tokenId]),
          rpc.call<boolean>(collection, ERC721, "isApprovedForAll", [input.owner, input.operator]),
        ]);
        rows = [row("Token-specific approved address", approved), row("Specified operator approved for all", all), row("Collection", collection)];
        break;
      }
      case "ens-resolver": {
        const node = namehash(String(input.name));
        const resolver = await rpc.call<`0x${string}`>(ENS_REGISTRY, REGISTRY, "resolver", [node]);
        rows = [row("ENS registry", ENS_REGISTRY), row("Resolver", resolver)];
        if (resolver !== "0x0000000000000000000000000000000000000000") {
          try { rows.push(row("Ethereum address record", await rpc.call<`0x${string}`>(resolver, RESOLVER, "addr", [node]))); }
          catch { rows.push(row("Ethereum address record", "UNAVAILABLE: resolver may require unsupported off-chain resolution")); }
        }
        break;
      }
      case "nft-ownership": {
        const collection = input.collection as `0x${string}`;
        rows = input.standard === "ERC-721" ? [row("Recorded ERC-721 owner", await rpc.call<`0x${string}`>(collection, ERC721, "ownerOf", [input.tokenId]))] : [row("ERC-1155 balance, raw units", (await rpc.call<bigint>(collection, ERC1155, "balanceOf", [input.account, input.tokenId])).toString())];
        rows.push(row("Collection", collection));
        break;
      }
      case "account-code": {
        const code = await rpc.rpc("eth_getCode", [input.account, block]);
        const slot = await rpc.rpc("eth_getStorageAt", [input.account, IMPLEMENTATION_SLOT, block]);
        if (typeof code !== "string" || !/^0x[0-9a-f]*$/i.test(code) || code.length > 32770 || typeof slot !== "string" || !/^0x[0-9a-f]*$/i.test(slot) || slot.length > 66) throw Error("Malformed code or storage response.");
        rows = [row("Bytecode present", code !== "0x"), row("Bytecode length, bytes", (code.length - 2) / 2), row("EIP-1967 implementation slot", slot)];
        break;
      }
      case "wallet-nonce": rows = [row("Confirmed transaction count", quantity(await rpc.rpc("eth_getTransactionCount", [input.account, block])).toString())]; break;
      default: throw Error("Unsupported tool.");
    }
    output.push(result(rpc, rows, tool.limitation));
  }
  return output;
}
