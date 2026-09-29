import { openDB } from "idb";
import { assertStorageEnabled } from "./storage-policy";
import { DERIVATIVE_TAXLOT_STATUS } from "./accounting-compatibility";
import type { readPerps } from "./hyperliquid";

type Fill = Awaited<ReturnType<typeof readPerps>>["fills"][number];
type Funding = Awaited<ReturnType<typeof readPerps>>["funding"][number];
export interface DerivativeEvidence {
  evidence_version: 1;
  record_kind: "fill" | "funding";
  taxlot_status: typeof DERIVATIVE_TAXLOT_STATUS;
  protocol: "hyperliquid";
  network: "testnet";
  account: string;
  id: string;
  source_id: string;
  payload_hash: string;
  observed_at: string;
  market: string;
  stable_instrument_id: null;
  side: string | null;
  size: string | null;
  price: string | null;
  fee: { amount: string; asset: string } | null;
  funding: { amount: string; rate: string; position_size: string } | null;
  order_id: string | null;
  fill_id: string | null;
  transaction_id: string;
  timestamp_ms: number;
  source: { endpoint: string; method: string };
  payload: Fill | Funding;
}
function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (
    typeof value === "object" &&
    value &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonical((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  throw new Error("Derivative evidence must contain lossless JSON values");
}
function text(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.length)
    throw new Error("Missing derivative source field");
}
function decimal(value: unknown) {
  if (typeof value !== "string" || !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value))
    throw new Error("Invalid derivative source decimal");
}
function identifier(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    return String(value);
  if (typeof value === "string" && value.length) return value;
  throw new Error("Missing or imprecise derivative identifier");
}
// Private DB accessor: no update/delete API and no dependency on Taxlot event code.
async function database() {
  assertStorageEnabled();
  return openDB("pit-derivative-evidence-v1", 1, {
    upgrade(db) {
      db.createObjectStore("observations", { keyPath: "id" });
    },
  });
}
async function observation(
  kind: "fill" | "funding",
  payload: Fill | Funding,
  account: string,
): Promise<DerivativeEvidence> {
  if (!/^0x[0-9a-f]{40}$/i.test(account))
    throw new Error("Invalid derivative evidence account");
  if (
    !Number.isSafeInteger(payload.time) ||
    payload.time < 0 ||
    !Number.isFinite(new Date(payload.time).getTime())
  )
    throw new Error("Invalid derivative source time");
  text(payload.hash);
  // Copy before asynchronous hashing: later caller mutation cannot change stored evidence.
  const copy = JSON.parse(canonical(payload)) as Fill | Funding;
  const fill = kind === "fill" ? (copy as Fill) : null,
    funding = kind === "funding" ? (copy as Funding) : null;
  const market = fill?.coin ?? funding!.delta.coin;
  text(market);
  if (fill) {
    text(fill.side);
    decimal(fill.sz);
    decimal(fill.px);
    decimal(fill.fee);
    text(fill.feeToken);
    identifier(fill.tid);
    if (fill.oid !== undefined) identifier(fill.oid);
  }
  if (funding) {
    if (funding.delta.type !== "funding")
      throw new Error("Unsupported derivative evidence kind");
    decimal(funding.delta.usdc);
    decimal(funding.delta.fundingRate);
    decimal(funding.delta.szi);
  }
  const owner = account.toLowerCase();
  const bytes = new TextEncoder().encode(
    canonical({
      protocol: "hyperliquid",
      network: "testnet",
      account: owner,
      kind,
      payload: copy,
    }),
  );
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const sourceId = fill
    ? `fill:${identifier(fill.tid)}`
    : `funding:${copy.hash}:${copy.time}:${market}`;
  return {
    evidence_version: 1,
    record_kind: kind,
    taxlot_status: DERIVATIVE_TAXLOT_STATUS,
    protocol: "hyperliquid",
    network: "testnet",
    account: owner,
    id: `hl:testnet:${owner}:${sourceId}:${digest}`,
    source_id: sourceId,
    payload_hash: digest,
    observed_at: new Date().toISOString(),
    market,
    stable_instrument_id: null,
    side: fill?.side ?? null,
    size: fill?.sz ?? null,
    price: fill?.px ?? null,
    fee: fill ? { amount: fill.fee, asset: fill.feeToken } : null,
    funding: funding
      ? {
          amount: funding.delta.usdc,
          rate: funding.delta.fundingRate,
          position_size: funding.delta.szi,
        }
      : null,
    order_id: fill?.oid === undefined ? null : identifier(fill.oid),
    fill_id: fill ? identifier(fill.tid) : null,
    transaction_id: copy.hash,
    timestamp_ms: copy.time,
    source: {
      endpoint: "https://api.hyperliquid-testnet.xyz/info",
      method: fill ? "userFillsByTime" : "userFunding",
    },
    payload: copy,
  };
}
async function record(
  kind: "fill" | "funding",
  payloads: (Fill | Funding)[],
  account: string,
) {
  assertStorageEnabled();
  // Validate/hash the complete batch before opening its atomic transaction.
  const records = await Promise.all(
    payloads.map((p) => observation(kind, p, account)),
  );
  const db = await database();
  try {
    const tx = db.transaction("observations", "readwrite");
    let added = 0;
    for (const entry of records)
      if (!(await tx.store.get(entry.id))) {
        await tx.store.add(entry);
        added++;
      }
    await tx.done;
    return added;
  } finally {
    db.close();
  }
}
export async function recordPerpFills(fills: Fill[], account: string) {
  return record("fill", fills, account);
}
export async function recordPerpFunding(funding: Funding[], account: string) {
  return record("funding", funding, account);
}
export async function listDerivativeEvidence(
  account: string,
): Promise<DerivativeEvidence[]> {
  const db = await database();
  try {
    return (await db.getAll("observations"))
      .filter((e) => e.account === account.toLowerCase())
      .sort(
        (a, b) => a.timestamp_ms - b.timestamp_ms || a.id.localeCompare(b.id),
      );
  } finally {
    db.close();
  }
}
