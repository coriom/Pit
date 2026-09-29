import { config } from "./config";
import { storageEnabled } from "./storage-policy";
import { eventDB } from "./events";
import type { WalletClient } from "viem";

export const COW_RELEASE = Object.freeze({
  chainId: 11155111,
  api: "https://api.cow.fi/sepolia",
  settlement: "0x9008D19f58AAbD9eD0D60971565AA8510560ab41",
  relayer: "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110",
});
export const HL_RELEASE = Object.freeze({
  isTestnet: true,
  apiUrl: "https://api.hyperliquid-testnet.xyz",
  rpcUrl: "https://rpc.hyperliquid-testnet.xyz",
});
export type PreflightCode =
  | "GREEN"
  | "DISCONNECTED"
  | "FEES_ENABLED"
  | "MAINNET_ENABLED"
  | "WRONG_CHAIN"
  | "COW_CONFIGURATION"
  | "HL_CONFIGURATION"
  | "STORAGE_UNAVAILABLE"
  | "UNSUPPORTED_ASSETS"
  | "INVALID_AMOUNT"
  | "INSUFFICIENT_BALANCE"
  | "WALLET_CHANGED"
  | "QUOTE_EXPIRED"
  | "MARKET_UNAVAILABLE"
  | "READ_FAILED"
  | "CHECKING";
export class PreflightError extends Error {
  constructor(public readonly code: PreflightCode) {
    super(code);
  }
}
export function requirePredicate(ok: boolean, code: PreflightCode): asserts ok {
  if (!ok) throw new PreflightError(code);
}
export interface ReleaseFacts {
  connected: boolean;
  feesEnabled: boolean;
  mainnetEnabled: boolean;
  storage: boolean;
  protocol: "cow" | "hyperliquid";
  chainId?: number;
  cow?: { api: string; settlement: string; relayer: string };
  hl?: { isTestnet: boolean; apiUrl: string | URL; rpcUrl: string | URL };
}
// Single deterministic predicate order for UI, execution and release tests.
export function executionPreflight(f: ReleaseFacts): "GREEN" {
  requirePredicate(f.feesEnabled === false, "FEES_ENABLED");
  requirePredicate(f.mainnetEnabled === false, "MAINNET_ENABLED");
  requirePredicate(f.connected, "DISCONNECTED");
  if (f.protocol === "cow") {
    requirePredicate(f.chainId === COW_RELEASE.chainId, "WRONG_CHAIN");
    requirePredicate(
      f.cow?.api === COW_RELEASE.api &&
        f.cow.settlement.toLowerCase() ===
          COW_RELEASE.settlement.toLowerCase() &&
        f.cow.relayer.toLowerCase() === COW_RELEASE.relayer.toLowerCase(),
      "COW_CONFIGURATION",
    );
  } else {
    requirePredicate(
      f.hl?.isTestnet === true &&
        String(f.hl.apiUrl) === HL_RELEASE.apiUrl &&
        String(f.hl.rpcUrl) === HL_RELEASE.rpcUrl,
      "HL_CONFIGURATION",
    );
  }
  requirePredicate(f.storage, "STORAGE_UNAVAILABLE");
  return "GREEN";
}
export function releaseFacts(wallet: WalletClient | undefined) {
  return {
    connected: !!wallet?.account,
    feesEnabled: config.FEES_ENABLED,
    mainnetEnabled: config.MAINNET_ENABLED,
    storage: storageEnabled(),
  };
}
export async function verifyWallet(wallet: WalletClient) {
  requirePredicate(!!wallet.account, "DISCONNECTED");
  const addresses = await wallet.getAddresses();
  requirePredicate(
    addresses[0]?.toLowerCase() === wallet.account!.address.toLowerCase(),
    "WALLET_CHANGED",
  );
}
export async function verifyAccountingStorage() {
  requirePredicate(storageEnabled(), "STORAGE_UNAVAILABLE");
  try {
    const db = await eventDB();
    // Probe the real accounting database, atomically leaving no record behind.
    const tx = db.transaction("meta", "readwrite");
    const key = `preflight:${crypto.randomUUID()}`;
    await tx.store.add(true, key);
    await tx.store.delete(key);
    await tx.done;
  } catch {
    throw new PreflightError("STORAGE_UNAVAILABLE");
  }
}
export async function preflightResult(
  check: () => Promise<unknown>,
): Promise<PreflightCode> {
  try {
    await check();
    return "GREEN";
  } catch (e) {
    return e instanceof PreflightError ? e.code : "READ_FAILED";
  }
}
export const preflightMessage: Record<PreflightCode, string> = {
  GREEN: "Preflight GREEN. Inspect every wallet prompt before confirming.",
  CHECKING: "Checking execution prerequisites…",
  DISCONNECTED: "Connect an external wallet.",
  FEES_ENABLED: "Release blocked: PIT fees must be disabled.",
  MAINNET_ENABLED: "Release blocked: mainnet must be disabled.",
  WRONG_CHAIN:
    "CoW requires Ethereum Sepolia (11155111). Base Sepolia (84532) is not supported.",
  COW_CONFIGURATION: "CoW Sepolia endpoint or contract mismatch.",
  HL_CONFIGURATION: "Hyperliquid testnet endpoint mismatch.",
  STORAGE_UNAVAILABLE:
    "Accounting storage unavailable. Use an approved origin with working IndexedDB.",
  UNSUPPORTED_ASSETS:
    "Use two distinct ERC20 contracts on Ethereum Sepolia; native ETH is unsupported.",
  INVALID_AMOUNT: "Enter a positive amount within token or market precision.",
  INSUFFICIENT_BALANCE: "Insufficient balance for this execution.",
  WALLET_CHANGED: "Wallet changed. Check the account and request a new quote.",
  QUOTE_EXPIRED: "Request a fresh quote before signing.",
  MARKET_UNAVAILABLE: "Market or reduce-only position unavailable.",
  READ_FAILED:
    "Preflight read failed. Execution is blocked; retry when the provider is available.",
};
