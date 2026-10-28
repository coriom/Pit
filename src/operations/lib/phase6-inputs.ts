import { getAddress, type Address } from "viem";
import { parseCsv } from "../../lib/crypto-data-workshop";
import { positiveUnits, requiredAddress } from "./inputs";
import { metadataUri, unsignedInteger } from "./phase5-inputs";

const MAX_UINT = (1n << 256n) - 1n;
function csvRows(text: string, maxBytes = 262_144): string[][] {
  if (new TextEncoder().encode(text).length > maxBytes) throw Error("CSV exceeds the local size limit.");
  const parsed = parseCsv(text, ",", false);
  if (parsed.issues.length) throw Error(parsed.issues.join(" "));
  return parsed.rows;
}

export function erc1155Transfers(text: string) {
  const rows = csvRows(text);
  if (rows[0]?.map((s) => s.trim().toLowerCase()).join(",") === "tokenid,amount,recipient") rows.shift();
  if (rows.length < 1 || rows.length > 40) throw Error("Enter 1–40 ERC-1155 transfers.");
  const seen = new Set<string>();
  return rows.map((row, index) => {
    if (row.length !== 3) throw Error(`Row ${index + 1} needs tokenId,amount,recipient.`);
    const id = unsignedInteger(row[0].trim(), 0n, MAX_UINT);
    const amount = unsignedInteger(row[1].trim(), 1n, MAX_UINT);
    const recipient = requiredAddress(row[2].trim());
    const key = `${id}:${recipient.toLowerCase()}`;
    if (seen.has(key)) throw Error(`Duplicate token ID and recipient at row ${index + 1}.`);
    seen.add(key);
    return { id, amount, recipient };
  });
}

export function allocationRows(text: string, mode: "equal" | "explicit" | "proportional" | "percentage") {
  const rows = csvRows(text);
  if (rows[0]?.[0]?.trim().toLowerCase() === "address") rows.shift();
  if (rows.length < 1 || rows.length > 2000) throw Error("Enter 1–2000 recipients.");
  const seen = new Set<string>();
  return rows.map((row, index) => {
    if (row.length !== (mode === "equal" ? 1 : 2)) throw Error(`Invalid allocation CSV row ${index + 1}.`);
    const address = requiredAddress(row[0].trim());
    if (seen.has(address.toLowerCase())) throw Error(`Duplicate recipient at row ${index + 1}.`);
    seen.add(address.toLowerCase());
    let weight = 1n;
    if (mode !== "equal") weight = unsignedInteger(row[1].trim(), 0n, MAX_UINT);
    return { address, weight };
  });
}

export function composeAirdrop(input: { mode: "equal" | "explicit" | "proportional" | "percentage"; recipients: string; total: string; decimals: number; min?: string; exclude?: string }) {
  if (!Number.isInteger(input.decimals) || input.decimals < 0 || input.decimals > 36) throw Error("Token decimals must be 0–36.");
  const total = positiveUnits(input.total, input.decimals);
  const rows = allocationRows(input.recipients, input.mode);
  const excluded = new Set((input.exclude ?? "").trim().split(/\r?\n/).filter(Boolean).map((s) => getAddress(s.trim()).toLowerCase()));
  const active = rows.filter((r) => !excluded.has(r.address.toLowerCase()));
  if (!active.length) throw Error("No eligible recipients remain.");
  const minimum = input.min ? positiveUnits(input.min, input.decimals) : 0n;
  let allocated: { address: Address; amount: bigint }[];
  if (input.mode === "explicit") {
    allocated = active.map((r) => ({ address: r.address, amount: r.weight }));
    if (allocated.reduce((sum, row) => sum + row.amount, 0n) !== total) throw Error("Explicit raw-unit amounts must sum exactly to the total.");
  } else {
    const weights = active.map((r) => r.weight);
    const sum = weights.reduce((a, b) => a + b, 0n);
    if (sum === 0n) throw Error("All allocation weights are zero.");
    if (input.mode === "percentage" && sum !== 10_000n) throw Error("Percentage weights must total exactly 10000 basis points.");
    const base = active.map((r) => ({ address: r.address, amount: total * r.weight / sum, remainder: total * r.weight % sum }));
    let dust = total - base.reduce((a, r) => a + r.amount, 0n);
    const order = base.map((_, i) => i).sort((a, b) => base[a].remainder === base[b].remainder ? a - b : base[a].remainder > base[b].remainder ? -1 : 1);
    for (const index of order) { if (dust === 0n) break; base[index].amount++; dust--; }
    allocated = base.map((r) => ({ address: r.address, amount: r.amount }));
  }
  if (allocated.some((r) => r.amount === 0n || r.amount < minimum)) throw Error("A recipient has zero or less than the minimum allocation.");
  if (allocated.reduce((sum, row) => sum + row.amount, 0n) !== total) throw Error("Allocation conservation failed.");
  const batches = Array.from({ length: Math.ceil(allocated.length / 100) }, (_, i) => allocated.slice(i * 100, i * 100 + 100));
  return { allocated, batches, total, excludedCount: rows.length - active.length, assumption: "User-supplied snapshot only; no holder discovery. Largest remainders, then CSV order, receive indivisible dust." };
}

