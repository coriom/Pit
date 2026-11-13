import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {http} from '../../backend/node_modules/viem/_esm/index.js';
import {clientFor} from '../../backend/src/rpc.mjs';
import {scanEvents} from '../../backend/src/events.mjs';

if(process.env.PIT_BENCH_LOCAL!=='1'||process.env.PIT_TEST_RPC_URL!=='http://127.0.0.1:58545')throw Error('LOCAL_ANVIL_REQUIRED');
const fixture=JSON.parse(await readFile('/tmp/pit-v2-parity-local.json','utf8'));
const client=clientFor('base-sepolia',http(process.env.PIT_TEST_RPC_URL,{timeout:5000,retryCount:0}));
const input={chain:'base-sepolia',contract:fixture.token,fromBlock:fixture.from,toBlock:fixture.last};
const samples=[];
for(let i=0;i<8;i++){
  const start=performance.now();const result=await scanEvents(input,{client});
  assert.equal(result.status,'COMPLETE');assert.equal(result.events.length,2);
  if(i>0)samples.push(performance.now()-start);
}
samples.sort((a,b)=>a-b);
console.log(`PIT_NODE_SCAN_BENCH samples_ms=${samples.map(x=>x.toFixed(2)).join(',')} median_ms=${samples[3].toFixed(2)} range_ms=${samples[0].toFixed(2)}-${samples[6].toFixed(2)} rss_kib=${Math.round(process.memoryUsage().rss/1024)}`);
