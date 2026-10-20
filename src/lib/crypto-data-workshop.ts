/** Bounded, pure CSV inspection. This schema is deliberately unrelated to Taxlot. */
export const WORKSHOP_VERSION = "pit.crypto-data-workshop.local.v1";
export const MAX_CSV_BYTES = 262_144;
export const MAX_CSV_ROWS = 1_000;
export const MAX_CSV_COLUMNS = 30;
export const MAX_CSV_CELL = 2_048;
export type Delimiter = "," | ";" | "\t";
export type DateFormat = "iso-offset" | "utc-date" | "unix-seconds";
export type Mapping = {
  recordId: string;
  chainId: string;
  eventId: string;
  timestampUtc: string;
  amount: string;
  note: string;
};
export const EMPTY_MAPPING: Mapping = {
  recordId: "",
  chainId: "",
  eventId: "",
  timestampUtc: "",
  amount: "",
  note: "",
};
export type WorkshopInput =
  | { mode: "inspect"; text: string; delimiter: Delimiter; hasHeader: boolean }
  | {
      mode: "normalize" | "dedupe";
      text: string;
      delimiter: Delimiter;
      hasHeader: true;
      mapping: Mapping;
      amountDecimals: number;
      dateFormat: DateFormat;
      identityFields: (keyof Mapping)[];
      decisions: Record<string, "keep" | "exclude">;
    };
export type ParsedCsv = {
  header: string[];
  rows: string[][];
  delimiter: Delimiter;
  hasHeader: boolean;
  byteLength: number;
  issues: string[];
};
export type FieldState = {
  status: "UNMAPPED" | "MISSING" | "INVALID" | "NORMALIZED";
  value: string;
  raw: string;
};
export type NormalizedRow = {
  sourceRow: number;
  fields: Record<keyof Mapping, FieldState>;
  issues: string[];
};
export type DuplicateGroup = {
  key: string;
  rowNumbers: number[];
  conflict: boolean;
};
export type WorkshopResult = {
  calculationVersion: typeof WORKSHOP_VERSION;
  mode: WorkshopInput["mode"];
  status: "COMPLETE" | "INCOMPLETE";
  parsed: ParsedCsv;
  normalizedRows: NormalizedRow[];
  duplicates: DuplicateGroup[];
  includedRows: number[];
  excludedRows: number[];
  reasons: string[];
  assumptions: string[];
};
export class WorkshopInputError extends Error {
  readonly name = "WorkshopInputError";
}
const fail = (m: string): never => {
  throw new WorkshopInputError(m);
};
const printable = (value: string) =>
  !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value);

