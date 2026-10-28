/** Provisional service fees. No checkout, balance debit or fee collector exists here. */
export type PriceKind = "FREE" | "FIXED_FEE" | "VARIABLE_FEE" | "PLANNED";
export type ProductPrice = Readonly<{ kind: PriceKind; label: string; asset?: "USDC"; fixedMicro?: bigint; baseMicro?: bigint; perUnitMicro?: bigint; capMicro?: bigint }>;
export const PIT_PRICES = {
  "advanced-financial-report": { kind: "PLANNED", label: "4.90–14.90 USDC proposed · inactive", asset: "USDC" },
  "standard-erc20-creation": { kind: "FIXED_FEE", label: "49 USDC proposed · inactive", asset: "USDC", fixedMicro: 49_000_000n },
  "advanced-erc20-creation": { kind: "FIXED_FEE", label: "149 USDC proposed · inactive", asset: "USDC", fixedMicro: 149_000_000n },
  "erc20-bulk-distribution": { kind: "VARIABLE_FEE", label: "3 USDC + 0.10/address, capped at 49 USDC · proposed inactive", asset: "USDC", baseMicro: 3_000_000n, perUnitMicro: 100_000n, capMicro: 49_000_000n },
  "token-locker": { kind: "FIXED_FEE", label: "39 USDC proposed · inactive", asset: "USDC", fixedMicro: 39_000_000n },
  "custom-vesting": { kind: "FIXED_FEE", label: "79 USDC proposed · inactive", asset: "USDC", fixedMicro: 79_000_000n },
  "simple-token-management": { kind: "VARIABLE_FEE", label: "2–5 USDC proposed · inactive", asset: "USDC" },
  "native-multisender": { kind: "VARIABLE_FEE", label: "3 USDC + 0.10/address, capped at 49 USDC · proposed inactive", asset: "USDC", baseMicro: 3_000_000n, perUnitMicro: 100_000n, capMicro: 49_000_000n },
  "nft-creator": { kind: "FIXED_FEE", label: "49 USDC proposed · inactive", asset: "USDC", fixedMicro: 49_000_000n },
  "nft-batch-sender": { kind: "VARIABLE_FEE", label: "3 USDC + 0.10/token, capped at 49 USDC · proposed inactive", asset: "USDC", baseMicro: 3_000_000n, perUnitMicro: 100_000n, capMicro: 49_000_000n },
  "erc1155-creator": { kind: "FIXED_FEE", label: "79 USDC proposed · inactive", asset: "USDC", fixedMicro: 79_000_000n },
  "erc1155-multisender": { kind: "VARIABLE_FEE", label: "3 USDC + 0.10/row, capped at 49 USDC · proposed inactive", asset: "USDC", baseMicro: 3_000_000n, perUnitMicro: 100_000n, capMicro: 49_000_000n },
} as const satisfies Record<string, ProductPrice>;

export function indicativeServiceFee(price: ProductPrice, units = 0): bigint | undefined {
  if (price.kind === "FREE") return 0n;
  if (price.fixedMicro !== undefined) return price.fixedMicro;
  if (price.baseMicro === undefined || price.perUnitMicro === undefined || !Number.isSafeInteger(units) || units < 0) return undefined;
  const variable = price.baseMicro + price.perUnitMicro * BigInt(units);
  return price.capMicro !== undefined && variable > price.capMicro ? price.capMicro : variable;
}

export function feeQuote(price: ProductPrice, options: { units?: number; network: string; gasUnits?: bigint; gasPriceWei?: bigint; now?: number }) {
  const serviceMicro = indicativeServiceFee(price, options.units);
  const networkWei = options.gasUnits !== undefined && options.gasPriceWei !== undefined ? options.gasUnits * options.gasPriceWei : undefined;
  return { status: "INDICATIVE_INACTIVE" as const, network: options.network, service: { asset: price.asset ?? "USDC", amountMicro: serviceMicro?.toString() ?? null }, gas: { asset: "ETH", amountWei: networkWei?.toString() ?? null, units: options.gasUnits?.toString() ?? null }, total: null, observedAt: options.now ?? Date.now(), expiresAt: null, note: "No USDC-to-ETH conversion, payment authorization or live fee collection." };
}
