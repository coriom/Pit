import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAllocations } from '../src/distribution.mjs';
import { publicAddress, resolvePublic, normalizeMetadataUri, ensureResponseStatus, safeFetch } from '../src/safe-http.mjs';
import { matchesRule } from '../src/monitor.mjs';
import { nftFetchAllowed, validateJob } from '../src/config.mjs';
import { createApi } from '../src/api.mjs';
import { processJob } from '../src/worker.mjs';
import { scanEvents } from '../src/events.mjs';
import { hashToken,safeTokenMatch } from '../src/db.mjs';
import { edgeSignature, verifyEdgeRequest } from '../src/edge-auth.mjs';
import { verifyAccess, signOriginRequest } from '../edge/worker.mjs';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
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
  for(const uri of ['http://example.com/x','https://127.0.0.1/x','file:///etc/passwd','https://'+'user:pass@example.com/x'])assert.throws(()=>normalizeMetadataUri(uri));
  await assert.rejects(resolvePublic('evil.example',async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]),/PRIVATE_ADDRESS/);
  await assert.rejects(resolvePublic('evil.example',async()=>[{address:'::ffff:127.0.0.1',family:6}]),/PRIVATE_ADDRESS/);
  assert.throws(()=>ensureResponseStatus(302),/REDIRECT_FORBIDDEN/);assert.throws(()=>ensureResponseStatus(413),/HTTP_413/);
  assert.equal(normalizeMetadataUri('ipfs://QmYwAPJzv5CZsnAzt8auVTL8f5BTj1VUnFWK8mNQSi2wS7/a.json').hostname,'ipfs.io');
});
test('metadata fetch pins the validated public address and bounds redirects, size and time',async()=>{
  let lookups=0,pinned=null;
  const lookup=async()=>{lookups++;return [{address:'8.8.8.8',family:4}];};
  const requestFn=(status,chunks)=>(_url,options,callback)=>{
    options.lookup('example.com',{},(_error,address)=>{pinned=address;});
    const req=new EventEmitter();req.end=()=>{const res=Readable.from(chunks);res.statusCode=status;res.headers={'content-type':'application/json'};queueMicrotask(()=>callback(res));};req.destroy=error=>req.emit('error',error);return req;
  };
  const ok=await safeFetch('https://example.com/a',{lookup,requestFn:requestFn(200,[Buffer.from('{}')])});
  assert.equal(ok.body.toString(),'{}');assert.equal(pinned,'8.8.8.8');assert.equal(lookups,1);
  await assert.rejects(safeFetch('https://example.com/a',{lookup,requestFn:requestFn(302,[])}),/REDIRECT_FORBIDDEN/);
  await assert.rejects(safeFetch('https://example.com/a',{lookup,maxBytes:2,requestFn:requestFn(200,[Buffer.from('too large')])}),/BODY_LIMIT/);
  const timeout=(_url,_options,_callback)=>{const req=new EventEmitter();req.end=()=>queueMicrotask(()=>req.emit('timeout'));req.destroy=error=>req.emit('error',error);return req;};
  await assert.rejects(safeFetch('https://example.com/a',{lookup,requestFn:timeout}),/TIMEOUT/);
  await assert.rejects(safeFetch('https://coolify',{lookup:async()=>[{address:'172.18.0.1',family:4}]}),/PRIVATE_ADDRESS/);
  await assert.rejects(safeFetch('https://metadata.google.internal/computeMetadata/v1',{lookup}),/HOST_FORBIDDEN/);
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
test('hosted NFT fetching is disabled at both the configuration and API boundary',async()=>{
  assert.equal(nftFetchAllowed({NODE_ENV:'production',PIT_NFT_FETCH_ENABLED:'1'}),false);
  assert.equal(nftFetchAllowed({NODE_ENV:'test',PIT_NFT_FETCH_ENABLED:'0'}),false);
  const server=createApi({}, {inviteHash:hashToken('private-invite'),allowedOrigin:'http://127.0.0.1:4000',nftEnabled:false});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/pit/api/v1/jobs`,{
      method:'POST',headers:{'content-type':'application/json','x-pit-invite':'private-invite'},
      body:JSON.stringify({kind:'nft',input:{chain:'base-sepolia',contract:a,tokenIds:['1']}})
    });
    assert.equal(response.status,503);
    assert.equal((await response.json()).code,'NFT_FETCH_DISABLED');
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('worker rejects a queued NFT job when hosted fetching is disabled',async()=>{
  let savedStatus,savedCode;
  const pool={query:async(_sql,args)=>{savedStatus=args[1];savedCode=args[2];return {rowCount:1};}};
  const status=await processJob(pool,{id:'job',kind:'nft',input_json:{},claim_token:'lease',attempts:1},{nftEnabled:false,fetcher:()=>{throw Error('FETCH_CALLED');}});
  assert.equal(status,'FAILED');
  assert.equal(savedStatus,'FAILED');
  assert.equal(savedCode,'NFT_FETCH_DISABLED');
});
test('API bounds simultaneous requests and returns an explicit overload response',async()=>{
  let release,entered;
  const enteredPromise=new Promise(resolve=>entered=resolve);
  const pool={query:()=>new Promise(resolve=>{release=resolve;entered();})};
  const server=createApi(pool,{inviteHash:hashToken('private-invite'),allowedOrigin:'http://127.0.0.1:4000',maxActiveRequests:1});
  assert.equal(server.headersTimeout,10_000);
  assert.equal(server.requestTimeout,15_000);
  assert.equal(server.timeout,30_000);
  assert.equal(server.maxConnections,64);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const url=`http://127.0.0.1:${server.address().port}/pit/api/v1/ready`;
    const first=fetch(url);
    await enteredPromise;
    const busy=await fetch(url);
    assert.equal(busy.status,503);
    assert.equal(busy.headers.get('retry-after'),'5');
    assert.equal((await busy.json()).code,'SERVER_BUSY');
    release({rows:[{live:true}]});
    assert.equal((await first).status,200);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('tokens are hashed and compared without plaintext persistence',()=>{
  const hash=hashToken('test-capability');assert.equal(safeTokenMatch(hash,'test-capability'),true);assert.equal(safeTokenMatch(hash,'other'),false);
});
test('edge HMAC binds method, path, body, nonce and timestamp',async()=>{
  const secret='a-local-test-secret-with-at-least-32-bytes';
  const request=new Request('https://private.example/pit/api/v1/jobs?format=json',{method:'POST',body:'{"kind":"events"}'});
  const signed=await signOriginRequest(request,{PIT_BACKEND_ORIGIN:'https://api.example',PIT_EDGE_HMAC_KEY:secret});
  await assert.rejects(signOriginRequest(request,{PIT_BACKEND_ORIGIN:'https://94.16.113.122',PIT_EDGE_HMAC_KEY:secret}),/EDGE_CONFIG_INVALID/);
  const body=Buffer.from(await signed.arrayBuffer());
  const req={method:'POST',url:'/pit/api/v1/jobs?format=json',headers:{'x-pit-edge-timestamp':signed.headers.get('x-pit-edge-timestamp'),'x-pit-edge-nonce':signed.headers.get('x-pit-edge-nonce'),'x-pit-edge-signature':signed.headers.get('x-pit-edge-signature')}};
  assert(verifyEdgeRequest(req,body,secret));
  assert(!verifyEdgeRequest({...req,url:'/pit/api/v1/other'},body,secret));
  assert(!verifyEdgeRequest({...req,method:'DELETE'},body,secret));
  assert(!verifyEdgeRequest(req,Buffer.from('{}'),secret));
  assert(!verifyEdgeRequest(req,body,secret,Date.now()+120_000));
  assert(!verifyEdgeRequest({...req,headers:{...req.headers,'x-pit-edge-nonce':'0'.repeat(32)}},body,secret));
  assert.equal(edgeSignature(secret,req.headers['x-pit-edge-timestamp'],req.headers['x-pit-edge-nonce'],req.method,req.url,body),req.headers['x-pit-edge-signature']);
});
test('edge rejects unsigned or wrong-audience Access JWT',async()=>{
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...publicKey.export({format:'jwk'}),kid:'local-test-key'};
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const claims={iss:'https://test-team.cloudflareaccess.com',aud:'pit-beta',email:'operator@example.com',exp:Math.floor(Date.now()/1000)+60};
  const tokenFor=value=>{const message=`${encode({alg:'RS256',kid:jwk.kid})}.${encode(value)}`;const signature=createSign('RSA-SHA256').update(message).sign(privateKey).toString('base64url');return `${message}.${signature}`;};
  const env={PIT_ACCESS_TEAM:'test-team',PIT_ACCESS_AUD:'pit-beta',PIT_ACCESS_ALLOWED_EMAILS:'operator@example.com'};
  const keys=async()=>[jwk];
  assert(await verifyAccess(new Request('https://private.example/',{headers:{'Cf-Access-Jwt-Assertion':tokenFor(claims)}}),env,keys));
  assert.equal(await verifyAccess(new Request('https://private.example/'),env,keys),false);
  assert.equal(await verifyAccess(new Request('https://private.example/',{headers:{'Cf-Access-Jwt-Assertion':tokenFor({...claims,aud:'other'})}}),env,keys),false);
  assert.equal(await verifyAccess(new Request('https://private.example/',{headers:{'Cf-Access-Jwt-Assertion':tokenFor({...claims,email:'other@example.com'})}}),env,keys),false);
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
