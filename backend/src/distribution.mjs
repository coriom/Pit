import { decodeEventLog, parseAbi } from 'viem';
import { assertChain, canonicalReceipt, clientFor } from './rpc.mjs';
import { limits } from './config.mjs';

const erc20=parseAbi(['function decimals() view returns (uint8)','function balanceOf(address) view returns (uint256)','event Transfer(address indexed from,address indexed to,uint256 value)']);
export function parseAllocations(csv,decimals){
  const lines=csv.trim().split(/\r?\n/);if(lines.length>limits.csvRows+1)throw new Error('CSV_ROW_LIMIT');
  if(lines[0]?.trim().toLowerCase()!=='recipient,amount')throw new Error('CSV_HEADER');
  const rows=[],seen=new Set();
  for(const line of lines.slice(1)){
    const cells=line.split(',').map(s=>s.trim());if(cells.length!==2||!/^0x[a-fA-F0-9]{40}$/.test(cells[0])||!/^\d+(?:\.\d+)?$/.test(cells[1]))throw new Error('CSV_ROW_INVALID');
    const [whole,fraction='']=cells[1].split('.');if(fraction.length>decimals)throw new Error('TOKEN_PRECISION');
    const key=cells[0].toLowerCase();if(seen.has(key))throw new Error('DUPLICATE_RECIPIENT');seen.add(key);
    rows.push({recipient:cells[0],amount:(BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0')||'0')).toString()});
  }
  if(!rows.length)throw new Error('EMPTY_CSV');return rows;
}
export async function verifyDistribution(input,{client=clientFor(input.chain),depth=limits.confirmedDepth}={}){
  await assertChain(client,input.chain);
  const decimals=await client.readContract({address:input.token,abi:erc20,functionName:'decimals'});
  if(decimals>36)throw new Error('UNSUPPORTED_DECIMALS');
  const expected=parseAllocations(input.csv,decimals);const observed=new Map(),receipts=[],unexpected=[];
  let minBlock=null,maxBlock=null;
  for(const hash of input.transactionHashes){
    const state=await canonicalReceipt(client,hash,depth);receipts.push({transactionHash:hash,status:state.status,blockHash:state.receipt?.blockHash??null,blockNumber:state.receipt?Number(state.receipt.blockNumber):null});
    if(state.status!=='CONFIRMED')continue;
    const r=state.receipt;minBlock=minBlock===null||r.blockNumber<minBlock?r.blockNumber:minBlock;maxBlock=maxBlock===null||r.blockNumber>maxBlock?r.blockNumber:maxBlock;
    for(const log of r.logs){if(log.address.toLowerCase()!==input.token.toLowerCase())continue;let decoded;try{decoded=decodeEventLog({abi:erc20,data:log.data,topics:log.topics,strict:true});}catch{continue;}if(decoded.eventName!=='Transfer')continue;
      const key=decoded.args.to.toLowerCase(),old=observed.get(key)??{amount:0n,count:0,events:[]};old.amount+=decoded.args.value;old.count++;old.events.push({transactionHash:hash,blockHash:r.blockHash,logIndex:Number(log.logIndex)});observed.set(key,old);
    }
  }
  const expectedSet=new Set(expected.map(x=>x.recipient.toLowerCase()));
  for(const [recipient,value] of observed)if(!expectedSet.has(recipient))unexpected.push({recipient,amount:value.amount.toString(),events:value.events});
  const rows=[];
  for(const item of expected){const value=observed.get(item.recipient.toLowerCase()),actual=value?.amount??0n;let balance='UNAVAILABLE';
    if(minBlock!==null&&minBlock>0n){try{const before=await client.readContract({address:input.token,abi:erc20,functionName:'balanceOf',args:[item.recipient],blockNumber:minBlock-1n});const after=await client.readContract({address:input.token,abi:erc20,functionName:'balanceOf',args:[item.recipient],blockNumber:maxBlock});balance=after-before>=BigInt(item.amount)?'CORROBORATED':'MISMATCH';}catch{}}
    rows.push({...item,observedAmount:actual.toString(),transferCount:value?.count??0,balanceEvidence:balance,status:actual!==BigInt(item.amount)?'MISMATCH':balance==='MISMATCH'?'AMBIGUOUS_DELIVERY':balance==='CORROBORATED'?'VERIFIED':'EVENT_MATCH_ONLY',events:value?.events??[]});
  }
  const status=receipts.some(r=>r.status!=='CONFIRMED')||unexpected.length||rows.some(r=>r.status!=='VERIFIED')?'PARTIAL':'VERIFIED';
  return {status,chain:input.chain,token:input.token,decimals,expectedCount:rows.length,verifiedCount:rows.filter(r=>r.status==='VERIFIED').length,expectedTotal:rows.reduce((n,r)=>n+BigInt(r.amount),0n).toString(),observedTotal:[...observed.values()].reduce((n,v)=>n+v.amount,0n).toString(),rows,unexpected,receipts,limitations:['Transfer events are insufficient for fee-on-transfer, rebasing, malicious, or nonstandard tokens. Balance deltas may include unrelated transfers.']};
}
