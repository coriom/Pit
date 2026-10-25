import { getAddress, isAddress, parseUnits, type Address } from "viem";
import { parseCsv } from "../../lib/crypto-data-workshop";

export const MAX_RECIPIENTS = 100;
const MAX_UINT = (1n << 256n) - 1n;
export function positiveUnits(value: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw Error("Token decimals must be between 0 and 36.");
  if (!/^\d+(?:\.\d+)?$/.test(value) || value.length > 100) throw Error("Enter a positive, ungrouped decimal amount.");
  if ((value.split(".")[1]?.length ?? 0) > decimals) throw Error("Amount has more decimals than this token supports.");
  const amount = parseUnits(value, decimals);
  if (amount <= 0n || amount > MAX_UINT) throw Error("Amount must fit in a positive uint256 value.");
  return amount;
}
export function requiredAddress(value: string): Address {
  if (!isAddress(value, { strict: false })) throw Error("Enter a valid 20-byte EVM address.");
  const address = getAddress(value);
  if (address === "0x0000000000000000000000000000000000000000") throw Error("Zero address is not allowed.");
  return address;
}
export function utcSeconds(value: string): bigint {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw Error("Choose an explicit UTC date and minute.");
  const ms = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 16) !== value) throw Error("Invalid UTC calendar date.");
  return BigInt(ms / 1000);
}
export type Recipient = { address: Address; amount: bigint };
export function parseRecipientsCsv(text: string, decimals: number, sender?: Address): { recipients: Recipient[]; total: bigint } {
  const parsed = parseCsv(text, ",", false);
  if (parsed.issues.length) throw Error(parsed.issues.join(" "));
  const rows = parsed.rows.filter((row, i) => !(i === 0 && row[0]?.trim().toLowerCase() === "address" && row[1]?.trim().toLowerCase() === "amount"));
  if (rows.length < 1 || rows.length > MAX_RECIPIENTS) throw Error(`Enter 1–${MAX_RECIPIENTS} recipients.`);
  const seen = new Set<string>();
  let total = 0n;
  const recipients = rows.map((row, index) => {
    if (row.length !== 2) throw Error(`CSV row ${index + 1} needs address and amount.`);
    const address = requiredAddress(row[0].trim());
    const key = address.toLowerCase();
    if (seen.has(key)) throw Error(`Duplicate recipient at row ${index + 1}.`);
    if (sender && key === sender.toLowerCase()) throw Error("Sender cannot be a recipient in this batch.");
    seen.add(key);
    const amount = positiveUnits(row[1].trim(), decimals);
    total += amount;
    if (total > MAX_UINT) throw Error("Batch total exceeds uint256.");
    return { address, amount };
  });
  return { recipients, total };
}
