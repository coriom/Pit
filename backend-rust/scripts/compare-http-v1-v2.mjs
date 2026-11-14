import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import pg from '../../backend/node_modules/pg/lib/index.js';
import {http} from '../../backend/node_modules/viem/_esm/index.js';
import {createApi} from '../../backend/src/api.mjs';
import {createPool,hashToken} from '../../backend/src/db.mjs';
import {edgeSignature} from '../../backend/src/edge-auth.mjs';
import {clientFor} from '../../backend/src/rpc.mjs';

const rpcUrl=process.env.PIT_TEST_RPC_URL;
const rustBinary=process.env.PIT_V2_BINARY;
if(process.env.PIT_HTTP_PARITY_LOCAL!=='1'||rpcUrl!=='http://127.0.0.1:58545'||!rustBinary?.startsWith('/tmp/pit-v2-3-parity/backend-rust/target/'))throw Error('DISPOSABLE_LOCAL_FIXTURES_REQUIRED');
const adminUrl='postgres://corio@127.0.0.1:55439/postgres';
const names=['pit_v23_http_node','pit_v23_http_rust'];
const urls=names.map(name=>`postgres://corio@127.0.0.1:55439/${name}`);
const invite='v23-local-private-invitation';
const edgeKey='v23_local_edge_hmac_key_32_bytes_000000';
const origin='http://127.0.0.1:4300';
const bases=['http://127.0.0.1:58793','http://127.0.0.1:58794'];
const prefix='/pit/api/v1';
const jobInput={chain:'base-sepolia',contract:'0x1111111111111111111111111111111111111111',fromBlock:0,toBlock:0};
const pools=[];
let rust,server,admin;

