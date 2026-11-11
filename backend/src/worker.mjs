import { createPool, claimJob, expireData } from './db.mjs';
import { scanEvents } from './events.mjs';
import { analyzePermissions } from './permissions.mjs';
import { verifyDistribution } from './distribution.mjs';
import { checkNft } from './nft.mjs';
import { nftFetchAllowed } from './config.mjs';
import { claimMonitor, pollMonitor, sendQueuedDelivery } from './monitor.mjs';

export async function processJob(pool,job,{client,fetcher,sourceLookup,nftEnabled=nftFetchAllowed()}={}){
  let heartbeat;
  try{
    heartbeat=setInterval(()=>pool.query(`UPDATE pit_jobs SET lease_until=now()+interval '2 minutes' WHERE id=$1 AND claim_token=$2 AND status='RUNNING'`,[job.id,job.claim_token]).catch(()=>{}),30000);
    const input=job.input_json;let result;
    if(job.kind==='events')result=await scanEvents(input,{client,resume:job.progress_json,onProgress:async progress=>{const {rowCount}=await pool.query(`UPDATE pit_jobs SET progress_json=$2,lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=$1 AND claim_token=$3 AND status='RUNNING'`,[job.id,JSON.stringify(progress),job.claim_token]);if(!rowCount)throw new Error('STALE_LEASE');}});
    else if(job.kind==='permissions')result=await analyzePermissions(input,{client,sourceLookup});
    else if(job.kind==='distribution')result=await verifyDistribution(input,{client});
    else if(job.kind==='nft'){
      if(!nftEnabled)throw new Error('NFT_FETCH_DISABLED');
      result=await checkNft(input,{client,fetcher});
    }
    else throw new Error('UNSUPPORTED_JOB');
    const status=['COMPLETE','VERIFIED'].includes(result.status)?'COMPLETED':'PARTIAL';
    const saved=await pool.query(`UPDATE pit_jobs SET status=$2,result_json=$3,progress_json=$4,lease_until=NULL,updated_at=now() WHERE id=$1 AND status='RUNNING' AND claim_token=$5`,[job.id,status,JSON.stringify(result),JSON.stringify({count:result.events?.length??null,completed:result.completed??[],missing:result.missing??[]}),job.claim_token]);if(!saved.rowCount)return 'STALE_LEASE';
    return status;
  }catch(error){const raw=String(error.message??'JOB_ERROR');const code=/^[A-Z][A-Z0-9_]{2,60}$/.test(raw)?raw:/rate limit|timeout|HTTP request failed|fetch failed/i.test(raw)?'RPC_UNAVAILABLE':'JOB_FAILED';const retry=/^(HTTP_|TIMEOUT|RPC_UNAVAILABLE)/i.test(code)&&job.attempts<2;
    if(code==='STALE_LEASE')return 'STALE_LEASE';
    const nextStatus=code==='CANCELLED'?'CANCELLED':retry?'QUEUED':'FAILED';
    const {rowCount}=await pool.query(`UPDATE pit_jobs SET status=$2,error_code=$3,lease_until=NULL,updated_at=now() WHERE id=$1 AND status='RUNNING' AND claim_token=$4`,[job.id,nextStatus,code,job.claim_token]);
    return rowCount?nextStatus:'STALE_LEASE';
  }finally{clearInterval(heartbeat);}
}
export async function tick(pool){const job=await claimJob(pool);if(job)return {type:'job',id:job.id,status:await processJob(pool,job)};
  const monitor=await claimMonitor(pool);if(monitor){let heartbeat;try{heartbeat=setInterval(()=>pool.query(`UPDATE pit_monitors SET lease_until=now()+interval '2 minutes' WHERE id=$1 AND lease_token=$2 AND status='ACTIVE'`,[monitor.id,monitor.lease_token]).catch(()=>{}),30000);return {type:'monitor',id:monitor.id,...await pollMonitor(pool,monitor)};}catch(error){await pool.query(`UPDATE pit_monitors SET lease_until=NULL,next_poll_at=now()+interval '2 minutes' WHERE id=$1 AND lease_token=$2`,[monitor.id,monitor.lease_token]);return {type:'monitor',id:monitor.id,status:'RETRY',reason:String(error.message).slice(0,80)};}finally{clearInterval(heartbeat);}}
  const delivery=await sendQueuedDelivery(pool);return {type:'delivery',status:delivery};
}
if(import.meta.url===`file://${process.argv[1]}`){const pool=createPool();let stopping=false,cycles=0;process.on('SIGTERM',()=>stopping=true);process.on('SIGINT',()=>stopping=true);
  const heartbeat=()=>pool.query(`INSERT INTO pit_worker_heartbeat(singleton,last_seen) VALUES(true,now()) ON CONFLICT(singleton) DO UPDATE SET last_seen=now()`).catch(()=>{});
  await heartbeat();const heartbeatTimer=setInterval(heartbeat,30_000);
  while(!stopping){try{await tick(pool);if(++cycles%60===0){await expireData(pool);await pool.query('DELETE FROM pit_edge_nonces WHERE expires_at<now()');}}catch{console.error('PIT_WORKER_ERROR');}await new Promise(r=>setTimeout(r,1000));}
  clearInterval(heartbeatTimer);await pool.end();}
