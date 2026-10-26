import test from "node:test";
import assert from "node:assert/strict";
import { SEPOLIA_SIGNER } from "../scripts/operations/sepolia-config.mjs";
import { ACTIONS, CAMPAIGN_INITIAL_BALANCE_WEI, CAMPAIGN_MAX_SPEND_WEI,
  MAX_FEE_PER_GAS_WEI, assertSepoliaBudget } from "../scripts/operations/sepolia-budget.mjs";

const quote = (index = 0) => ({ index, action: ACTIONS[index][0], chainId: 84532, signer: SEPOLIA_SIGNER,
  nonce: BigInt(index), initialBalanceWei: CAMPAIGN_INITIAL_BALANCE_WEI,
  currentBalanceWei: CAMPAIGN_INITIAL_BALANCE_WEI, previousBalanceWei: CAMPAIGN_INITIAL_BALANCE_WEI,
  estimatedGas: ACTIONS[index][1] - 1n, maxFeePerGasWei: MAX_FEE_PER_GAS_WEI,
  l1UpperBoundWei: 10_000_000_000_000n, operatorFeeWei: 0n });

test("campaign budget bounds all nineteen approved testnet actions", () => {
  assert.equal(ACTIONS.length, 19);
  assert.equal(ACTIONS.reduce((sum, [, gas]) => sum + gas, 0n), 9_550_000n);
  const worst = ACTIONS.reduce((sum, [, gas]) => sum + gas * MAX_FEE_PER_GAS_WEI + 20_000_000_000_000n, 0n);
  assert.equal(worst, 857_500_000_000_000n);
  assert.ok(worst <= CAMPAIGN_MAX_SPEND_WEI);
  for (let i = 0; i < ACTIONS.length; i++) assert.equal(assertSepoliaBudget(quote(i)).gasLimit, ACTIONS[i][1]);
});

test("wrong chain, signer, nonce, changed funding, gas, fee or insufficient budget fails closed", () => {
  const changes = [
    { chainId: 8453 }, { signer: "0x0000000000000000000000000000000000000001" },
    { nonce: 1n }, { action: "deploy-other" }, { initialBalanceWei: CAMPAIGN_INITIAL_BALANCE_WEI + 1n },
    { currentBalanceWei: CAMPAIGN_INITIAL_BALANCE_WEI + 1n },
    { previousBalanceWei: 0n }, { estimatedGas: ACTIONS[0][1] + 1n },
    { maxFeePerGasWei: MAX_FEE_PER_GAS_WEI + 1n },
    { l1UpperBoundWei: 20_000_000_000_001n }, { operatorFeeWei: 10_000_000_000_001n },
    { currentBalanceWei: 100_000_000_000_000n, previousBalanceWei: 100_000_000_000_000n },
  ];
  for (const change of changes) assert.throws(() => assertSepoliaBudget({ ...quote(), ...change }), JSON.stringify(Object.keys(change)));
  assert.throws(() => assertSepoliaBudget({ ...quote(), index: ACTIONS.length }));
});
