import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import {
  accountingAllowed,
  accountingOrigins,
  storageEnabled,
} from "../src/lib/storage-policy";
import {
  eventDB,
  appendEvent,
  listEvents,
  downloadCSV,
  type TaxlotEvent,
} from "../src/lib/events";
const origin = "https://pit.example";
const event: TaxlotEvent = {
  version: 1,
  id: "origin-test",
  type: "trade",
  timestamp: "2026-09-29T12:00:00Z",
  sequence: 0,
  asset: "ETH",
  quantity: "1",
  counter_asset: "USDC",
  counter_quantity: "2000",
  fee: [],
  source: "pit:cow:11155111",
  account: "public-fixture",
  raw_row_ref: "origin-test",
};
afterEach(() => vi.stubGlobal("location", new URL("http://localhost:4321/")));
it("production policy has no implicitly trusted origins", () => {
  expect(accountingOrigins).toEqual([]);
  expect(Object.isFrozen(accountingOrigins)).toBe(true);
  for (const url of [
    "https://pit.pages.dev/",
    "https://cid.ipfs.gateway.example/",
    "https://unknown.example/",
  ])
    expect(accountingAllowed(url)).toBe(false);
});
it("explicit dedicated HTTPS origins work, without suffix or scheme confusion", () => {
  for (const host of [
    origin,
    "https://pit.pages.dev",
    "https://stable.ipns.gateway.example",
  ])
    expect(accountingAllowed(host + "/app/", [host])).toBe(true);
  for (const url of [
    "http://pit.example/",
    "https://pit.example.evil.test/",
    "https://pit.example:444/",
    "https://user@pit.example/",
    "file:///pit.html",
  ])
    expect(accountingAllowed(url, [origin])).toBe(false);
});
it("shared paths fail even on approved origins and loopback", () => {
  for (const path of [
    "/ipfs/cid/",
    "/ipns/name/",
    "/prefix/IPFS/cid/",
    "/%69pfs/cid/",
    "/%2569pfs/cid/",
    "/%broken",
  ]) {
    expect(accountingAllowed(origin + path, [origin])).toBe(false);
    expect(accountingAllowed("http://localhost:4321" + path)).toBe(false);
  }
});
it("normal loopback development works but lookalikes and opaque locations fail", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"])
    expect(accountingAllowed("http://" + host + ":4321/")).toBe(true);
  expect(accountingAllowed("http://localhost.evil.test:4321/")).toBe(false);
  vi.stubGlobal("location", undefined);
  expect(storageEnabled()).toBe(false);
});
it("unsafe storage rejects every entry point and preserves existing records unchanged", async () => {
  await appendEvent(event, { evidence: "public fixture" });
  const before = await listEvents(event.account);
  const db = await eventDB();
  const raw = await db.get("raw", event.id);
  const sequence = await db.get("meta", "sequence");
  db.close();
  vi.stubGlobal("location", new URL("http://localhost:4321/ipfs/cid/"));
  await expect(eventDB()).rejects.toThrow("disabled");
  await expect(appendEvent({ ...event, id: "blocked" }, {})).rejects.toThrow(
    "disabled",
  );
  await expect(listEvents(event.account)).rejects.toThrow("disabled");
  await expect(downloadCSV(event.account)).rejects.toThrow("disabled");
  vi.stubGlobal("location", new URL("http://localhost:4321/"));
  expect(await listEvents(event.account)).toEqual(before);
  const reopened = await eventDB();
  expect(await reopened.get("raw", event.id)).toEqual(raw);
  expect(await reopened.get("meta", "sequence")).toBe(sequence);
  reopened.close();
});
