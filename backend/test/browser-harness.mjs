// Local-only API/worker harness. Never packaged in the production Docker image.
import { http } from 'viem';
import { createApi } from '../src/api.mjs';
import { createPool, claimJob, hashToken } from '../src/db.mjs';
import { clientFor } from '../src/rpc.mjs';
import { processJob } from '../src/worker.mjs';
if(!process.env.PIT_TEST_DATABASE_URL||!/^http:\/\/127\.0\.0\.1:8549$/.test(process.env.PIT_TEST_RPC_URL??''))throw Error('LOCAL_TEST_ENDPOINTS_REQUIRED');
const pool=createPool(process.env.PIT_TEST_DATABASE_URL),client=clientFor('base-sepolia',http(process.env.PIT_TEST_RPC_URL));
const server=createApi(pool,{inviteHash:hashToken('browser-invite'),allowedOrigin:'http://127.0.0.1:4399',clientFactory:()=>client});
server.listen(8790,'127.0.0.1');let busy=false;
const timer=setInterval(async()=>{if(busy)return;busy=true;try{const job=await claimJob(pool);if(job)await processJob(pool,job,{client,sourceLookup:async()=>({status:'UNKNOWN'})});}finally{busy=false;}},200);
const stop=()=>{clearInterval(timer);server.close(()=>pool.end());};process.on('SIGTERM',stop);process.on('SIGINT',stop);
