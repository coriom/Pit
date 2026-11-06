import { decodeEventLog } from 'viem';
import { assertChain, clientFor } from './rpc.mjs';
import { limits } from './config.mjs';

const toHex = (n) => `0x${BigInt(n).toString(16)}`;
const rangeError = message => /POSSIBLY_TRUNCATED|block range|too many results|query returned more than|response size/i.test(String(message));
export function eventIdentity(log) { return `${log.blockHash.toLowerCase()}:${log.transactionHash.toLowerCase()}:${Number(log.logIndex)}`; }
export async function scanEvents(input, { client = clientFor(input.chain), onProgress = async () => {}, signal, resume } = {}) {
  await assertChain(client, input.chain);
  const head = await client.getBlockNumber();
  const safeEnd = head > BigInt(limits.confirmedDepth) ? head - BigInt(limits.confirmedDepth) : 0n;
  const end = Math.min(input.toBlock, Number(safeEnd));
  let events = [], completed = [], coverage=[];
  const missing = [], seen = new Set(), canonicalBlocks = new Map();
  if(Array.isArray(resume?.coverage)&&Array.isArray(resume?.events)&&resume.events.length<=limits.maxEvents){
    let valid=true;
    for(const interval of resume.coverage){try{const endBlock=await client.getBlock({blockNumber:BigInt(interval.to)});if(endBlock.hash.toLowerCase()!==interval.toHash.toLowerCase())throw Error();}catch{valid=false;break;}}
    for(const event of resume.events){if(event.contract?.toLowerCase()!==input.contract.toLowerCase()||event.chainId!==await client.getChainId()||!resume.coverage.some(x=>x.from<=event.blockNumber&&event.blockNumber<=x.to)){valid=false;break;}}
    if(valid){events=resume.events;coverage=resume.coverage.filter(x=>Number.isInteger(x.from)&&Number.isInteger(x.to)&&x.from>=input.fromBlock&&x.to<=input.toBlock&&x.from<=x.to);completed=coverage.map(x=>[x.from,x.to]);for(const event of events)seen.add(event.id);}
  }
  let logRequests=0;
  const scan = async (from, to) => {
    if (signal?.aborted) throw new Error('CANCELLED');
    try {
      let logs;
      for(let attempt=0;attempt<3;attempt++){
        if(++logRequests>limits.maxLogRequests)throw new Error('RPC_BUDGET');
        try{logs=await client.request({ method:'eth_getLogs', params:[{ address:input.contract, fromBlock:toHex(from), toBlock:toHex(to), ...(input.topic0 ? { topics:[input.topic0] } : {}) }] });break;}
        catch(error){if(attempt===2||rangeError(error.message))throw error;await new Promise(resolve=>setTimeout(resolve,200*(2**attempt)));}
      }
      if (!Array.isArray(logs)) throw new Error('INVALID_RPC_LOGS');
      // Providers may cap log counts. Split at the threshold instead of accepting an ambiguous batch.
      if (logs.length >= 900) throw new Error('POSSIBLY_TRUNCATED');
      if (events.length + logs.length > limits.maxEvents) throw new Error('EVENT_LIMIT');
      for (const log of logs) {
        const bn = BigInt(log.blockNumber);
        if (bn < BigInt(from) || bn > BigInt(to) || log.address.toLowerCase() !== input.contract.toLowerCase()) throw new Error('RPC_LOG_MISMATCH');
        if (!canonicalBlocks.has(log.blockNumber)) canonicalBlocks.set(log.blockNumber, await client.getBlock({ blockNumber:bn }));
        if (canonicalBlocks.get(log.blockNumber).hash.toLowerCase() !== log.blockHash.toLowerCase()) throw new Error('REORGANIZED');
        const id = eventIdentity(log);
        if (seen.has(id)) continue;
        seen.add(id);
        let decoded = null;
        if (input.abi) try { const result = decodeEventLog({ abi:input.abi, data:log.data, topics:log.topics, strict:true }); decoded = { eventName:result.eventName, args:JSON.parse(JSON.stringify(result.args, (_,v) => typeof v === 'bigint' ? v.toString() : v)) }; } catch {}
        events.push({ id, chainId:await client.getChainId(), contract:log.address, blockNumber:Number(bn), blockHash:log.blockHash, transactionHash:log.transactionHash, transactionIndex:Number(BigInt(log.transactionIndex)), logIndex:Number(BigInt(log.logIndex)), signature:log.topics[0] ?? null, topics:log.topics, data:log.data, decoded });
      }
      const endBlock=await client.getBlock({blockNumber:BigInt(to)});
      completed.push([from,to]);coverage.push({from,to,toHash:endBlock.hash});
      await onProgress({ completed, coverage, missing, count:events.length, events });
    } catch (error) {
      if (error.message === 'CANCELLED' || error.message === 'STALE_LEASE') throw error;
      if (from < to && rangeError(error.message) && logRequests<limits.maxLogRequests) {
        const mid = Math.floor((from+to)/2);
        await scan(from,mid); await scan(mid+1,to);
      } else missing.push({ from,to, reason:error.message.slice(0,100) });
    }
  };
  for (let from=input.fromBlock; from<=end; from+=limits.scanChunk){
    const to=Math.min(from+limits.scanChunk-1,end);
    let gaps=[[from,to]];
    for(const [coveredFrom,coveredTo] of completed){gaps=gaps.flatMap(([a,b])=>coveredTo<a||coveredFrom>b?[[a,b]]:[[a,Math.min(b,coveredFrom-1)],[Math.max(a,coveredTo+1),b]].filter(([x,y])=>x<=y));}
    for(const [a,b] of gaps)await scan(a,b);
  }
  if (end < input.toBlock) missing.push({ from:Math.max(input.fromBlock,end+1), to:input.toBlock, reason:'UNCONFIRMED_HEAD' });
  events.sort((a,b)=>a.blockNumber-b.blockNumber||a.transactionIndex-b.transactionIndex||a.logIndex-b.logIndex);
  return { status: missing.length ? 'PARTIAL':'COMPLETE', requested:[input.fromBlock,input.toBlock], completed, coverage, missing, events, rpcLogRequests:logRequests, providerLimitation:'Public RPC providers may omit logs below their retention horizon; completeness assumes conforming eth_getLogs responses below the split threshold.' };
}
