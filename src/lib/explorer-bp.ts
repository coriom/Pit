import { getAddress, keccak256, parseAbi } from "viem";
import { EIP1967_SLOTS, EXPLORER_CHAINS, ExplorerRpc, quantity, type ExplorerChain, type ExplorerResult, type ExplorerTool, type RpcFetch } from "./explorer-bn";

const CONTRACT = { id: "contract", label: "Contract address", example: "0xcA11bde05977b3631167028862bE2a173976CA11" };
const ACCOUNT = { id: "account", label: "Account to check", example: "0x0000000000000000000000000000000000000000" };
const ERC20 = parseAbi(["function name() view returns (string)", "function symbol() view returns (string)", "function decimals() view returns (uint8)", "function totalSupply() view returns (uint256)"]);
const OWNABLE = parseAbi(["function owner() view returns (address)"]);
const ACCESS = parseAbi(["function hasRole(bytes32,address) view returns (bool)", "function getRoleAdmin(bytes32) view returns (bytes32)"]);
const PERMIT = parseAbi(["function DOMAIN_SEPARATOR() view returns (bytes32)", "function nonces(address) view returns (uint256)"]);
const ERC165 = parseAbi(["function supportsInterface(bytes4) view returns (bool)"]);
const TIMELOCK = parseAbi(["function getMinDelay() view returns (uint256)", "function PROPOSER_ROLE() view returns (bytes32)", "function EXECUTOR_ROLE() view returns (bytes32)", "function hasRole(bytes32,address) view returns (bool)"]);
const SAFE = parseAbi(["function getOwners() view returns (address[])", "function getThreshold() view returns (uint256)", "function nonce() view returns (uint256)"]);
const IMPLEMENTATION_SLOT = EIP1967_SLOTS.implementation;
const ADMIN_SLOT = EIP1967_SLOTS.admin;
const BEACON_SLOT = EIP1967_SLOTS.beacon;
export const BP_TOOLS: readonly ExplorerTool[] = [
  { id: "proxy-storage", title: "Proxy storage inspector", question: "Are standard EIP-1967 proxy slots populated for this contract?", limitation: "Slot values and bytecode patterns are signals, not proof of a safe or correctly configured proxy.", chains: ["ethereum", "base"], fields: [CONTRACT] },
  { id: "bytecode-compare", title: "Contract bytecode comparator", question: "Do two chosen addresses have identical deployed bytecode at sampled blocks?", limitation: "Matching runtime bytecode does not prove identical storage, owners, initialization or safety.", chains: ["ethereum", "base"], fields: [CONTRACT, { id: "otherContract", label: "Second contract address", example: CONTRACT.example }, { id: "otherChain", label: "Second network", example: "ethereum", kind: "select", options: ["ethereum", "base"] }] },
  { id: "ownership-role", title: "Ownership and role inspector", question: "Does a contract expose Ownable owner and AccessControl role evidence for a chosen account?", limitation: "Only supplied role/account and standard methods are examined; no exhaustive role-member enumeration or control conclusion.", chains: ["ethereum", "base"], fields: [CONTRACT, ACCOUNT, { id: "role", label: "Role hash (bytes32; zero is DEFAULT_ADMIN_ROLE)", example: "0x" + "0".repeat(64) }] },
  { id: "erc20-contract", title: "ERC-20 contract metadata inspector", question: "What name, symbol, decimals and raw total supply does this contract report?", limitation: "Self-reported metadata does not verify asset identity, audit status, market price or full ERC-20 compliance.", chains: ["ethereum", "base"], fields: [CONTRACT] },
  { id: "permit-signals", title: "EIP-2612 permit signal checker", question: "Does this contract respond to DOMAIN_SEPARATOR and nonces(address)?", limitation: "Method responses are only signals; they do not prove a valid EIP-2612 signature will be accepted. No signing occurs.", chains: ["ethereum", "base"], fields: [CONTRACT, ACCOUNT] },
  { id: "erc165-interface", title: "ERC-165 interface support checker", question: "Does a contract claim support for one supplied four-byte interface ID?", limitation: "A contract's returned claim is not independent proof of standards compliance or safety.", chains: ["ethereum", "base"], fields: [CONTRACT, { id: "interfaceId", label: "Interface ID, four hex bytes", example: "0x80ac58cd" }] },
  { id: "timelock-standard", title: "Timelock standard inspector", question: "What minimum delay and selected role status does an OpenZeppelin-style timelock report?", limitation: "Only these standard methods are read. Queued operations, governance control and actual execution rules are not enumerated.", chains: ["ethereum", "base"], fields: [CONTRACT, ACCOUNT] },
  { id: "safe-multisig", title: "Safe multisig state inspector", question: "Which owners, threshold and nonce does a Safe-compatible contract report?", limitation: "Self-reported state is not a security audit; modules, guards, delegates and pending transactions are not inspected.", chains: ["ethereum", "base"], fields: [CONTRACT] },
];
export const BP_IDS = BP_TOOLS.map((tool) => tool.id);
function address(value: string): `0x${string}` {
  if (value.length !== 42) throw Error("Address must be 20 hex bytes.");
  try { return getAddress(value); } catch { throw Error("Invalid address or mixed-case checksum."); }
}
function hex(value: string, bytes: number): `0x${string}` {
  if (!new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(value)) throw Error(`Expected exactly ${bytes} hex bytes.`);
  return value.toLowerCase() as `0x${string}`;
}
function row(label: string, value: unknown) { return { label, value: String(value) }; }
function result(rpc: ExplorerRpc, rows: ExplorerResult["rows"], limitation: string): ExplorerResult {
  const chain = EXPLORER_CHAINS[rpc.chain];
  return { chain: chain.label, chainId: chain.id, provider: chain.rpc, block: quantity(rpc.block).toString(), rows, limitation };
}
async function optional<T>(operation: () => Promise<T>): Promise<T | "UNAVAILABLE"> {
  try { return await operation(); } catch { return "UNAVAILABLE"; }
}
function slotAddress(value: unknown): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw Error("Malformed EIP-1967 storage word.");
  return `0x${value.slice(-40)}`;
}
export async function runBpTool(id: string, values: Record<string, string>, chain: ExplorerChain, fetcher: RpcFetch = fetch): Promise<ExplorerResult[]> {
  const tool = BP_TOOLS.find((entry) => entry.id === id);
  if (!tool || !tool.chains.includes(chain)) throw Error("Tool or network is unsupported.");
  for (const field of tool.fields) if (!values[field.id] || values[field.id].length > 256) throw Error(`${field.label} is required and must be bounded.`);
  const contract = address(values.contract.trim());
  const account = values.account ? address(values.account.trim()) : undefined;
  const otherContract = values.otherContract ? address(values.otherContract.trim()) : undefined;
  const otherChain = values.otherChain ? values.otherChain as ExplorerChain : undefined;
  if (otherChain && !(otherChain in EXPLORER_CHAINS)) throw Error("Second network unsupported.");
  const role = values.role ? hex(values.role.trim(), 32) : undefined;
  const interfaceId = values.interfaceId ? hex(values.interfaceId.trim(), 4) : undefined;
  const rpc = await ExplorerRpc.open(chain, fetcher);
  const rows: ExplorerResult["rows"] = [row("Contract", contract)];
  switch (id) {
    case "proxy-storage": {
      const code = await rpc.rpc("eth_getCode", [contract, rpc.block]);
      if (typeof code !== "string" || !/^0x[0-9a-fA-F]*$/.test(code) || code.length > 32770) throw Error("Malformed or oversized bytecode.");
      if (code === "0x") throw Error("No deployed bytecode at the sampled block.");
      const implementation = slotAddress(await rpc.rpc("eth_getStorageAt", [contract, IMPLEMENTATION_SLOT, rpc.block]));
      const admin = slotAddress(await rpc.rpc("eth_getStorageAt", [contract, ADMIN_SLOT, rpc.block]));
      const beacon = slotAddress(await rpc.rpc("eth_getStorageAt", [contract, BEACON_SLOT, rpc.block]));
      rows.push(row("Bytecode bytes", (code.length - 2) / 2), row("EIP-1967 implementation slot address", implementation), row("EIP-1967 admin slot address", admin), row("EIP-1967 beacon slot address", beacon));
      rows.push(row("EIP-1167 minimal-proxy bytecode pattern", /^0x363d3d373d3d3d363d73[0-9a-fA-F]{40}5af43d82803e903d91602b57fd5bf3$/i.test(code)));
      break;
    }
    case "bytecode-compare": {
      const second = await ExplorerRpc.open(otherChain!, fetcher);
      const [codeA, codeB] = await Promise.all([rpc.rpc("eth_getCode", [contract, rpc.block]), second.rpc("eth_getCode", [otherContract, second.block])]);
      for (const code of [codeA, codeB]) if (typeof code !== "string" || !/^0x[0-9a-fA-F]*$/.test(code) || code.length > 32770) throw Error("Malformed or oversized bytecode.");
      rows.push(row("First code hash", keccak256(codeA)), row("First byte length", (codeA.length - 2) / 2));
      rows.push(row("Second chain and block", `${EXPLORER_CHAINS[otherChain!].label} · ${quantity(second.block)}`), row("Second provider", EXPLORER_CHAINS[otherChain!].rpc), row("Second contract", otherContract));
      rows.push(row("Second code hash", keccak256(codeB)), row("Second byte length", (codeB.length - 2) / 2), row("Runtime bytecode identical", codeA !== "0x" && codeA.toLowerCase() === codeB.toLowerCase()));
      break;
    }
    case "ownership-role": {
      const owner = await optional(() => rpc.call<`0x${string}`>(contract, OWNABLE, "owner", []));
      const admin = await optional(() => rpc.call<`0x${string}`>(contract, ACCESS, "getRoleAdmin", [role]));
      const hasRole = await optional(() => rpc.call<boolean>(contract, ACCESS, "hasRole", [role, account]));
      rows.push(row("Owner()", owner), row("Selected role hash", role), row("Role admin hash", admin), row("Chosen account has role", hasRole));
      if (owner === "UNAVAILABLE" && admin === "UNAVAILABLE" && hasRole === "UNAVAILABLE") throw Error("Standard ownership/role methods unavailable on this contract.");
      break;
    }
    case "erc20-contract": {
      const [name, symbol, decimals, supply] = await Promise.all([
        rpc.call<string>(contract, ERC20, "name", []), rpc.call<string>(contract, ERC20, "symbol", []),
        rpc.call<number>(contract, ERC20, "decimals", []), rpc.call<bigint>(contract, ERC20, "totalSupply", []),
      ]);
      if (name.length > 80 || symbol.length > 40 || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw Error("Unsupported token metadata size or precision.");
      rows.push(row("Self-reported name", name), row("Self-reported symbol", symbol), row("Decimals", decimals), row("Total supply, raw base units", supply));
      break;
    }
    case "permit-signals": {
      const separator = await optional(() => rpc.call<`0x${string}`>(contract, PERMIT, "DOMAIN_SEPARATOR", []));
      const nonce = await optional(() => rpc.call<bigint>(contract, PERMIT, "nonces", [account]));
      rows.push(row("DOMAIN_SEPARATOR()", separator), row("Selected account nonces()", nonce));
      rows.push(row("EIP-2612 support conclusion", separator === "UNAVAILABLE" || nonce === "UNAVAILABLE" ? "UNVERIFIED: one or both methods unavailable" : "CANDIDATE ONLY: method responses do not prove permit acceptance"));
      break;
    }
    case "erc165-interface": {
      const supported = await rpc.call<boolean>(contract, ERC165, "supportsInterface", [interfaceId]);
      rows.push(row("Queried interface ID", interfaceId), row("Contract reports support", supported));
      break;
    }
    case "timelock-standard": {
      const delay = await rpc.call<bigint>(contract, TIMELOCK, "getMinDelay", []);
      const proposer = await optional(() => rpc.call<`0x${string}`>(contract, TIMELOCK, "PROPOSER_ROLE", []));
      const executor = await optional(() => rpc.call<`0x${string}`>(contract, TIMELOCK, "EXECUTOR_ROLE", []));
      rows.push(row("Minimum delay, seconds", delay), row("Proposer role hash", proposer), row("Executor role hash", executor));
      if (proposer !== "UNAVAILABLE") rows.push(row("Chosen account has proposer role", await optional(() => rpc.call<boolean>(contract, TIMELOCK, "hasRole", [proposer, account]))));
      if (executor !== "UNAVAILABLE") rows.push(row("Chosen account has executor role", await optional(() => rpc.call<boolean>(contract, TIMELOCK, "hasRole", [executor, account]))));
      break;
    }
    case "safe-multisig": {
      const [owners, threshold, nonce] = await Promise.all([
        rpc.call<`0x${string}`[]>(contract, SAFE, "getOwners", []), rpc.call<bigint>(contract, SAFE, "getThreshold", []), rpc.call<bigint>(contract, SAFE, "nonce", []),
      ]);
      if (!Array.isArray(owners) || owners.length < 1 || owners.length > 20 || threshold < 1n || threshold > BigInt(owners.length)) throw Error("Safe owner count or threshold outside reviewed bounds.");
      rows.push(row("Owner count", owners.length), row("Signature threshold", threshold), row("Safe nonce", nonce));
      owners.forEach((owner, index) => rows.push(row(`Owner ${index + 1}`, owner)));
      break;
    }
    default: throw Error("Unsupported tool.");
  }
  return [result(rpc, rows, tool.limitation)];
}
