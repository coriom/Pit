import "fake-indexeddb/auto";
import { expect, it, vi } from "vitest";
import {
  startAcceptanceSession,
  appendAcceptanceEntry,
  listAcceptanceEntries,
  acceptanceReport,
  hyperliquidSubmissionIdentity,
} from "../src/lib/acceptance-evidence";
import {
  reconcileCow,
  reconcileHyperliquid,
} from "../src/lib/acceptance-reconcile";
import { eventsCSV, listEvents, type TaxlotEvent } from "../src/lib/events";
import { recordCowFill } from "../src/lib/record-fills";
import {
  recordPerpFills,
  listDerivativeEvidence,
} from "../src/lib/derivative-evidence";
import { storageEnabled } from "../src/lib/storage-policy";

const account = "0x2222222222222222222222222222222222222222";
const sell = "0x1111111111111111111111111111111111111111";
const buy = "0x3333333333333333333333333333333333333333";
const synthetic = {
  orderUid: "synthetic-order-uid",
  owner: account,
  sellToken: sell,
  buyToken: buy,
  sellAmount: "1000001",
  sellAmountBeforeFees: "1000000",
  buyAmount: "1234567890123456789",
  blockNumber: 100,
  logIndex: 7,
  txHash: `0x${"4".repeat(64)}`,
};
const provider = {
  getChainId: vi.fn(async () => 11155111),
  readContract: vi.fn(async ({ address }: { address: string }) =>
    address === sell ? 6 : 18,
  ),
  getBlock: vi.fn(async () => ({
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
  })),
};

it("appends completed action evidence once and exports only allowlisted public fields", async () => {
  const session = await startAcceptanceSession(
    "cow",
    account,
    "synthetic-fixture",
  );
  const data = {
    kind: "cow-submission",
    quoteIdentity: "synthetic-quote",
    orderUid: "synthetic-order-uid",
    pitPartnerFee: "0",
  } as const;
  expect(
    await appendAcceptanceEntry(
      session,
      "submission:synthetic-order-uid",
      data,
    ),
  ).toBe(true);
  expect(
    await appendAcceptanceEntry(
      session,
      "submission:synthetic-order-uid",
      data,
    ),
  ).toBe(false);
  const entries = await listAcceptanceEntries(session);
  expect(entries).toHaveLength(1);
  const report = acceptanceReport(session, entries);
  expect(report.json).toContain('"source": "synthetic-fixture"');
  expect(report.markdown).toContain(
    "Evidence capture does not mean live acceptance has passed.",
  );
  expect(report.json).not.toMatch(/privateKey|authorization|cookie|signature/i);
  await expect(
    appendAcceptanceEntry(session, "bad:secret", {
      ...data,
      authorization: "synthetic-secret",
    } as any),
  ).rejects.toThrow(/Unsupported/);
  await expect(
    appendAcceptanceEntry(session, "bad:fee", {
      ...data,
      pitPartnerFee: "1",
    } as any),
  ).rejects.toThrow(/invariant/);
  expect(await listAcceptanceEntries(session)).toHaveLength(1);
  expect(
    await appendAcceptanceEntry(session, "amendment:1", {
      kind: "amendment",
      amends: `${session.id}:submission:synthetic-order-uid`,
      reason: "correction",
    }),
  ).toBe(true);
  expect((await listAcceptanceEntries(session))[0].data).toEqual(data);
});

it("reconciles a synthetic CoW fill with exact integer units and the real Taxlot CSV serializer", async () => {
  const network = {
    ...synthetic,
    orderUid: `synthetic-${crypto.randomUUID()}`,
  };
  expect(await recordCowFill(network as any, 11155111, provider as any)).toBe(
    true,
  );
  expect(await recordCowFill(network as any, 11155111, provider as any)).toBe(
    false,
  );
  const event = (await listEvents(account)).find((e) =>
    e.raw_row_ref.includes(network.orderUid),
  )!;
  expect(event.type).toBe("trade");
  const outcome = reconcileCow(
    { ...network, chainId: 11155111 },
    event,
    eventsCSV([event]),
    6,
    18,
  );
  expect(outcome).toEqual({
    status: "MATCH",
    economicDifferences: [],
    metadataDifferences: [],
  });
  expect(
    reconcileCow({ ...network, chainId: 11155111 }, undefined, undefined, 6, 18)
      .status,
  ).toBe("MISSING_RECORD");
  expect(
    reconcileCow({ ...network, chainId: 11155111 }, event, "wrong CSV", 6, 18)
      .status,
  ).toBe("CSV_MISMATCH");
  expect(
    reconcileCow(
      { ...network, chainId: 11155111 },
      { ...event, quantity: "1.000001" },
      eventsCSV([{ ...event, quantity: "1.000001" }]),
      6,
      18,
    ).economicDifferences,
  ).toContain("quantity");
  const session = await startAcceptanceSession(
    "cow",
    account,
    "synthetic-fixture",
  );
  const capture = {
    kind: "cow-fill",
    orderUid: network.orderUid,
    settlementTxHash: network.txHash,
    sellToken: sell,
    buyToken: buy,
    sellDecimals: 6,
    buyDecimals: 18,
    sellAmount: network.sellAmount,
    sellAmountBeforeFees: network.sellAmountBeforeFees,
    buyAmount: network.buyAmount,
    pitPartnerFee: "0",
    taxlotEventId: event.id,
    reconciliation: outcome.status,
    economicDifferences: outcome.economicDifferences,
    metadataDifferences: outcome.metadataDifferences,
  } as const;
  expect(
    await appendAcceptanceEntry(session, `fill:${event.id}`, capture),
  ).toBe(true);
  expect(
    await appendAcceptanceEntry(session, `fill:${event.id}`, capture),
  ).toBe(false);
  expect(
    (await listAcceptanceEntries(session)).filter(
      (e) => e.data.kind === "cow-fill",
    ),
  ).toHaveLength(1);
});

