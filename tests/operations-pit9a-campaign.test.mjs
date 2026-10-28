import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACTIONS, INITIAL_NONCE, MAX_FEE_PER_GAS_WEI, MAX_TOTAL_SPEND_WEI,
  REQUIRED_TEST_USDC_MICRO, SIGNER, TEST_USDC, WORST_CASE_WEI, assertCampaignAction, candidate } from "../scripts/operations/pit9a-campaign.mjs";

test("reviewed testnet campaign is exact, budgeted and non-broadcast", () => {
  const file = JSON.parse(readFileSync("deployments/base-sepolia-paid-test-candidate.json", "utf8"));
  assert.deepEqual(file, candidate());
  assert.equal(file.status, "NOT_AUTHORIZED_NO_BROADCAST");
  assert.equal(file.paymentToken, TEST_USDC);
  assert.equal(file.maximumTransactionCount, 15);
  assert.equal(REQUIRED_TEST_USDC_MICRO, 420_000n);
  assert.ok(WORST_CASE_WEI < MAX_TOTAL_SPEND_WEI);
});

test("per-transaction guard rejects wrong chain, signer, nonce, destination, amount and fees", () => {
  const base = { index: 2, chainId: 84532, signer: SIGNER, nonce: INITIAL_NONCE + 2n,
    to: TEST_USDC, gasEstimate: 70_000n, maxFeePerGasWei: 6_000_000n,
    spentWei: 0n, currentBalanceWei: 2_000_000_000_000_000n, amount: ACTIONS[2].amount };
  assert.equal(assertCampaignAction(base).id, "approve-usdc-standard");
  for (const change of [
    { chainId: 8453 }, { signer: "0x0000000000000000000000000000000000000001" },
    { nonce: 18n }, { to: SIGNER }, { amount: 1n },
    { gasEstimate: 80_001n }, { maxFeePerGasWei: MAX_FEE_PER_GAS_WEI + 1n },
    { spentWei: MAX_TOTAL_SPEND_WEI }, { currentBalanceWei: 0n },
  ]) assert.throws(() => assertCampaignAction({ ...base, ...change }));
});
