import { useState } from "react";
import { probeDiagnosticMarket } from "../lib/diagnostic-quotes";
import { quoteMarkets } from "../lib/quote-markets";
import { displayQuote } from "../lib/swap-quotes";

type Result = Awaited<ReturnType<typeof probeDiagnosticMarket>>;

/** Separate read path. No wallet, execution quote, approval, or order callback enters here. */
export function DiagnosticQuotes() {
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const market = quoteMarkets[0];
  return (
    <section className="rule" data-testid="diagnostic-quotes">
      <h3>Sepolia market read</h3>
      <p className="muted">
        Read-only diagnostic for {market.sell.displaySymbol} → test{" "}
        {market.buy.displaySymbol}. Uses a synthetic public address, not your
        wallet. These quotes cannot be signed or executed through PIT. Test
        tokens have no implied dollar value.
      </p>
      <p>
        Sell budget: {market.sellAmounts[0]} WETH · selected Uniswap v3 fee
        tiers: 0.05% and 0.3%
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          setResult(undefined);
          try {
            setResult(await probeDiagnosticMarket(market, 0));
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        Read market quotes
      </button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div data-testid="diagnostic-result">
          <p>Status: {result.status}</p>
          {result.outcomes.map((outcome) => (
            <div key={outcome.provider}>
              <strong>{outcome.provider}</strong>:{" "}
              {outcome.availability === "available"
                ? `${displayQuote(outcome.quote).output} test USDC quoted output (diagnostic only)`
                : `${outcome.reason} — ${result.classes.find((item) => item.provider === outcome.provider)?.classification}`}
            </div>
          ))}
          <p>
            {result.ranking.comparable
              ? `Best quoted output, excluding separate gas: ${result.ranking.bestProviderIds.join(" and ")}. Neither diagnostic quote is executable.`
              : "No comparable pair of fresh quotes; no winner."}
          </p>
        </div>
      )}
    </section>
  );
}