it("keeps rejected and expired synthetic orders as status only, with no invented fill", async () => {
  const session = await startAcceptanceSession(
    "cow",
    account,
    "synthetic-fixture",
  );
  await appendAcceptanceEntry(session, "status:rejected", {
    kind: "cow-status",
    orderUid: "synthetic-rejected",
    status: "cancelled",
    settlementTxHash: null,
  });
  await appendAcceptanceEntry(session, "status:expired", {
    kind: "cow-status",
    orderUid: "synthetic-expired",
    status: "expired",
    settlementTxHash: null,
  });
  expect(
    (await listAcceptanceEntries(session)).filter(
      (e) => e.data.kind === "cow-fill",
    ),
  ).toEqual([]);
});

it("keeps synthetic partial/failed and filled Hyperliquid evidence raw-only", async () => {
  const session = await startAcceptanceSession(
    "hyperliquid",
    account,
    "synthetic-fixture",
  );
  const base = {
    coin: "ETH",
    side: "B",
    sz: "0.1",
    px: "2000.1",
    fee: "0.01",
    feeToken: "USDC",
    hash: "synthetic-public-fill",
    time: Date.now(),
    tid: 91001,
    oid: 92001,
    dir: "Open Long",
    closedPnl: "0",
  };
  await recordPerpFills([base as any], account);
  const raw = (await listDerivativeEvidence(account)).find(
    (e) => e.fill_id === String(base.tid),
  );
  expect(raw).toBeDefined();
  const input = {
    account,
    fillId: String(base.tid),
    orderId: String(base.oid),
    market: base.coin,
    side: base.side,
    size: base.sz,
    price: base.px,
    fee: base.fee,
    feeAsset: base.feeToken,
  };
  expect(reconcileHyperliquid(input, raw, await listEvents(account))).toBe(
    "RAW_ONLY",
  );
  expect(reconcileHyperliquid(input, undefined, [])).toBe("MISSING_RECORD");
  expect(
    reconcileHyperliquid(input, raw, [
      {
        source: "pit:hyperliquid",
        raw_row_ref: `fill:${base.tid}`,
      } as TaxlotEvent,
    ]),
  ).toBe("FALSE_TAXLOT_EVENT");
  expect(reconcileHyperliquid({ ...input, size: "0.2" }, raw, [])).toBe(
    "EVIDENCE_MISMATCH",
  );
  await appendAcceptanceEntry(session, "partial:1", {
    kind: "hyperliquid-submission",
    market: "ETH",
    side: "buy",
    size: "0.2",
    limitPrice: "2000.1",
    reduceOnly: false,
    orderId: String(base.oid),
    status: "resting",
    pitBuilderFee: "0",
    taxlotStatus: "unsupported_derivative_v1",
  });
  await appendAcceptanceEntry(session, "failed:1", {
    kind: "hyperliquid-submission",
    market: "ETH",
    side: "buy",
    size: "0.2",
    limitPrice: "2000.1",
    reduceOnly: false,
    orderId: "92002",
    status: "submitted",
    pitBuilderFee: "0",
    taxlotStatus: "unsupported_derivative_v1",
  });
  await appendAcceptanceEntry(session, "status:failed:1", {
    kind: "hyperliquid-status",
    orderId: "92002",
    status: "rejected",
    positionSize: null,
    openOrder: false,
    observedAt: new Date(base.time).toISOString(),
  });
  await appendAcceptanceEntry(session, `fill:${base.tid}`, {
    kind: "hyperliquid-fill",
    market: base.coin,
    side: base.side,
    size: base.sz,
    price: base.px,
    exchangeFee: base.fee,
    orderId: String(base.oid),
    fillId: String(base.tid),
    terminalState: null,
    pitBuilderFee: "0",
    rawEvidenceId: raw!.id,
    taxlotStatus: "unsupported_derivative_v1",
    reconciliation: "RAW_ONLY",
  });
  expect(
    (await listAcceptanceEntries(session)).filter(
      (e) => e.data.kind === "hyperliquid-fill",
    ),
  ).toHaveLength(1);
  expect(
    (await listEvents(account)).some((e) => e.source.includes("hyperliquid")),
  ).toBe(false);
});

it("fails evidence writes closed on an unsafe origin without invoking wallet or network APIs", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const session = await startAcceptanceSession(
    "cow",
    account,
    "synthetic-fixture",
  );
  const original = globalThis.location;
  vi.stubGlobal("location", new URL("https://gateway.example/ipfs/cid"));
  try {
    expect(storageEnabled()).toBe(false);
    await expect(startAcceptanceSession("cow", account)).rejects.toThrow(
      /disabled/,
    );
    await expect(
      appendAcceptanceEntry(session, "write:failed", {
        kind: "checkpoint",
        action: "cow-order",
        confirmed: true,
      }),
    ).rejects.toThrow(/disabled/);
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    vi.stubGlobal("location", original);
    fetchSpy.mockRestore();
  }
  expect(await listAcceptanceEntries(session)).toEqual([]);
  expect(
    hyperliquidSubmissionIdentity({
      response: { data: { statuses: [{ filled: { oid: 123 } }] } },
    }),
  ).toEqual({ orderId: "123", status: "filled" });
});
