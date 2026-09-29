import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "../schemas/events.v1.json";
import {
  appendEvent,
  assertEvent,
  eventsCSV,
  listEvents,
  type TaxlotEvent,
} from "../src/lib/events";
import { perpEvent } from "../src/lib/record-fills";
const event: TaxlotEvent = {
  version: 1,
  id: "cow:1",
  type: "trade",
  timestamp: "2026-09-29T12:00:00Z",
  sequence: 0,
  asset: "ETH",
  quantity: "1.000000000000000001",
  counter_asset: "USDC",
  counter_quantity: "3000",
  fee: [],
  source: "pit:cow:11155111",
  account: "0xabc",
  raw_row_ref: "cow:1",
};
it("validates every write against the copied schema and deduplicates atomically", async () => {
  const results = await Promise.all([
    appendEvent(event, {}),
    appendEvent(event, {}),
  ]);
  expect(results.sort()).toEqual([false, true]);
  expect(await listEvents("0xabc")).toHaveLength(1);
  const ajv = new Ajv();
  addFormats(ajv);
  expect(ajv.compile(schema)((await listEvents("0xabc"))[0])).toBe(true);
  await expect(
    appendEvent({ ...event, id: "bad", quantity: "-1" }, {}),
  ).rejects.toThrow(/schema/);
  expect(await listEvents("0xabc")).toHaveLength(1);
});
it("rejects incorrect types timestamps and extra properties", () => {
  for (const patch of [
    { type: "swap" },
    { timestamp: "yesterday" },
    { quantity: 1 },
    { surprise: true },
  ])
    expect(() => assertEvent({ ...event, ...patch })).toThrow();
});
it("keeps stablecoins as trade and preserves CSV precision and escaping", () => {
  const csv = eventsCSV([{ ...event, valuation_note: '=1+1,"test"\nnext' }]);
  expect(csv).toContain('"trade"');
  expect(csv).toContain("1.000000000000000001");
  expect(csv).toContain('"\'=1+1,""test""\nnext"');
});
it("records derivative notional exactly and marks it for separate review", () => {
  const fill = {
    tid: 1,
    time: 1790683200000,
    coin: "ETH",
    side: "B",
    sz: "0.12345678",
    px: "2000.1",
    fee: "0.01",
    feeToken: "USDC",
    hash: "0xabc",
    dir: "Open Long",
    closedPnl: "0",
  };
  const e = perpEvent(fill as any, "0xabc");
  assertEvent(e);
  expect(e.counter_quantity).toBe("246.925905678");
  expect(e.valuation_note).toContain("DERIVATIVE REVIEW ONLY");
});