/** Strict RFC-4180-style supported subset, including BOM, CRLF and quoted newlines. */
export function parseCsv(
  text: string,
  delimiter: Delimiter,
  hasHeader: boolean,
): ParsedCsv {
  if (![",", ";", "\t"].includes(delimiter))
    fail("Choose comma, semicolon or tab explicitly.");
  const byteLength = new TextEncoder().encode(text).length;
  if (byteLength > MAX_CSV_BYTES) fail("CSV exceeds the 256 KiB local limit.");
  if (!text) fail("CSV text is empty.");
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    state: "plain" | "quoted" | "closed" = "plain";
  const pushCell = () => {
    if (cell.length > MAX_CSV_CELL || !printable(cell))
      fail("A CSV cell is too long or contains unsupported controls.");
    row.push(cell);
    cell = "";
    if (row.length > MAX_CSV_COLUMNS) fail("CSV exceeds 30 columns.");
    state = "plain";
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
    if (rows.length > MAX_CSV_ROWS + (hasHeader ? 1 : 0))
      fail("CSV exceeds 1,000 data rows.");
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (state === "quoted") {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else state = "closed";
      } else if (ch === "\r") {
        if (source[i + 1] === "\n") i++;
        cell += "\n";
      } else cell += ch;
      if (cell.length > MAX_CSV_CELL)
        fail("CSV cell exceeds 2,048 characters.");
      continue;
    }
    if (ch === '"') {
      if (state !== "plain" || cell) fail("Malformed CSV quote.");
      state = "quoted";
      continue;
    }
    if (ch === delimiter) {
      pushCell();
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      pushRow();
      continue;
    }
    if (state === "closed") fail("Unexpected text after closing CSV quote.");
    cell += ch;
    if (cell.length > MAX_CSV_CELL) fail("CSV cell exceeds 2,048 characters.");
  }
  if (state === "quoted") fail("CSV has an unterminated quoted field.");
  if (row.length || cell || state === "closed" || !rows.length) pushRow();
  if (rows.length === 1 && rows[0].length === 1 && rows[0][0] === "")
    fail("CSV contains no data.");
  const header = hasHeader
    ? rows.shift()!
    : rows[0].map((_, i) => `Column ${i + 1}`);
  if (!rows.length) fail("CSV has no data rows.");
  if (
    !header.length ||
    header.some((h) => !h.trim()) ||
    new Set(header).size !== header.length
  )
    fail("Header names must be nonempty and unique.");
  const issues: string[] = [];
  rows.forEach((r, i) => {
    if (r.length !== header.length)
      issues.push(
        `Row ${i + 1} has ${r.length} cells; expected ${header.length}.`,
      );
  });
  return { header, rows, delimiter, hasHeader, byteLength, issues };
}

export function inspectDelimiters(text: string) {
  return ([",", ";", "\t"] as const).map((delimiter) => {
    try {
      const p = parseCsv(text, delimiter, true);
      return {
        delimiter,
        columns: p.header.length,
        rows: p.rows.length,
        consistent: p.issues.length === 0,
      };
    } catch {
      return { delimiter, columns: 0, rows: 0, consistent: false };
    }
  });
}

export function normalizeDecimal(raw: string, decimals: number): string {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 18)
    fail("Amount precision must be 0–18 decimal places.");
  if (!/^-?(?:0|[1-9][0-9]{0,60})(?:\.[0-9]+)?$/.test(raw))
    fail(
      "Amount must use an ungrouped decimal string; no exponent or locale separators.",
    );
  const negative = raw.startsWith("-");
  const [whole, fraction = ""] = (negative ? raw.slice(1) : raw).split(".");
  if (fraction.length > decimals)
    fail("Amount has excess precision; no silent rounding is performed.");
  const units =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  return `${negative && units !== 0n ? "-" : ""}${units}`;
}
const leap = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
const days = (y: number, m: number) =>
  [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0;
export function normalizeTimestamp(raw: string, format: DateFormat): string {
  if (format === "unix-seconds") {
    if (!/^(?:0|[1-9][0-9]{0,10})$/.test(raw))
      fail("Unix seconds must be a bounded nonnegative integer.");
    const ms = BigInt(raw) * 1000n;
    if (ms > 4_102_444_800_000n) fail("Timestamp exceeds year 2100.");
    return new Date(Number(ms)).toISOString();
  }
  const re =
    format === "utc-date"
      ? /^(\d{4})-(\d{2})-(\d{2})$/
      : /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/;
  const m = re.exec(raw);
  if (!m)
    throw new WorkshopInputError(
      "Timestamp must match the explicitly selected UTC date or ISO offset format.",
    );
  const [y, mo, d, h, min, sec] = [
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0),
  ];
  if (
    y < 1970 ||
    y > 2100 ||
    d < 1 ||
    d > days(y, mo) ||
    h > 23 ||
    min > 59 ||
    sec > 59
  )
    fail("Timestamp has an invalid calendar or clock value.");
  let offsetMinutes = 0;
  if (format === "iso-offset" && m[7] !== "Z") {
    const offset = m[7];
    const oh = Number(offset.slice(1, 3)),
      om = Number(offset.slice(4, 6));
    if (oh > 14 || om > 59 || (oh === 14 && om !== 0))
      fail("Invalid UTC offset.");
    offsetMinutes = (offset[0] === "+" ? 1 : -1) * (oh * 60 + om);
  }
  const epoch = Date.UTC(y, mo - 1, d, h, min, sec) - offsetMinutes * 60_000;
  if (epoch < 0 || epoch > 4_102_444_800_000)
    fail("Timestamp lies outside 1970–2100 UTC.");
  return new Date(epoch).toISOString();
}

