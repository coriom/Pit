import { formatUnits, toHex, type Address, type Hex } from "viem";
import { PIT_PRICES, indicativeServiceFee } from "../../lib/pit-pricing";
import type { LegacyOperationId } from "./catalog";

export type PaidKind = LegacyOperationId;
export type LocalQuote = Readonly<{
  operation: PaidKind;
  network: "Anvil 31337";
  paymentAsset: "LOCAL MOCK USDC";
  paymentToken: Address;
  payer: Address;
  feeRecipient: Address;
  destination: Address;
  expectedSpender: Address;
  amountMicro: bigint;
  maxAuthorizedServiceFeeMicro: bigint;
  gasUnits: bigint | null;
  gasWei: bigint | null;
  units: number;
  assetToken?: Address;
  assetAmountRaw?: bigint;
  beneficiary?: Address;
  recipients?: readonly { address: Address; amountRaw: bigint }[];
  intentId: Hex;
  version: bigint;
  createdAt: bigint;
  expiresAt: bigint;
}>;

export function priceForPaidOperation(kind: PaidKind, units: number, advanced = false): bigint {
  const key = kind === "token-creator" ? advanced ? "advanced-erc20-creation" : "standard-erc20-creation"
    : kind === "multisender" ? "erc20-bulk-distribution"
    : kind === "token-locker" ? "token-locker" : "custom-vesting";
  const amount = indicativeServiceFee(PIT_PRICES[key], units);
  if (amount === undefined || amount <= 0n) throw Error("Missing paid-operation price.");
  return amount;
}

export function newIntentId(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes);
}

export function formatLocalQuote(quote: LocalQuote, assetMovement?: string): string {
  return [
    `${quote.operation} · ${quote.network} · pricing version ${quote.version}`,
    `PIT service fee: ${formatUnits(quote.amountMicro, 6)} LOCAL MOCK USDC (test-only)`,
    `Maximum authorized service fee: ${formatUnits(quote.maxAuthorizedServiceFeeMicro, 6)} LOCAL MOCK USDC`,
    `Payment token: ${quote.paymentToken}`,
    `Fee recipient: ${quote.feeRecipient}`,
    `Payer: ${quote.payer}`,
    `Atomic paid destination and exact fee spender: ${quote.destination}`,
    `Network gas: ${quote.gasUnits === null || quote.gasWei === null ? "pending simulation" : `${quote.gasUnits} gas × ${quote.gasWei} wei = ${quote.gasUnits * quote.gasWei} wei native ETH estimate (local Anvil only)`}`,
    assetMovement ?? "No other token transfer specified.",
    `Intent ${quote.intentId} · created ${new Date(Number(quote.createdAt) * 1000).toISOString()} · expires ${new Date(Number(quote.expiresAt) * 1000).toISOString()}`,
    "Approval is a separate gas-bearing transaction. A reverted paid operation rolls back the service fee, but not network gas. No real USDC or merchant wallet is used.",
  ].join("\n");
}
