// Read-only Base Sepolia preflight and exact-step proposal. Never signs or sends.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createPublicClient, custom, formatEther, getContractAddress, isAddress, keccak256 } from "viem";
import { baseSepolia } from "viem/chains";
import { validateSepoliaConfig } from "./sepolia-config.mjs";
import { validateWalletCampaign } from "./wallet-campaign.mjs";
import { buildPit4bPlan } from "./pit4b-plan.mjs";

const deployment = validateSepoliaConfig(JSON.parse(readFileSync("deployments/base-sepolia.json", "utf8")));
const signer = process.env.PIT4B_BROWSER_WALLET_ADDRESS;
if (!signer || !isAddress(signer, { strict: true }) || signer.toLowerCase() === deployment.signer.toLowerCase()) throw Error("Set PIT4B_BROWSER_WALLET_ADDRESS to the approved checksummed browser wallet");

// The public RPC is fixed. curl's IPv4 path works reliably in this WSL host;
// Node's direct fetch intermittently fails during IPv6/IPv4 connection racing.
// No transaction methods are accepted by this preflight transport.
const readMethods = new Set(["eth_chainId", "eth_getBlockByNumber", "eth_getTransactionCount", "eth_getBalance", "eth_getCode", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory"]);
const rpc = async ({ method, params = [] }) => {
  if (!readMethods.has(method)) throw Error(`Preflight RPC method disallowed: ${method}`);
  const response = spawnSync("curl", ["-4", "--fail", "--silent", "--show-error", "--max-time", "12", "-H", "content-type: application/json", "--data-binary", "@-", deployment.rpc], {
    input: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), encoding: "utf8", timeout: 15_000, maxBuffer: 200_000,
  });
  if (response.status !== 0) throw Error(`Read-only Base Sepolia RPC transport failed (${response.status})`);
  const parsed = JSON.parse(response.stdout);
  if (parsed.error || !Object.hasOwn(parsed, "result")) throw Error(`Read-only Base Sepolia RPC ${method} rejected (${parsed.error?.code ?? "unknown"})`);
  return parsed.result;
};
const client = createPublicClient({ chain: baseSepolia, transport: custom({ request: rpc }) });
if (await client.getChainId() !== 84532) throw Error("Unexpected Base Sepolia chain ID");
const block = await client.getBlock();
const nonce = await client.getTransactionCount({ address: signer });
const pendingNonce = await client.getTransactionCount({ address: signer, blockTag: "pending" });
const factoryNonce = await client.getTransactionCount({ address: deployment.factory.address });
const balance = await client.getBalance({ address: signer });
if (nonce !== pendingNonce || factoryNonce !== 3) throw Error("Browser or factory nonce changed; campaign needs a fresh review");
const token = getContractAddress({ from: deployment.factory.address, nonce: 3n });
if (await client.getCode({ address: token })) throw Error("Expected new token address already contains code");
for (const label of ["factory", "sender", "standard"]) {
  const item = deployment[label];
  const code = await client.getCode({ address: item.address });
  if (!code || keccak256(code).slice(2).toLowerCase() !== item.runtimeKeccak.toLowerCase()) throw Error(`Reviewed ${label} bytecode mismatch`);
}
const fees = await client.estimateFeesPerGas();
if (fees.maxFeePerGas === undefined || fees.maxPriorityFeePerGas === undefined || fees.maxFeePerGas > 10_000_000n) throw Error("Current fee estimate is outside the proposed 20-million-wei cap");
const plan = buildPit4bPlan({
  deployment, signer, nonce, timestamp: block.timestamp,
  maxFeePerGasWei: 20_000_000n, l1ReservePerTxWei: 10_000_000_000n,
  name: "PIT Browser Demo", symbol: "PBD",
  unlockDelay: 1800n, startDelay: 2700n, duration: 900n, cliffDelay: 300n,
});
validateWalletCampaign(plan.campaign, deployment);
if (balance < BigInt(plan.campaign.maxTotalWei) * 2n) throw Error("Browser wallet lacks a two-times margin over the proposed maximum gas spend");

const campaignBody = JSON.stringify(plan.campaign);
const campaignSha256 = createHash("sha256").update(campaignBody).digest("hex");
writeFileSync("/tmp/pit4b-live-campaign.json", campaignBody, { mode: 0o600 });
const review = {
  status: "PREPARED_NOT_AUTHORIZED", chainId: 84532, block: String(block.number), blockTimestamp: String(block.timestamp),
  signer, nonce, balanceWei: String(balance), balanceEth: formatEther(balance), factoryNonce, fundingRequiredWei: "0",
  currentEstimatedMaxFeePerGasWei: String(fees.maxFeePerGas), campaignSha256, campaign: plan.campaign,
  expectedCreatedToken: token, lock: plan.forms.lock.address, vest: plan.forms.vest.address,
  unlockTime: new Date(Number(plan.unlock) * 1000).toISOString(),
  vestStart: new Date(Number(plan.start) * 1000).toISOString(),
  vestCliff: new Date(Number(plan.cliff) * 1000).toISOString(),
  vestEnd: new Date(Number(plan.end) * 1000).toISOString(),
};
writeFileSync("/tmp/pit4b-live-review.json", JSON.stringify(review, null, 2), { mode: 0o600 });
console.log(JSON.stringify({
  status: review.status, chainId: review.chainId, block: review.block, signer, nonce, balanceWei: review.balanceWei,
  fundingRequiredWei: "0", factory: deployment.factory.address, sender: deployment.sender.address,
  expectedCreatedToken: token, lock: review.lock, vest: review.vest,
  recipients: plan.forms.multisender.csv.split("\n").slice(1).map((row) => row.split(",")[0]),
  browserTransactions: plan.campaign.steps.length, currentEstimatedMaxFeePerGasWei: review.currentEstimatedMaxFeePerGasWei,
  maxFeePerGasWei: plan.campaign.maxFeePerGasWei, l1ReservePerTxWei: plan.campaign.l1ReservePerTxWei,
  maxTotalGasSpendWei: plan.campaign.maxTotalWei, campaignSha256,
  unlockTime: review.unlockTime, vestStart: review.vestStart, vestCliff: review.vestCliff, vestEnd: review.vestEnd,
  expiresAt: new Date(plan.campaign.expiresAt * 1000).toISOString(),
}, null, 2));
