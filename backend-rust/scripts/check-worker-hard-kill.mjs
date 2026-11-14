import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import pg from '../../backend/node_modules/pg/lib/index.js';

if(process.env.PIT_HARD_KILL_LOCAL!=='1'||process.env.PIT_TEST_RPC_URL!=='http://127.0.0.1:58545'||
  !process.env.PIT_V2_BINARY?.startsWith('/tmp/pit-v24-target/debug/'))throw Error('DISPOSABLE_LOCAL_FIXTURES_REQUIRED');
const binary=process.env.PIT_V2_BINARY,anvil=process.env.PIT_TEST_RPC_URL;
const name='pit_v24_hardkill',database=`postgres://corio@127.0.0.1:55439/${name}`;
const admin=new pg.Pool({connectionString:'postgres://corio@127.0.0.1:55439/postgres'});
const rpc=async(method,params,url=anvil)=>{
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  const data=await response.json();if(data.error)throw Error(JSON.stringify(data.error));return data.result;
};
const waitFor=async(label,check,timeout=15000)=>{
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const value=await check();if(value)return value;await delay(100)}
  throw Error(`TIMEOUT_${label}`);
};
let db,proxy,worker,successor;
try{
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${name}`);
  db=new pg.Pool({connectionString:database});
  for(const file of ['../../backend/migrations/001_init.sql','../../backend/migrations/002_edge_nonces.sql','../migrations/003_retry_schedule.sql']){
    await db.query(await readFile(new URL(file,import.meta.url),'utf8'));
  }
  await rpc('anvil_reset',[]);
  const accounts=await rpc('eth_accounts',[]),sender=accounts[0],recipient=accounts[1];
  const artifact=JSON.parse(await readFile(new URL('../../out/PitBackendFixtures.sol/PitBackendTokenFixture.json',import.meta.url),'utf8'));
  const deploy=await rpc('eth_sendTransaction',[{from:sender,data:artifact.bytecode.object,gas:'0x7a1200'}]);
  const contract=(await rpc('eth_getTransactionReceipt',[deploy])).contractAddress;
  const transfer=`0xa9059cbb${recipient.slice(2).padStart(64,'0')}${(1_000_000).toString(16).padStart(64,'0')}`;
  const transferHash=await rpc('eth_sendTransaction',[{from:sender,to:contract,data:transfer,gas:'0x7a1200'}]);
  const receipt=await rpc('eth_getTransactionReceipt',[transferHash]);assert.equal(receipt.status,'0x1');
  const head=Number.parseInt(await rpc('eth_blockNumber',[]),16);
  if(head<612)await rpc('anvil_mine',[`0x${(612-head).toString(16)}`]);
  let firstRange=0,secondRange=0,holdSecond=true;
  proxy=createServer(async(req,res)=>{
    try{
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const request=JSON.parse(Buffer.concat(chunks).toString());
      if(request.method==='eth_getLogs'){
        const from=request.params?.[0]?.fromBlock;
        if(from==='0x1')firstRange++;
        if(from==='0x1f5'){
          secondRange++;
          if(holdSecond)return;
        }
      }
      const upstream=await fetch(anvil,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)});
      res.writeHead(upstream.status,{'content-type':'application/json'});res.end(await upstream.text());
    }catch{if(!res.destroyed){res.writeHead(502);res.end()}}
  });
  await new Promise(resolve=>proxy.listen(58547,'127.0.0.1',resolve));
  const job=randomUUID(),input={chain:'base-sepolia',contract,fromBlock:1,toBlock:600};
  await db.query("INSERT INTO pit_jobs(id,kind,access_hash,invite_hash,input_json) VALUES($1,'events',$2,$3,$4)",[
    job,createHash('sha256').update('local-capability').digest('hex'),createHash('sha256').update('local-invite').digest('hex'),input,
  ]);
  const env={...process.env,PIT_DEPLOYMENT_CLASS:'local',PIT_DATABASE_URL:database,
    PIT_BACKEND_INVITE_SHA256:createHash('sha256').update('local-invite').digest('hex'),
    PIT_EDGE_HMAC_KEY:'local_hard_kill_hmac_secret_32_bytes_0000',PIT_ALLOWED_ORIGIN:'http://127.0.0.1:4300',
    PIT_LOCAL_RPC_URL:'http://127.0.0.1:58547',PIT_NFT_FETCH_ENABLED:'0'};
  const start=()=>spawn(binary,['worker'],{env,stdio:['ignore','ignore','pipe']});
  worker=start();worker.stderr.on('data',()=>{});
  await waitFor('checkpoint_and_second_range',async()=>{
    const {rows}=await db.query('SELECT status,progress_json FROM pit_jobs WHERE id=$1',[job]);
    return rows[0].status==='RUNNING'&&rows[0].progress_json.coverage?.length===1&&secondRange===1;
  });
  const before=(await db.query('SELECT progress_json FROM pit_jobs WHERE id=$1',[job])).rows[0].progress_json;
  assert.equal(before.events.length,2,'first checkpoint contains mint and transfer events');
  assert(worker.kill('SIGKILL'),'the active worker accepted SIGKILL');
  const exitSignal=await new Promise(resolve=>worker.once('close',(_code,signal)=>resolve(signal)));
  assert.equal(exitSignal,'SIGKILL','the active worker was terminated abruptly');
  assert.equal((await db.query('SELECT status FROM pit_jobs WHERE id=$1',[job])).rows[0].status,'RUNNING');
  await db.query("UPDATE pit_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[job]);
  holdSecond=false;successor=start();successor.stderr.on('data',()=>{});
  const final=await waitFor('lease_recovery',async()=>{
    const {rows}=await db.query('SELECT status,attempts,result_json FROM pit_jobs WHERE id=$1',[job]);
    return rows[0].status==='COMPLETED'?rows[0]:null;
  },20000);
  assert.equal(final.attempts,2,'one claim before and after hard kill');
  assert.equal(final.result_json.status,'COMPLETE');
  assert.deepEqual(final.result_json.completed,[[1,500],[501,600]]);
  assert.equal(final.result_json.events.length,2,'no duplicated event');
  assert.equal(new Set(final.result_json.events.map(event=>event.id)).size,2);
  assert.equal(final.result_json.rpcLogRequests,1,'resume queries only the uncovered interval');
  assert.equal(firstRange,1,'covered interval was not rescanned');
  assert.equal(secondRange,2,'first attempt was interrupted, second completed');
  console.log('PIT_RUST_WORKER_HARD_KILL_RECOVERY_PASS claim checkpoint lease resume canonical_event deduplication');
}finally{
  for(const child of [worker,successor])if(child&&!child.killed){child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('close',resolve)),delay(3000)])}
  proxy?.closeAllConnections();if(proxy)await new Promise(resolve=>proxy.close(resolve));
  await db?.end();await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);await admin.end();
}
