import {
  DERIVATIVE_ACCOUNTING_BLOCKED,
  assertNotDerivativeSource,
} from "./accounting-compatibility";
export { DERIVATIVE_ACCOUNTING_BLOCKED } from "./accounting-compatibility";
import { assertStorageEnabled } from "./storage-policy";
import { openDB } from "idb";
import validate from "./validate-event";
export interface TaxlotEvent {
  version: 1;
  id: string;
  type: "trade";
  timestamp: string;
  sequence: number;
  asset: string;
  quantity: string;
  counter_asset: string | null;
  counter_quantity: string | null;
  fee: { asset: string; quantity: string }[];
  source: string;
  account: string;
  raw_row_ref: string;
  txid?: string;
  valuation_note?: string;
}
export function assertEvent(event: unknown): asserts event is TaxlotEvent {
  if (!validate(event))
    throw new Error(
      `Taxlot schema validation failed: ${JSON.stringify(validate.errors)}`,
    );
}
export function isDerivativeEvidence(e: TaxlotEvent) {
  return (
    e.source.toLowerCase().includes("hyperliquid") ||
    e.asset.toUpperCase().startsWith("HL-PERP:") ||
    e.counter_asset?.toUpperCase() === "USDC-NOTIONAL"
  );
}
function assertAccountingSupported(e: TaxlotEvent) {
  if (isDerivativeEvidence(e)) throw new Error(DERIVATIVE_ACCOUNTING_BLOCKED);
}
export async function eventDB() {
  assertStorageEnabled();
  return openDB("pit-taxlot-v1", 1, {
    upgrade(db) {
      db.createObjectStore("events", { keyPath: "id" });
      db.createObjectStore("raw", { keyPath: "id" });
      db.createObjectStore("meta");
    },
  });
}
// Validate before every write, including duplicates. ID check and sequence allocation share a transaction.
export async function appendEvent(event: TaxlotEvent, raw: unknown) {
  assertEvent(event);
  assertAccountingSupported(event);
  assertNotDerivativeSource(raw);
  const db = await eventDB();
  const tx = db.transaction(["events", "raw", "meta"], "readwrite");
  if (await tx.objectStore("events").get(event.id)) {
    await tx.done;
    return false;
  }
  const sequence = ((await tx.objectStore("meta").get("sequence")) ??
    0) as number;
  const next = { ...event, sequence };
  assertEvent(next);
  await tx.objectStore("events").add(next);
  await tx.objectStore("raw").add({ id: event.id, payload: raw });
  await tx.objectStore("meta").put(sequence + 1, "sequence");
  await tx.done;
  return true;
}
export async function listEvents(account: string) {
  const db = await eventDB();
  return ((await db.getAll("events")) as TaxlotEvent[])
    .filter((e) => e.account.toLowerCase() === account.toLowerCase())
    .sort(
      (a, b) =>
        a.timestamp.localeCompare(b.timestamp) || a.sequence - b.sequence,
    );
}
export function csvCell(value: unknown) {
  let s =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
  return `"${s.replaceAll('"', '""')}"`;
}
export function eventsCSV(events: TaxlotEvent[]) {
  const columns = [
    "version",
    "id",
    "type",
    "timestamp",
    "sequence",
    "asset",
    "quantity",
    "counter_asset",
    "counter_quantity",
    "fee",
    "fee_asset",
    "fee_quantity",
    "source",
    "account",
    "raw_row_ref",
    "txid",
    "valuation_note",
  ];
  return (
    [
      columns.map(csvCell).join(","),
      ...events.map((e) => {
        assertEvent(e);
        assertAccountingSupported(e);
        if (e.fee.length > 1)
          throw new Error(
            "Taxlot Generic CSV mapping supports one fee leg; export blocked to prevent fee loss",
          );
        const row = {
          ...e,
          fee_asset: e.fee[0]?.asset ?? "",
          fee_quantity: e.fee[0]?.quantity ?? "",
        };
        return columns
          .map((k) => csvCell(row[k as keyof typeof row]))
          .join(",");
      }),
    ].join("\r\n") + "\r\n"
  );
}
export async function downloadCSV(account: string, derivatives = false) {
  if (derivatives) throw new Error(DERIVATIVE_ACCOUNTING_BLOCKED);
  const events = (await listEvents(account)).filter(
    (e) => !isDerivativeEvidence(e),
  );
  const url = URL.createObjectURL(
    new Blob([eventsCSV(events)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "pit-taxlot.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return events.length;
}
