import { storageEnabled, STORAGE_WARNING } from "../lib/storage-policy";
import { useEffect, useState } from "react";
import { useWalletClient } from "wagmi";
import { createPublicClient, custom } from "viem";
import { orderbook } from "../lib/cow";
import { hlInfo } from "../lib/hyperliquid";
import { recordCowFill, recordPerpFills } from "../lib/record-fills";
import { eventDB } from "../lib/events";
export function FillRecorder() {
  const { data: wallet } = useWalletClient();
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
            }
            if (fills.length < 100) break;
          }
        },
        async () => {
          const db = await eventDB();
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
            : "Filled trades synced locally.",
        );
        timer = setTimeout(sync, 20000);
      }
    }
    void sync();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [wallet]);
  return (
    <p className="notice" role="status">
      {status}
    </p>
  );
}
