// Run with `docker compose exec -T pit-api node --input-type=module -e "$(cat this-file)" <phase>`.
// The raw disposable invite is supplied on stdin for `pre`; never put it in argv or logs.
import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { edgeSignature } from './src/edge-auth.mjs';
import { createPool } from './src/db.mjs';

const phase=process.argv.at(-1);
const base='http://127.0.0.1:8789/pit/api/v1';
const statePath='/tmp/pit-canary-smoke-state.json';
const contract='0xF2c716A5EA0240C3D3A49cA1aad81d98e2947475';
const block=51698212;
const check=(value,code)=>{if(!value)throw new Error(code);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function signedRequest(method,path,payload,extra={}){
  const body=payload===undefined?undefined:JSON.stringify(payload);
  const time=String(Date.now()),nonce=randomBytes(16).toString('hex');
  const signature=edgeSignature(process.env.PIT_EDGE_HMAC_KEY,time,nonce,method,`/pit/api/v1${path}`,body?Buffer.from(body):Buffer.alloc(0));
  return {url:`${base}${path}`,options:{method,headers:{'x-pit-edge-timestamp':time,'x-pit-edge-nonce':nonce,'x-pit-edge-signature':signature,...(body?{'content-type':'application/json'}:{}),...extra},...(body?{body}:{})}};
}
async function request(method,path,payload,extra={}){
  const {url,options}=signedRequest(method,path,payload,extra);
  const response=await fetch(url,options);
  const content=await response.text();
  let data;try{data=JSON.parse(content);}catch{data=content;}
  return {status:response.status,data};
}
async function database(){return createPool();}

async function baseline(){
  check((await fetch(`${base}/health`)).status===200,'HEALTH');
  check((await fetch(`${base}/ready`)).status===200,'READY');
  const db=await database();
  try{
    const {rows}=await db.query("SELECT to_regclass('public.pit_jobs') AS jobs, to_regclass('public.pit_edge_nonces') AS nonces, EXISTS(SELECT 1 FROM pit_worker_heartbeat WHERE singleton AND last_seen>now()-interval '2 minutes') AS worker");
    check(rows[0]?.jobs&&rows[0]?.nonces&&rows[0]?.worker,'MIGRATION_OR_WORKER');
  }finally{await db.end();}
  const unsigned=await fetch(`${base}/jobs/00000000-0000-4000-8000-000000000000`);
  check(unsigned.status===403,'UNSIGNED_ORIGIN_ALLOWED');
  const replay=signedRequest('GET','/jobs/00000000-0000-4000-8000-000000000000');
  check((await fetch(replay.url,replay.options)).status===404,'SIGNED_UNKNOWN_RESOURCE');
  check((await fetch(replay.url,replay.options)).status===403,'NONCE_REPLAY_ALLOWED');
  const response=await fetch('https://base-sepolia-rpc.publicnode.com',{method:'POST',headers:{'content-type':'application/json','user-agent':'PIT-internal-canary/1.0'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]}),signal:AbortSignal.timeout(10000)});
  check(response.ok,'RPC_HTTP');
  const rpc=await response.json();check(rpc.result==='0x14a34','RPC_CHAIN');
  console.log('CANARY_BASELINE_PASS health ready migrations worker unsigned-denial replay-denial Base-Sepolia-chain');
}

async function pre(){
  let invite='';for await(const chunk of process.stdin)invite+=chunk;
  invite=invite.trim();
  check(invite.length>=32&&createHash('sha256').update(invite).digest('hex')===process.env.PIT_BACKEND_INVITE_SHA256,'INVITE_HASH');
  const created=await request('POST','/jobs',{kind:'events',input:{chain:'base-sepolia',contract,fromBlock:block,toBlock:block}},{'x-pit-invite':invite,'idempotency-key':randomBytes(16).toString('hex')});
  check(created.status===202&&created.data?.status==='QUEUED'&&created.data?.id&&created.data?.accessToken,'JOB_CREATE');
  const db=await database();try{const {rows}=await db.query('SELECT status FROM pit_jobs WHERE id=$1',[created.data.id]);check(rows[0]?.status==='QUEUED','JOB_NOT_QUEUED');}finally{await db.end();}
  await writeFile(statePath,JSON.stringify({id:created.data.id,accessToken:created.data.accessToken}),{mode:0o600,flag:'wx'});
  console.log('CANARY_PRE_PASS queued-public-event-job-persisted');
}

async function post(){
  const state=JSON.parse(await readFile(statePath,'utf8'));
  const path=`/jobs/${state.id}`;
  const denied=await request('GET',path,undefined,{'authorization':`Bearer ${randomBytes(32).toString('base64url')}`});
  check(denied.status===404,'CAPABILITY_SCOPE');
  let job;
  for(let i=0;i<45;i++){
    const found=await request('GET',path,undefined,{'authorization':`Bearer ${state.accessToken}`});
    check(found.status===200,'JOB_READ');job=found.data;
    if(['COMPLETED','PARTIAL','FAILED','CANCELLED'].includes(job.status))break;
    await pause(2000);
  }
  check(job?.status==='COMPLETED'&&job.result?.status==='COMPLETE'&&job.result?.events?.length===2&&job.result?.missing?.length===0,'JOB_NOT_COMPLETE');
  check(job.result.requested?.[0]===block&&job.result.requested?.[1]===block,'COVERAGE');
  const exported=await request('GET',`${path}/export?format=json`,undefined,{'authorization':`Bearer ${state.accessToken}`});
  check(exported.status===200&&exported.data?.events?.length===2,'JSON_EXPORT');
  const csv=await request('GET',`${path}/export?format=csv`,undefined,{'authorization':`Bearer ${state.accessToken}`});
  check(csv.status===200&&typeof csv.data==='string'&&csv.data.includes('transactionHash'),'CSV_EXPORT');
  const db=await database();
  try{
    const {rows}=await db.query('SELECT status,expires_at,result_json FROM pit_jobs WHERE id=$1',[state.id]);
    const expiry=+new Date(rows[0]?.expires_at)-Date.now();
    check(rows[0]?.status==='COMPLETED'&&rows[0]?.result_json?.events?.length===2&&expiry>0&&expiry<=25*3600*1000,'PERSISTENCE_OR_EXPIRY');
  }finally{await db.end();}
  const removed=await request('DELETE',path,undefined,{'authorization':`Bearer ${state.accessToken}`});
  check(removed.status===200&&removed.data?.status==='DELETED','DELETE');
  await unlink(statePath);
  console.log('CANARY_POST_PASS worker-restart completion canonical-coverage exports scoped-access persistence expiry deletion');
}

try{
  if(phase==='baseline')await baseline();
  else if(phase==='pre')await pre();
  else if(phase==='post')await post();
  else throw new Error('PHASE_REQUIRED');
}catch(error){console.error('CANARY_SMOKE_FAILED',error.message);process.exitCode=1;}
