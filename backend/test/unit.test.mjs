import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAllocations } from '../src/distribution.mjs';
import { publicAddress, resolvePublic, normalizeMetadataUri, ensureResponseStatus } from '../src/safe-http.mjs';
import { matchesRule } from '../src/monitor.mjs';
import { validateJob } from '../src/config.mjs';
import { scanEvents } from '../src/events.mjs';
import { hashToken,safeTokenMatch } from '../src/db.mjs';
import { keccak256, stringToHex } from 'viem';

const a='0x1111111111111111111111111111111111111111';
test('integer-exact CSV parsing and duplicate protection',()=>{
  assert.equal(parseAllocations(`recipient,amount\n${a},1.000001`,6)[0].amount,'1000001');
  assert.throws(()=>parseAllocations(`recipient,amount\n${a},0.1\n${a},0.2`,6),/DUPLICATE_RECIPIENT/);
  assert.throws(()=>parseAllocations(`recipient,amount\n${a},0.0000001`,6),/TOKEN_PRECISION/);
});
test('metadata URL policy blocks private networks and unsafe schemes',async()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','::1','::ffff:127.0.0.1','fc00::1'])assert.equal(publicAddress(ip),false,ip);
  assert.equal(publicAddress('8.8.8.8'),true);
  for(const uri of ['http://example.com/x','https://127.0.0.1/x','file:///etc/passwd','https://user:pass@example.com/x'])assert.throws(()=>normalizeMetadataUri(uri));
  await assert.rejects(resolvePublic('evil.example',async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]),/PRIVATE_ADDRESS/);
  await assert.rejects(resolvePublic('evil.example',async()=>[{address:'::ffff:127.0.0.1',family:6}]),/PRIVATE_ADDRESS/);
  assert.throws(()=>ensureResponseStatus(302),/REDIRECT_FORBIDDEN/);assert.throws(()=>ensureResponseStatus(413),/HTTP_413/);
  assert.equal(normalizeMetadataUri('ipfs://QmYwAPJzv5CZsnAzt8auVTL8f5BTj1VUnFWK8mNQSi2wS7/a.json').hostname,'ipfs.io');
});
test('monitor rules use exact event topics and integer thresholds',()=>{
  const topic=keccak256(stringToHex('Transfer(address,address,uint256)'));
  const zero=`0x${'0'.repeat(64)}`,recipient=`0x${'0'.repeat(24)}${'1'.repeat(40)}`;
  const log={signature:topic,topics:[topic,zero,recipient],data:`0x${(200n).toString(16).padStart(64,'0')}`};
  assert.equal(matchesRule(log,{type:'mint'}),true);
  assert.equal(matchesRule(log,{type:'transfer-threshold',minimum:'201'}),false);
  assert.equal(matchesRule(log,{type:'transfer-threshold',minimum:'200'}),true);
});
test('request validation fails closed on range, extra fields and unsupported chain',()=>{
  const base={chain:'base-sepolia',contract:a,fromBlock:1,toBlock:10};
  assert.deepEqual(validateJob('events',base),base);
  assert.throws(()=>validateJob('events',{...base,toBlock:100000}),/BLOCK_RANGE_LIMIT/);
  assert.throws(()=>validateJob('events',{...base,signingKey:'bad'}));
  assert.throws(()=>validateJob('events',{...base,chain:'anvil'}));
});
test('tokens are hashed and compared without plaintext persistence',()=>{
  const hash=hashToken('test-capability');assert.equal(safeTokenMatch(hash,'test-capability'),true);assert.equal(safeTokenMatch(hash,'other'),false);
});
test('failed eth_getLogs segments remain partial',async()=>{
  const client={getChainId:async()=>84532,getBlockNumber:async()=>100n,request:async()=>{throw Error('provider unavailable');}};
  const result=await scanEvents({chain:'base-sepolia',contract:a,fromBlock:10,toBlock:11},{client});
  assert.equal(result.status,'PARTIAL');assert.equal(result.missing.length,1);assert.equal(result.events.length,0);
});
test('interrupted event scan resumes only canonical completed intervals',async()=>{
  let calls=0,checkpoint;
  const client={getChainId:async()=>84532,getBlockNumber:async()=>1000n,getBlock:async({blockNumber})=>({hash:`0x${blockNumber.toString(16).padStart(64,'0')}`}),request:async()=>{calls++;return [];}};
  const input={chain:'base-sepolia',contract:a,fromBlock:10,toBlock:510};
  await assert.rejects(scanEvents(input,{client,onProgress:async progress=>{checkpoint=structuredClone(progress);throw Error('CANCELLED');}}),/CANCELLED/);
  assert.equal(calls,1);
  const result=await scanEvents(input,{client,resume:checkpoint});
  assert.equal(result.status,'COMPLETE');assert.equal(calls,2);assert.deepEqual(result.completed,[[10,509],[510,510]]);
});
