/* PIT_STAGING_ACCOUNTING_AUDIT_ONLY: never include in a normal production build. */
import {
  appendEvent,
  assertEvent,
  downloadCSV,
  eventDB,
  eventsCSV,
  listEvents,
  type TaxlotEvent,
} from "../../src/lib/events";
import { storageEnabled } from "../../src/lib/storage-policy";

const ORIGIN = "https://pit-testnet-staging-corioms-projects.vercel.app";
const PATH = "/__pit-staging-accounting/";
const ACCOUNT = "pit-staging-synthetic-account";
const ID_PREFIX = "pit-staging-synthetic-";
const CLEANUP_TARGET_ID = "pit-staging-synthetic-92c4578a-472e-452e-99f8-a47653bd1e26";
const SELL = "0.005";
const BUY = "10.25";
const output = document.getElementById("report") as HTMLPreElement;
const fileInput = document.getElementById("csv-file") as HTMLInputElement;
const fileState = document.getElementById("file-state") as HTMLPreElement;
const validateButton = document.getElementById("validate") as HTMLButtonElement;
const cleanupButton = document.getElementById("cleanup") as HTMLButtonElement;
let csvVerified = false;
let selectionEventReceived = false;
let selectedFile: File | null = null;
let selectedForFixture: string | null = null;
let validationFileAvailable: boolean | null = null;

function assertSite() {
  if (
    location.origin !== ORIGIN ||
    location.pathname !== PATH ||
    window.top !== window ||
    !storageEnabled()
  ) throw Error("BLOCKED: exact approved staging origin/path required");
}

function fixtureId() {
  const match = /^#(pit-staging-synthetic-[0-9a-f-]{36})$/.exec(location.hash);
  return match?.[1] ?? null;
}

function report(step: string, detail: Record<string, unknown>) {
  output.textContent = JSON.stringify({
    status: step,
    evidence: "SYNTHETIC — no wallet, signature, trade or tax conclusion",
    origin: location.origin,
    ...detail,
  }, null, 2);
}

function showFileState() {
  fileState.textContent = JSON.stringify({
    selectionEventReceived,
    inputFileListLength: fileInput.files?.length ?? 0,
    fileObjectCaptured: selectedFile !== null,
    selectedFilename: selectedFile?.name ?? null,
    fileSizeBytes: selectedFile?.size ?? null,
    inputAttached: fileInput.isConnected,
    validationFileAvailable,
  }, null, 2);
  validateButton.disabled = !selectedFile || selectedForFixture !== fixtureId();
  cleanupButton.disabled = !csvVerified;
}

fileInput.addEventListener("change", () => {
  selectionEventReceived = true;
  selectedFile = fileInput.files?.length === 1 ? fileInput.files[0] : null;
  selectedForFixture = selectedFile ? fixtureId() : null;
  validationFileAvailable = null;
  csvVerified = false;
  showFileState();
});
fileInput.addEventListener("cancel", () => {
  selectedFile = null;
  selectedForFixture = null;
  validationFileAvailable = null;
  csvVerified = false;
  showFileState();
});
showFileState();

async function emptyStores() {
  const db = await eventDB();
  const tx = db.transaction(["events", "raw", "meta"], "readonly");
  const counts = await Promise.all([
    tx.objectStore("events").count(),
    tx.objectStore("raw").count(),
    tx.objectStore("meta").count(),
  ]);
  await tx.done;
  return counts.every((count) => count === 0);
}

async function savedFixture() {
  const id = fixtureId();
  if (!id) throw Error("No fixture ID in this page URL; create one first");
  const db = await eventDB();
  const tx = db.transaction(["events", "raw", "meta"], "readonly");
  const [event, raw, eventCount, rawCount, metaCount] = await Promise.all([
    tx.objectStore("events").get(id),
    tx.objectStore("raw").get(id),
    tx.objectStore("events").count(),
    tx.objectStore("raw").count(),
    tx.objectStore("meta").count(),
  ]);
  await tx.done;
  if (
    eventCount !== 1 || rawCount !== 1 || metaCount !== 1 ||
    !event || raw?.id !== id || raw.payload?.synthetic !== true ||
    event.account !== ACCOUNT || event.source !== "pit:staging-synthetic" ||
    event.id !== id || event.type !== "trade" ||
    event.asset !== "WETH" || event.quantity !== SELL ||
    event.counter_asset !== "USDC" || event.counter_quantity !== BUY ||
    event.fee?.length !== 0
  ) throw Error("BLOCKED: fixture or store state differs; no cleanup performed");
  assertEvent(event);
  return event;
}

async function create() {
  assertSite();
  if (location.hash || !(await emptyStores()))
    throw Error("BLOCKED: use an isolated browser with no existing PIT records");
  const id = ID_PREFIX + crypto.randomUUID();
  const event: TaxlotEvent = {
    version: 1,
    id,
    type: "trade",
    timestamp: new Date().toISOString(),
    sequence: 0,
    asset: "WETH",
    quantity: SELL,
    counter_asset: "USDC",
    counter_quantity: BUY,
    fee: [],
    source: "pit:staging-synthetic",
    account: ACCOUNT,
    raw_row_ref: id,
  };
  assertEvent(event);
  if (!(await appendEvent(event, { synthetic: true, id })))
    throw Error("BLOCKED: synthetic fixture ID already exists");
  location.hash = id;
  report("CREATED — reload this page before verifying", { id, schemaValid: true });
}

