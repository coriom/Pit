import { storageEnabled, STORAGE_WARNING } from "../lib/storage-policy";
import { useEffect, useState } from "react";
import { useWalletClient } from "wagmi";
import { createPublicClient, custom, erc20Abi } from "viem";
import { orderbook } from "../lib/cow";
import { hlInfo } from "../lib/hyperliquid";
import { recordCowFill } from "../lib/record-fills";
import { recordPerpFills, recordPerpFunding } from "../lib/derivative-evidence";
import { eventDB, eventsCSV, listEvents } from "../lib/events";
import { listDerivativeEvidence } from "../lib/derivative-evidence";
import {
  reconcileCow,
  reconcileHyperliquid,
} from "../lib/acceptance-reconcile";
import { useAcceptanceEvidence } from "./AcceptanceEvidence";
export function FillRecorder() {
  const { data: wallet } = useWalletClient();
  const evidence = useAcceptanceEvidence();
  const [status, setStatus] = useState("Connect wallet to sync filled trades.");
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    if (!storageEnabled()) {
      setStatus(STORAGE_WARNING);
      return;
    }
    if (!wallet?.account || !wallet.chain) {
      setStatus("Connect wallet to sync filled trades.");
      return;
    }
    const user = wallet.account.address,
      chainId = wallet.chain.id;
    async function sync() {
      const failures: string[] = [];
      const tasks = [
        async () => {
          const book = orderbook(chainId);
          const provider = createPublicClient({
            transport: custom({ request: wallet!.request }),
          });
          for (let offset = 0; !stopped; offset += 100) {
            const fills = await book.getTrades({
              owner: user,
              offset,
              limit: 100,
            });
            for (const fill of fills) {
              if (stopped) return;
              await recordCowFill(fill, chainId, provider);
              if (
                evidence.active?.protocol === "cow" &&
                evidence.active.account === user.toLowerCase() &&
                chainId === 11155111
              ) {
                const id = `cow:${chainId}:${fill.orderUid}:${fill.blockNumber}:${fill.logIndex}`;
                const stored = (await listEvents(user)).find(
                  (event) => event.id === id,
                );
                if (
                  stored &&
                  Date.parse(stored.timestamp) >=
                    Date.parse(evidence.active.startedAt)
                ) {
                  const [sellDecimals, buyDecimals] = await Promise.all([
                    provider.readContract({
                      address: fill.sellToken as `0x${string}`,
                      abi: erc20Abi,
                      functionName: "decimals",
                    }),
                    provider.readContract({
                      address: fill.buyToken as `0x${string}`,
                      abi: erc20Abi,
                      functionName: "decimals",
                    }),
                  ]);
                  const reconciliation = reconcileCow(
                    { ...fill, chainId: 11155111 },
                    stored,
                    eventsCSV([stored]),
                    Number(sellDecimals),
                    Number(buyDecimals),
                  );
                  await evidence.capture("cow", `fill:${id}`, {
                    kind: "cow-fill",
                    orderUid: fill.orderUid,
                    settlementTxHash: fill.txHash ?? null,
                    sellToken: fill.sellToken,
                    buyToken: fill.buyToken,
                    sellDecimals: Number(sellDecimals),
                    buyDecimals: Number(buyDecimals),
                    sellAmount: fill.sellAmount,
                    sellAmountBeforeFees: fill.sellAmountBeforeFees,
                    buyAmount: fill.buyAmount,
                    pitPartnerFee: "0",
                    taxlotEventId: stored.id,
                    reconciliation: reconciliation.status,
                    economicDifferences: reconciliation.economicDifferences,
                    metadataDifferences: reconciliation.metadataDifferences,
                  });
                }
              }
            }
            if (fills.length < 100) break;
          }
        },
        async () => {
          const db = await eventDB();
          const funding = await hlInfo.userFunding({
            user,
            startTime: Date.now() - 30 * 86400000,
          });
          if (stopped) return;
          await recordPerpFunding(funding, user);
          const key = `hl-cursor:${user.toLowerCase()}`;
          let cursor = (await db.get("meta", key)) ?? 0;
          while (!stopped) {
            const fills = await hlInfo.userFillsByTime({
              user,
              startTime: cursor,
              aggregateByTime: false,
            });
            if (stopped) return;
            await recordPerpFills(fills, user);
            if (
              evidence.active?.protocol === "hyperliquid" &&
              evidence.active.account === user.toLowerCase()
            ) {
              const raw = await listDerivativeEvidence(user);
              const taxlot = await listEvents(user);
              for (const fill of fills) {
                if (fill.time < Date.parse(evidence.active.startedAt)) continue;
                const match = raw.find(
                  (r) =>
                    r.record_kind === "fill" &&
                    r.fill_id === String(fill.tid) &&
                    r.transaction_id === fill.hash,
                );
                const outcome = reconcileHyperliquid(
                  {
                    account: user,
                    fillId: String(fill.tid),
                    orderId: fill.oid === undefined ? null : String(fill.oid),
                    market: fill.coin,
                    side: fill.side,
                    size: fill.sz,
                    price: fill.px,
                    fee: fill.fee,
                    feeAsset: fill.feeToken,
                  },
                  match,
                  taxlot,
                );
                await evidence.capture(
                  "hyperliquid",
                  `fill:${fill.tid}:${fill.hash}`,
                  {
                    kind: "hyperliquid-fill",
                    market: fill.coin,
                    side: fill.side,
                    size: fill.sz,
                    price: fill.px,
                    exchangeFee: fill.fee,
                    orderId: fill.oid === undefined ? null : String(fill.oid),
                    fillId: String(fill.tid),
                    terminalState: null,
                    pitBuilderFee: "0",
                    rawEvidenceId: match?.id ?? null,
                    taxlotStatus: "unsupported_derivative_v1",
                    reconciliation: outcome,
                  },
                );
              }
            }
            if (!fills.length) break;
            const last = Math.max(...fills.map((f) => f.time));
            if (fills.length >= 2000 && last === cursor)
              throw new Error(
                "Fill pagination saturated; manual reconciliation required",
              );
            await db.put("meta", last, key);
            if (fills.length < 2000) break;
            cursor = last;
          }
        },
      ];
      await Promise.all(
        tasks.map(async (task) => {
          try {
            await task();
          } catch (e) {
            failures.push(e instanceof Error ? e.message : String(e));
          }
        }),
      );
      if (!stopped) {
        setStatus(
          failures.length
            ? `Sync needs attention: ${failures.join("; ")}`
            : "CoW fills synced locally. Hyperliquid raw evidence only; taxlot_status: unsupported_derivative_v1.",
        );
        timer = setTimeout(sync, 20000);
      }
    }
    void sync();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [wallet, evidence.active?.id]);
  return (
    <p className="notice" role="status">
      {status}
    </p>
  );
}