async function signed(base,method,path,{body,raw,token,key,invitation=invite,nonce=randomUUID().replaceAll('-',''),timestamp=String(Date.now()),signature}={}){
  const bytes=raw??(body===undefined?'':JSON.stringify(body));
  const headers={
    'x-pit-edge-timestamp':timestamp,'x-pit-edge-nonce':nonce,
    'x-pit-edge-signature':signature??edgeSignature(edgeKey,timestamp,nonce,method,path,Buffer.from(bytes)),
  };
  if(body!==undefined||raw!==undefined)headers['content-type']='application/json';
  if(invitation!==null)headers['x-pit-invite']=invitation;
  if(key)headers['idempotency-key']=key;
  if(token)headers.authorization=`Bearer ${token}`;
  const response=await fetch(base+path,{method,headers,body:method==='GET'||method==='DELETE'?undefined:bytes});
  const text=await response.text();
  let json;try{json=JSON.parse(text)}catch{}
  return {status:response.status,json,text,contentType:response.headers.get('content-type')};
}
async function both(method,path,options={}){
  return Promise.all(bases.map(base=>signed(base,method,path,options)));
}
async function sameCode(label,method,path,options,status,code){
  const results=await both(method,path,options);
  for(const result of results){assert.equal(result.status,status,`${label}: ${result.text}`);assert.equal(result.json?.code,code,label)}
  return results;
}
async function waitReady(base){
  for(let attempt=0;attempt<50;attempt++){
    try{if((await fetch(base+prefix+'/health')).status===200)return}catch{}
    await delay(100);
  }
  throw Error(`LOCAL_API_NOT_READY ${base}`);
}
async function setup(){
  admin=new pg.Pool({connectionString:adminUrl});
  for(const name of names){await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);await admin.query(`CREATE DATABASE ${name}`)}
  for(const [index,url] of urls.entries()){
    const pool=createPool(url);pools.push(pool);
    for(const file of ['../../backend/migrations/001_init.sql','../../backend/migrations/002_edge_nonces.sql',...(index?['../migrations/003_retry_schedule.sql']:[])]){
      await pool.query(await readFile(new URL(file,import.meta.url),'utf8'));
    }
  }
  server=createApi(pools[0],{inviteHash:hashToken(invite),allowedOrigin:origin,edgeSecret:edgeKey,nftEnabled:false,clientFactory:chain=>clientFor(chain,http(rpcUrl,{timeout:5000,retryCount:0}))});
  await new Promise(resolve=>server.listen(58793,'127.0.0.1',resolve));
  rust=spawn(rustBinary,['api'],{env:{...process.env,PIT_DEPLOYMENT_CLASS:'local',PIT_DATABASE_URL:urls[1],PIT_BACKEND_INVITE_SHA256:hashToken(invite),PIT_EDGE_HMAC_KEY:edgeKey,PIT_ALLOWED_ORIGIN:origin,PIT_LOCAL_RPC_URL:rpcUrl,PIT_NFT_FETCH_ENABLED:'0',PIT_API_PORT:'58794'},stdio:['ignore','ignore','pipe']});
  rust.stderr.on('data',()=>{}); // Synthetic local test credentials never enter test output.
  await Promise.all(bases.map(waitReady));
}
async function cleanup(){
  rust?.kill('SIGTERM');
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const pool of pools)await pool.end();
  for(const name of names)await admin?.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin?.end();
}
try{
  await setup();
  const path=prefix+'/jobs';
  const body={kind:'events',input:jobInput};
  for(const base of bases){const unsigned=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(unsigned.status,403)}
  await sameCode('invalid HMAC','POST',path,{body,signature:'0'.repeat(64)},403,'EDGE_AUTH_REQUIRED');
  const altered=JSON.stringify({...body,kind:'permissions'});
  const timestamp=String(Date.now()),nonce=randomUUID().replaceAll('-','');
  await sameCode('altered body','POST',path,{raw:altered,timestamp,nonce,signature:edgeSignature(edgeKey,timestamp,nonce,'POST',path,Buffer.from(JSON.stringify(body)))},403,'EDGE_AUTH_REQUIRED');
  await sameCode('expired signature','POST',path,{body,timestamp:String(Date.now()-61_000)},403,'EDGE_AUTH_REQUIRED');
  await sameCode('missing invitation','POST',path,{body,invitation:null,key:'v23_missing_invite_0001'},403,'INVITE_REQUIRED');
  await sameCode('invalid JSON','POST',path,{raw:'{broken',key:'v23_invalid_json_0001'},400,'INVALID_JSON');
  await sameCode('unsupported tool','POST',path,{body:{kind:'arbitrary',input:{}},key:'v23_invalid_kind_0001'},400,'UNSUPPORTED_JOB');
  await sameCode('invalid input','POST',path,{body:{kind:'events',input:{...jobInput,fromBlock:2,toBlock:1}},key:'v23_invalid_range_0001'},400,'BLOCK_RANGE_LIMIT');
  await sameCode('hosted NFT disabled','POST',path,{body:{kind:'nft',input:{chain:'base-sepolia',contract:jobInput.contract,tokenIds:['1']}},key:'v23_nft_disabled_0001'},503,'NFT_FETCH_DISABLED');
  await sameCode('oversized body','POST',path,{raw:'x'.repeat(256*1024+1)},413,'BODY_LIMIT');
  const created=await both('POST',path,{body,key:'v23_event_create_0001'});
  for(const value of created){assert.equal(value.status,202);assert.equal(value.json.status,'QUEUED');assert.match(value.json.accessToken,/^[A-Za-z0-9_-]{43}$/)}
  const ids=created.map(value=>value.json.id),tokens=created.map(value=>value.json.accessToken);
  await sameCode('idempotency conflict','POST',path,{body,key:'v23_event_create_0001'},409,'ALREADY_SUBMITTED');
  for(let i=0;i<2;i++){
    const one=`${path}/${ids[i]}`,base=bases[i];
    assert.equal((await signed(base,'GET',one,{token:'wrong-capability'})).status,404);
    assert.equal((await signed(base,'POST',one+'/cancel',{token:'wrong-capability'})).status,404);
    assert.equal((await signed(base,'GET',one+'/export?format=json',{token:'wrong-capability'})).status,404);
    const queued=await signed(base,'GET',one,{token:tokens[i]});assert.equal(queued.status,200);assert.equal(queued.json.status,'QUEUED');
    const premature=await signed(base,'GET',one+'/export?format=json',{token:tokens[i]});assert.equal(premature.status,409);assert.equal(premature.json.code,'RESULT_NOT_READY');
    const invalidPage=await signed(base,'GET',one+'?limit=not-a-number',{token:tokens[i]});
    if(i===0)assert.equal(invalidPage.status,200); // V1 clamps an invalid cursor.
    else{assert.equal(invalidPage.status,400);assert.equal(invalidPage.json.code,'PAGINATION_INVALID')} // V2 intentionally rejects it.
  }
  const event={chainId:84532,contract:jobInput.contract,blockNumber:1,blockHash:'0x'+'a'.repeat(64),transactionHash:'0x'+'b'.repeat(64),logIndex:0,signature:'0x'+'c'.repeat(64),decoded:null};
  for(let i=0;i<2;i++){
    await pools[i].query("UPDATE pit_jobs SET status='COMPLETED',result_json=$2,progress_json=$3 WHERE id=$1",[ids[i],{status:'COMPLETE',events:[event],completed:[[0,0]],missing:[]},{coverage:[]}]);
    const one=`${path}/${ids[i]}`,base=bases[i];
    const page=await signed(base,'GET',one+'?offset=0&limit=1',{token:tokens[i]});assert.equal(page.status,200);assert.equal(page.json.result.totalEvents,1);assert.deepEqual(page.json.result.events,[event]);
    const exported=await signed(base,'GET',one+'/export?format=json',{token:tokens[i]});assert.equal(exported.status,200);assert.deepEqual(exported.json.events,[event]);
    const csv=await signed(base,'GET',one+'/export?format=csv',{token:tokens[i]});assert.equal(csv.status,200);assert.match(csv.text,/chainId,contract,blockNumber/);
    if(i===0)globalThis.nodeCsv=csv.text;else assert.equal(csv.text,globalThis.nodeCsv);
    const cancelled=await signed(base,'POST',one+'/cancel',{token:tokens[i]});assert.equal(cancelled.status,200);assert.equal(cancelled.json.status,'COMPLETED');
  }
  const unknown=randomUUID();
  for(const base of bases){const missing=await signed(base,'GET',`${path}/${unknown}`,{token:tokens[0]});assert.equal(missing.status,404);assert.equal(missing.json.code,'NOT_FOUND')}
  const monitorPath=prefix+'/monitors';
  const monitorBody={chain:'base-sepolia',contract:jobInput.contract,startBlock:0,rule:{type:'mint'}};
  const monitors=await both('POST',monitorPath,{body:monitorBody,key:'v23_monitor_create_0001'});
  for(const value of monitors){assert.equal(value.status,202);assert.equal(value.json.status,'ACTIVE')}
  const monitorIds=monitors.map(value=>value.json.id),monitorTokens=monitors.map(value=>value.json.accessToken);
  await sameCode('monitor conflict','POST',monitorPath,{body:monitorBody,key:'v23_monitor_create_0001'},409,'ALREADY_SUBMITTED');
  for(let i=0;i<2;i++){
    const one=`${monitorPath}/${monitorIds[i]}`,base=bases[i],token=monitorTokens[i];
    assert.equal((await signed(base,'GET',one,{token:'wrong-capability'})).status,404);
    const active=await signed(base,'GET',one,{token});assert.equal(active.status,200);assert.equal(active.json.status,'ACTIVE');
    assert.deepEqual(active.json.rule,{type:'mint'});
    const paused=await signed(base,'POST',one+'/pause',{token});assert.equal(paused.json.status,'PAUSED');
    const resumed=await signed(base,'POST',one+'/resume',{token});assert.equal(resumed.json.status,'ACTIVE');
    const alertId=randomUUID(),transactionHash='0x'+'d'.repeat(64);
    const insert="INSERT INTO pit_alerts(id,monitor_id,chain_id,block_hash,block_number,transaction_hash,log_index,event_json) VALUES($1,$2,84532,$3,1,$4,0,$5) ON CONFLICT DO NOTHING";
    const args=[alertId,monitorIds[i],'0x'+'e'.repeat(64),transactionHash,{kind:'mint'}];
    await pools[i].query(insert,args);await pools[i].query(insert,[randomUUID(),...args.slice(1)]);
    const alerts=await signed(base,'GET',one+'/alerts',{token});assert.equal(alerts.status,200);assert.equal(alerts.json.alerts.length,1);assert.deepEqual(alerts.json.alerts[0].event_json,{kind:'mint'});
    await pools[i].query("UPDATE pit_monitors SET expires_at=now()-interval '1 second' WHERE id=$1",[monitorIds[i]]);
    const expired=await signed(base,'GET',one,{token});
    assert.equal(expired.status,i===0?200:404); // V1 still serves expired monitor capabilities; Rust rejects them.
    await pools[i].query("UPDATE pit_monitors SET expires_at=now()+interval '1 day' WHERE id=$1",[monitorIds[i]]);
    const deleted=await signed(base,'DELETE',one,{token});assert.equal(deleted.status,200);assert.equal(deleted.json.status,'DELETED');
    assert.equal((await signed(base,'GET',one,{token})).status,404);
  }
  for(let i=0;i<2;i++){
    const deleted=await signed(bases[i],'DELETE',`${path}/${ids[i]}`,{token:tokens[i]});assert.equal(deleted.status,200);assert.equal(deleted.json.status,'DELETED');
    assert.equal((await signed(bases[i],'GET',`${path}/${ids[i]}`,{token:tokens[i]})).status,404);
  }
  if(process.env.PIT_HTTP_BENCH_LOCAL==='1'){
    for(let i=0;i<2;i++){
      const samples=[];
      for(let n=0;n<31;n++){
        const started=performance.now();
        const response=await fetch(bases[i]+prefix+'/health');
        assert.equal(response.status,200);
        await response.arrayBuffer();
        if(n>0)samples.push(performance.now()-started);
      }
      samples.sort((a,b)=>a-b);
      console.log(`PIT_${i===0?'NODE':'RUST'}_HTTP_HEALTH_BENCH median_ms=${samples[15].toFixed(2)} p10_ms=${samples[2].toFixed(2)} p90_ms=${samples[26].toFixed(2)}`);
    }
  }
  console.log('PIT_V1_V2_HTTP_PARITY_PASS security validation lifecycle exports monitor cursor-compatible intentional-strict-pagination');
}finally{await cleanup()}