async function verify() {
  assertSite();
  const event = await savedFixture();
  const listed = await listEvents(ACCOUNT);
  if (listed.length !== 1 || listed[0].id !== event.id)
    throw Error("BLOCKED: PIT listEvents does not return exactly the fixture");
  report("PERSISTED — schema and exact economic fields verified", {
    id: event.id,
    schemaValid: true,
    type: event.type,
    asset: event.asset,
    quantity: event.quantity,
    counterAsset: event.counter_asset,
    counterQuantity: event.counter_quantity,
    sequence: event.sequence,
  });
}

async function exportCSV() {
  assertSite();
  await savedFixture();
  const count = await downloadCSV(ACCOUNT);
  if (count !== 1) throw Error("BLOCKED: CSV export count was not one");
  report("DOWNLOADED — select the downloaded CSV for exact readback", { count });
}

async function validateDownload() {
  assertSite();
  const file = selectedForFixture === fixtureId() ? selectedFile : null;
  validationFileAvailable = file !== null;
  showFileState();
  if (!file) throw Error("Select the downloaded PIT CSV file");
  await savedFixture();
  const expected = eventsCSV(await listEvents(ACCOUNT));
  if ((await file.text()) !== expected)
    throw Error("FAIL: downloaded CSV differs from PIT serializer output");
  csvVerified = true;
  showFileState();
  report("CSV VERIFIED — exact PIT serializer and economic fields match", {
    rowCount: 1,
    type: "trade",
    asset: "WETH",
    quantity: SELL,
    counterAsset: "USDC",
    counterQuantity: BUY,
  });
}

async function cleanup() {
  assertSite();
  if (!csvVerified) throw Error("Verify the downloaded CSV before cleanup");
  const event = await savedFixture();
  const db = await eventDB();
  const tx = db.transaction(["events", "raw", "meta"], "readwrite");
  if ((await tx.objectStore("meta").get("sequence")) !== 1)
    throw Error("BLOCKED: sequence changed; no cleanup performed");
  await tx.objectStore("events").delete(event.id);
  await tx.objectStore("raw").delete(event.id);
  await tx.objectStore("meta").delete("sequence");
  await tx.done;
  if (!(await emptyStores())) throw Error("FAIL: fixture cleanup incomplete");
  location.hash = "";
  selectedFile = null;
  selectedForFixture = null;
  csvVerified = false;
  showFileState();
  report("PASS — synthetic fixture cleaned; stores empty", {
    fixtureId: event.id,
    preexistingRecords: 0,
    remainingRecords: 0,
    downloadedCSVVerified: true,
  });
}

async function verifyAbsent() {
  assertSite();
  const id = fixtureId();
  if (id !== CLEANUP_TARGET_ID)
    throw Error("BLOCKED: exact Phase Y-D fixture ID required in URL fragment");
  if (typeof indexedDB.databases !== "function")
    throw Error("BLOCKED: IndexedDB database inspection unavailable");
  const databases = await indexedDB.databases();
  if (!databases.some((database) => database.name === "pit-taxlot-v1" && database.version === 1))
    throw Error("BLOCKED: existing PIT IndexedDB database not found at version 1");

  // The database must already exist at v1, so eventDB() opens it without an upgrade.
  const db = await eventDB();
  try {
    const tx = db.transaction(["events", "raw", "meta"], "readonly");
    const [event, raw, eventCount, rawCount, metaCount] = await Promise.all([
      tx.objectStore("events").get(id),
      tx.objectStore("raw").get(id),
      tx.objectStore("events").count(),
      tx.objectStore("raw").count(),
      tx.objectStore("meta").count(),
    ]);
    await tx.done;
    const counts = { events: eventCount, raw: rawCount, meta: metaCount };
    if (event || raw) {
      report("FAIL — synthetic fixture still present", { fixtureId: id, counts, readOnly: true });
    } else if (eventCount || rawCount || metaCount) {
      report("FAIL — unexpected PIT records remain", { fixtureId: id, counts, readOnly: true });
    } else {
      report("PASS — synthetic fixture absent after reload", { fixtureId: id, counts, readOnly: true });
    }
  } finally {
    db.close();
  }
}

const actions: Record<string, () => Promise<void>> = {
  create,
  verify,
  export: exportCSV,
  validate: validateDownload,
  cleanup,
  absence: verifyAbsent,
};
for (const [action, run] of Object.entries(actions)) {
  document.getElementById(action)?.addEventListener("click", () => {
    void run().catch((error) => report("BLOCKED", { reason: String(error) }));
  });
}
try {
  assertSite();
  report("READY — synthetic fixture only; no wallet required", {
    fixturePresentInURL: fixtureId() !== null,
  });
} catch (error) {
  report("BLOCKED", { reason: String(error) });
  for (const button of document.querySelectorAll("button")) button.disabled = true;
}
