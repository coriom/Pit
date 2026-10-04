import { AcceptanceEvidenceProvider } from "./AcceptanceEvidence";
import { config } from "../lib/config";
import { FillRecorder } from "./FillRecorder";
import { Export } from "./Export";
import { useState } from "react";
import { Perps } from "./Perps";
import { Providers, Wallet } from "./Wallet";
import { Swap } from "./Swap";
export default function TradingApp() {
  const [tab, setTab] = useState("swap");
  return (
    <Providers>
      <AcceptanceEvidenceProvider
        protocol={tab === "swap" ? "cow" : "hyperliquid"}
      >
        <Wallet />
        <FillRecorder />
        <div className="grid" style={{ marginTop: 24 }}>
          <section className="panel">
            <div className="tabs">
              <button
                className={tab === "swap" ? "active" : ""}
                onClick={() => setTab("swap")}
              >
                Swap
              </button>
              <button
                className={tab === "perps" ? "active" : ""}
                onClick={() => setTab("perps")}
              >
                Perpetuals
              </button>
            </div>
            {tab === "swap" ? <Swap /> : <Perps />}
          </section>
          <aside className="panel">
            <div className="eyebrow">Execution, explained</div>
            <h2 style={{ marginTop: 20 }}>Every cost. Up front.</h2>
            <p>
              Your wallet signs. The protocol settles. PIT never holds your
              assets.
            </p>
            <div className="rule row">
              <span>PIT integrator fees</span>
              <span className="tag">{config.FEES_ENABLED ? "ON" : "OFF"}</span>
            </div>
            <div className="row">
              <small>Default swap fee when enabled</small>
              <span>{(config.partnerFeeBps / 100).toFixed(2)}%</span>
            </div>
            <div className="row">
              <small>Current network</small>
              <span>
                {config.FEES_ENABLED && config.MAINNET_ENABLED
                  ? "Mainnet swaps enabled"
                  : "Testnet only"}
              </span>
            </div>
            <div className="rule">
              <h3>A record you own</h3>
              <Export />
            </div>
          </aside>
        </div>
      </AcceptanceEvidenceProvider>
    </Providers>
  );
}
