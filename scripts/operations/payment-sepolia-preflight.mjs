import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { keccak256, encodeFunctionData, decodeFunctionResult } from "viem";

// Read-only. Recheck the address in current Circle documentation before use.
// Fixed official RPC; curl is used because this WSL Node fetch currently times out.
export const CIRCLE_BASE_SEPOLIA_TEST_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const manifest = JSON.parse(readFileSync(new URL("../../deployments/base-sepolia.json", import.meta.url), "utf8"));
const abi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
];
let id = 0;
function rpc(method, params = []) {
  if (!["eth_chainId", "eth_blockNumber", "eth_getCode", "eth_call", "eth_feeHistory"].includes(method)) throw Error("Non-read-only RPC method rejected");
  const body = JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params });
  const response = execFileSync("curl", ["--fail", "--silent", "--show-error", "--max-time", "10", "--retry", "0", "-H", "content-type: application/json", "--data-binary", "@-", "https://sepolia.base.org"], { input: body, encoding: "utf8", timeout: 12_000, maxBuffer: 256_000 });
  const parsed = JSON.parse(response);
  if (parsed.error || parsed.result === undefined) throw Error(`RPC ${method} unavailable`);
  return parsed.result;
}
function read(functionName, args = []) {
  const data = encodeFunctionData({ abi, functionName, args });
  const result = rpc("eth_call", [{ to: CIRCLE_BASE_SEPOLIA_TEST_USDC, data }, "latest"]);
  return decodeFunctionResult({ abi, functionName, data: result });
}
const zero = "0x0000000000000000000000000000000000000000";
try {
  const chainId = Number(BigInt(rpc("eth_chainId")));
  if (chainId !== 84532 || manifest.chainId !== chainId) throw Error("Wrong chain ID");
  const block = Number(BigInt(rpc("eth_blockNumber")));
  const code = rpc("eth_getCode", [CIRCLE_BASE_SEPOLIA_TEST_USDC, "latest"]);
  if (!code || code === "0x") throw Error("Circle-listed test USDC has no code");
  const name = read("name"), symbol = read("symbol"), decimals = read("decimals");
  const zeroAllowance = read("allowance", [zero, zero]);
  const zeroBalance = read("balanceOf", [zero]);
  if (symbol !== "USDC" || decimals !== 6 || typeof name !== "string" || !name.length) throw Error("Unexpected test USDC metadata");
  const feeHistory = rpc("eth_feeHistory", ["0x1", "latest", [50]]);
  const contracts = {};
  for (const key of ["factory", "sender", "standard", "advanced", "lock", "vesting"]) {
    const expected = manifest[key];
    const runtime = rpc("eth_getCode", [expected.address, "latest"]);
    if (!runtime || runtime === "0x" || keccak256(runtime).slice(2).toLowerCase() !== expected.runtimeKeccak.toLowerCase())
      throw Error(`Existing PIT ${key} runtime differs from deployment manifest`);
    contracts[key] = expected.address;
  }
  console.log(JSON.stringify({ status: "PASS_READ_ONLY", chainId, block,
    circleListedTestUSDC: CIRCLE_BASE_SEPOLIA_TEST_USDC, metadata: { name, symbol, decimals },
    runtimeKeccak: keccak256(code), allowanceRead: typeof zeroAllowance === "bigint",
    balanceRead: typeof zeroBalance === "bigint", feeHistorySupported: Array.isArray(feeHistory.baseFeePerGas),
    existingPitContracts: contracts, transactionSent: false }, null, 2));
} catch (error) {
  console.error(`BLOCKED_READ_ONLY: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`);
  process.exitCode = 1;
}
