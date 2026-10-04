import { openDB } from "idb";
import { assertStorageEnabled } from "./storage-policy";
import type { ReadinessStatus } from "./operator-readiness";

export type AcceptanceProtocol = "cow" | "hyperliquid";
export type AcceptanceSession = Readonly<{
  version: 1;
  id: string;
  protocol: AcceptanceProtocol;
  account: `0x${string}`;
  environment: "ethereum-sepolia:11155111" | "hyperliquid:testnet";
  startedAt: string;
  source: "operator" | "synthetic-fixture";
}>;
export type AcceptanceEntryData =
  | { kind: "readiness"; items: { id: string; status: ReadinessStatus }[] }
  | {
      kind: "checkpoint";
      action:
        | "cow-approval"
        | "cow-order"
        | "hyperliquid-order"
        | "hyperliquid-close";
      confirmed: true;
    }
  | {
      kind: "cow-quote";
      quoteIdentity: string;
      sellToken: string;
      buyToken: string;
      sellBudget: string;
      expectedBuy: string;
      pitPartnerFee: "0";
      obtainedAt: string;
    }
  | { kind: "cow-approval"; quoteIdentity: string; outcome: "completed" }
  | {
      kind: "cow-submission";
      quoteIdentity: string;
      orderUid: string;
      pitPartnerFee: "0";
    }
  | {
      kind: "cow-status";
      orderUid: string;
      status: string;
      settlementTxHash: string | null;
    }
  | {
      kind: "cow-fill";
      orderUid: string;
      settlementTxHash: string | null;
      sellToken: string;
      buyToken: string;
      sellDecimals: number;
      buyDecimals: number;
      sellAmount: string;
      sellAmountBeforeFees: string;
      buyAmount: string;
      pitPartnerFee: "0";
      taxlotEventId: string | null;
      reconciliation:
        "MATCH" | "MISSING_RECORD" | "ECONOMIC_MISMATCH" | "CSV_MISMATCH";
      economicDifferences: string[];
      metadataDifferences: string[];
    }
  | {
      kind: "hyperliquid-submission";
      market: string;
      side: "buy" | "sell";
      size: string;
      limitPrice: string;
      reduceOnly: boolean;
      orderId: string | null;
      status: string;
      pitBuilderFee: "0";
      taxlotStatus: "unsupported_derivative_v1";
    }
  | {
      kind: "hyperliquid-status";
      orderId: string;
      status: string;
      positionSize: string | null;
      openOrder: boolean;
      observedAt: string;
    }
  | {
      kind: "hyperliquid-fill";
      market: string;
      side: string;
      size: string;
      price: string;
      exchangeFee: string | null;
      orderId: string | null;
      fillId: string;
      terminalState: string | null;
      pitBuilderFee: "0";
      rawEvidenceId: string | null;
      taxlotStatus: "unsupported_derivative_v1";
      reconciliation:
        | "RAW_ONLY"
        | "MISSING_RECORD"
        | "FALSE_TAXLOT_EVENT"
        | "EVIDENCE_MISMATCH";
    }
  | {
      kind: "amendment";
      amends: string;
      reason: "correction" | "later-confirmation" | "reconciliation";
    };
