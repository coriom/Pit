import { z } from 'zod';

const rpcHosts = new Set(['ethereum-rpc.publicnode.com', 'base-rpc.publicnode.com', 'base-sepolia-rpc.publicnode.com']);
export const chains = Object.freeze({
  ethereum: { id: 1, url: 'https://ethereum-rpc.publicnode.com' },
  base: { id: 8453, url: 'https://base-rpc.publicnode.com' },
  'base-sepolia': { id: 84532, url: 'https://base-sepolia-rpc.publicnode.com' },
});
export function rpcFor(chain) {
  const entry = chains[chain];
  if (!entry) throw new Error('UNSUPPORTED_CHAIN');
  const url = new URL(entry.url);
  if (url.protocol !== 'https:' || !rpcHosts.has(url.hostname)) throw new Error('RPC_NOT_ALLOWLISTED');
  return entry;
}
export const limits = Object.freeze({
  bodyBytes: 256 * 1024, maxActiveRequests: 32, csvRows: 500, txHashes: 20, maxBlockSpan: 20_000,
  maxEvents: 5000, nftTokens: 25, metadataBytes: 512 * 1024,
  scanChunk: 500, maxLogRequests: 120, confirmedDepth: 12, maxJobsPerDay: 20,
  maxJobsPerMinute: 10, maxMonitorsPerMinute: 1,
  monitorLifetimeHours: 72, maxMonitorsPerOwner: 3, maxAlertsPerPoll: 20,
});
// The shared VPS has no independently verified egress policy for arbitrary
// NFT metadata hosts. Keep hosted NFT fetching disabled until that gate passes.
export function nftFetchAllowed(env = process.env) {
  return env.NODE_ENV !== 'production' && env.PIT_NFT_FETCH_ENABLED !== '0';
}
export const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
export const hex32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const positiveBlock = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const baseInput = z.object({ chain: z.enum(['ethereum','base','base-sepolia']), contract: address }).strict();
export const requestSchemas = Object.freeze({
  events: baseInput.extend({ fromBlock: positiveBlock, toBlock: positiveBlock, topic0: hex32.optional(), abi: z.array(z.record(z.unknown())).max(30).optional() }).strict(),
  permissions: baseInput.extend({ fromBlock: positiveBlock, toBlock: positiveBlock }).strict(),
  distribution: z.object({ chain: z.enum(['ethereum','base','base-sepolia']), token: address, csv: z.string().max(80_000), transactionHashes: z.array(hex32).min(1).max(limits.txHashes) }).strict(),
  nft: baseInput.extend({ tokenIds: z.array(z.string().regex(/^\d{1,78}$/)).min(1).max(limits.nftTokens) }).strict(),
});
export function validateJob(kind, input) {
  const schema = requestSchemas[kind];
  if (!schema) throw new Error('UNSUPPORTED_JOB');
  const parsed = schema.parse(input);
  if ('fromBlock' in parsed && (parsed.toBlock < parsed.fromBlock || parsed.toBlock - parsed.fromBlock + 1 > limits.maxBlockSpan)) throw new Error('BLOCK_RANGE_LIMIT');
  return parsed;
}
