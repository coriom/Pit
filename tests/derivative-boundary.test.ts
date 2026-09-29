import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  recordPerpFills,
  recordPerpFunding,
  listDerivativeEvidence,
} from "../src/lib/derivative-evidence";
import { recordCowFill } from "../src/lib/record-fills";
import {
  appendEvent,
  assertEvent,
  eventDB,
  eventsCSV,
  listEvents,
} from "../src/lib/events";
const account = "0x3333333333333333333333333333333333333333";
const fill = {
  tid: 77,
  oid: 99,
  time: 1790683200000,
  coin: "ETH",
  side: "B",
  sz: "0.1",
  px: "2000.1",
  fee: "-0.01",
  feeToken: "USDC",
  hash: "fixture-fill-hash",
  dir: "Close Short",
  closedPnl: "-2.5",
  startPosition: "-0.1",
  liquidation: { liquidatedUser: account, markPx: "2000", method: "market" },
};
afterEach(() => vi.stubGlobal("location", new URL("http://localhost:4321/")));
it("separate evidence is append-only, duplicate-safe and preserves conflicting source observations", async () => {
  const db = await eventDB();
  const original = { id: "legacy-evidence", payload: { original: true } };
  await db.put("raw", original);
  expect(await recordPerpFills([fill as never], account)).toBe(1);
  const [first] = await listDerivativeEvidence(account);
  expect(first.taxlot_status).toBe("unsupported_derivative_v1");
  expect(first.payload).toEqual(fill);
  expect(first.order_id).toBe("99");
  expect(first.fill_id).toBe("77");
  expect(first.fee?.amount).toBe("-0.01");
  expect(first.stable_instrument_id).toBeNull();
  expect(() => assertEvent(first)).toThrow();
  expect(await recordPerpFills([{ ...fill } as never], account)).toBe(0);
  expect(
    await recordPerpFills([{ ...fill, fee: "0.02" } as never], account),
  ).toBe(1);
  const records = await listDerivativeEvidence(account);
  expect(records).toHaveLength(2);
  expect(records.find((r) => r.id === first.id)).toEqual(first);
  expect(new Set(records.map((r) => r.payload_hash)).size).toBe(2);
  expect(await listEvents(account)).toEqual([]);
  expect(await db.get("raw", "legacy-evidence")).toEqual(original);
  db.close();
});
it("funding is immutable signed protocol evidence, not a deposit, fee or trade interpretation", async () => {
  const payload = {
    time: 1790683200001,
    hash: "funding-fixture",
    delta: {
      type: "funding",
      coin: "ETH",
      usdc: "-0.5",
      szi: "-0.1",
      fundingRate: "0.0001",
    },
  };
  expect(await recordPerpFunding([payload as never], account)).toBe(1);
  const evidence = (await listDerivativeEvidence(account)).find(
    (e) => e.record_kind === "funding",
  )!;
  expect(evidence.payload).toEqual(payload);
  expect(evidence.funding?.amount).toBe("-0.5");
  expect(evidence.side).toBeNull();
  expect(evidence.price).toBeNull();
  expect(evidence.fill_id).toBeNull();
  expect(await listEvents(account)).toEqual([]);
});
it("Hyperliquid fills and envelopes cannot call the CoW or generic spot writer", async () => {
  const read = vi.fn();
  const provider = { getChainId: read, readContract: read } as never;
  for (const payload of [
    fill,
    { payload: fill },
    { kind: "hyperliquid-fill-evidence", payload: fill },
    [fill],
    { ...fill, orderUid: "mixed", sellToken: account, buyToken: account },
    {
      protocol: "hyperliquid",
      payload: fill,
      taxlot_status: "unsupported_derivative_v1",
    },
  ]) {
    await expect(
      recordCowFill(payload as never, 11155111, provider),
    ).rejects.toThrow("unsupported_derivative_v1");
  }
  expect(read).not.toHaveBeenCalled();
  const fakeSpot = {
    version: 1,
    id: "false-spot",
    type: "trade",
    timestamp: "2026-09-29T12:00:00Z",
    sequence: 0,
    asset: "ETH",
    quantity: "0.1",
    counter_asset: "USDC",
    counter_quantity: "200",
    fee: [],
    source: "pit:cow:11155111",
    account,
    raw_row_ref: "false-spot",
  } as const;
  await expect(appendEvent(fakeSpot as never, fill)).rejects.toThrow(
    "unsupported_derivative_v1",
  );
  expect(await listEvents(account)).toEqual([]);
  const legacy = {
    ...fakeSpot,
    source: "pit:hyperliquid:testnet:derivative-review",
  };
  expect(() => eventsCSV([legacy as never])).toThrow(
    "unsupported_derivative_v1",
  );
  const module = readFileSync("src/lib/derivative-evidence.ts", "utf8");
  expect(module).not.toMatch(/from ['"].*\/(events|record-fills)['"]/);
});
it("unsafe origins and malformed batches fail before evidence persistence", async () => {
  const before = await listDerivativeEvidence(account);
  await expect(
    recordPerpFills(
      [
        { ...fill, tid: 78 } as never,
        { ...fill, tid: Number.MAX_SAFE_INTEGER + 1 } as never,
      ],
      account,
    ),
  ).rejects.toThrow("identifier");
  expect(await listDerivativeEvidence(account)).toEqual(before);
  vi.stubGlobal("location", new URL("http://localhost:4321/ipfs/unsafe/"));
  await expect(recordPerpFills([fill as never], account)).rejects.toThrow(
    "disabled",
  );
  await expect(listDerivativeEvidence(account)).rejects.toThrow("disabled");
});

it("CSV fails closed instead of dropping multiple fee legs in the real Generic importer mapping", () => {
  const e = {
    version: 1,
    id: "multi-fee",
    type: "trade",
    timestamp: "2026-09-29T12:00:00Z",
    sequence: 0,
    asset: "ETH",
    quantity: "1",
    counter_asset: "USDC",
    counter_quantity: "2000",
    fee: [
      { asset: "ETH", quantity: "0.1" },
      { asset: "USDC", quantity: "1" },
    ],
    source: "pit:cow:11155111",
    account,
    raw_row_ref: "multi-fee",
  };
  expect(() => eventsCSV([e as never])).toThrow("one fee leg");
});

it("concurrent repeated observations add one immutable record", async () => {
  const owner = "0x5555555555555555555555555555555555555555";
  const results = await Promise.all([
    recordPerpFills([fill as never], owner),
    recordPerpFills([fill as never], owner),
  ]);
  expect(results.sort()).toEqual([0, 1]);
  expect(await listDerivativeEvidence(owner)).toHaveLength(1);
});