export type AcceptanceEntry = Readonly<{
  version: 1;
  id: string;
  sessionId: string;
  at: string;
  data: AcceptanceEntryData;
}>;
const address = /^0x[0-9a-fA-F]{40}$/;
const safeId = /^[a-zA-Z0-9:._-]{1,256}$/;
const decimal = /^(0|[1-9]\d*)(\.\d+)?$/;
function assertSession(s: AcceptanceSession) {
  if (
    s.version !== 1 ||
    !["cow", "hyperliquid"].includes(s.protocol) ||
    !["operator", "synthetic-fixture"].includes(s.source) ||
    Object.keys(s).length !== 7 ||
    !address.test(s.account) ||
    !safeId.test(s.id) ||
    (s.protocol === "cow"
      ? s.environment !== "ethereum-sepolia:11155111"
      : s.environment !== "hyperliquid:testnet") ||
    !Number.isFinite(Date.parse(s.startedAt))
  )
    throw new Error("Invalid acceptance session");
}
function assertEntry(data: AcceptanceEntryData) {
  // Explicit fields only. No caller-supplied raw payload, headers, cookies or signatures.
  const fields: Record<AcceptanceEntryData["kind"], readonly string[]> = {
    readiness: ["items"],
    checkpoint: ["action", "confirmed"],
    "cow-quote": [
      "quoteIdentity",
      "sellToken",
      "buyToken",
      "sellBudget",
      "expectedBuy",
      "pitPartnerFee",
      "obtainedAt",
    ],
    "cow-approval": ["quoteIdentity", "outcome"],
    "cow-submission": ["quoteIdentity", "orderUid", "pitPartnerFee"],
    "cow-status": ["orderUid", "status", "settlementTxHash"],
    "cow-fill": [
      "orderUid",
      "settlementTxHash",
      "sellToken",
      "buyToken",
      "sellDecimals",
      "buyDecimals",
      "sellAmount",
      "sellAmountBeforeFees",
      "buyAmount",
      "pitPartnerFee",
      "taxlotEventId",
      "reconciliation",
      "economicDifferences",
      "metadataDifferences",
    ],
    "hyperliquid-submission": [
      "market",
      "side",
      "size",
      "limitPrice",
      "reduceOnly",
      "orderId",
      "status",
      "pitBuilderFee",
      "taxlotStatus",
    ],
    "hyperliquid-status": [
      "orderId",
      "status",
      "positionSize",
      "openOrder",
      "observedAt",
    ],
    "hyperliquid-fill": [
      "market",
      "side",
      "size",
      "price",
      "exchangeFee",
      "orderId",
      "fillId",
      "terminalState",
      "pitBuilderFee",
      "rawEvidenceId",
      "taxlotStatus",
      "reconciliation",
    ],
    amendment: ["amends", "reason"],
  };
  if (
    !data ||
    !Object.hasOwn(fields, data.kind) ||
    Object.keys(data).length !== fields[data.kind].length + 1 ||
    Object.keys(data).some(
      (key) => key !== "kind" && !fields[data.kind].includes(key),
    )
  )
    throw new Error("Unsupported acceptance evidence field");
  const d = data as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(d)) {
    if (key === "kind") continue;
    if (
      typeof value === "string" &&
      (value.length > 256 || /[\r\n]/.test(value))
    )
      throw new Error("Unsafe acceptance evidence value");
  }
  if (
    ("pitPartnerFee" in data && data.pitPartnerFee !== "0") ||
    ("pitBuilderFee" in data && data.pitBuilderFee !== "0") ||
    ("taxlotStatus" in data &&
      data.taxlotStatus !== "unsupported_derivative_v1")
  )
    throw new Error("Acceptance fee/accounting invariant violated");
  if (
    data.kind === "cow-quote" &&
    (!address.test(data.sellToken) ||
      !address.test(data.buyToken) ||
      !decimal.test(data.sellBudget) ||
      !decimal.test(data.expectedBuy))
  )
    throw new Error("Invalid CoW quote evidence");
  if (
    data.kind === "cow-fill" &&
    (!address.test(data.sellToken) ||
      !address.test(data.buyToken) ||
      ![data.sellDecimals, data.buyDecimals].every(
        (v) => Number.isInteger(v) && v >= 0 && v <= 255,
      ) ||
      ![data.sellAmount, data.sellAmountBeforeFees, data.buyAmount].every((v) =>
        decimal.test(v),
      ))
  )
    throw new Error("Invalid CoW fill evidence");
  if (
    data.kind === "cow-fill" &&
    ![data.economicDifferences, data.metadataDifferences].every(
      (items) =>
        Array.isArray(items) &&
        items.every(
          (item) =>
            typeof item === "string" && safeId.test(item) && item.length <= 40,
        ),
    )
  )
    throw new Error("Invalid reconciliation differences");
  if (
    data.kind === "hyperliquid-fill" &&
    (![data.size, data.price].every((v) => decimal.test(v)) ||
      !safeId.test(data.fillId))
  )
    throw new Error("Invalid derivative fill evidence");
  if (
    data.kind === "cow-status" &&
    ![
      "open",
      "fulfilled",
      "cancelled",
      "expired",
      "presignaturePending",
      "pending",
      "traded",
    ].includes(data.status)
  )
    throw new Error("Invalid CoW status");
  if (
    data.kind === "hyperliquid-status" &&
    (!safeId.test(data.status) ||
      data.status.length > 80 ||
      (data.positionSize !== null &&
        !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(data.positionSize)) ||
      !Number.isFinite(Date.parse(data.observedAt)))
  )
    throw new Error("Invalid Hyperliquid status");
  if (
    data.kind === "hyperliquid-submission" &&
    (!["submitted", "filled", "resting", "waitingForFill"].includes(
      data.status,
    ) ||
      !decimal.test(data.size) ||
      !decimal.test(data.limitPrice))
  )
    throw new Error("Invalid Hyperliquid submission");
  for (const value of [
    "quoteIdentity",
    "orderUid",
    "orderId",
    "fillId",
    "taxlotEventId",
    "rawEvidenceId",
    "market",
  ] as const) {
    const candidate = d[value];
    if (
      candidate !== undefined &&
      candidate !== null &&
      (typeof candidate !== "string" || !safeId.test(candidate))
    )
      throw new Error("Invalid acceptance identifier");
  }
  for (const value of ["settlementTxHash"] as const) {
    const candidate = d[value];
    if (
      candidate !== undefined &&
      candidate !== null &&
      (typeof candidate !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(candidate))
    )
      throw new Error("Invalid public transaction hash");
  }
  if (
    data.kind === "readiness" &&
    (!Array.isArray(data.items) ||
      data.items.length > 50 ||
      data.items.some(
        (i) =>
          !safeId.test(i.id) ||
          !["PASS", "FAIL", "UNKNOWN"].includes(i.status) ||
          Object.keys(i).some((k) => !["id", "status"].includes(k)),
      ))
  )
    throw new Error("Invalid readiness evidence");
  if (data.kind === "amendment" && !safeId.test(data.amends))
    throw new Error("Invalid amendment");
}
async function db() {
  assertStorageEnabled();
  return openDB("pit-acceptance-evidence-v1", 1, {
    upgrade(database) {
      database.createObjectStore("sessions", { keyPath: "id" });
      database.createObjectStore("entries", { keyPath: "id" });
    },
  });
}
export async function startAcceptanceSession(
  protocol: AcceptanceProtocol,
  account: string,
  source: AcceptanceSession["source"] = "operator",
) {
  assertStorageEnabled();
  const session: AcceptanceSession = {
    version: 1,
    id: crypto.randomUUID(),
    protocol,
    account: account.toLowerCase() as `0x${string}`,
    environment:
      protocol === "cow" ? "ethereum-sepolia:11155111" : "hyperliquid:testnet",
    startedAt: new Date().toISOString(),
    source,
  };
  assertSession(session);
  const database = await db();
  try {
    await database.add("sessions", session);
  } finally {
    database.close();
  }
  return session;
}
export async function appendAcceptanceEntry(
  session: AcceptanceSession,
  key: string,
  data: AcceptanceEntryData,
) {
  assertSession(session);
  assertEntry(data);
  if (!safeId.test(key)) throw new Error("Invalid evidence key");
  if (
    (session.protocol === "cow" && data.kind.startsWith("hyperliquid")) ||
    (session.protocol === "hyperliquid" && data.kind.startsWith("cow"))
  )
    throw new Error("Wrong protocol evidence");
  const entry: AcceptanceEntry = {
    version: 1,
    id: `${session.id}:${key}`,
    sessionId: session.id,
    at: new Date().toISOString(),
    data: structuredClone(data),
  };
  const database = await db();
  try {
    const stored = await database.get("sessions", session.id);
    if (!stored || JSON.stringify(stored) !== JSON.stringify(session))
      throw new Error("Acceptance session identity mismatch");
    if (
      data.kind === "amendment" &&
      (!data.amends.startsWith(`${session.id}:`) ||
        !(await database.get("entries", data.amends)))
    )
      throw new Error("Amendment target not found");
    try {
      await database.add("entries", entry);
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "ConstraintError")
        return false;
      throw error;
    }
  } finally {
    database.close();
  }
}
export async function listAcceptanceSessions(account: string) {
  assertStorageEnabled();
  if (!address.test(account)) throw new Error("Invalid account");
  const database = await db();
  try {
    return ((await database.getAll("sessions")) as AcceptanceSession[])
      .filter((s) => s.account === account.toLowerCase())
      .map((s) => {
        assertSession(s);
        return s;
      })
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  } finally {
    database.close();
  }
}
export async function listAcceptanceEntries(session: AcceptanceSession) {
  assertSession(session);
  const database = await db();
  try {
    return ((await database.getAll("entries")) as AcceptanceEntry[])
      .filter((e) => e.sessionId === session.id)
      .map((e) => {
        assertStoredEntry(e, session);
        return e;
      })
      .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  } finally {
    database.close();
  }
}
function assertStoredEntry(entry: AcceptanceEntry, session: AcceptanceSession) {
  if (
    entry.version !== 1 ||
    entry.sessionId !== session.id ||
    !entry.id.startsWith(`${session.id}:`) ||
    !Number.isFinite(Date.parse(entry.at)) ||
    Object.keys(entry).length !== 5
  )
    throw new Error("Invalid stored acceptance evidence");
  assertEntry(entry.data);
}
export function acceptanceReport(
  session: AcceptanceSession,
  entries: AcceptanceEntry[],
) {
  assertSession(session);
  const safe = entries.filter((e) => e.sessionId === session.id);
  for (const entry of safe) assertStoredEntry(entry, session);
  const json = JSON.stringify({ session, entries: safe }, null, 2);
  const lines = [
    "# PIT acceptance evidence",
    "",
    "Evidence capture does not mean live acceptance has passed.",
    "",
    `Session: ${session.id}`,
    `Source: ${session.source}`,
    `Protocol: ${session.protocol}`,
    `Account: ${session.account}`,
    `Environment: ${session.environment}`,
    `Started: ${session.startedAt}`,
    "",
    "## Timeline",
    "",
  ];
  for (const e of safe)
    lines.push(
      `- ${e.at} — ${e.data.kind} (${e.id}): ${JSON.stringify(e.data)}`,
    );
  lines.push(
    "",
    "## Acceptance",
    "",
    "UNVERIFIED until independent protocol, fee, accounting and terminal-state checks pass.",
    "",
  );
  return { json, markdown: lines.join("\n") };
}
// Extract only public identifiers from an already returned exchange response.
export function hyperliquidSubmissionIdentity(result: unknown): {
  orderId: string | null;
  status: string;
} {
  const response = (
    result as { response?: { data?: { statuses?: unknown[] } } } | null
  )?.response;
  const first = response?.data?.statuses?.[0];
  if (!first || typeof first !== "object")
    return { orderId: null, status: "submitted" };
  for (const key of ["filled", "resting", "waitingForFill"] as const) {
    const value = (first as Record<string, unknown>)[key];
    if (value && typeof value === "object") {
      const oid = (value as Record<string, unknown>).oid;
      return {
        orderId:
          (typeof oid === "number" && Number.isSafeInteger(oid)) ||
          (typeof oid === "string" && /^[0-9]+$/.test(oid))
            ? String(oid)
            : null,
        status: key,
      };
    }
  }
  return { orderId: null, status: "submitted" };
}
