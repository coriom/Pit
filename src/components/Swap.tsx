import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import {
  inspectCow,
  inspectSwap,
  submitSwap,
  approveSwap,
  costsDisplay,
  orderbook,
  quoteSwap,
  type SwapQuote,
} from "../lib/cow";
import { useExecutionPreflight } from "./useExecutionPreflight";
import { preflightMessage, PreflightError } from "../lib/execution-preflight";
export function Swap() {
  const { address, chainId } = useAccount();
  const { data: wallet } = useWalletClient();
  const [sell, setSell] = useState("");
  const [buy, setBuy] = useState("");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<SwapQuote>();
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [history, setHistory] = useState<{ uid: string; status: string }[]>([]);
  const revision = useRef(0);
  useEffect(() => {
    revision.current++;
    setQuote(undefined);
    setApproved(false);
    setError("");
    setStatus("");
  }, [address, chainId, sell, buy, amount]);
  useEffect(() => {
    let stopped = false;
    setHistory([]);
    if (!address || !chainId) return;
    const poll = async () => {
      try {
        const orders = await orderbook(chainId).getOrders({
          owner: address,
          limit: 50,
          offset: 0,
        });
        if (!stopped) setHistory(orders);
      } catch (e) {
        if (!stopped)
          setStatus(
            `History unavailable: ${e instanceof Error ? e.message : String(e)}`,
          );
      }
    };
    void poll();
    const id = setInterval(poll, 15000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [address, chainId, wallet]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const check = useCallback(async () => {
    if (!wallet) throw new PreflightError("DISCONNECTED");
    if (!quote) {
      await inspectCow(wallet, sell, buy, amount);
      throw new PreflightError("QUOTE_EXPIRED");
    }
    if (
      wallet.account?.address.toLowerCase() !== quote.owner.toLowerCase() ||
      wallet.chain?.id !== quote.chainId
    )
      throw new PreflightError("WALLET_CHANGED");
    await inspectSwap(quote);
  }, [wallet, quote, sell, buy, amount]);
  const gate = useExecutionPreflight(
    `${address}:${chainId}:${sell}:${buy}:${amount}:${quote?.obtainedAt}`,
    check,
  );
  return (
    <>
      <div className="row">
        <h2>Swap tokens</h2>
        <span className="tag">CoW Protocol</span>
      </div>
      <p className="muted">
        Ethereum Sepolia only (11155111), not Base Sepolia (84532) · 0.50%
        slippage
      </p>
      <label>
        Sell token address
        <input
          value={sell}
          onChange={(e) => setSell(e.target.value)}
          placeholder="ERC20 address on selected network"
        />
      </label>
      <label>
        You sell
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
        />
      </label>
      <label>
        Buy token address
        <input
          value={buy}
          onChange={(e) => setBuy(e.target.value)}
          placeholder="ERC20 address on selected network"
        />
      </label>
      <button
        className="primary"
        disabled={!wallet || busy}
        onClick={() =>
          act(async () => {
            const r = revision.current;
            const q = await quoteSwap(wallet!, sell, buy, amount);
            if (r === revision.current) {
              setQuote(q);
              setApproved(false);
            }
          })
        }
      >
        {busy ? "Working…" : "Get quote"}
      </button>
      {!wallet && <p className="empty">Connect your wallet to get started.</p>}
      <p data-testid="cow-preflight">
        {gate}: {preflightMessage[gate]}
      </p>
      {quote && (
        <div className="rule">
          {Object.entries(
            costsDisplay(
              quote.quoteResults.amountsAndCosts,
              quote.sellDecimals,
              quote.buyDecimals,
            ),
          ).map(([k, v]) => (
            <div className="row" key={k}>
              <small>{k}</small>
              <strong>{v}</strong>
            </div>
          ))}
          <small>
            Quote expires after 60 seconds. Token approval uses gas separately.
          </small>
          <button
            className="primary"
            disabled={busy || gate !== "GREEN"}
            onClick={() =>
              act(async () => {
                await check();
                if (!approved) {
                  await approveSwap(quote);
                  setApproved(true);
                } else {
                  const result = await submitSwap(quote);
                  setStatus(`Submitted: ${result.orderId}`);
                  setQuote(undefined);
                }
              })
            }
          >
            {approved ? "Sign & submit order" : "Approve exact sell amount"}
          </button>
          <details>
            <summary>Signed appData</summary>
            <pre>{quote.quoteResults.appDataInfo.fullAppData}</pre>
          </details>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p role="status">{status}</p>
      <div className="rule">
        <h3>Order history</h3>
        <small>From the orderbook · refreshes every 15 seconds</small>
        {history.length === 0 ? (
          <p className="empty">No orders to display.</p>
        ) : (
          history.map((o) => (
            <div className="row" key={o.uid} data-order-id={o.uid}>
              <small title={o.uid}>{o.uid.slice(0, 18)}…</small>
              <span>{o.status}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
