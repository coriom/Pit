// Read-only Base Sepolia preflight and exact-step proposal. Never signs or sends.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, encodeFunctionData, formatEther, http, isAddress, keccak256, parseAbi, parseUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { validateSepoliaConfig } from "./sepolia-config.mjs";
import { validateWalletCampaign } from "./wallet-campaign.mjs";
import { buildPit4bPlan } from "./pit4b-plan.mjs";

const deployment = validateSepoliaConfig(JSON.parse(readFileSync("deployments/base-sepolia.json", "utf8")));
const browserSigner = process.env.PIT4B_BROWSER_WALLET_ADDRESS;
if (!browserSigner || !isAddress(browserSigner, { strict: true }) || browserSigner.toLowerCase() === deployment.signer.toLowerCase()) throw Error("Set PIT4B_BROWSER_WALLET_ADDRESS to a separate checksummed dedicated browser wallet");
const client = createPublicClient({ chain: baseSepolia, transport: http(deployment.rpc, { timeout: 10_000, retryCount: 0 }) });
if (await client.getChainId() !== 84532) throw Error("Unexpected Base Sepolia chain ID");
const tokenAbi = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)"]);
const [block, cliNonce, cliPending, factoryNonce, cliBalance, browserNonce, browserPending, browserBalance, browserTokenBalance, factoryCode, senderCode, tokenCode, cliTokenBalance, browserSenderAllowance, fees] = await Promise.all([
  client.getBlock(),
  client.getTransactionCount({ address: deployment.signer }),
  client.getTransactionCount({ address: deployment.signer, blockTag: "pending" }),
  client.getTransactionCount({ address: deployment.factory.address }),
  client.getBalance({ address: deployment.signer }),
  client.getTransactionCount({ address: browserSigner }),
  client.getTransactionCount({ address: browserSigner, blockTag: "pending" }),
  client.getBalance({ address: browserSigner }),
  client.readContract({ address: deployment.standard.address, abi: tokenAbi, functionName: "balanceOf", args: [browserSigner] }),
  client.getCode({ address: deployment.factory.address }),
  client.getCode({ address: deployment.sender.address }),
  client.getCode({ address: deployment.standard.address }),
  client.readContract({ address: deployment.standard.address, abi: tokenAbi, functionName: "balanceOf", args: [deployment.signer] }),
  client.readContract({ address: deployment.standard.address, abi: tokenAbi, functionName: "allowance", args: [browserSigner, deployment.sender.address] }),
  client.estimateFeesPerGas(),
]);
if (cliNonce !== 19 || cliPending !== 19 || browserNonce !== 0 || browserPending !== 0) throw Error("Signer nonce changed; campaign needs a fresh review");
if (factoryNonce !== 3) throw Error("Factory nonce changed; expected demo-token address requires a fresh review");
for (const [label, code] of [["factory", factoryCode], ["sender", senderCode], ["standard", tokenCode]]) {
  if (!code || keccak256(code).slice(2).toLowerCase() !== deployment[label].runtimeKeccak.toLowerCase()) throw Error(`Reviewed ${label} bytecode mismatch`);
}
if (cliTokenBalance < parseUnits("10", 18) || browserTokenBalance !== 0n || browserSenderAllowance !== 0n) throw Error("Token balances or allowance differ from the new-wallet funding plan");
if (fees.maxFeePerGas === undefined || fees.maxPriorityFeePerGas === undefined || fees.maxFeePerGas > 10_000_000n) throw Error("Current fee estimate is outside the proposed 20-million-wei cap");
const plan = buildPit4bPlan({
  deployment, signer: browserSigner, nonce: browserNonce, timestamp: block.timestamp,
  maxFeePerGasWei: 20_000_000n, l1ReservePerTxWei: 10_000_000_000n,
  name: "PIT Browser Demo", symbol: "PBD",
  unlockDelay: 1800n, startDelay: 2700n, duration: 1800n, cliffDelay: 900n,
});
validateWalletCampaign(plan.campaign, deployment);
const nativeFundingWei = 250_000_000_000_000n;
const cliGasCaps = [21_000n, 80_000n];
const cliMaxGasCostWei = cliGasCaps.reduce((sum, gas) => sum + gas * 20_000_000n + 10_000_000_000n, 0n);
if (cliBalance < nativeFundingWei + cliMaxGasCostWei || browserBalance > 10_000_000_000_000n || nativeFundingWei < BigInt(plan.campaign.maxTotalWei)) throw Error("Funding balances differ from the approved plan");
const fundingData = encodeFunctionData({ abi: parseAbi(["function transfer(address,uint256) returns (bool)"]), functionName: "transfer", args: [browserSigner, parseUnits("10", 18)] });
const [nativeGasEstimate, tokenGasEstimate] = await Promise.all([
  client.estimateGas({ account: deployment.signer, to: browserSigner, value: nativeFundingWei }),
  client.estimateGas({ account: deployment.signer, to: deployment.standard.address, data: fundingData }),
]);
if (nativeGasEstimate > cliGasCaps[0] || tokenGasEstimate > cliGasCaps[1]) throw Error("Current funding gas estimate exceeds the proposed CLI caps");
const funding = { from: deployment.signer, recipient: browserSigner, startNonce: cliNonce, nativeFundingWei: String(nativeFundingWei), token: deployment.standard.address, tokenAmountRaw: String(parseUnits("10", 18)), tokenTransferCalldataKeccak: keccak256(fundingData).slice(2), gasEstimates: [nativeGasEstimate, tokenGasEstimate].map(String), maxFeePerGasWei: "20000000", gasLimits: cliGasCaps.map(String), l1ReservePerTxWei: "10000000000", maxCliGasCostWei: String(cliMaxGasCostWei), maxCliBalanceDecreaseWei: String(nativeFundingWei + cliMaxGasCostWei) };
const campaignBody = JSON.stringify(plan.campaign);
const campaignSha256 = createHash("sha256").update(campaignBody).digest("hex");
writeFileSync("/tmp/pit4b-live-campaign.json", campaignBody, { mode: 0o600 });
const review = {
  status: "PREPARED_NOT_AUTHORIZED", chainId: 84532, block: String(block.number), blockTimestamp: String(block.timestamp),
  cliSigner: deployment.signer, cliNonce, cliBalanceWei: String(cliBalance), cliBalanceEth: formatEther(cliBalance),
  browserSigner, browserNonce, browserBalanceWei: String(browserBalance), funding,
  currentEstimatedMaxFeePerGasWei: String(fees.maxFeePerGas), campaignSha256, campaign: plan.campaign,
  forms: plan.forms, expectedCreatedToken: plan.expectedCreatedToken,
  unlockTime: new Date(Number(plan.unlock) * 1000).toISOString(),
  vestStart: new Date(Number(plan.start) * 1000).toISOString(),
  vestCliff: new Date(Number(plan.cliff) * 1000).toISOString(),
  vestEnd: new Date(Number(plan.end) * 1000).toISOString(),
};
writeFileSync("/tmp/pit4b-live-review.json", JSON.stringify(review, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ status: review.status, chainId: 84532, block: review.block, cliSigner: review.cliSigner, cliNonce, cliBalanceWei: review.cliBalanceWei, browserSigner, browserNonce, browserBalanceWei: review.browserBalanceWei, funding, estimatedMaxFeePerGasWei: review.currentEstimatedMaxFeePerGasWei, maxFeePerGasWei: plan.campaign.maxFeePerGasWei, maxBrowserGasWei: plan.campaign.maxTotalWei, browserTransactions: plan.campaign.steps.length, campaignSha256, factory: deployment.factory.address, sender: deployment.sender.address, token: deployment.standard.address, recipients: plan.forms.multisender.csv.split("\n").slice(1).map((row) => row.split(",")[0]), lock: plan.forms.lock.address, vest: plan.forms.vest.address, unlockTime: review.unlockTime, vestStart: review.vestStart, vestCliff: review.vestCliff, vestEnd: review.vestEnd, expiresAt: new Date(plan.campaign.expiresAt * 1000).toISOString() }, null, 2));