const mappingKeys: (keyof Mapping)[] = [
  "recordId",
  "chainId",
  "eventId",
  "timestampUtc",
  "amount",
  "note",
];
export function normalizeRows(
  parsed: ParsedCsv,
  mapping: Mapping,
  amountDecimals: number,
  dateFormat: DateFormat,
): NormalizedRow[] {
  if (!parsed.hasHeader || parsed.issues.length)
    fail(
      "Resolve CSV structure and explicitly confirm a header before normalization.",
    );
  if (
    !Number.isSafeInteger(amountDecimals) ||
    amountDecimals < 0 ||
    amountDecimals > 18
  )
    fail("Amount precision must be 0–18.");
  if (!["iso-offset", "utc-date", "unix-seconds"].includes(dateFormat))
    fail("Unsupported timestamp format.");
  if (
    Object.keys(mapping).length !== mappingKeys.length ||
    Object.keys(mapping).some(
      (key) => !mappingKeys.includes(key as keyof Mapping),
    )
  )
    fail("Mapping has missing or unsupported fields.");
  const assigned = mappingKeys.map((k) => mapping[k]).filter(Boolean);
  if (!assigned.length) fail("Map at least one source column explicitly.");
  if (
    new Set(assigned).size !== assigned.length ||
    assigned.some((name) => !parsed.header.includes(name))
  )
    fail(
      "Each mapped source column must be unique and present in the confirmed header.",
    );
  return parsed.rows.map((cells, i) => {
    const fields = {} as Record<keyof Mapping, FieldState>,
      issues: string[] = [];
    for (const key of mappingKeys) {
      const sourceName = mapping[key],
        raw = sourceName ? cells[parsed.header.indexOf(sourceName)] : "";
      if (!sourceName) {
        fields[key] = { status: "UNMAPPED", value: "", raw: "" };
        continue;
      }
      if (raw === "") {
        fields[key] = { status: "MISSING", value: "", raw };
        issues.push(`${key}: mapped value is missing.`);
        continue;
      }
      try {
        let value = raw;
        if (key === "amount") value = normalizeDecimal(raw, amountDecimals);
        if (key === "timestampUtc") value = normalizeTimestamp(raw, dateFormat);
        if (
          key === "chainId" &&
          (!/^[1-9][0-9]{0,9}$/.test(raw) || BigInt(raw) > 4_294_967_295n)
        )
          fail("Chain ID must be a positive bounded integer.");
        if (key === "recordId" || key === "eventId" || key === "note") {
          if (!printable(raw)) fail("Unsupported control character.");
        }
        fields[key] = { status: "NORMALIZED", value, raw };
      } catch (error) {
        fields[key] = { status: "INVALID", value: "", raw };
        issues.push(
          `${key}: ${error instanceof Error ? error.message : "invalid"}`,
        );
      }
    }
    return { sourceRow: i + 1, fields, issues };
  });
}

export function analyzeDuplicates(
  rows: NormalizedRow[],
  identityFields: (keyof Mapping)[],
): DuplicateGroup[] {
  if (
    !identityFields.length ||
    identityFields.length > 4 ||
    new Set(identityFields).size !== identityFields.length ||
    identityFields.some((f) => !mappingKeys.includes(f))
  )
    fail("Choose one to four distinct mapped identity fields.");
  const groups = new Map<string, NormalizedRow[]>();
  for (const row of rows) {
    const values = identityFields.map((f) => row.fields[f]);
    if (values.some((f) => f.status !== "NORMALIZED" || !f.value))
      fail("Identity fields must be populated and valid for every row.");
    const key = JSON.stringify(values.map((f) => f.value));
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return [...groups]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      rowNumbers: group.map((r) => r.sourceRow),
      conflict: group.some(
        (r) => JSON.stringify(r.fields) !== JSON.stringify(group[0].fields),
      ),
    }));
}

