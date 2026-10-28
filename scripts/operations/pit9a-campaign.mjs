// Reproducible, non-broadcast payment test candidate. No signer is loaded here.
import { readFileSync, writeFileSync } from "node:fs";
import { getContractAddress } from "viem";

export const SIGNER = "0xCb8c794c7B33FeC20C30D970725933bE1fc656C6";
export const FEE_RECIPIENT = "0xA945c984d4cD94528D0Ee3eCEe540EE66F1843B0";
export const RECIPIENT_B = "0xf938C5E7D1e6bf62a2399aE6b14ca13708478ab7";
export const TEST_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const MAX_FEE_PER_GAS_WEI = 50_000_000n;
export const L1_RESERVE_PER_TX_WEI = 20_000_000_000_000n;
export const MAX_TOTAL_SPEND_WEI = 1_100_000_000_000_000n;
export const INITIAL_NONCE = 19n;
export const CREATOR = getContractAddress({ from: SIGNER, nonce: INITIAL_NONCE });
export const OPERATIONS = getContractAddress({ from: SIGNER, nonce: INITIAL_NONCE + 1n });
export const TEST_PRICES = Object.freeze({ standard: 100_000n, advanced: 200_000n,
  multiBase: 10_000n, multiPerRecipient: 5_000n, multiCap: 50_000n,
  lockFee: 50_000n, vestingFee: 50_000n });
export const ACTIONS = Object.freeze([
  { id: "deploy-paid-creator", to: null, gasCap: 4_800_000n },
  { id: "deploy-paid-operations", to: null, gasCap: 4_300_000n },
  { id: "approve-usdc-standard", to: TEST_USDC, gasCap: 80_000n, amount: TEST_PRICES.standard },
  { id: "create-standard", to: CREATOR, gasCap: 750_000n, amount: 10n * 10n ** 18n },
  { id: "approve-usdc-advanced", to: TEST_USDC, gasCap: 80_000n, amount: TEST_PRICES.advanced },
  { id: "create-advanced", to: CREATOR, gasCap: 2_100_000n, amount: 10n * 10n ** 18n },
  { id: "approve-usdc-multisend", to: TEST_USDC, gasCap: 80_000n, amount: 20_000n },
  { id: "approve-asset-multisend", to: "CREATED_STANDARD", gasCap: 80_000n, amount: 2n * 10n ** 18n },
  { id: "multisend-two", to: OPERATIONS, gasCap: 250_000n, amount: 2n * 10n ** 18n },
  { id: "approve-usdc-lock", to: TEST_USDC, gasCap: 80_000n, amount: TEST_PRICES.lockFee },
  { id: "approve-asset-lock", to: "CREATED_STANDARD", gasCap: 80_000n, amount: 1n * 10n ** 18n },
  { id: "create-lock", to: OPERATIONS, gasCap: 950_000n, amount: 1n * 10n ** 18n },
  { id: "approve-usdc-vesting", to: TEST_USDC, gasCap: 80_000n, amount: TEST_PRICES.vestingFee },
  { id: "approve-asset-vesting", to: "CREATED_STANDARD", gasCap: 80_000n, amount: 1n * 10n ** 18n },
  { id: "create-vesting", to: OPERATIONS, gasCap: 1_200_000n, amount: 1n * 10n ** 18n },
]);
const gasCapTotal = ACTIONS.reduce((sum, action) => sum + action.gasCap, 0n);
export const WORST_CASE_WEI = gasCapTotal * MAX_FEE_PER_GAS_WEI + BigInt(ACTIONS.length) * L1_RESERVE_PER_TX_WEI;
if (WORST_CASE_WEI > MAX_TOTAL_SPEND_WEI) throw Error("Campaign ceiling cannot cover action caps");
export const REQUIRED_TEST_USDC_MICRO = TEST_PRICES.standard + TEST_PRICES.advanced +
  TEST_PRICES.multiBase + 2n * TEST_PRICES.multiPerRecipient + TEST_PRICES.lockFee + TEST_PRICES.vestingFee;

