import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import {
  inspectCow,
  inspectSwap,
  invalidateSwapQuote,
  submitSwap,
  approveSwap,
  costsDisplay,
  orderbook,
  quoteSwap,
  type SwapQuote,
} from "../lib/cow";
import { useExecutionPreflight } from "./useExecutionPreflight";
import { preflightMessage, PreflightError } from "../lib/execution-preflight";
import { isAddress, parseUnits } from "viem";
import {
  collectQuotes,
  cowQuoteProvider,
  displayQuote,
  rankQuotedOutput,
  type QuoteOutcome,
  type QuoteIntent,
} from "../lib/swap-quotes";
import { uniswapV3QuoteProvider } from "../lib/uniswap-quote";
import { DiagnosticQuotes } from "./DiagnosticQuotes";
export function Swap() {
  const { address, chainId } = useAccount();
  const { data: wallet } = useWalletClient();
  const [sell, setSell] = useState("");
  const [buy, setBuy] = useState("");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<SwapQuote>();
  const [comparison, setComparison] = useState<QuoteOutcome[]>([]);
  const [clock, setClock] = useState(Date.now());
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [history, setHistory] = useState<{ uid: string; status: string }[]>([]);
  const revision = useRef(0);
  const requestSequence = useRef(0);
  useEffect(() => {
    revision.current++;
    requestSequence.current++;
    invalidateSwapQuote(quote);
    setQuote(undefined);
    setComparison([]);
    setApproved(false);
    setError("");
    setStatus("");
  }, [address, chainId, sell, buy, amount]);
  useEffect(() => {
    if (!comparison.length) return;
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, [comparison]);
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
    if (
      sell.toLowerCase() !== quote.sellToken.toLowerCase() ||
      buy.toLowerCase() !== quote.buyToken.toLowerCase() ||
      !/^\d+(?:\.\d+)?$/.test(amount) ||
      (() => {
        try {
          return parseUnits(amount, quote.sellDecimals) !== quote.units;
        } catch {
          return true;
        }
      })()
    )
      throw new PreflightError("INVALID_EXECUTION_QUOTE");
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
      <DiagnosticQuotes />
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
            const s = ++requestSequence.current;
            invalidateSwapQuote(quote);
            setQuote(undefined);
            setApproved(false);
            if (
              !isAddress(sell) ||
              !isAddress(buy) ||
              sell.toLowerCase() === buy.toLowerCase()
            )
              throw new PreflightError("UNSUPPORTED_ASSETS");
            if (chainId !== 11155111) throw new PreflightError("WRONG_CHAIN");
            const intent: QuoteIntent = {
              chainId,
              sellToken: sell,
              buyToken: buy,
              sellAmountText: amount,
              direction: "exact-in",
            };
            let cowCandidate: SwapQuote | undefined;
            const outcomes = await collectQuotes(
              [
                cowQuoteProvider(async () => {
                  cowCandidate = await quoteSwap(wallet!, sell, buy, amount);
                  return cowCandidate;
                }),
                uniswapV3QuoteProvider(),
              ],
              intent,
            );
            if (r === revision.current && s === requestSequence.current) {
              setComparison(outcomes);
              setClock(Date.now());
              setQuote(
                outcomes.some(
                  (outcome) =>
                    outcome.provider === "cow" &&
                    outcome.availability === "available",
                )
                  ? cowCandidate
                  : undefined,
              );
              setApproved(false);
              if (
                outcomes.every(
                  (outcome) => outcome.availability === "unavailable",
                )
              )
                setError(
                  "No Sepolia venue quote is available for these inputs.",
                );
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
      {comparison.length > 0 &&
        (() => {
          const ranking = rankQuotedOutput(comparison, clock);
          return (
            <section className="rule" data-testid="quote-comparison">
              <h3>Same-input venue quotes</h3>
              <p className="muted">
                Same total sell-token debit budget. Quoted output includes
                venue-specific embedded fees, but cost coverage differs.
                Separate wallet gas is unknown and excluded; no cross-token gas
                conversion is assumed.
              </p>
              {comparison.map((outcome) => (
                <div
                  className="panel"
                  data-testid={`quote-${outcome.provider}`}
                  key={outcome.provider}
                >
                  <h4>
                    {outcome.provider === "cow" ? "CoW Protocol" : "Uniswap v3"}{" "}
                    · {outcome.availability}
                  </h4>
                  {outcome.availability === "unavailable" ? (
                    <p>{outcome.reason}</p>
                  ) : (
                    (() => {
                      const detail = displayQuote(outcome.quote, clock);
                      return (
                        <>
                          <p>Quoted output: {detail.output} buy token</p>
                          <p>Sell budget: {detail.budget} sell token</p>
                          <p>
                            Quoted swap input: {detail.swapInput} sell token
                          </p>
                          <p>Path: {detail.pool}</p>
                          <p>Protocol/provider fee: {detail.protocolFee}</p>
                          <p>Estimated gas: {detail.gas}</p>
                          <p>Network cost: {detail.networkCost}</p>
                          <p>PIT fee: {detail.pitFee}</p>
                          <p>Quote age: {detail.age}</p>
                          <p>
                            {outcome.quote.executableThroughPit
                              ? "CoW execution available only through its separate preflight below."
                              : "Quote-only: PIT cannot execute this Uniswap quote."}
                          </p>
                        </>
                      );
                    })()
                  )}
                </div>
              ))}
              <p data-testid="quote-ranking">
                {ranking.comparable
                  ? `Best quoted output (separately paid gas excluded; cost coverage differs): ${ranking.bestProviderIds.join(" and ")}${ranking.bestProviderIds.includes("uniswap-v3") ? ". Uniswap is quote-only; PIT cannot execute it." : "."}`
                  : ranking.fresh.length === 1
                    ? "Only one fresh quote; no best-output comparison."
                    : ranking.fresh.length === 0
                      ? "No fresh quote available."
                      : `Quotes cannot be compared: ${ranking.reason}.`}
              </p>
            </section>
          );
        })()}
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
