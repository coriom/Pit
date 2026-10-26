import { decodeFunctionResult, encodeFunctionData, keccak256, parseAbi, type Abi, type Address, type Hex } from "viem";

type Deployment = { address: Address; deploymentTx: string; deploymentBlock: number; runtimeKeccak: string };
type Config = { chainId: 84532; rpc: "https://sepolia.base.org"; signer: Address; factory: Deployment; sender: Deployment; standard: Deployment; advanced: Deployment; lock: Deployment; vesting: Deployment };
declare const __PIT_SEPOLIA_CONFIG__: Config;

// This preview has no injected provider, wallet client, signing path or write method.
const deployment = __PIT_SEPOLIA_CONFIG__;
async function rpc(method: string, params: unknown[] = []): Promise<any> {
  const response = await fetch("https://sepolia.base.org", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw Error(`Base Sepolia RPC HTTP ${response.status}`);
  const raw = await response.text();
  if (raw.length > 131_072) throw Error("Base Sepolia RPC response too large");
  const body = JSON.parse(raw);
  if (body.error || typeof body.result !== "string" && (body.result === null || typeof body.result !== "object")) throw Error(`Base Sepolia RPC ${method} failed`);
  return body.result;
}
const client = {
  async getChainId() { return Number(BigInt(await rpc("eth_chainId"))); },
  async getBlock() { const block = await rpc("eth_getBlockByNumber", ["latest", false]); return { number: BigInt(block.number), timestamp: BigInt(block.timestamp) }; },
  async getCode({ address }: { address: Address }): Promise<Hex | undefined> {
    const code = await rpc("eth_getCode", [address, "latest"]);
    if (typeof code !== "string" || !/^0x[0-9a-fA-F]*$/.test(code) || code.length > 131_074) throw Error("Invalid contract bytecode response");
    return code === "0x" ? undefined : code as Hex;
  },
  async readContract({ address, abi, functionName }: { address: Address; abi: Abi; functionName: string }): Promise<any> {
    const data = encodeFunctionData({ abi, functionName });
    const result = await rpc("eth_call", [{ to: address, data }, "latest"]);
    if (typeof result !== "string" || !/^0x[0-9a-fA-F]*$/.test(result) || result.length > 8194) throw Error("Invalid contract response");
    return decodeFunctionResult({ abi, functionName, data: result as Hex });
  },
};
const root = document.querySelector<HTMLElement>("#operation-root");
const kind = root?.dataset.operation;
const tokenAbi = parseAbi([
  "function name() view returns (string)", "function symbol() view returns (string)",
  "function decimals() view returns (uint8)", "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);
const advancedAbi = parseAbi([
  "function cap() view returns (uint256)", "function defaultAdmin() view returns (address)",
  "function defaultAdminDelay() view returns (uint48)", "function paused() view returns (bool)",
]);
const lockAbi = parseAbi([
  "function token() view returns (address)", "function beneficiary() view returns (address)",
  "function unlockTime() view returns (uint64)", "function deposited() view returns (uint256)",
  "function released() view returns (uint256)",
]);
const vestAbi = parseAbi([
  "function token() view returns (address)", "function beneficiary() view returns (address)",
  "function start() view returns (uint64)", "function duration() view returns (uint64)",
  "function cliff() view returns (uint64)", "function allocation() view returns (uint256)",
  "function released() view returns (uint256)",
]);
const senderAbi = parseAbi(["function MAX_RECIPIENTS() view returns (uint256)"]);

function line(label: string, value: unknown) { return `${label}: ${String(value)}`; }
function date(seconds: bigint) { return new Date(Number(seconds) * 1000).toISOString(); }
async function codeMatches(item: Deployment) {
  const code = await client.getCode({ address: item.address });
  if (!code || keccak256(code).slice(2).toLowerCase() !== item.runtimeKeccak.toLowerCase()) throw Error(`Verified runtime mismatch at ${item.address}`);
}
async function inspect(): Promise<string> {
  if (await client.getChainId() !== 84532) throw Error("RPC returned a different chain ID");
  const block = await client.getBlock();
  const header = [line("Network", "Base Sepolia (84532)"), line("RPC", deployment.rpc), line("Read block", block.number), line("Read time", date(block.timestamp)), "Only the listed demonstration contracts are inspected."];
  if (kind === "token-creator") {
    await Promise.all([codeMatches(deployment.factory), codeMatches(deployment.standard), codeMatches(deployment.advanced)]);
    const lines = [...header, line("Factory", deployment.factory.address), line("Creator", deployment.signer)];
    for (const [label, item] of [["Standard", deployment.standard], ["Advanced", deployment.advanced]] as const) {
      const [name, symbol, decimals, supply] = await Promise.all([
        client.readContract({ address: item.address, abi: tokenAbi, functionName: "name" }),
        client.readContract({ address: item.address, abi: tokenAbi, functionName: "symbol" }),
        client.readContract({ address: item.address, abi: tokenAbi, functionName: "decimals" }),
        client.readContract({ address: item.address, abi: tokenAbi, functionName: "totalSupply" }),
      ]);
      lines.push("", line(`${label} token`, item.address), line("Name / symbol", `${name} / ${symbol}`), line("Decimals", decimals), line("Total supply (raw)", supply));
    }
    const [cap, admin, delay, paused] = await Promise.all([
      client.readContract({ address: deployment.advanced.address, abi: advancedAbi, functionName: "cap" }),
      client.readContract({ address: deployment.advanced.address, abi: advancedAbi, functionName: "defaultAdmin" }),
      client.readContract({ address: deployment.advanced.address, abi: advancedAbi, functionName: "defaultAdminDelay" }),
      client.readContract({ address: deployment.advanced.address, abi: advancedAbi, functionName: "paused" }),
    ]);
    lines.push(line("Advanced cap (raw)", cap), line("Advanced administrator", admin), line("Admin transfer delay (seconds)", delay), line("Paused", paused));
    return lines.join("\n");
  }
  if (kind === "multisender") {
    await Promise.all([codeMatches(deployment.sender), codeMatches(deployment.standard)]);
    const maximum = await client.readContract({ address: deployment.sender.address, abi: senderAbi, functionName: "MAX_RECIPIENTS" });
    return [...header, line("MultiSender", deployment.sender.address), line("Recipient limit", maximum), line("Demonstration token", deployment.standard.address), "No recipient list is requested or uploaded."].join("\n");
  }
  if (kind === "token-locker") {
    await codeMatches(deployment.lock);
    const address = deployment.lock.address;
    const [token, beneficiary, unlock, deposited, released] = await Promise.all([
      client.readContract({ address, abi: lockAbi, functionName: "token" }),
      client.readContract({ address, abi: lockAbi, functionName: "beneficiary" }),
      client.readContract({ address, abi: lockAbi, functionName: "unlockTime" }),
      client.readContract({ address, abi: lockAbi, functionName: "deposited" }),
      client.readContract({ address, abi: lockAbi, functionName: "released" }),
    ]);
    return [...header, line("Locker", address), line("Token", token), line("Beneficiary", beneficiary), line("Unlock", date(unlock)), line("Deposited (raw)", deposited), line("Released (raw)", released)].join("\n");
  }
  if (kind === "token-vesting") {
    await codeMatches(deployment.vesting);
    const address = deployment.vesting.address;
    const [token, beneficiary, start, duration, cliff, allocation, released] = await Promise.all([
      client.readContract({ address, abi: vestAbi, functionName: "token" }),
      client.readContract({ address, abi: vestAbi, functionName: "beneficiary" }),
      client.readContract({ address, abi: vestAbi, functionName: "start" }),
      client.readContract({ address, abi: vestAbi, functionName: "duration" }),
      client.readContract({ address, abi: vestAbi, functionName: "cliff" }),
      client.readContract({ address, abi: vestAbi, functionName: "allocation" }),
      client.readContract({ address, abi: vestAbi, functionName: "released" }),
    ]);
    return [...header, line("Vesting", address), line("Token", token), line("Beneficiary", beneficiary), line("Start", date(start)), line("Cliff", date(cliff)), line("End", date(start + duration)), line("Allocation (raw)", allocation), line("Released (raw)", released)].join("\n");
  }
  throw Error("Unknown operation");
}
if (root) {
  const panel = document.createElement("section"); panel.className = "panel";
  const title = document.createElement("h2"); title.textContent = "Verified testnet readback";
  const button = document.createElement("button"); button.type = "button"; button.textContent = "Read Base Sepolia state";
  const output = document.createElement("pre"); output.setAttribute("role", "status"); output.setAttribute("aria-live", "polite"); output.textContent = "Choose Read to query the fixed public RPC. No wallet access or transaction occurs.";
  button.addEventListener("click", async () => {
    button.disabled = true; output.textContent = "Reading verified contract state…";
    try { output.textContent = await inspect(); }
    catch (error) { output.textContent = `Read failed: ${error instanceof Error ? error.message : "unknown error"}`; }
    finally { button.disabled = false; }
  });
  panel.append(title, button, output); root.append(panel);
}
