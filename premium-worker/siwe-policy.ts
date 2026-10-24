import { isAddressEqual, verifyMessage } from 'viem';
import { parseSiweMessage } from 'viem/siwe';

export const IDENTITY_CHAIN_ID = 8453;
const MAX_MESSAGE_AGE_MS = 5 * 60_000;

// Reused by the production Worker and the loopback-only wallet prototype.
// The Better Auth SIWE plugin separately consumes its D1-backed nonce.
export async function verifyPitSiwe(message: string, signature: string, address: `0x${string}`, origin: string, now = new Date()): Promise<boolean> {
  if (message.length > 4096 || !/^0x[\da-fA-F]{130}$/.test(signature)) return false;
  const fields=['URI','Version','Chain ID','Nonce','Issued At','Expiration Time'];
  if (fields.some(field => message.split(/\r?\n/).filter(line => line.startsWith(`${field}: `)).length !== 1)) return false;
  try {
    const parsed=parseSiweMessage(message);
    const url=new URL(origin);
    const issued=parsed.issuedAt?.getTime(), expiry=parsed.expirationTime?.getTime();
    if (parsed.domain !== url.host || parsed.uri !== `${origin}/` || parsed.version !== '1' ||
        parsed.chainId !== IDENTITY_CHAIN_ID || (parsed.scheme && parsed.scheme.toLowerCase() !== 'https') ||
        !parsed.address || !isAddressEqual(parsed.address,address) || !parsed.nonce ||
        !Number.isFinite(issued) || !Number.isFinite(expiry) || issued! > now.getTime() ||
        now.getTime()-issued! > MAX_MESSAGE_AGE_MS || expiry! <= now.getTime() ||
        expiry!-issued! > MAX_MESSAGE_AGE_MS ||
        (parsed.notBefore && (!Number.isFinite(parsed.notBefore.getTime()) || parsed.notBefore > now))) return false;
    // viem's offline verifyMessage recovers an EOA; no RPC or ERC-1271 fallback.
    return await verifyMessage({address,message,signature:signature as `0x${string}`});
  } catch { return false; }
}
