import { useCallback, useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import {
  inspectPerp,
  approveBuilder,
  builderRate,
  hlInfo,
  hlTransport,
  placePerp,
  readPerps,
} from "../lib/hyperliquid";
import { config } from "../lib/config";
import { useExecutionPreflight } from "./useExecutionPreflight";
import { preflightMessage } from "../lib/execution-preflight";
import { HL_RELEASE } from "../lib/execution-preflight";
import { storageEnabled } from "../lib/storage-policy";
import { perpOperatorReadiness } from "../lib/operator-readiness";
import { ReadinessPanel } from "./ReadinessPanel";
import { OperatorCheckpoint } from "./OperatorCheckpoint";
import { useAcceptanceEvidence } from "./AcceptanceEvidence";
import {
  hyperliquidSubmissionIdentity,
  listAcceptanceEntries,
} from "../lib/acceptance-evidence";
export function Perps() {
  const { address } = useAccount();
  const evidence = useAcceptanceEvidence();
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
  const [dryRun, setDryRun] = useState(false);
  const [dryRunDone, setDryRunDone] = useState(false);
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
        if (
          !stopped &&
          evidence.active?.protocol === "hyperliquid" &&
          evidence.active.account === address.toLowerCase()
        ) {
          const entries = await listAcceptanceEntries(evidence.active);
          const submissions = entries.filter(
            (e) =>
              e.data.kind === "hyperliquid-submission" &&
              e.data.orderId !== null,
          );
          for (const submission of submissions) {
            const orderId = (submission.data as { orderId: string }).orderId;
            if (
              entries.some(
                (e) =>
                  e.data.kind === "hyperliquid-status" &&
                  e.data.orderId === orderId &&
                  e.data.status !== "open",
              )
            )
              continue;
            const result = await hlInfo.orderStatus({
              user: address,
              oid: orderId,
            });
            if (result.status !== "order") continue;
            const market = (submission.data as { market: string }).market;
            const positionSize =
              next.positions.assetPositions.find(
                (p) => p.position.coin === market,
              )?.position.szi ?? null;
            await evidence.capture(
              "hyperliquid",
              `status:${orderId}:${result.order.status}`,
              {
                kind: "hyperliquid-status",
                orderId,
                status: result.order.status,
                positionSize,
                openOrder: next.orders.some((o) => String(o.oid) === orderId),
                observedAt: new Date(
                  result.order.statusTimestamp,
                ).toISOString(),
              },
            );
          }
        }
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
  }, [address, evidence.active?.id]);
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
  useEffect(
    () => setDryRunDone(false),
    [address, asset, buy, price, size, reduce],
  );
  const readiness = perpOperatorReadiness({
    connected: !!wallet?.account,
    feesEnabled: config.FEES_ENABLED,
    mainnetEnabled: config.MAINNET_ENABLED,
    storage: storageEnabled(),
    testnetEnvironment:
      hlTransport.isTestnet === true &&
      String(hlTransport.apiUrl) === HL_RELEASE.apiUrl &&
      String(hlTransport.rpcUrl) === HL_RELEASE.rpcUrl,
    gate,
    marketSelected: !!markets[asset],
  });
  const action = reduce ? "reduce-only position close" : "testnet limit order";
  const checkpointDetails = [
    "Protocol: Hyperliquid · exact testnet API and execution environment",
    `Account: ${address ?? "not connected"}`,
    `Market: ${markets[asset]?.name ?? "UNKNOWN"} / USDC · side: ${buy ? "Buy / Long" : "Sell / Short"}`,
    `Size: ${size || "UNKNOWN"} ${markets[asset]?.name ?? "base asset"} · limit price: ${price || "UNKNOWN"} USDC · reduce only: ${reduce ? "yes" : "no"}`,
    "Expected exchange trading fee: UNKNOWN until exchange fill; PIT builder fee: 0% (disabled).",
    "Accounting on confirmed fill: raw derivative evidence, taxlot_status = unsupported_derivative_v1; no Taxlot event or CSV row.",
  ];
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
      <p data-testid="hl-preflight">
        {gate}: {preflightMessage[gate]}
      </p>
      <ReadinessPanel protocol="hyperliquid" items={readiness} />
      <label>
        <input
          type="checkbox"
          style={{ width: "auto", marginRight: 10 }}
          checked={dryRun}
          onChange={(event) => {
            setDryRun(event.target.checked);
            setDryRunDone(false);
          }}
        />
        Dry run only · rehearse the order checkpoint without wallet signing or
        submission
      </label>
      {dryRun && (
        <p data-testid="hl-dry-run-stage">
          Dry-run stage: {dryRunDone ? "preview complete" : "order review"}. No
          wallet action is possible.
        </p>
      )}
      {(!dryRun || !dryRunDone) && (
        <OperatorCheckpoint
          key={`${address}:${asset}:${buy}:${price}:${size}:${reduce}:${dryRun}`}
          action={action}
          details={checkpointDetails}
          gate={gate}
          dryRun={dryRun}
          busy={busy}
          onDryRun={() => setDryRunDone(true)}
          onConfirm={async () => {
            await evidence.capture(
              "hyperliquid",
              `checkpoint:${crypto.randomUUID()}`,
              {
                kind: "readiness",
                items: readiness.map(({ id, status }) => ({ id, status })),
              },
            );
            await evidence.capture(
              "hyperliquid",
              `checkpoint:${crypto.randomUUID()}`,
              {
                kind: "checkpoint",
                action: reduce ? "hyperliquid-close" : "hyperliquid-order",
                confirmed: true,
              },
            );
            await act(async () => {
              const result = await placePerp(
                wallet!,
                asset,
                buy,
                price,
                size,
                reduce,
              );
              const identity = hyperliquidSubmissionIdentity(result);
              await evidence.capture(
                "hyperliquid",
                `submission:${identity.orderId ?? crypto.randomUUID()}`,
                {
                  kind: "hyperliquid-submission",
                  market: markets[asset]?.name ?? "unknown",
                  side: buy ? "buy" : "sell",
                  size,
                  limitPrice: price,
                  reduceOnly: reduce,
                  orderId: identity.orderId,
                  status: identity.status,
                  pitBuilderFee: "0",
                  taxlotStatus: "unsupported_derivative_v1",
                },
              );
              return result;
            });
          }}
        />
      )}
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