export function calculateWorkshop(input: WorkshopInput): WorkshopResult {
  const parsed = parseCsv(input.text, input.delimiter, input.hasHeader);
  const reasons = [...parsed.issues];
  let normalizedRows: NormalizedRow[] = [],
    duplicates: DuplicateGroup[] = [],
    includedRows: number[] = [],
    excludedRows: number[] = [];
  if (input.mode !== "inspect") {
    normalizedRows = normalizeRows(
      parsed,
      input.mapping,
      input.amountDecimals,
      input.dateFormat,
    );
    for (const row of normalizedRows)
      reasons.push(
        ...row.issues.map((issue) => `Row ${row.sourceRow}: ${issue}`),
      );
    if (input.mode === "dedupe" && !reasons.length) {
      duplicates = analyzeDuplicates(normalizedRows, input.identityFields);
      const duplicateRows = new Set(duplicates.flatMap((g) => g.rowNumbers));
      if (
        Object.keys(input.decisions).some(
          (key) => !duplicateRows.has(Number(key)),
        )
      )
        fail("Duplicate decisions refer to an unknown or nonduplicate row.");
      for (const row of normalizedRows) {
        if (!duplicateRows.has(row.sourceRow)) {
          includedRows.push(row.sourceRow);
          continue;
        }
        const choice = input.decisions[String(row.sourceRow)];
        if (choice === "keep") includedRows.push(row.sourceRow);
        else if (choice === "exclude") excludedRows.push(row.sourceRow);
        else
          reasons.push(
            `Row ${row.sourceRow} needs an explicit keep/exclude decision.`,
          );
      }
      for (const group of duplicates)
        if (!group.rowNumbers.some((n) => includedRows.includes(n)))
          reasons.push(`Duplicate group ${group.key} has no kept row.`);
    } else if (!reasons.length)
      includedRows = normalizedRows.map((r) => r.sourceRow);
  }
  return {
    calculationVersion: WORKSHOP_VERSION,
    mode: input.mode,
    status: reasons.length ? "INCOMPLETE" : "COMPLETE",
    parsed,
    normalizedRows,
    duplicates,
    includedRows,
    excludedRows,
    reasons,
    assumptions: [
      "Column meanings, header and delimiter are manually confirmed.",
      "Amount is a unitless exact decimal string; no currency or tax meaning is inferred.",
    ],
  };
}

/** Spreadsheet-safe CSV is intentionally text-modified; JSON preserves exact input. */
export function spreadsheetCell(text: string): string {
  const dangerous =
    /^[\s\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]*[=+\-@]/u.test(
      text,
    );
  const safe = dangerous ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function workshopReportJSON(
  input: WorkshopInput,
  result: WorkshopResult,
): string {
  return JSON.stringify(
    {
      calculationVersion: WORKSHOP_VERSION,
      input,
      result,
      disclaimer:
        "Local generic data preparation only; not Taxlot, tax advice or verified on-chain data.",
    },
    null,
    2,
  );
}
export function workshopReviewedCSV(result: WorkshopResult): string {
  if (result.status !== "COMPLETE" || result.mode === "inspect")
    fail(
      "Resolve validation and duplicate decisions before normalized CSV export.",
    );
  const columns = mappingKeys;
  const lines = [columns.map(spreadsheetCell).join(",")];
  for (const row of result.normalizedRows) {
    if (!result.includedRows.includes(row.sourceRow)) continue;
    lines.push(
      columns
        .map((key) =>
          spreadsheetCell(
            row.fields[key].status === "NORMALIZED"
              ? row.fields[key].value
              : "",
          ),
        )
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
