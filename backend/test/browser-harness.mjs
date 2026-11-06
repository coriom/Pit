// Local-only API/worker harness. Never packaged in the production Docker image.
import { http } from 'viem';
import { createApi } from '../src/api.mjs';
import { createPool, claimJob, hashToken } from '../src/db.mjs';
import { clientFor } from '../src/rpc.mjs';
import { processJob } from '../src/worker.mjs';
import { claimMonitor, pollMonitor } from '../src/monitor.mjs';
import { createServer as createHttpServer } from 'node:http';
if(!process.env.PIT_TEST_DATABASE_URL||!/^http:\/\/127\.0\.0\.1:8549$/.test(process.env.PIT_TEST_RPC_URL??''))throw Error('LOCAL_TEST_ENDPOINTS_REQUIRED');
const pool=createPool(process.env.PIT_TEST_DATABASE_URL),client=clientFor('base-sepolia',http(process.env.PIT_TEST_RPC_URL));
const metadata=createHttpServer((req,res)=>{
  if(req.url==='/pit-token-1.json'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({name:'Fixture NFT',description:'Local browser fixture',image:'https://example.com/image.png'}));return;}
  if(req.url==='/image.png'){res.writeHead(200,{'content-type':'image/png'});res.end('png');return;}
  res.writeHead(404);res.end();
});
await new Promise(resolve=>metadata.listen(0,'127.0.0.1',resolve));
const fixtureFetch=async(uri,{method='GET'}={})=>{
  const response=await fetch(`http://127.0.0.1:${metadata.address().port}${new URL(uri).pathname}`,{method});
  if(!response.ok)throw Error('HTTP_'+response.status);
  return {contentType:response.headers.get('content-type'),body:Buffer.from(await response.arrayBuffer())};
};
const server=createApi(pool,{inviteHash:hashToken('browser-invite'),allowedOrigin:'http://127.0.0.1:4399',clientFactory:()=>client});
server.listen(8790,'127.0.0.1');let busy=false;
const timer=setInterval(async()=>{if(busy)return;busy=true;try{
  const job=await claimJob(pool);
  if(job)await processJob(pool,job,{client,fetcher:fixtureFetch,sourceLookup:async()=>({status:'UNKNOWN'})});
  else {const monitor=await claimMonitor(pool);if(monitor)await pollMonitor(pool,monitor,{client,intervalSeconds:1});}
}catch(error){console.error('HARNESS_WORKER_ERROR',String(error.message).slice(0,80));}finally{busy=false;}},200);
const stop=()=>{clearInterval(timer);metadata.close();server.close(()=>pool.end());};process.on('SIGTERM',stop);process.on('SIGINT',stop);
