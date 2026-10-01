import { FillRecorder } from "./FillRecorder";
import { Export } from "./Export";
import { Perps } from "./Perps";
import { Providers, Wallet } from "./Wallet";
import { Swap } from "./Swap";

export default function TradeTool({ kind }: { kind: "swap" | "perps" }) {
  return (
    <Providers>
      <Wallet />
      <FillRecorder />
      <div className="grid" style={{ marginTop: 24 }}>
        <section className="panel">
          {kind === "swap" ? <Swap /> : <Perps />}
        </section>
        <aside className="panel">
          <h2>Your local records</h2>
          <Export />
        </aside>
      </div>
    </Providers>
  );
}
