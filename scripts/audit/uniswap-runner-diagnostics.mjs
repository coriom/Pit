// Test-only diagnostics. Never import this module from src/ or a browser bundle.
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";

const knownCodes = new Set([
  "UNISWAP_NOT_ACCEPTED", "UNISWAP_QUOTE_NOT_READY", "UNISWAP_QUOTE_ECONOMICS",
  "UNISWAP_FRESH_QUOTE_MISMATCH", "UNISWAP_BROWSER_SIGNING_NOT_ARMED",
  "UNISWAP_APPROVAL_NOT_SENT_ONCE", "UNISWAP_APPROVAL_VERIFICATION",
  "UNISWAP_SWAP_NOT_SENT_ONCE", "UNISWAP_SWAP_VERIFICATION",
  "UNISWAP_PREFLIGHT_FUNDS_OR_CHAIN", "UNISWAP_ORIGIN",
  "UNISWAP_RPC_METHOD", "UNISWAP_RPC_READ_ONLY", "UNISWAP_COW_ORDER_DENIED",
  "UNISWAP_ACCOUNTING_RECONCILIATION", "UNISWAP_WRONG_CHAIN",
  "QUOTE_EXPIRED", "INVALID_EXECUTION_QUOTE", "INSUFFICIENT_BALANCE",
  "WRONG_CHAIN", "UNSUPPORTED_ASSETS", "AUTONOMOUS_TRANSACTION_NOT_ARMED",
  "AUTONOMOUS_UNISWAP_ARMING", "AUTONOMOUS_UNISWAP_APPROVAL_INTENT",
  "AUTONOMOUS_UNISWAP_SWAP_INTENT", "AUTONOMOUS_NO_TRANSACTION_RETRY",
  "AUTONOMOUS_ADDRESS_MISMATCH", "AUTONOMOUS_RELEASE_GATE", "ETIMEDOUT",
  "STALE_OR_WRONG_BUILD",
  "UNISWAP_LIVE_RUN_NOT_AUTHORIZED",
]);
const safeName = /^(?:Error|TypeError|RangeError|TimeoutError|RpcRequestError|HttpRequestError|ContractFunctionExecutionError)$/;
const digest = (value) => createHash("sha256").update(value).digest("hex");

export function sourceGate(source) {
  const matches = [...source.matchAll(/^export const UNISWAP_EXECUTION_ACCEPTED = (true|false);$/gm)];
  if (matches.length !== 1) throw Error("STALE_OR_WRONG_BUILD");
  return matches[0][1] === "true";
}

export function verifyServedSource(localSource, rawModule) {
  // Vite's /@fs/...?...raw response exports one quoted JavaScript string.
  // Match only a literal; never evaluate arbitrary response code.
  const encoded = rawModule.match(/^export default ((?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'));(?:\s*\/\/#[^\n]*)?\s*$/s)?.[1];
  if (!encoded) throw Error("STALE_OR_WRONG_BUILD");
  let served;
  try { served = runInNewContext(encoded, Object.create(null), { timeout: 100 }); }
  catch { throw Error("STALE_OR_WRONG_BUILD"); }
  if (digest(served) !== digest(localSource)) throw Error("STALE_OR_WRONG_BUILD");
  return { sourceSha256: digest(served), executionAccepted: sourceGate(served) };
}

export function assertFreshAfterApproval(priorExpiry, nextExpiry, now = Date.now()) {
  if (!Number.isFinite(priorExpiry) || !Number.isFinite(nextExpiry) ||
      nextExpiry <= priorExpiry || nextExpiry <= now)
    throw Error("QUOTE_EXPIRED");
}

/** Return only allowlisted diagnostics, even when an RPC/browser error nests secrets. */
export function safeRunnerFailure(error, stage, state = {}, at = new Date().toISOString()) {
  const seen = new WeakSet();
  const codes = [];
  let errorName = "Error";
  let httpStatus = null;
  const walk = (value, depth) => {
    if (depth > 5 || value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (depth === 0 && typeof value.name === "string" && safeName.test(value.name))
      errorName = value.name;
    for (const field of ["code", "message"]) {
      const candidate = value[field];
      if (typeof candidate === "string" && knownCodes.has(candidate) && !codes.includes(candidate))
        codes.push(candidate);
    }
    if (httpStatus === null && Number.isInteger(value.status) && value.status >= 100 && value.status <= 599)
      httpStatus = value.status;
    for (const field of ["cause", "errors", "details", "data"])
      if (Array.isArray(value[field])) value[field].forEach((item) => walk(item, depth + 1));
      else walk(value[field], depth + 1);
  };
  walk(error, 0);
  const code = codes[0] ?? null;
  let classification = "UNKNOWN_RUNTIME_FAILURE";
  if (state.submissionAttempted && !state.hashReturned) classification = "BROADCAST_AMBIGUOUS";
  else if (code === "UNISWAP_LIVE_RUN_NOT_AUTHORIZED") classification = "EXECUTION_DISABLED";
  else if (code === "UNISWAP_NOT_ACCEPTED") classification = "EXECUTION_DISABLED";
  else if (code === "STALE_OR_WRONG_BUILD") classification = "STALE_OR_WRONG_BUILD";
  else if (code === "QUOTE_EXPIRED" || code === "UNISWAP_FRESH_QUOTE_MISMATCH") classification = "QUOTE_EXPIRED";
  else if (code?.startsWith("AUTONOMOUS_") || code === "UNISWAP_BROWSER_SIGNING_NOT_ARMED") classification = "SIGNER_REJECTED";
  else if (errorName === "TimeoutError" || code === "ETIMEDOUT") classification = stage.includes("rpc") ? "RPC_TIMEOUT" : "PREFLIGHT_FAILURE";
  else if (stage.includes("receipt") || code?.includes("VERIFICATION")) classification = "RECEIPT_FAILED";
  else if (stage.includes("wallet") || stage.includes("approval") || stage.includes("swap")) classification = "WALLET_PROVIDER_FAILURE";
  else if (stage.includes("preflight") || stage.includes("quote")) classification = "PREFLIGHT_FAILURE";
  return {
    stage, at, classification, errorName, safeCode: code,
    sanitizedCause: codes.length ? codes : ["REDACTED_UNKNOWN"], httpStatus,
    signingAttempted: state.signingAttempted === true,
    submissionAttempted: state.submissionAttempted === true,
    hashReturned: state.hashReturned === true,
  };
}