export type NftMetadata = { name: string; description?: string; image?: string; attributes?: { trait_type: string; value: string | number }[] };
export function validateNftMetadata(text: string): NftMetadata {
  if (new TextEncoder().encode(text).length > 65_536) throw Error("Metadata JSON exceeds 64 KiB.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw Error("Invalid metadata JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Metadata must be one JSON object.");
  const item = value as Record<string, unknown>;
  if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 120) throw Error("Metadata needs a short name.");
  if (item.description !== undefined && (typeof item.description !== "string" || item.description.length > 4000)) throw Error("Invalid description.");
  if (item.image !== undefined) {
    if (typeof item.image !== "string") throw Error("Metadata image must be an explicit URI string.");
    metadataUri(item.image);
  }
  if (item.attributes !== undefined && (!Array.isArray(item.attributes) || item.attributes.length > 32 || item.attributes.some((a) => !a || typeof a !== "object" || typeof a.trait_type !== "string" || a.trait_type.length > 64 || !["string", "number"].includes(typeof a.value)))) throw Error("Invalid metadata attributes.");
  return { name: item.name.trim(), ...(item.description === undefined ? {} : { description: item.description as string }), ...(item.image === undefined ? {} : { image: item.image as string }), ...(item.attributes === undefined ? {} : { attributes: item.attributes as NftMetadata["attributes"] }) };
}

/** Explicit browser fetch only; the remote metadata host sees the request. No PIT proxy. */
export async function fetchNftMetadata(uri: string, fetcher: typeof fetch = fetch): Promise<NftMetadata> {
  let url: URL;
  if (uri.startsWith("ipfs://")) {
    const path = uri.slice(7);
    if (!/^[a-zA-Z0-9]+(?:\/[a-zA-Z0-9._~-]+)*$/.test(path) || path.includes("..")) throw Error("Invalid IPFS content path.");
    url = new URL(`https://ipfs.io/ipfs/${path}`);
  } else {
    url = new URL(uri);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname || url.port) throw Error("Metadata URL must use ordinary HTTPS without credentials or a custom port.");
  }
  if (/^(?:localhost\.?|.*\.localhost\.?|0\..*|127\..*|10\..*|192\.168\..*|169\.254\..*|172\.(?:1[6-9]|2\d|3[01])\..*|\[(?:::1|f[cd][0-9a-f:]*|fe80[0-9a-f:]*)\]|.*\.(?:local|internal))$/i.test(url.hostname)) throw Error("Private or local metadata hosts are unsupported.");
  const response = await fetcher.call(globalThis, url, { signal: AbortSignal.timeout(4000), redirect: "error", credentials: "omit", referrerPolicy: "no-referrer" });
  if (!response.ok) throw Error(`Metadata HTTP ${response.status}.`);
  if (!String(response.headers.get("content-type")).toLowerCase().includes("json")) throw Error("Metadata endpoint did not return JSON.");
  if (new URL(response.url || url).protocol !== "https:") throw Error("Metadata resolved outside HTTPS.");
  if (!response.body) throw Error("Metadata body unavailable.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65_536) throw Error("Metadata response exceeds 64 KiB.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return validateNftMetadata(new TextDecoder().decode(bytes));
}

export function metadataCsv(text: string, standard: "erc721" | "erc1155") {
  const rows = csvRows(text, 131_072);
  if (rows[0]?.map((s) => s.trim().toLowerCase()).join(",") === "tokenid,name,description,image") rows.shift();
  if (rows.length < 1 || rows.length > 100) throw Error("Enter 1–100 metadata rows.");
  const ids = new Set<string>();
  return rows.map((row) => {
    if (row.length !== 4) throw Error("Metadata CSV needs tokenId,name,description,image.");
    const id = unsignedInteger(row[0].trim(), 0n, MAX_UINT);
    if (ids.has(String(id))) throw Error("Duplicate metadata token ID.");
    ids.add(String(id));
    const item = validateNftMetadata(JSON.stringify({ name: row[1], description: row[2], image: row[3] }));
    return { filename: standard === "erc1155" ? `${id.toString(16).padStart(64, "0")}.json` : `${id}.json`, id, item };
  });
}

/** Portable POSIX tar of bounded, validated JSON files; no external storage. */
export function filesTar(filesInput: { filename: string; body: string }[]): Uint8Array {
  if (filesInput.length < 1 || filesInput.length > 101) throw Error("Archive file count is outside the supported limit.");
  const encoder = new TextEncoder();
  const files = filesInput.map(({ filename, body }) => {
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(filename) || filename.startsWith(".") || filename.includes("..")) throw Error("Unsafe archive filename.");
    const bytes = encoder.encode(body);
    if (bytes.length > 262_144) throw Error("Archive member exceeds 256 KiB.");
    return { name: filename, body: bytes };
  });
  const blocks = files.map((file) => Math.ceil(file.body.length / 512) + 1);
  const archive = new Uint8Array((blocks.reduce((a, b) => a + b, 0) + 2) * 512);
  const field = (header: Uint8Array, start: number, width: number, value: string) => {
    const bytes = encoder.encode(value);
    if (bytes.length > width) throw Error("Metadata archive field is too long.");
    header.set(bytes, start);
  };
  let offset = 0;
  for (const file of files) {
    const header = archive.subarray(offset, offset + 512);
    field(header, 0, 100, file.name);
    field(header, 100, 8, "0000644\0");
    field(header, 108, 8, "0000000\0");
    field(header, 116, 8, "0000000\0");
    field(header, 124, 12, `${file.body.length.toString(8).padStart(11, "0")}\0`);
    field(header, 136, 12, "00000000000\0");
    header.fill(32, 148, 156);
    field(header, 156, 1, "0");
    field(header, 257, 6, "ustar\0");
    field(header, 263, 2, "00");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    field(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
    offset += 512;
    archive.set(file.body, offset);
    offset += Math.ceil(file.body.length / 512) * 512;
  }
  return archive;
}

export function metadataTar(items: ReturnType<typeof metadataCsv>): Uint8Array {
  return filesTar(items.map(({ filename, item }) => ({ filename, body: `${JSON.stringify(item, null, 2)}\n` })));
}