export function assertCampaignAction(input) {
  const { index, chainId, signer, nonce, to, gasEstimate, maxFeePerGasWei,
    spentWei, currentBalanceWei, amount = 0n } = input;
  const action = ACTIONS[index];
  if (!action || chainId !== 84532 || signer?.toLowerCase() !== SIGNER.toLowerCase()
    || nonce !== INITIAL_NONCE + BigInt(index) || to?.toLowerCase() !== action.to?.toLowerCase())
    throw Error("Unapproved chain, signer, action, nonce or destination");
  if (action.amount !== undefined && amount !== action.amount) throw Error("Unapproved asset or approval amount");
  if (gasEstimate < 1n || gasEstimate > action.gasCap || maxFeePerGasWei < 1n
    || maxFeePerGasWei > MAX_FEE_PER_GAS_WEI) throw Error("Per-transaction gas cap exceeded");
  const reserve = action.gasCap * maxFeePerGasWei + L1_RESERVE_PER_TX_WEI;
  if (spentWei < 0n || spentWei + reserve > MAX_TOTAL_SPEND_WEI || currentBalanceWei < reserve)
    throw Error("Aggregate budget or signer balance exceeded");
  return { id: action.id, gasCap: action.gasCap, reserveWei: reserve };
}

export function candidate() {
  return { schema: "pit9a.paid-testnet-candidate.v1", status: "NOT_AUTHORIZED_NO_BROADCAST",
    sourceCommit: "52612c0033703388fc76c03b10bbdc135fb4b46c", chainId: 84532,
    paymentToken: TEST_USDC, deployer: SIGNER, testPayer: SIGNER,
    testFeeRecipient: FEE_RECIPIENT, priceAdministrator: SIGNER,
    expectedRouterAddresses: { creator: CREATOR, operations: OPERATIONS },
    existingInfrastructure: { factory: "0xE861d10ab302B66f619b15323C96d9F3BbfDc230",
      multiSender: "0xf1c076cDF4A3C0bbBc491cF3578CA2F3d99424eA" },
    testRecipients: [FEE_RECIPIENT, RECIPIENT_B],
    testPricesMicro: Object.fromEntries(Object.entries(TEST_PRICES).map(([key, value]) => [key, value.toString()])),
    commercialPricesActive: false, requiredTestUsdcMicro: REQUIRED_TEST_USDC_MICRO.toString(),
    initialNonce: INITIAL_NONCE.toString(), maximumTransactionCount: ACTIONS.length,
    maximumFeePerGasWei: MAX_FEE_PER_GAS_WEI.toString(), l1ReservePerTxWei: L1_RESERVE_PER_TX_WEI.toString(),
    worstCaseWei: WORST_CASE_WEI.toString(), maximumTotalSpendWei: MAX_TOTAL_SPEND_WEI.toString(),
    actions: ACTIONS.map((action) => ({ ...action, gasCap: action.gasCap.toString(),
      ...(action.amount === undefined ? {} : { amount: action.amount.toString() }) })),
    schedule: { standardSupplyRaw: (10n ** 19n).toString(), distributionRaw: (2n * 10n ** 18n).toString(),
      lockRaw: (10n ** 18n).toString(), vestingRaw: (10n ** 18n).toString(),
      lockUnlock: "execution block time + 10 minutes", vestingStart: "execution block time + 2 minutes",
      vestingCliff: "start + 2 minutes", vestingDuration: "10 minutes" },
    sourceVerification: "PENDING_SEPARATE_SOURCIFY_APPROVAL",
    staging: "PENDING_SEPARATE_HOSTING_APPROVAL" };
}
if (process.argv[1]?.endsWith("pit9a-campaign.mjs")) {
  const path = "deployments/base-sepolia-paid-test-candidate.json";
  const output = JSON.stringify(candidate(), null, 2) + "\n";
  if (process.argv.includes("--write")) writeFileSync(path, output);
  else if (readFileSync(path, "utf8") !== output) throw Error("Campaign manifest differs from guarded source");
  console.log(`PIT9A PLAN ${process.argv.includes("--write") ? "WRITTEN" : "PASS"}: ${ACTIONS.length} actions; ${REQUIRED_TEST_USDC_MICRO} test-USDC micro; ${WORST_CASE_WEI} wei worst case; no broadcast`);
}
