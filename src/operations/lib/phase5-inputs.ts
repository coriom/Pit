import { getAddress, isAddress, type Address } from "viem";
import { positiveUnits, requiredAddress } from "./inputs";
import { parseCsv } from "../../lib/crypto-data-workshop";

function rows(text: string, first: string, second?: string) {
  if (text.length > 262_144) throw Error("Input exceeds 256 KiB.");
  const data = parseCsv(text, ",", false);
  if (data.issues.length) throw Error(data.issues.join(" "));
  return data.rows.filter((row, index) => !(index === 0 && row[0]?.trim().toLowerCase() === first && (!second || row[1]?.trim().toLowerCase() === second)));
}

export function nativeRecipients(text: string, sender: Address) {
  const data = rows(text, "address", "amount");
  if (data.length < 1 || data.length > 100) throw Error("Enter 1–100 recipients.");
  const seen = new Set<string>(); let total = 0n;
  const entries = data.map((row, index) => {
    if (row.length !== 2) throw Error(`Row ${index + 1} needs address,amount.`);
    const address = requiredAddress(row[0].trim());
    if (address.toLowerCase() === sender.toLowerCase() || seen.has(address.toLowerCase())) throw Error(`Duplicate or self recipient at row ${index + 1}.`);
    seen.add(address.toLowerCase());
    const amount = positiveUnits(row[1].trim(), 18);
    total += amount;
    if (total > (1n << 256n) - 1n) throw Error("Native total exceeds uint256.");
    return { address, amount };
  });
  return { entries, total };
}

export function nftRecipients(text: string) {
  const data = rows(text, "tokenid", "address");
  if (data.length < 1 || data.length > 50) throw Error("Enter 1–50 NFT transfers.");
  const seen = new Set<string>();
  return data.map((row, index) => {
    if (row.length !== 2 || !/^(0|[1-9][0-9]*)$/.test(row[0].trim()) || row[0].length > 78) throw Error(`Invalid token ID at row ${index + 1}.`);
    const id = BigInt(row[0].trim());
    if (id > (1n << 256n) - 1n || seen.has(String(id))) throw Error(`Duplicate or excessive token ID at row ${index + 1}.`);
    seen.add(String(id));
    return { id, address: requiredAddress(row[1].trim()) };
  });
}

export function addresses(text: string) {
  const data = rows(text, "address");
  if (data.length < 1 || data.length > 50) throw Error("Enter 1–50 addresses.");
  const seen = new Set<string>();
  return data.map((row, index) => {
    if (row.length !== 1) throw Error(`Address row ${index + 1} has extra columns.`);
    const address = requiredAddress(row[0].trim());
    if (seen.has(address.toLowerCase())) throw Error(`Duplicate address at row ${index + 1}.`);
    seen.add(address.toLowerCase()); return address;
  });
}

export function tokenAddresses(text: string) {
  if (!text.trim()) return [] as Address[];
  const data = rows(text, "token");
  if (data.length > 5) throw Error("Choose at most five ERC-20 tokens.");
  const seen = new Set<string>();
  return data.map((row) => {
    if (row.length !== 1 || !isAddress(row[0].trim(), { strict: false })) throw Error("Invalid token address.");
    const address = getAddress(row[0].trim());
    if (seen.has(address.toLowerCase())) throw Error("Duplicate token address.");
    seen.add(address.toLowerCase()); return address;
  });
}

export function metadataUri(value: string) {
  if (value.length < 8 || value.length > 512 || !/^(ipfs:\/\/|https:\/\/)/i.test(value) || /[\u0000-\u001f]/.test(value)) throw Error("Use an explicit HTTPS or IPFS metadata URI, maximum 512 characters.");
  return value;
}

export function unsignedInteger(value: string, min: bigint, max: bigint): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value) || value.length > 78) throw Error("Enter a whole unsigned integer.");
  const number = BigInt(value);
  if (number < min || number > max) throw Error("Integer outside supported bounds.");
  return number;
}
