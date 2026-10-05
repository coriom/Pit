import { isAddress } from "viem";
import type { PreflightCode } from "./execution-preflight";

export type ReadinessStatus = "PASS" | "FAIL" | "UNKNOWN";
export type ReadinessItem = Readonly<{
  id: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
}>;
export type ObservationFact = Readonly<{
  status: ReadinessStatus;
  evidence: string;
}>;

const item = (
  id: string,
  label: string,
  status: ReadinessStatus,
  detail: string,
): ReadinessItem => ({ id, label, status, detail });
const verifiedByRead = (gate: PreflightCode): ReadinessStatus =>
  gate === "GREEN" || gate === "QUOTE_EXPIRED" ? "PASS" : "UNKNOWN";

export function cowOperatorReadiness(f: {
  connected: boolean;
  chainId?: number;
  feesEnabled: boolean;
  mainnetEnabled: boolean;
  storage: boolean;
  sellToken: string;
  buyToken: string;
  gate: PreflightCode;
  quotePresent: boolean;
  quoteDiagnostic: boolean;
  quoteObtainedAt?: number;
  now: number;
}): ReadinessItem[] {
  const assetsValid =
    isAddress(f.sellToken) &&
    isAddress(f.buyToken) &&
    f.sellToken.toLowerCase() !== f.buyToken.toLowerCase();
  const quoteExpired =
    f.quoteObtainedAt !== undefined &&
    (!Number.isSafeInteger(f.quoteObtainedAt) ||
      f.now - f.quoteObtainedAt >= 60_000 ||
      f.quoteObtainedAt > f.now);
  const quoteStatus: ReadinessStatus =
    !f.quotePresent ||
    f.quoteDiagnostic ||
    quoteExpired ||
    f.gate === "QUOTE_EXPIRED" ||
    f.gate === "INVALID_EXECUTION_QUOTE"
      ? "FAIL"
      : f.gate === "GREEN"
        ? "PASS"
        : "UNKNOWN";
  const funds =
    f.gate === "INSUFFICIENT_BALANCE" ? "FAIL" : verifiedByRead(f.gate);
  return [
    item(
      "wallet",
      "External wallet connected",
      f.connected && f.gate !== "WALLET_CHANGED" ? "PASS" : "FAIL",
      "No account-access request is made by this checklist.",
    ),
    item(
      "chain",
      "Ethereum Sepolia chain ID 11155111",
      f.gate === "WRONG_CHAIN"
        ? "FAIL"
        : f.chainId === 11155111
          ? "PASS"
          : f.chainId === undefined
            ? "UNKNOWN"
            : "FAIL",
      "Base Sepolia 84532 is a different chain.",
    ),
    item(
      "cow-environment",
      "CoW Sepolia API and pinned contracts",
      f.gate === "COW_CONFIGURATION" ? "FAIL" : verifiedByRead(f.gate),
      "Execution preflight checks the exact orderbook, settlement and relayer identities.",
    ),
    item(
      "fees",
      "PIT fees and mainnet disabled",
      !f.feesEnabled && !f.mainnetEnabled ? "PASS" : "FAIL",
      "PIT partner fee must remain zero.",
    ),
    item(
      "assets",
      "Two distinct Sepolia ERC-20 contracts",
      assetsValid
        ? f.gate === "UNSUPPORTED_ASSETS"
          ? "FAIL"
          : verifiedByRead(f.gate)
        : "FAIL",
      "Addresses and deployed code are checked by execution preflight; native ETH is unsupported.",
    ),
    item(
      "funds",
      "Sell-token balance and Sepolia ETH for wallet operations",
      funds,
      "Preflight checks sell balance and approval-gas headroom when approval is needed.",
    ),
    item(
      "storage",
      "Approved accounting origin",
      f.storage && f.gate !== "STORAGE_UNAVAILABLE" ? "PASS" : "FAIL",
      "IndexedDB must be available before execution.",
    ),
    item(
      "quote",
      "Fresh original executable CoW quote",
      quoteStatus,
      "Diagnostic and comparison-display quotes never authorize execution.",
    ),
  ];
}

/** Reuses the same CoW prerequisite IDs, labels and PASS/FAIL/UNKNOWN vocabulary.
 * A public-address observation cannot claim wallet or IndexedDB readiness, and
 * its quote row is explicitly read-only rather than an execution authorization.
 */
export function cowObservationReadiness({
  account,
  facts,
}: {
  account: string;
  facts: Readonly<Record<string, ObservationFact>>;
}) {
  const base = cowOperatorReadiness({
    connected: false,
    chainId: undefined,
    feesEnabled: false,
    mainnetEnabled: false,
    storage: false,
    sellToken: "",
    buyToken: "",
    gate: "DISCONNECTED",
    quotePresent: false,
    quoteDiagnostic: true,
    now: Date.now(),
  });
  return base.map((row) => {
    if (row.id === "wallet")
      return {
        ...row,
        status: "UNKNOWN" as const,
        detail: `Public address ${account}; no connected wallet was inspected`,
      };
    const observed = facts[row.id];
    if (!observed) return row;
    return {
      ...row,
      label: row.id === "quote" ? "Fresh read-only CoW quote" : row.label,
      status: observed.status,
      detail: observed.evidence,
    };
  });
}

export function perpOperatorReadiness(f: {
  connected: boolean;
  feesEnabled: boolean;
  mainnetEnabled: boolean;
  storage: boolean;
  testnetEnvironment: boolean;
  gate: PreflightCode;
  marketSelected: boolean;
}): ReadinessItem[] {
  return [
    item(
      "account",
      "External account connected",
      f.connected && f.gate !== "WALLET_CHANGED" ? "PASS" : "FAIL",
      "The wallet remains externally controlled.",
    ),
    item(
      "environment",
      "Exact Hyperliquid testnet endpoints",
      f.testnetEnvironment && f.gate !== "HL_CONFIGURATION" ? "PASS" : "FAIL",
      "The wallet EVM chain does not select Hyperliquid's network.",
    ),
    item(
      "fees",
      "Builder-fee path disabled",
      !f.feesEnabled && !f.mainnetEnabled ? "PASS" : "FAIL",
      "No builder approval or builder field; PIT fee is zero.",
    ),
    item(
      "market",
      "Market, side, size and price valid",
      !f.marketSelected ||
        f.gate === "MARKET_UNAVAILABLE" ||
        f.gate === "INVALID_AMOUNT"
        ? "FAIL"
        : f.gate === "GREEN"
          ? "PASS"
          : "UNKNOWN",
      "Limit notional and reduce-only position are checked before order submission.",
    ),
    item(
      "collateral",
      "Sufficient testnet collateral or reducible position",
      f.gate === "INSUFFICIENT_BALANCE"
        ? "FAIL"
        : f.gate === "GREEN"
          ? "PASS"
          : "UNKNOWN",
      "Exchange-side margin and fee checks may still reject the order.",
    ),
    item(
      "storage",
      "Approved accounting origin",
      f.storage && f.gate !== "STORAGE_UNAVAILABLE" ? "PASS" : "FAIL",
      "Raw derivative evidence requires local storage.",
    ),
    item(
      "accounting",
      "Derivative accounting disclosed",
      "PASS",
      "unsupported_derivative_v1: raw evidence only, never a Taxlot spot event or CSV row.",
    ),
  ];
}

export function operatorActionAllowed(
  dryRun: boolean,
  gate: PreflightCode,
  checkpointConfirmed: boolean,
): boolean {
  return !dryRun && gate === "GREEN" && checkpointConfirmed;
}
