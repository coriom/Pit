import { useEffect, useState } from "react";
import { formatUnits, isAddress } from "viem";
import {
  OBSERVER_INTENT,
  observeCowOperator,
  type OperatorObservation,
} from "../lib/operator-observer";
import { storageEnabled } from "../lib/storage-policy";

const loopback = () =>
  typeof location !== "undefined" &&
  ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) &&
  ["http:", "https:"].includes(location.protocol);

/** Public-address reads only. This component imports no wallet or execution API. */
export function OperatorObserver() {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<OperatorObservation>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    if (!result) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [result]);
  if (!loopback()) return null;
  const quoteFresh = !!result?.quote && result.quote.expiresAtMs > clock;
  return (
    <section className="rule" data-testid="operator-observer">
      <h3>Local operator observer · read only</h3>
      <p className="muted">
        Enter a public address to check Ethereum Sepolia balances, CoW allowance
        and a diagnostic-only CoW quote for 1 test USDC → WETH. No wallet
        connection, approval, signature or order is requested. The quote cannot
        be executed through PIT; wallet execution requires its own fresh quote
        and GREEN preflight.
      </p>
      <label>
        Public EVM address
        <input
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
            setResult(undefined);
          }}
          placeholder="0x…"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <button
        disabled={busy || !isAddress(address)}
        onClick={async () => {
          setBusy(true);
          setError("");
          setResult(undefined);
          try {
            setResult(
              await observeCowOperator(address, undefined, undefined, {
                origin: location.origin,
                storage: storageEnabled()
                  ? {
                      status: "UNKNOWN",
                      evidence: `Origin ${location.origin} is policy-allowed; IndexedDB writability requires the wallet execution preflight`,
                    }
                  : {
                      status: "FAIL",
                      evidence: `Origin ${location.origin} is not approved for accounting storage`,
                    },
              }),
            );
            setClock(Date.now());
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Reading…" : "Observe public address"}
      </button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div data-testid="operator-observer-result">
          <p>
            <strong>
              {result.observerReady && quoteFresh
                ? "OBSERVER READY"
                : "OBSERVER BLOCKED"}
            </strong>{" "}
            · WALLET EXECUTION READY: NO
          </p>
          <p>Address: {result.account}</p>
          <p>Browser origin: {result.browserOrigin ?? "not observed"}</p>
          <p>
            RPC block: {result.block?.number ?? "UNKNOWN"} · observed at{" "}
            {result.observedAt}
          </p>
          <p>
            ETH:{" "}
            {result.ethWei === null
              ? "UNKNOWN"
              : formatUnits(BigInt(result.ethWei), 18)}{" "}
            · test USDC:{" "}
            {result.sellBalance === null
              ? "UNKNOWN"
              : formatUnits(
                  BigInt(result.sellBalance),
                  OBSERVER_INTENT.sellDecimals,
                )}{" "}
            · WETH:{" "}
            {result.buyBalance === null
              ? "UNKNOWN"
              : formatUnits(
                  BigInt(result.buyBalance),
                  OBSERVER_INTENT.buyDecimals,
                )}
          </p>
          <p>
            Allowance: {result.allowance ?? "UNKNOWN"} base units · approval
            required:{" "}
            {result.approvalRequired === null
              ? "UNKNOWN"
              : result.approvalRequired
                ? "yes"
                : "no"}
          </p>
          <p>Approval target: {OBSERVER_INTENT.approvalTarget}</p>
          <p>
            Estimated approval gas: {result.approvalGasUnits ?? "UNKNOWN"} units
          </p>
          {result.quote ? (
            <div data-testid="operator-observer-quote">
              <p>
                CoW quote ID: {result.quote.id ?? "not returned"} · verified:
                yes · diagnostic only
              </p>
              <p>Sell: {result.quote.sellAmount} test USDC base units</p>
              <p>
                Quoted swap input: {result.quote.swapInputSellAmount} test USDC
                base units
              </p>
              <p>Expected buy: {result.quote.buyAmount} WETH base units</p>
              <p>
                Protocol fee: {result.quote.protocolFee.amount ?? "UNKNOWN"}{" "}
                WETH base units, embedded in output
              </p>
              <p>
                CoW network cost:{" "}
                {result.quote.networkCostSellAmount ?? "UNKNOWN"} test USDC base
                units, embedded in sell budget
              </p>
              <p>PIT fee: {result.quote.pitFeeBuyAmount} WETH base units</p>
              <p>
                Minimum receive:{" "}
                {result.quote.minimumReceiveBuyAmount ?? "UNKNOWN"} WETH base
                units
              </p>
              <p>
                Quote age:{" "}
                {Math.max(
                  0,
                  Math.floor((clock - result.quote.quotedAtMs) / 1000),
                )}{" "}
                seconds · {quoteFresh ? "fresh" : "expired"} · expires{" "}
                {new Date(result.quote.expiresAtMs).toISOString()}
              </p>
            </div>
          ) : (
            <p>
              CoW quote unavailable:{" "}
              {result.quoteError ?? "prerequisite read incomplete"}
            </p>
          )}
          {result.handoff && quoteFresh && (
            <div data-testid="operator-handoff">
              <h4>
                ACTION REQUIRED —{" "}
                {result.handoff.action === "ERC20_APPROVAL"
                  ? "ERC-20 APPROVAL"
                  : "COW ORDER REVIEW"}
              </h4>
              <p>Wallet: {result.handoff.wallet}</p>
              <p>Network: {result.handoff.network}</p>
              <p>Token: {result.handoff.token}</p>
              <p>Spender: {result.handoff.spender}</p>
              <p>
                Required allowance: {result.handoff.requiredAllowance} base
                units
              </p>
              <p>
                Current allowance: {result.handoff.currentAllowance} base units
              </p>
              <p>
                Estimated approval gas:{" "}
                {result.handoff.estimatedApprovalGasUnits ?? "not required"}{" "}
                units
              </p>
              <p>
                No approval or order has been submitted. Obtain a new
                wallet-bound executable quote and GREEN preflight before any
                manual wallet prompt.
              </p>
            </div>
          )}
          <h4>Read-only prerequisite snapshot</h4>
          {result.readiness.map((entry) => (
            <p key={entry.id}>
              {entry.status} · {entry.label}: {entry.detail}
            </p>
          ))}
          <p>{result.nextAction}</p>
        </div>
      )}
    </section>
  );
}
