import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateWalletCampaign } from "../scripts/operations/wallet-campaign.mjs";
import { validateSepoliaConfig } from "../scripts/operations/sepolia-config.mjs";
import { buildPit4bPlan } from "../scripts/operations/pit4b-plan.mjs";

const deployment = validateSepoliaConfig(JSON.parse(readFileSync("deployments/base-sepolia.json", "utf8")));
function fixture() {
  return buildPit4bPlan({ deployment, signer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", nonce: 0,
    timestamp: 1_800_000_000n, maxFeePerGasWei: 50_000_000n, l1ReservePerTxWei: 10_000_000_000n,
    name: "PIT Test", symbol: "PITX", unlockDelay: 1800n, startDelay: 2700n, duration: 1800n, cliffDelay: 900n }).campaign;
}
test("exact-step campaign accepts the eleven reviewed actions and newly created token", () => {
  const campaign = validateWalletCampaign(fixture(), deployment);
  assert.equal(campaign.steps.length, 11);
  assert.equal(campaign.steps[1].to, campaign.token);
});
test("campaign rejects signer, chain, nonce, destination and calldata mutation", () => {
  for (const mutate of [
    (x) => { x.chainId = 8453; },
    (x) => { x.signer = deployment.signer; },
    (x) => { x.token = deployment.standard.address; },
    (x) => { x.steps[1].nonce = 2; },
    (x) => { x.expiresAt = 0; },
    (x) => { x.steps[0].to = deployment.standard.address; },
    (x) => { x.steps[1].calldataKeccak = "0x" + "b".repeat(64); },
    (x) => { x.steps[5].to = deployment.sender.address; },
    (x) => { x.steps[7].label = "deploy-lock"; },
    (x) => { x.steps.pop(); },
    (x) => { x.forms.lock.beneficiary = deployment.signer; },
  ]) { const x = fixture(); mutate(x); assert.throws(() => validateWalletCampaign(x, deployment)); }
});
test("campaign fails closed on aggregate fee and unbounded gas or extra fields", () => {
  const low = fixture(); low.maxTotalWei = "1";
  assert.throws(() => validateWalletCampaign(low, deployment));
  const high = fixture(); high.steps[0].gasLimit = 5_000_000;
  assert.throws(() => validateWalletCampaign(high, deployment));
  const extra = fixture(); extra.steps[0].recipient = deployment.signer;
  assert.throws(() => validateWalletCampaign(extra, deployment));
});
