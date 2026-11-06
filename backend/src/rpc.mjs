import { createPublicClient, http } from 'viem';
import { rpcFor } from './config.mjs';

export function clientFor(chain, transport) {
  const { id, url } = rpcFor(chain);
  return createPublicClient({ cacheTime: 0, chain: { id, name: chain, nativeCurrency: { name:'Ether', symbol:'ETH', decimals:18 }, rpcUrls: { default: { http: [url] } } }, transport: transport ?? http(url, { timeout: 12_000, retryCount: 1 }) });
}
export async function assertChain(client, chain) {
  const actual = await client.getChainId();
  if (actual !== rpcFor(chain).id) throw new Error('RPC_CHAIN_MISMATCH');
}
export async function canonicalReceipt(client, hash, depth = 12) {
  const receipt = await client.getTransactionReceipt({ hash }).catch(() => null);
  if (!receipt) return { status: 'PENDING_OR_MISSING' };
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (block.hash.toLowerCase() !== receipt.blockHash.toLowerCase()) return { status: 'REORGANIZED', receipt };
  const head = await client.getBlockNumber();
  if (head < receipt.blockNumber + BigInt(depth)) return { status: 'UNCONFIRMED', receipt };
  return { status: receipt.status === 'success' ? 'CONFIRMED' : 'REVERTED', receipt };
}
