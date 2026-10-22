import { decodeFunctionResult, encodeFunctionData, getAddress, keccak256, parseAbi, toBytes } from "viem";
import { EXPLORER_CHAINS, ExplorerRpc, quantity, type ExplorerChain, type ExplorerResult, type ExplorerTool, type RpcFetch } from "./explorer-bn";

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL = parseAbi(["function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns ((bool success,bytes returnData)[] returnData)"]);
const ERC20_META = parseAbi(["function totalSupply() view returns (uint256)", "function decimals() view returns (uint8)", "function symbol() view returns (string)"]);
const TRANSFER_TOPIC = keccak256(toBytes("Transfer(address,address,uint256)"));
const hashField = { id: "hash", label: "Transaction hash", example: "0x" + "0".repeat(64) };
export const BO_TOOLS: readonly ExplorerTool[] = [
  { id: "transaction-detail", title: "Transaction hash decoder", question: "What transaction fields and receipt status were recorded for a supplied hash?", limitation: "Decodes basic public fields only. Calldata meaning, contract intent and security are not inferred.", chains: ["ethereum", "base"], fields: [hashField] },
  { id: "network-gas", title: "Live gas observation", question: "What base fee, gas usage and provider gas suggestions are visible now?", limitation: "Provider gas suggestions are time-sensitive observations, not a transaction quote or guarantee.", chains: ["ethereum", "base"], fields: [] },
  { id: "blob-activity", title: "Ethereum blob activity inspector", question: "How much blob gas did a sampled Ethereum block use?", limitation: "The free provider does not expose eth_blobBaseFee; this tool does not quote or calculate a blob fee.", chains: ["ethereum"], fields: [] },
  { id: "tx-transfer-events", title: "Transaction Transfer-event inspector", question: "Which Transfer-signature events appeared in one transaction receipt?", limitation: "Only this transaction is covered. The signature is shared by ERC-20 and ERC-721, so raw values are not labeled as fungible amounts; this is not a historical transfer explorer.", chains: ["ethereum", "base"], fields: [hashField] },
  { id: "base-transaction-cost", title: "Base transaction cost breakdown", question: "Which execution and L1 data fee components appear in one Base receipt?", limitation: "Shows only receipt-exposed components. Operator or other fees may not be available, so a complete total is not claimed.", chains: ["base"], fields: [hashField] },
  { id: "multicall-static-reads", title: "Bounded Multicall3 reader", question: "Can up to four selected token metadata fields be read at one block?", limitation: "Only totalSupply, decimals and symbol are supported. Contract labels and token identity remain unverified; failed calls are shown as unavailable.", chains: ["ethereum", "base"], fields: [{ id: "calls", label: "One contract|method per line; method = totalSupply, decimals or symbol (maximum four)", example: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48|decimals", kind: "textarea" }] },
];
export const BO_IDS = BO_TOOLS.map((tool) => tool.id);
function txHash(value: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw Error("Transaction hash must be exactly 32 hex bytes.");
  return value.toLowerCase() as `0x${string}`;
}
function textRow(label: string, value: string | number | bigint | boolean) { return { label, value: String(value) }; }
function numericRow(label: string, value: unknown) { return textRow(label, quantity(value).toString()); }
function baseResult(rpc: ExplorerRpc, rows: ExplorerResult["rows"], limitation: string, block = rpc.block): ExplorerResult {
  const chain = EXPLORER_CHAINS[rpc.chain];
  return { chain: chain.label, chainId: chain.id, provider: chain.rpc, block: quantity(block).toString(), rows, limitation };
}
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error(`${name} unavailable or malformed.`);
  return value as Record<string, unknown>;
}
function boundedString(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max) throw Error("Provider returned an oversized or malformed field.");
  return value;
}
function parseCalls(value: string): { target: `0x${string}`; method: "totalSupply" | "decimals" | "symbol" }[] {
  const lines = value.trim().split(/\r?\n/);
  if (lines.length < 1 || lines.length > 4) throw Error("Enter one to four bounded static reads.");
  return lines.map((line) => {
    const parts = line.trim().split("|").map((part) => part.trim());
    if (parts.length !== 2 || !["totalSupply", "decimals", "symbol"].includes(parts[1])) throw Error("Use contract|totalSupply, contract|decimals or contract|symbol.");
    try { return { target: getAddress(parts[0]), method: parts[1] as "totalSupply" | "decimals" | "symbol" }; }
    catch { throw Error("Invalid contract address or mixed-case checksum."); }
  });
}
export async function runBoTool(id: string, values: Record<string, string>, chain: ExplorerChain, fetcher: RpcFetch = fetch): Promise<ExplorerResult[]> {
  const tool = BO_TOOLS.find((entry) => entry.id === id);
  if (!tool || !tool.chains.includes(chain)) throw Error("Tool or network is unsupported.");
  for (const field of tool.fields) if (!values[field.id] || values[field.id].length > 1024) throw Error(`${field.label} is required and must be bounded.`);
  // Strictly validate user-supplied hashes/targets before any RPC call.
  const hash = "hash" in values ? txHash(values.hash.trim()) : undefined;
  const calls = id === "multicall-static-reads" ? parseCalls(values.calls) : undefined;
  const rpc = await ExplorerRpc.open(chain, fetcher);
  const rows: ExplorerResult["rows"] = [];
  let observedBlock = rpc.block;
  switch (id) {
    case "transaction-detail": {
      const transaction = object(await rpc.rpc("eth_getTransactionByHash", [hash]), "Transaction");
      if (transaction.blockNumber == null) throw Error("Transaction is pending or unavailable; no confirmed result is shown.");
      const receipt = object(await rpc.rpc("eth_getTransactionReceipt", [hash]), "Receipt");
      if (transaction.hash !== hash || receipt.transactionHash !== hash || receipt.blockNumber !== transaction.blockNumber) throw Error("Transaction/receipt identity or block mismatch.");
      observedBlock = boundedString(receipt.blockNumber, 66) as `0x${string}`;
      rows.push(textRow("From", boundedString(transaction.from, 42)), textRow("To", transaction.to === null ? "Contract creation" : boundedString(transaction.to, 42)));
      rows.push(numericRow("Value, wei", transaction.value), numericRow("Nonce", transaction.nonce), numericRow("Gas limit, units", transaction.gas));
      rows.push(textRow("Receipt status", receipt.status === "0x1" ? "Success" : receipt.status === "0x0" ? "Failed" : "Unknown"));
      rows.push(numericRow("Gas used, units", receipt.gasUsed));
      if (receipt.effectiveGasPrice != null) rows.push(numericRow("Effective gas price, wei per gas", receipt.effectiveGasPrice));
      rows.push(textRow("Input selector", boundedString(transaction.input, 32770).slice(0, 10)));
      break;
    }
    case "network-gas": {
      const block = object(await rpc.rpc("eth_getBlockByNumber", [rpc.block, false]), "Block");
      if (block.number !== rpc.block) throw Error("Block context mismatch.");
      rows.push(numericRow("Block base fee, wei per gas", block.baseFeePerGas), numericRow("Block gas used, units", block.gasUsed), numericRow("Block gas limit, units", block.gasLimit));
      rows.push(numericRow("Provider gas-price observation, wei per gas", await rpc.rpc("eth_gasPrice", [])));
      rows.push(numericRow("Provider priority-fee observation, wei per gas", await rpc.rpc("eth_maxPriorityFeePerGas", [])));
      break;
    }
    case "blob-activity": {
      const block = object(await rpc.rpc("eth_getBlockByNumber", [rpc.block, false]), "Block");
      if (block.number !== rpc.block) throw Error("Block context mismatch.");
      rows.push(numericRow("Blob gas used in block", block.blobGasUsed), numericRow("Excess blob gas field", block.excessBlobGas));
      break;
    }
    case "tx-transfer-events": {
      const receipt = object(await rpc.rpc("eth_getTransactionReceipt", [hash]), "Receipt");
      if (receipt.transactionHash !== hash) throw Error("Receipt hash mismatch.");
      observedBlock = boundedString(receipt.blockNumber, 66) as `0x${string}`;
      if (!Array.isArray(receipt.logs) || receipt.logs.length > 500) throw Error("Receipt log count exceeds 500-event limit.");
      const matches = receipt.logs.filter((entry: unknown) => {
        const log = object(entry, "Receipt log");
        return Array.isArray(log.topics) && log.topics[0] === TRANSFER_TOPIC;
      });
      if (matches.length > 50) throw Error("More than 50 Transfer-signature events; bounded preview unavailable.");
      rows.push(textRow("Transfer-signature events in this receipt", matches.length));
      for (const [index, entry] of matches.entries()) {
        const log = object(entry, "Transfer log");
        if (!Array.isArray(log.topics) || ![3, 4].includes(log.topics.length) || !log.topics.every((topic) => typeof topic === "string" && /^0x[0-9a-fA-F]{64}$/.test(topic)) || typeof log.data !== "string" || !(log.topics.length === 3 && /^0x[0-9a-fA-F]{64}$/.test(log.data) || log.topics.length === 4 && log.data === "0x")) throw Error("Unsupported Transfer event encoding.");
        rows.push(textRow(`Event ${index + 1} contract`, boundedString(log.address, 42)));
        rows.push(textRow(`Event ${index + 1} from`, `0x${log.topics[1].slice(-40)}`));
        rows.push(textRow(`Event ${index + 1} to`, `0x${log.topics[2].slice(-40)}`));
        rows.push(textRow(`Event ${index + 1} ${log.topics.length === 4 ? "indexed token ID (ERC-721-like)" : "raw value (ERC-20-like)"}`, BigInt(log.topics.length === 4 ? log.topics[3] : log.data).toString()));
      }
      break;
    }
    case "base-transaction-cost": {
      const receipt = object(await rpc.rpc("eth_getTransactionReceipt", [hash]), "Receipt");
      if (receipt.transactionHash !== hash) throw Error("Receipt hash mismatch.");
      observedBlock = boundedString(receipt.blockNumber, 66) as `0x${string}`;
      const execution = quantity(receipt.gasUsed) * quantity(receipt.effectiveGasPrice);
      rows.push(numericRow("L2 gas used, units", receipt.gasUsed), numericRow("L2 effective gas price, wei per gas", receipt.effectiveGasPrice));
      rows.push(textRow("L2 execution component, wei", execution));
      rows.push(textRow("L1 data fee, wei", receipt.l1Fee == null ? "UNAVAILABLE" : quantity(receipt.l1Fee).toString()));
      if (receipt.l1Fee != null) rows.push(textRow("Subtotal of these two known components, wei", execution + quantity(receipt.l1Fee)));
      rows.push(textRow("Other or operator fee coverage", "UNVERIFIED; subtotal is not a complete payment assertion"));
      break;
    }
    case "multicall-static-reads": {
      const request = calls!.map(({ target, method }) => ({ target, allowFailure: true, callData: encodeFunctionData({ abi: ERC20_META, functionName: method }) }));
      const raw = await rpc.call<readonly { success: boolean; returnData: `0x${string}` }[]>(MULTICALL3, MULTICALL, "aggregate3", [request]);
      if (!Array.isArray(raw) || raw.length !== calls!.length) throw Error("Malformed Multicall3 result count.");
      let successes = 0;
      for (const [index, item] of raw.entries()) {
        const { target, method } = calls![index];
        let value = "UNAVAILABLE: contract call failed";
        if (item.success) {
          const decoded = decodeFunctionResult({ abi: ERC20_META, functionName: method, data: item.returnData } as any);
          value = typeof decoded === "bigint" ? decoded.toString() : String(decoded);
          if (value.length > 128) throw Error("Multicall output exceeds display limit.");
          successes++;
        }
        rows.push(textRow(`${target} · ${method}`, value));
      }
      if (!successes) throw Error("All selected static reads were unavailable at this block.");
      break;
    }
    default: throw Error("Unsupported tool.");
  }
  return [baseResult(rpc, rows, tool.limitation, observedBlock)];
}
