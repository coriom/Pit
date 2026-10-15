import type { ReadinessItem } from "../lib/operator-readiness";

export function ReadinessPanel({
  protocol,
  items,
}: {
  protocol: "cow" | "hyperliquid" | "uniswap-v3";
  items: readonly ReadinessItem[];
}) {
  return (
    <section className="rule" data-testid={`${protocol}-readiness`}>
      <h3>Operator readiness · read only</h3>
      <p className="muted">
        PASS confirms a checked fact; UNKNOWN needs a fresh read. This panel
        never requests a signature.
      </p>
      {items.map((entry) => (
        <div
          className="row"
          key={entry.id}
          data-testid={`${protocol}-readiness-${entry.id}`}
        >
          <span>
            <strong>{entry.status}</strong> · {entry.label}
            <small style={{ display: "block" }}>{entry.detail}</small>
          </span>
        </div>
      ))}
    </section>
  );
}
