import { describe, expect, it } from "vitest";
import {
  calculateEvm,
  decodeStaticCall,
  inspectAddress,
  inspectSignature,
  parseStaticAbi,
} from "../src/lib/evm-data-inspector";
import {
  analyzeDuplicates,
  calculateWorkshop,
  inspectDelimiters,
  normalizeDecimal,
  normalizeRows,
  normalizeTimestamp,
  parseCsv,
  spreadsheetCell,
  workshopReportJSON,
  workshopReviewedCSV,
  EMPTY_MAPPING,
} from "../src/lib/crypto-data-workshop";
import {
  cryptoDataWorkshopContract,
  evmDataInspectorContract,
  runAnTool,
} from "../src/lib/an-tool-contracts";
import {
  PURE_TOOL_CONTRACTS,
  compatiblePorts,
  runPureTool,
} from "../src/lib/pure-tool-contract";

const abi =
  '{"type":"function","name":"transfer","inputs":[{"name":"to","type":"address"},{"name":"amount","type":"uint256"}]}';
const transfer =
  "0xa9059cbb00000000000000000000000052908400098527886e0f7030069857d2e4169ee70000000000000000000000000000000000000000000000000000000000000064";
const csv =
  "\uFEFFid,chain,event,time,amount,note\r\nA,11155111,0,2026-01-02T10:00:00+02:00,1.250000,first\r\nB,11155111,1,2026-01-03T08:00:00Z,0,second\r\nA,11155111,0,2026-01-02T10:00:00+02:00,1.250000,first\r\n";
const mapping = {
  recordId: "id",
  chainId: "chain",
  eventId: "event",
  timestampUtc: "time",
  amount: "amount",
  note: "note",
};
const base = {
  mode: "dedupe" as const,
  text: csv,
  delimiter: "," as const,
  hasHeader: true as const,
  mapping,
  amountDecimals: 6,
  dateFormat: "iso-offset" as const,
  identityFields: [
    "chainId",
    "recordId",
    "eventId",
  ] as (keyof typeof mapping)[],
  decisions: {},
};

describe("offline EVM inspection", () => {
  it("uses official EIP-55 vectors and distinguishes unchecked case", () => {
    expect(
      inspectAddress("0x52908400098527886E0F7030069857D2E4169EE7", "11155111"),
    ).toMatchObject({
      checksumStatus: "NOT_CARRIED",
      checksummed: "0x52908400098527886E0F7030069857D2E4169EE7",
    });
    expect(
      inspectAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", "1")
        .checksumStatus,
    ).toBe("VALID_EIP55");
    expect(
      inspectAddress("0x5aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed", "1")
        .checksumStatus,
    ).toBe("INVALID_EIP55");
    expect(() => inspectAddress("0x1234", "")).toThrow();
    expect(
      inspectAddress("0x52908400098527886E0F7030069857D2E4169EE7", "1")
        .chainDescriptor,
    ).not.toEqual(
      inspectAddress("0x52908400098527886E0F7030069857D2E4169EE7", "8453")
        .chainDescriptor,
    );
  });
  it("uses Ethereum Keccak, rejects noncanonical signatures", () => {
    expect(
      inspectSignature("function", "transfer(address,uint256)").selectorOrTopic,
    ).toBe("0xa9059cbb");
    expect(
      inspectSignature("function", "approve(address,uint256)").selectorOrTopic,
    ).toBe("0x095ea7b3");
    expect(
      inspectSignature("event", "Transfer(address,address,uint256)")
        .selectorOrTopic,
    ).toBe(
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    );
    expect(() =>
      inspectSignature("function", "transfer(address, uint)"),
    ).toThrow();
    expect(() =>
      inspectSignature("function", "transfer(address,uint256[])"),
    ).toThrow();
  });
  it("decodes only exact bounded static calls", () => {
    expect(decodeStaticCall(abi, transfer)).toMatchObject({
      name: "transfer",
      selector: "0xa9059cbb",
      parameters: [
        {
          name: "to",
          type: "address",
          value: "0x52908400098527886E0F7030069857D2E4169EE7",
        },
        { name: "amount", type: "uint256", value: "100" },
      ],
    });
    expect(() =>
      decodeStaticCall(abi, `0x095ea7b3${transfer.slice(10)}`),
    ).toThrow("No ABI");
    expect(() => decodeStaticCall(abi, transfer.slice(0, -2))).toThrow(
      "truncated",
    );
    expect(() => decodeStaticCall(abi, `${transfer}00`)).toThrow("trailing");
    expect(() => parseStaticAbi(`[${abi},${abi}]`)).toThrow("Ambiguous");
    expect(() =>
      parseStaticAbi(
        '{"type":"function","name":"x","inputs":[{"name":"a","type":"uint256[]"}]}',
      ),
    ).toThrow("Unsupported");
    expect(() => decodeStaticCall(abi, `0x${"00".repeat(4097)}`)).toThrow(
      "4 KiB",
    );
    expect(() => parseStaticAbi("[".repeat(8193))).toThrow("8 KiB");
    expect(
      calculateEvm({ mode: "decode", abiJson: abi, calldata: transfer })
        .details[1].value,
    ).toBe("0x52908400098527886E0F7030069857D2E4169EE7");
  });
});

