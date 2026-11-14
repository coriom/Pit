import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
import {http,decodeEventLog,toEventSelector} from '../../backend/node_modules/viem/_esm/index.js';
import {clientFor} from '../../backend/src/rpc.mjs';
import {scanEvents} from '../../backend/src/events.mjs';
import {createPool,claimJob,hashToken} from '../../backend/src/db.mjs';
import {processJob} from '../../backend/src/worker.mjs';

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
const rpcSamples=[];for(let i=0;i<8;i++){const started=performance.now();await client.getBlockNumber();if(i>0)rpcSamples.push(performance.now()-started)}
rpcSamples.sort((a,b)=>a-b);console.log('PIT_NODE_RPC_HEAD_BENCH median_ms='+rpcSamples[3].toFixed(2)+' range_ms='+rpcSamples[0].toFixed(2)+'-'+rpcSamples[6].toFixed(2));
const abi=[{type:'event',name:'Transfer',anonymous:false,inputs:[{name:'from',type:'address',indexed:true},{name:'to',type:'address',indexed:true},{name:'value',type:'uint256',indexed:false}]}];
const topics=[toEventSelector('Transfer(address,address,uint256)'),'0x'+(1).toString(16).padStart(64,'0'),'0x'+(2).toString(16).padStart(64,'0')];
const data='0x'+(123456789).toString(16).padStart(64,'0');
const decodeSamples=[];for(let i=0;i<8;i++){const started=performance.now();let sum=0;for(let n=0;n<1000;n++){const decoded=decodeEventLog({abi,data,topics,strict:true});sum+=Number(decoded.args.value)}assert.equal(sum,123456789000);if(i>0)decodeSamples.push(performance.now()-started)}
decodeSamples.sort((a,b)=>a-b);console.log('PIT_NODE_DECODE_1000_BENCH median_ms='+decodeSamples[3].toFixed(2)+' range_ms='+decodeSamples[0].toFixed(2)+'-'+decodeSamples[6].toFixed(2));
if(process.env.PIT_BENCH_DATABASE_URL){
  assert.equal(process.env.PIT_BENCH_DATABASE_URL,'postgres://corio@127.0.0.1:55439/pit_v22_bench');
  const pool=createPool(process.env.PIT_BENCH_DATABASE_URL);
  await pool.query('TRUNCATE pit_jobs CASCADE');
  const jobs=[];
  for(let i=0;i<8;i++){
    const id=randomUUID();await pool.query(`INSERT INTO pit_jobs(id,kind,access_hash,invite_hash,input_json) VALUES($1,'events',$2,$3,$4)`,[id,hashToken('bench-access'),hashToken('bench-invite'),JSON.stringify(input)]);
    const started=performance.now();const job=await claimJob(pool);assert.equal(job.id,id);
    assert.equal(await processJob(pool,job,{client}),'COMPLETED');
    const {rows}=await pool.query('SELECT status,result_json FROM pit_jobs WHERE id=$1',[id]);assert.equal(rows[0].status,'COMPLETED');assert.equal(rows[0].result_json.events.length,2);
    if(i>0)jobs.push(performance.now()-started);
  }
  jobs.sort((a,b)=>a-b);
  console.log(`PIT_NODE_FULL_JOB_BENCH samples_ms=${jobs.map(x=>x.toFixed(2)).join(',')} median_ms=${jobs[3].toFixed(2)} range_ms=${jobs[0].toFixed(2)}-${jobs[6].toFixed(2)} rss_kib=${Math.round(process.memoryUsage().rss/1024)}`);
  const dbSamples=[];for(let i=0;i<8;i++){const started=performance.now();await pool.query('SELECT 1');if(i>0)dbSamples.push(performance.now()-started)}
  dbSamples.sort((a,b)=>a-b);console.log('PIT_NODE_PG_ROUNDTRIP_BENCH median_ms='+dbSamples[3].toFixed(2)+' range_ms='+dbSamples[0].toFixed(2)+'-'+dbSamples[6].toFixed(2));
  await pool.end();
}
