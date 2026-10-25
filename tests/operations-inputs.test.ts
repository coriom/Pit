import { describe, expect, it } from "vitest";
import { parseRecipientsCsv, positiveUnits, requiredAddress, utcSeconds } from "../src/operations/lib/inputs";

const alice = "0x000000000000000000000000000000000000a11c";
const bob = "0x0000000000000000000000000000000000000b0b";
describe("bounded local operation inputs", () => {
  it("parses exact raw token units and rejects silent rounding", () => {
    expect(positiveUnits("1000.000001", 6)).toBe(1000000001n);
    expect(() => positiveUnits("1.0000001", 6)).toThrow(/more decimals/);
    expect(() => positiveUnits("1e6", 6)).toThrow();
    expect(() => positiveUnits("0", 18)).toThrow();
    expect(() => positiveUnits("-1", 18)).toThrow();
    expect(() => positiveUnits("1", 37)).toThrow();
  });
  it("requires strict addresses and real UTC calendar dates", () => {
    expect(requiredAddress(alice).toLowerCase()).toBe(alice);
    expect(() => requiredAddress("0x0")).toThrow();
    expect(() => requiredAddress("0x0000000000000000000000000000000000000000")).toThrow();
    expect(utcSeconds("2028-02-29T12:00")).toBe(1835438400n);
    expect(() => utcSeconds("2027-02-29T12:00")).toThrow();
  });
  it("validates local CSV, duplicate recipients and conservation", () => {
    const csv = `address,amount\r\n${alice},1.25\r\n${bob},2.75`;
    const result = parseRecipientsCsv(csv, 2);
    expect(result.total).toBe(400n);
    expect(result.recipients.map((row) => row.amount)).toEqual([125n, 275n]);
    expect(() => parseRecipientsCsv(`${alice},1\n${alice.toUpperCase().replace("0X", "0x")},2`, 0)).toThrow(/Duplicate/);
    expect(() => parseRecipientsCsv(`${alice},1\n${bob},2`, 0, alice)).toThrow(/Sender/);
    expect(() => parseRecipientsCsv(`${alice},1\n${bob},`, 0)).toThrow();
    expect(() => parseRecipientsCsv(`${alice},1\n${bob},2,extra`, 0)).toThrow();
    expect(() => parseRecipientsCsv(`${alice},1\n${bob},2\n${alice},3`, 0)).toThrow();
  });
  it("rejects a batch above the on-chain recipient bound", () => {
    const rows = Array.from({ length: 101 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")},1`).join("\n");
    expect(() => parseRecipientsCsv(rows, 0)).toThrow(/1–100/);
  });
});
