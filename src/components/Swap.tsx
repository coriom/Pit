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
import {
  approveUniswap,
  inspectUniswapApproval,
  inspectUniswapExecution,
  invalidateUniswapQuote,
  quoteUniswapExecution,
  submitUniswap,
  UNISWAP_SEPOLIA,
  UNISWAP_EXECUTION_ACCEPTED,
  type UniswapExecutionQuote,
} from "../lib/uniswap-execution";
import { recordUniswapFill } from "../lib/uniswap-fill";
import { DiagnosticQuotes } from "./DiagnosticQuotes";
import { OperatorObserver } from "./OperatorObserver";
import { config } from "../lib/config";
import { storageEnabled } from "../lib/storage-policy";
import { cowOperatorReadiness, uniswapOperatorReadiness } from "../lib/operator-readiness";
import { ReadinessPanel } from "./ReadinessPanel";
import { OperatorCheckpoint } from "./OperatorCheckpoint";
import { useAcceptanceEvidence } from "./AcceptanceEvidence";
import { listAcceptanceEntries } from "../lib/acceptance-evidence";
export function Swap() {
  const { address, chainId } = useAccount();
  const evidence = useAcceptanceEvidence();
  const { data: wallet } = useWalletClient();
  const [sell, setSell] = useState("");
  const [buy, setBuy] = useState("");
  const [amount, setAmount] = useState("");
  const [venue, setVenue] = useState<"cow" | "uniswap-v3">("cow");
  const [quote, setQuote] = useState<SwapQuote>();
  const [uniswapQuote, setUniswapQuote] = useState<UniswapExecutionQuote>();
  const [uniswapApprovalNeeded, setUniswapApprovalNeeded] = useState(false);
  const [quoteEvidenceIdentity, setQuoteEvidenceIdentity] = useState("");
  const [comparison, setComparison] = useState<QuoteOutcome[]>([]);
  const [clock, setClock] = useState(Date.now());
  const [approved, setApproved] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [dryStage, setDryStage] = useState<"approval" | "order" | "done">(
    "approval",
  );
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
    invalidateUniswapQuote(uniswapQuote);
    setQuote(undefined);
    setUniswapQuote(undefined);
    setUniswapApprovalNeeded(false);
    setQuoteEvidenceIdentity("");
    setComparison([]);
    setApproved(false);
    setDryStage("approval");
    setError("");
    setStatus("");
  }, [address, chainId, sell, buy, amount, venue]);
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
        if (
          !stopped &&
          evidence.active?.protocol === "cow" &&
          evidence.active.account === address.toLowerCase()
        ) {
          const recorded = await listAcceptanceEntries(evidence.active);
          const submitted = new Set(
            recorded
              .filter((e) => e.data.kind === "cow-submission")
              .map((e) => (e.data as { orderUid: string }).orderUid),
          );
          for (const order of orders)
            if (submitted.has(order.uid)) {
              await evidence.capture(
                "cow",
                `status:${order.uid}:${order.status}`,
                {
                  kind: "cow-status",
                  orderUid: order.uid,
                  status: order.status,
                  settlementTxHash: null,
                },
              );
            }
        }
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
  }, [address, chainId, wallet, evidence.active?.id]);
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
    if (venue !== "cow") throw new PreflightError("QUOTE_EXPIRED");
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
  }, [venue, wallet, quote, sell, buy, amount]);
  const gate = useExecutionPreflight(
    `${address}:${chainId}:${sell}:${buy}:${amount}:${quote?.obtainedAt}`,
    check,
  );
  const checkUniswap = useCallback(async () => {
    if (venue !== "uniswap-v3") throw new PreflightError("QUOTE_EXPIRED");
    if (!wallet) throw new PreflightError("DISCONNECTED");
    if (!uniswapQuote) throw new PreflightError("QUOTE_EXPIRED");
    if (wallet.account?.address.toLowerCase() !== uniswapQuote.owner.toLowerCase() ||
        wallet.chain?.id !== uniswapQuote.chainId)
      throw new PreflightError("WALLET_CHANGED");
    if (sell.toLowerCase() !== uniswapQuote.sellToken.toLowerCase() ||
        buy.toLowerCase() !== uniswapQuote.buyToken.toLowerCase() ||
        !/^\d+(?:\.\d+)?$/.test(amount) ||
        parseUnits(amount, uniswapQuote.normalized.sellDecimals) !== uniswapQuote.sellAmount)
      throw new PreflightError("INVALID_EXECUTION_QUOTE");
    return inspectUniswapExecution(uniswapQuote);
  }, [venue, wallet, uniswapQuote, sell, buy, amount]);
  const uniswapGate = useExecutionPreflight(
    `${address}:${chainId}:${sell}:${buy}:${amount}:${uniswapQuote?.obtainedAt}`,
    checkUniswap,
  );
  const checkUniswapApproval = useCallback(async () => {
    if (venue !== "uniswap-v3" || !wallet || !uniswapQuote || !uniswapApprovalNeeded)
      throw new PreflightError("INVALID_EXECUTION_QUOTE");
    if (wallet.account?.address.toLowerCase() !== uniswapQuote.owner.toLowerCase() ||
        wallet.chain?.id !== uniswapQuote.chainId)
      throw new PreflightError("WALLET_CHANGED");
    if (sell.toLowerCase() !== uniswapQuote.sellToken.toLowerCase() ||
        buy.toLowerCase() !== uniswapQuote.buyToken.toLowerCase() ||
        !/^\d+(?:\.\d+)?$/.test(amount) ||
        parseUnits(amount, uniswapQuote.normalized.sellDecimals) !== uniswapQuote.sellAmount)
      throw new PreflightError("INVALID_EXECUTION_QUOTE");
    return inspectUniswapApproval(uniswapQuote);
  }, [venue, wallet, uniswapQuote, uniswapApprovalNeeded, sell, buy, amount]);
  const uniswapApprovalGate = useExecutionPreflight(
    `approval:${address}:${chainId}:${sell}:${buy}:${amount}:${uniswapQuote?.obtainedAt}:${uniswapApprovalNeeded}`,
    checkUniswapApproval,
  );
  const activeGate = venue === "cow" ? gate : uniswapGate;
  const readiness = cowOperatorReadiness({
    connected: !!wallet?.account,
    chainId,
    feesEnabled: config.FEES_ENABLED,
    mainnetEnabled: config.MAINNET_ENABLED,
    storage: storageEnabled(),
    sellToken: sell,
    buyToken: buy,
    gate,
    quotePresent: !!quote,
    quoteDiagnostic:
      (quote as { diagnosticOnly?: boolean } | undefined)?.diagnosticOnly ===
      true,
    quoteObtainedAt: quote?.obtainedAt,
    now: clock,
  });
  const uniswapReadiness = uniswapOperatorReadiness({
    connected: !!wallet?.account, chainId,
    feesEnabled: config.FEES_ENABLED, mainnetEnabled: config.MAINNET_ENABLED,
    storage: storageEnabled(), gate: uniswapGate,
    quotePresent: !!uniswapQuote, quoteExpiresAt: uniswapQuote?.expiresAt, now: clock,
  });
  const quoteIdentity = quote ? quoteEvidenceIdentity : "";
  const disclosure =
    quote && gate === "GREEN"
      ? costsDisplay(
          quote.quoteResults.amountsAndCosts,
          quote.sellDecimals,
          quote.buyDecimals,
        )
      : null;
  const action = dryRun
    ? dryStage === "approval"
      ? "token approval"
      : "order signature and submission"
    : approved
      ? "order signature and submission"
      : "token approval";
  const uniswapAction = uniswapApprovalNeeded ? "Uniswap exact token approval" : "Uniswap swap submission";
  const checkpointDetails = [
    "Protocol: CoW Protocol · Ethereum Sepolia (11155111)",
    `Account: ${address ?? "not connected"}`,
    `Assets: ${sell || "unknown"} → ${buy || "unknown"} · exact sell amount: ${amount || "unknown"}`,
    `Side: sell · expected protocol fee: ${disclosure?.["Protocol fee (buy token)"] ?? "UNKNOWN — obtain a fresh executable quote"} buy token`,
    `Expected solver network cost: ${disclosure?.["Network cost (sell token)"] ?? "UNKNOWN"} sell token; wallet approval gas is separate and unknown.`,
    `PIT fee: ${disclosure?.["Partner fee (buy token)"] ?? "0 configured; quote not validated"} buy token`,
    `Minimum receive: ${disclosure?.["Minimum receive (buy token)"] ?? "UNKNOWN"} buy token`,
    "Accounting on confirmed fill: Taxlot v1 trade; no Taxlot event on quote or submission alone.",
  ];
  return (
    <>
      <div className="row">
        <h2>Swap tokens</h2>
        <span className="tag">Best Swap · CoW and Uniswap v3</span>
      </div>
      <p className="muted">
        Ethereum Sepolia only (11155111), not Base Sepolia (84532) · 0.50%
        slippage
      </p>
      <DiagnosticQuotes />
      <OperatorObserver />
      <label>
        Executable venue
        <select aria-label="Executable venue" value={venue}
          onChange={(event) => setVenue(event.target.value as "cow" | "uniswap-v3")}>
          <option value="cow">CoW Protocol</option>
          <option value="uniswap-v3" disabled={!UNISWAP_EXECUTION_ACCEPTED}>
            Uniswap v3 · execution pending live acceptance
          </option>
        </select>
      </label>
      {!UNISWAP_EXECUTION_ACCEPTED && (
        <p className="notice">Uniswap v3 500-tier quotes are available for comparison; Uniswap wallet execution remains disabled pending testnet acceptance.</p>
      )}
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
            invalidateUniswapQuote(uniswapQuote);
            setQuote(undefined);
            setUniswapQuote(undefined);
            setUniswapApprovalNeeded(false);
            setQuoteEvidenceIdentity("");
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
            let uniswapCandidate: UniswapExecutionQuote | undefined;
            const outcomes = await collectQuotes(
              [
                cowQuoteProvider(async () => {
                  cowCandidate = await quoteSwap(wallet!, sell, buy, amount);
                  return cowCandidate;
                }),
                venue === "uniswap-v3"
                  ? { id: "uniswap-v3", quote: async () => {
                    uniswapCandidate = await quoteUniswapExecution(wallet!, sell, buy, amount);
                    return uniswapCandidate.normalized;
                  } } as ReturnType<typeof uniswapV3QuoteProvider>
                  : uniswapV3QuoteProvider(undefined, [500]),
              ],
              intent,
              venue === "uniswap-v3" ? 30000 : undefined,
            );
            if (r === revision.current && s === requestSequence.current) {
              setComparison(outcomes);
              setClock(Date.now());
              const executableAvailable = outcomes.some(
                (outcome) =>
                  outcome.provider === "cow" &&
                  outcome.availability === "available",
              );
              if (venue === "cow" && executableAvailable && cowCandidate) {
                const costs = cowCandidate.quoteResults.amountsAndCosts;
                const identity = `cowquote:${crypto.randomUUID()}`;
                await evidence.capture("cow", `quote:${identity}`, {
                  kind: "cow-quote",
                  quoteIdentity: identity,
                  sellToken: cowCandidate.sellToken,
                  buyToken: cowCandidate.buyToken,
                  sellBudget: cowCandidate.units.toString(),
                  expectedBuy: costs.afterSlippage.buyAmount.toString(),
                  pitPartnerFee:
                    costs.costs.partnerFee.amount.toString() as "0",
                  obtainedAt: new Date(cowCandidate.obtainedAt).toISOString(),
                });
                if (r !== revision.current || s !== requestSequence.current)
                  return;
                setQuoteEvidenceIdentity(identity);
              }
              setQuote(
                venue === "cow" && outcomes.some(
                  (outcome) =>
                    outcome.provider === "cow" &&
                    outcome.availability === "available",
                )
                  ? cowCandidate
                  : undefined,
              );
              if (venue === "uniswap-v3") {
                invalidateSwapQuote(cowCandidate);
                const uniswapAvailable = outcomes.some((outcome) =>
                  outcome.provider === "uniswap-v3" && outcome.availability === "available");
                if (uniswapAvailable && uniswapCandidate) {
                  setUniswapQuote(uniswapCandidate);
                  const checked = await inspectUniswapExecution(uniswapCandidate);
                  setUniswapApprovalNeeded(checked.allowance < uniswapCandidate.sellAmount);
                }
              }
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
      <p data-testid={venue === "cow" ? "cow-preflight" : "uniswap-preflight"}>
        {activeGate}: {preflightMessage[activeGate]}
      </p>
      <ReadinessPanel protocol={venue} items={venue === "cow" ? readiness : uniswapReadiness} />
      <label>
        <input
          type="checkbox"
          style={{ width: "auto", marginRight: 10 }}
          checked={dryRun}
          onChange={(event) => {
            setDryRun(event.target.checked);
            setDryStage("approval");
          }}
        />
        Dry run only · rehearse checkpoints without wallet signing or submission
      </label>
      {dryRun && (
        <p data-testid="cow-dry-run-stage">
          Dry-run stage: {dryStage}. No wallet action is possible.
        </p>
      )}
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
                          <p>{outcome.provider === venue &&
                            (venue === "cow" ? !!quote : !!uniswapQuote)
                            ? "Selected execution route; review its separate wallet checkpoint below."
                            : "Comparison quote only; select this venue and request a new wallet-bound quote to execute."}</p>
                        </>
                      );
                    })()
                  )}
                </div>
              ))}
              <p data-testid="quote-ranking">
                {ranking.comparable
                  ? `Best quoted output (separately paid gas excluded; cost coverage differs): ${ranking.bestProviderIds.join(" and ")}. Select a venue explicitly before execution.`
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
          <details>
            <summary>Signed appData</summary>
            <pre>{quote.quoteResults.appDataInfo.fullAppData}</pre>
          </details>
        </div>
      )}
      {uniswapQuote && venue === "uniswap-v3" && (
        <div className="rule" data-testid="uniswap-execution-economics">
          <h3>Uniswap wallet-paid swap economics</h3>
          <p>Router: {UNISWAP_SEPOLIA.router} · pool: {uniswapQuote.pool} · fee tier: 500</p>
          <p>Exact input: {uniswapQuote.sellAmount.toString()} base units. Quoted output: {uniswapQuote.expectedBuy.toString()} base units.</p>
          <p>Minimum received after 0.50% slippage: {uniswapQuote.minimumBuy.toString()} base units.</p>
          <p>Pool fee is included in quoted output. Wallet swap gas and any approval gas are paid separately in Sepolia ETH; they are not included in route ranking.</p>
          <p>PIT fee: 0. Quote expires: {new Date(uniswapQuote.expiresAt).toISOString()}.</p>
          <p>Approval required: {uniswapApprovalNeeded ? "YES — exact sell amount only" : "NO"}.</p>
          {uniswapApprovalNeeded && <p>Token approval is a separate exact-amount action. A new wallet-bound quote is required after confirmation; this quote never authorizes the later swap.</p>}
        </div>
      )}
      {venue === "uniswap-v3" && uniswapApprovalNeeded && uniswapQuote && (
        <p data-testid="uniswap-approval-preflight">{uniswapApprovalGate}: {preflightMessage[uniswapApprovalGate]}</p>
      )}
      {venue === "cow" && (quote || dryRun) && (!dryRun || dryStage !== "done") && (
        <OperatorCheckpoint
          key={`${address}:${chainId}:${sell}:${buy}:${amount}:${quote?.obtainedAt}:${approved}:${dryRun}:${dryStage}`}
          action={action}
          details={checkpointDetails}
          gate={gate}
          dryRun={dryRun}
          busy={busy}
          onDryRun={() =>
            setDryStage(dryStage === "approval" ? "order" : "done")
          }
          onConfirm={async () => {
            await evidence.capture("cow", `checkpoint:${crypto.randomUUID()}`, {
              kind: "readiness",
              items: readiness.map(({ id, status }) => ({ id, status })),
            });
            await evidence.capture("cow", `checkpoint:${crypto.randomUUID()}`, {
              kind: "checkpoint",
              action: approved ? "cow-order" : "cow-approval",
              confirmed: true,
            });
            await act(async () => {
              await check();
              if (!quote) throw new PreflightError("INVALID_EXECUTION_QUOTE");
              if (!approved) {
                await approveSwap(quote);
                setApproved(true);
                await evidence.capture("cow", `approval:${quoteIdentity}`, {
                  kind: "cow-approval",
                  quoteIdentity,
                  outcome: "completed",
                });
              } else {
                const result = await submitSwap(quote);
                setStatus(`Submitted: ${result.orderId}`);
                await evidence.capture("cow", `submission:${result.orderId}`, {
                  kind: "cow-submission",
                  quoteIdentity,
                  orderUid: result.orderId,
                  pitPartnerFee: "0",
                });
                setQuote(undefined);
                setQuoteEvidenceIdentity("");
              }
            });
          }}
        />
      )}
      {venue === "uniswap-v3" && uniswapQuote && (
        <OperatorCheckpoint
          key={`${uniswapQuote.obtainedAt}:${uniswapApprovalNeeded}`}
          action={uniswapAction}
          details={[
            "Uniswap v3 · Ethereum Sepolia 11155111 · exact 500-tier pool",
            `Wallet: ${uniswapQuote.owner}`,
            `Sell: ${uniswapQuote.sellAmount} base units of ${uniswapQuote.sellToken}`,
            ...(uniswapApprovalNeeded ? [
              `Exact ERC-20 spender: ${UNISWAP_SEPOLIA.router}`,
              "Approval changes allowance only; obtain a new quote before any swap.",
              "Wallet approval gas is paid separately in Sepolia ETH; PIT fee: 0",
            ] : [
              `Quoted receive: ${uniswapQuote.expectedBuy} base units of ${uniswapQuote.buyToken}`,
              `Minimum receive: ${uniswapQuote.minimumBuy} base units`,
              "Pool fee: 500 ppm, included in quote; wallet gas paid separately; PIT fee: 0",
              `Quote expiry: ${new Date(uniswapQuote.expiresAt).toISOString()}`,
            ]),
            "Only a confirmed swap produces a Taxlot spot trade.",
          ]}
          gate={uniswapApprovalNeeded ? uniswapApprovalGate : uniswapGate} dryRun={dryRun} busy={busy}
          onDryRun={() => setDryStage("done")}
          onConfirm={async () => {
            await act(async () => {
              if (uniswapApprovalNeeded) {
                await checkUniswapApproval();
                const hash = await approveUniswap(uniswapQuote);
                setStatus(hash
                  ? `Exact Uniswap approval confirmed: ${hash}. Request a fresh quote before swapping.`
                  : "Uniswap allowance already sufficient. Request a fresh quote before swapping.");
                setUniswapQuote(undefined);
              } else {
                await checkUniswap();
                const result = await submitUniswap(uniswapQuote);
                setStatus(`Uniswap Sepolia swap confirmed: ${result.hash}. Reconciling Taxlot…`);
                const fill = await recordUniswapFill(uniswapQuote, result.receipt, result.client);
                setStatus(`Uniswap swap ${result.hash} recorded as Taxlot trade ${fill.event.id}; wallet gas ${fill.gasWei} wei; PIT fee 0.`);
                setUniswapQuote(undefined);
              }
            });
          }}
        />
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