describe("bounded local CSV workshop", () => {
  it("parses BOM, CRLF, quoted delimiter/newline/doubled quote", () => {
    const p = parseCsv(
      '\uFEFFname,note\r\nA,"hello, \"\"world\"\"\r\nnext"\r\n',
      ",",
      true,
    );
    expect(p.header).toEqual(["name", "note"]);
    expect(p.rows).toEqual([["A", 'hello, "world"\nnext']]);
    expect(p.issues).toEqual([]);
    expect(
      inspectDelimiters(csv).find((x) => x.delimiter === ",")?.columns,
    ).toBe(6);
  });
  it("rejects malformed rows, quoting, controls, oversized inputs and columns", () => {
    expect(parseCsv("a,b\n1", ",", true).issues).toEqual([
      "Row 1 has 1 cells; expected 2.",
    ]);
    for (const text of [
      'a,b\n"unterminated',
      'a,b\n"x"y,z',
      "a,b\n1\u0000,2",
      "a,b\n1,2,3",
    ]) {
      if (text.endsWith("1,2,3"))
        expect(parseCsv(text, ",", true).issues.length).toBe(1);
      else expect(() => parseCsv(text, ",", true)).toThrow();
    }
    expect(() => parseCsv("x".repeat(262145), ",", false)).toThrow("256 KiB");
    expect(() => parseCsv("id,amount\n", ",", true)).toThrow("no data rows");
    expect(() =>
      parseCsv(
        Array.from({ length: 31 }, (_, i) => `c${i}`).join(","),
        ",",
        true,
      ),
    ).toThrow("30 columns");
  });
  it("normalizes exact decimals and explicit UTC timestamps without guessing", () => {
    expect(normalizeDecimal("1.250000", 6)).toBe("1250000");
    expect(normalizeDecimal("0", 6)).toBe("0");
    expect(normalizeDecimal("-0.1", 6)).toBe("-100000");
    expect(() => normalizeDecimal("1,234", 6)).toThrow();
    expect(() => normalizeDecimal("1.0000001", 6)).toThrow("excess precision");
    expect(normalizeTimestamp("2026-01-02T10:00:00+02:00", "iso-offset")).toBe(
      "2026-01-02T08:00:00.000Z",
    );
    expect(normalizeTimestamp("2024-02-29", "utc-date")).toBe(
      "2024-02-29T00:00:00.000Z",
    );
    expect(() => normalizeTimestamp("2025-02-29", "utc-date")).toThrow();
    expect(() => normalizeTimestamp("01/02/2026", "utc-date")).toThrow();
    expect(normalizeTimestamp("0", "unix-seconds")).toBe(
      "1970-01-01T00:00:00.000Z",
    );
  });
  it("marks missing, invalid and unmapped distinctly", () => {
    const parsed = parseCsv(
      "id,amount,time\nA,,2026-01-01\nB,0,invalid",
      ",",
      true,
    );
    const rows = normalizeRows(
      parsed,
      {
        ...EMPTY_MAPPING,
        recordId: "id",
        amount: "amount",
        timestampUtc: "time",
      },
      6,
      "utc-date",
    );
    expect(rows[0].fields.amount.status).toBe("MISSING");
    expect(rows[1].fields.amount).toMatchObject({
      status: "NORMALIZED",
      value: "0",
    });
    expect(rows[1].fields.timestampUtc.status).toBe("INVALID");
    expect(rows[0].fields.eventId.status).toBe("UNMAPPED");
  });
  it("groups duplicates deterministically, requires decisions and preserves conflicts", () => {
    const first = calculateWorkshop(base);
    expect(first.status).toBe("INCOMPLETE");
    expect(first.duplicates).toMatchObject([
      { rowNumbers: [1, 3], conflict: false },
    ]);
    expect(
      analyzeDuplicates(first.normalizedRows, ["amount", "timestampUtc"])
        .length,
    ).toBe(1);
    const reviewed = calculateWorkshop({
      ...base,
      decisions: { "1": "keep", "3": "exclude" },
    });
    expect(reviewed.status).toBe("COMPLETE");
    expect(reviewed.includedRows).toEqual([1, 2]);
    expect(reviewed.excludedRows).toEqual([3]);
    expect(() => calculateWorkshop({ ...base, decisions: { "2": "exclude" } })).toThrow("nonduplicate");
    expect(workshopReviewedCSV(reviewed)).toContain('"1250000"');
    expect(
      JSON.parse(
        workshopReportJSON(
          { ...base, decisions: { "1": "keep", "3": "exclude" } },
          reviewed,
        ),
      ).result.parsed.rows,
    ).toHaveLength(3);
    const conflict = calculateWorkshop({
      ...base,
      text: csv.replace("1.250000,first\r\n", "1.250000,changed\r\n"),
    });
    expect(conflict.duplicates[0].conflict).toBe(true);
  });
  it("escapes spreadsheet formulas while JSON remains exact", () => {
    for (const value of ["=SUM(1,1)", "+cmd", "-cmd", "@cmd", " \t=1", "\n=1"])
      expect(spreadsheetCell(value).startsWith("\"'")).toBe(true);
    expect(spreadsheetCell("ordinary")).toBe('"ordinary"');
    const hostile = calculateWorkshop({
      mode: "inspect",
      text: 'name\n"<script>alert(1)</script>"',
      delimiter: ",",
      hasHeader: true,
    });
    expect(
      JSON.parse(
        workshopReportJSON(
          {
            mode: "inspect",
            text: 'name\n"<script>alert(1)</script>"',
            delimiter: ",",
            hasHeader: true,
          },
          hostile,
        ),
      ).result.parsed.rows[0][0],
    ).toBe("<script>alert(1)</script>");
  });
});

