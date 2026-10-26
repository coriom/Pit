import { SEPOLIA_SIGNER } from "./sepolia-config.mjs";

export const CAMPAIGN_MAX_SPEND_WEI = 900_000_000_000_000n;
export const CAMPAIGN_INITIAL_BALANCE_WEI = 1_000_000_000_000_000n;
export const MAX_FEE_PER_GAS_WEI = 50_000_000n;
export const MAX_L1_AND_OPERATOR_PER_TX_WEI = 20_000_000_000_000n;

// Order and limits are part of the operator's proposed authorization envelope.
export const ACTIONS = Object.freeze([
  ["deploy-factory", 3_200_000n], ["deploy-sender", 700_000n],
  ["create-standard", 650_000n], ["create-advanced", 1_900_000n],
  ["mint", 150_000n], ["pause", 100_000n], ["unpause", 100_000n], ["burn", 100_000n],
  ["approve-batch", 80_000n], ["send-two", 200_000n],
  ["deploy-lock", 700_000n], ["approve-lock", 80_000n], ["fund-lock", 120_000n],
  ["deploy-vesting", 950_000n], ["approve-vesting", 80_000n], ["fund-vesting", 120_000n],
  ["release-lock", 100_000n], ["release-vesting-partial", 120_000n], ["release-vesting-final", 100_000n],
]);

const nonnegative = (value, label) => {
  if (typeof value !== "bigint" || value < 0n) throw Error(`Invalid ${label}`);
  return value;
};

/** A pure pre-write bound. The broadcaster must also verify calldata, receipts, code, roles, and each post-write balance. */
export function assertSepoliaBudget(quote) {
  const { index, action, chainId, signer, nonce, initialBalanceWei, currentBalanceWei,
    previousBalanceWei, estimatedGas, maxFeePerGasWei, l1UpperBoundWei, operatorFeeWei } = quote;
  if (!Number.isInteger(index) || index < 0 || index >= ACTIONS.length || action !== ACTIONS[index][0]) throw Error("Unapproved action or order");
  if (chainId !== 84532 || signer !== SEPOLIA_SIGNER || nonce !== BigInt(index)) throw Error("Wrong chain, signer or nonce");
  if (nonnegative(initialBalanceWei, "initial balance") !== CAMPAIGN_INITIAL_BALANCE_WEI) throw Error("Unexpected funding amount");
  const balance = nonnegative(currentBalanceWei, "current balance");
  if (balance > nonnegative(previousBalanceWei, "previous balance") || balance > initialBalanceWei) throw Error("Unexpected account funding or balance change");
  const gas = nonnegative(estimatedGas, "gas estimate");
  const gasCap = ACTIONS[index][1];
  if (gas === 0n || gas > gasCap) throw Error("Per-action gas limit exceeded");
  const fee = nonnegative(maxFeePerGasWei, "gas fee");
  if (fee === 0n || fee > MAX_FEE_PER_GAS_WEI) throw Error("Gas price ceiling exceeded");
  const l1AndOperator = nonnegative(l1UpperBoundWei, "L1 fee") + nonnegative(operatorFeeWei, "operator fee");
  if (l1AndOperator > MAX_L1_AND_OPERATOR_PER_TX_WEI) throw Error("L1 or operator fee reserve exceeded");
  const worstCaseWei = gasCap * fee + MAX_L1_AND_OPERATOR_PER_TX_WEI;
  const spentWei = initialBalanceWei - balance;
  if (spentWei + worstCaseWei > CAMPAIGN_MAX_SPEND_WEI || balance < worstCaseWei) throw Error("Aggregate campaign budget exceeded");
  return { gasLimit: gasCap, maxFeePerGasWei: fee, worstCaseWei, spentWei, remainingWei: CAMPAIGN_MAX_SPEND_WEI - spentWei };
}
