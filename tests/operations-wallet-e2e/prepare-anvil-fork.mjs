// Local fork fixture only. All later signed requests go to 127.0.0.1:8555.
import { createPublicClient, getAddress, http } from "viem";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { buildPit4bPlan } from "../../scripts/operations/pit4b-plan.mjs";
import { validateWalletCampaign } from "../../scripts/operations/wallet-campaign.mjs";

const client = createPublicClient({ transport: http("http://127.0.0.1:8555", { retryCount: 0 }) });
const deployment = JSON.parse(readFileSync("deployments/base-sepolia.json", "utf8"));
if (await client.getChainId() !== 84532) throw Error("Fork must use chain 84532");
// This is an arbitrary local-only impersonated address, not a wallet key.
const signer = getAddress(`0x${randomBytes(20).toString("hex")}`);
await client.request({ method: "anvil_setBalance", params: [signer, "0xde0b6b3a7640000"] });
await client.request({ method: "anvil_impersonateAccount", params: [signer] });
const nonce = await client.getTransactionCount({ address: signer, blockTag: "pending" });
if (nonce !== 0) throw Error("Browser test account must start at nonce 0");
const timestamp = (await client.getBlock()).timestamp;
// Give the browser suite ample real wall-clock headroom on a busy CI host;
// the isolated fork advances time only after the early-release assertions.
const fixture = buildPit4bPlan({ deployment, signer, nonce, timestamp, maxFeePerGasWei: 50_000_000n, l1ReservePerTxWei: 10_000_000_000n, name: "PIT Browser Fork", symbol: "PBF", unlockDelay: 14_400n, startDelay: 18_000n, duration: 3600n, cliffDelay: 1800n });
validateWalletCampaign(fixture.campaign, deployment);
writeFileSync("/tmp/pit4b-anvil-campaign.json", JSON.stringify(fixture.campaign), { mode: 0o600 });
writeFileSync("/tmp/pit4b-anvil-fixture.json", JSON.stringify(fixture, (_, value) => typeof value === "bigint" ? value.toString() : value), { mode: 0o600 });
console.log(JSON.stringify({ status: "LOCAL_FORK_ONLY", chainId: 84532, signer, startNonce: nonce, steps: fixture.campaign.steps.length, maxTotalWei: fixture.campaign.maxTotalWei, lock: fixture.forms.lock.address, vest: fixture.forms.vest.address }));