describe("closed AN pure contract boundary", () => {
  it("adds only the two reviewed IDs and rejects execution", () => {
    expect(PURE_TOOL_CONTRACTS.slice(-2).map((c) => c.id)).toEqual([
      "evm-data-inspector",
      "crypto-data-workshop",
    ]);
    for (const id of ["swap", "perps", "taxlot-export", "token-approvals"])
      expect(runPureTool(id, {}).status).toBe("ERROR");
    expect(
      runAnTool("evm-data-inspector", {
        mode: "signature",
        kind: "function",
        signature: "transfer(address,uint256)",
      }).status,
    ).toBe("COMPLETE");
    expect(
      runAnTool("crypto-data-workshop", {
        mode: "inspect",
        text: csv,
        delimiter: ",",
        hasHeader: true,
      }).status,
    ).toBe("COMPLETE");
    expect(
      runAnTool("crypto-data-workshop", {
        mode: "inspect",
        text: csv,
        delimiter: ",",
        hasHeader: true,
        extra: true,
      }).status,
    ).toBe("ERROR");
  });
  it("validates output and prevents generic data being composed as verified units", () => {
    const a = runAnTool("evm-data-inspector", {
      mode: "address",
      address: "0x52908400098527886E0F7030069857D2E4169EE7",
      chainId: "1",
    });
    const b = runAnTool("crypto-data-workshop", {
      mode: "inspect",
      text: csv,
      delimiter: ",",
      hasHeader: true,
    });
    if (a.status === "ERROR" || b.status === "ERROR")
      throw Error("Unexpected rejection");
    expect(compatiblePorts(a.inputPorts[0], b.inputPorts[0])).toBe(false);
    expect(() =>
      evmDataInspectorContract.validateOutput({ ...a.output, primary: "" }),
    ).toThrow();
    expect(() =>
      cryptoDataWorkshopContract.validateOutput({
        ...b.output,
        reasons: ["x"],
      }),
    ).toThrow();
  });
});
