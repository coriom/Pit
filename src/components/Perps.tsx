import { useCallback, useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import {
  inspectPerp,
  approveBuilder,
  builderRate,
  hlInfo,
  placePerp,
  readPerps,
} from "../lib/hyperliquid";
import { config } from "../lib/config";
import { useExecutionPreflight } from "./useExecutionPreflight";
import { preflightMessage } from "../lib/execution-preflight";
export function Perps() {
  const { address } = useAccount();
  const { data: wallet } = useWalletClient();
  const [markets, setMarkets] = useState<
    { name: string; szDecimals: number }[]
  >([]);
  const [asset, setAsset] = useState(0);
  const [buy, setBuy] = useState(true);
  const [price, setPrice] = useState("");
  const [size, setSize] = useState("");
  const [reduce, setReduce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<Awaited<ReturnType<typeof readPerps>>>();
  useEffect(() => {
    hlInfo
      .meta()
      .then((m) => setMarkets(m.universe))
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    let stopped = false;
    setData(undefined);
    setStatus("");
    if (!address) return;
    const poll = async () => {
      try {
        const next = await readPerps(address);
        if (!stopped) setData(next);
      } catch (e) {
        if (!stopped) setError(String(e));
      }
    };
    void poll();
    const id = setInterval(poll, 15000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [address]);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      setStatus(JSON.stringify(await fn()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const check = useCallback(
    () => inspectPerp(wallet, asset, buy, price, size, reduce),
    [wallet, asset, buy, price, size, reduce],
  );
  const gate = useExecutionPreflight(
    `${address}:${asset}:${buy}:${price}:${size}:${reduce}`,
    check,
  );
  return (
    <>
      <div className="row">
        <h2>Perpetuals</h2>
        <span className="tag">Hyperliquid testnet</span>
      </div>
      <p>Limit orders · Main wallet signatures · No agent keys</p>
      <label>
        Market
        <select
          value={asset}
          onChange={(e) => setAsset(Number(e.target.value))}
        >
          {markets.map((m, i) => (
            <option value={i} key={m.name}>
              {m.name} / USDC
            </option>
          ))}
        </select>
      </label>
      <div className="tabs">
        <button className={buy ? "active" : ""} onClick={() => setBuy(true)}>
          Buy / Long
        </button>
        <button className={!buy ? "active" : ""} onClick={() => setBuy(false)}>
          Sell / Short
        </button>
      </div>
      <label>
        Limit price (USDC)
        <input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0.00"
        />
      </label>
      <label>
        Size ({markets[asset]?.name ?? "base asset"})
        <input
          inputMode="decimal"
          value={size}
          onChange={(e) => setSize(e.target.value)}
          placeholder="0.00"
        />
      </label>
      <label>
        <input
          style={{ width: "auto", marginRight: 10 }}
          type="checkbox"
          checked={reduce}
          onChange={(e) => setReduce(e.target.checked)}
        />
        Reduce only
      </label>
      <div className="row">
        <small>PIT builder fee</small>
        <strong>
          {config.FEES_ENABLED
            ? builderRate(config.builderFeeTenthsBps)
            : "0% · disabled"}
        </strong>
      </div>
      {config.FEES_ENABLED && (
        <button
          disabled={true}
          onClick={() => act(() => approveBuilder(wallet!))}
        >
          Approve builder fee
        </button>
      )}
      <button
        className="primary"
        disabled={busy || gate !== "GREEN"}
        onClick={() =>
          act(() => placePerp(wallet!, asset, buy, price, size, reduce))
        }
      >
        {busy ? "Waiting…" : "Sign & place limit order"}
      </button>
      <p data-testid="hl-preflight">
        {gate}: {preflightMessage[gate]}
      </p>
      {!wallet && (
        <p className="empty">Connect your wallet to trade test assets.</p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {status && <pre role="status">{status}</pre>}
      <div className="rule">
        {(["positions", "orders", "fills", "funding"] as const).map((k) => (
          <details key={k}>
            <summary>
              {k === "orders"
                ? "Open orders"
                : k === "funding"
                  ? "Funding · last 30 days"
                  : k}
            </summary>
            <pre>
              {data
                ? JSON.stringify(data[k], null, 2)
                : "Connect wallet to load public account data."}
            </pre>
          </details>
        ))}
      </div>
    </>
  );
}
