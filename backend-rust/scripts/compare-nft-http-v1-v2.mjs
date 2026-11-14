import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {encodeFunctionData, http} from '../../backend/node_modules/viem/_esm/index.js';
import {clientFor} from '../../backend/src/rpc.mjs';
import {checkNft} from '../../backend/src/nft.mjs';

const rpcUrl=process.env.PIT_TEST_RPC_URL;
if(rpcUrl!=='http://127.0.0.1:58545'||process.env.PIT_NFT_HTTP_PARITY_LOCAL!=='1')throw Error('LOCAL_FIXTURES_REQUIRED');
const fixture=JSON.parse(await readFile('/tmp/pit-v2-parity-local.json','utf8'));
assert.equal(new URL(fixture.nftHttpOrigin).hostname,'127.0.0.1');
const port=Number(new URL(fixture.nftHttpOrigin).port);
const valid=Buffer.from('{"name":"Fixture NFT","description":"Parity HTTP","image":"https://fixture.example/image.png"}');
const missing=Buffer.from('{"name":"Fixture NFT","description":"Parity HTTP","image":"https://fixture.example/missing.png"}');
const server=createServer((req,res)=>{
  if(req.url==='/parity-slow'){setTimeout(()=>{res.writeHead(200,{'content-type':'application/json'});res.end('{}')},4000);return}
  if(req.url==='/image.png'&&req.method==='HEAD'){res.writeHead(200,{'content-type':'image/png'});res.end();return}
  if(req.url==='/missing.png'){res.writeHead(404);res.end();return}
  const body=({
    '/parity-valid':valid,
    '/parity-invalid':Buffer.from('{invalid'),
    '/parity-media-missing':missing,
    '/parity-oversized':Buffer.alloc(512*1024+1,120),
  })[req.url];
  if(!body){res.writeHead(404);res.end();return}
  res.writeHead(200,{'content-type':'application/json'});res.end(body);
});
await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
const client=clientFor('base-sepolia',http(rpcUrl,{timeout:5000,retryCount:0}));
const rpc=async(method,params)=>{
  const response=await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  const data=await response.json();if(data.error)throw Error(JSON.stringify(data.error));return data.result;
};
const fetcher=async(uri,{method='GET',maxBytes=512*1024}={})=>{
  const parsed=new URL(uri);
  if(parsed.protocol!=='https:'||parsed.hostname!=='fixture.example')throw Error('FIXTURE_HOST_FORBIDDEN');
  let response;
  try{response=await fetch(`${fixture.nftHttpOrigin}${parsed.pathname}`,{method,redirect:'manual',signal:AbortSignal.timeout(3000)})}
  catch(error){if(error.name==='TimeoutError')throw Error('TIMEOUT');throw error}
  if(response.status>=300&&response.status<400)throw Error('REDIRECT_FORBIDDEN');
  if(!response.ok)throw Error(`HTTP_${response.status}`);
  const chunks=[];let size=0;
  try{for await(const chunk of response.body??[]){size+=chunk.length;if(size>maxBytes)throw Error('BODY_LIMIT');chunks.push(chunk)}}
  catch(error){if(error.name==='TimeoutError')throw Error('TIMEOUT');throw error}
  return {contentType:response.headers.get('content-type')??'',body:Buffer.concat(chunks)};
};
const normalizedIssues=issues=>issues.map(issue=>/JSON|Unexpected token/.test(issue)?'INVALID_JSON':issue);
try{
  const accounts=await rpc('eth_accounts',[]);
  for(const [name,{uri,tokenIds,result:rust}] of Object.entries(fixture.nftHttpCases)){
    const data=encodeFunctionData({abi:[{type:'function',name:'setTokenURI',inputs:[{name:'value',type:'string'}],outputs:[],stateMutability:'nonpayable'}],functionName:'setTokenURI',args:[uri]});
    const hash=await rpc('eth_sendTransaction',[{from:accounts[0],to:fixture.nft,data,gas:'0x7a1200'}]);
    const receipt=await rpc('eth_getTransactionReceipt',[hash]);assert.equal(receipt.status,'0x1');
    const node=await checkNft({chain:'base-sepolia',contract:fixture.nft,tokenIds},{client,fetcher});
    assert.equal(node.status,rust.status,name);
    assert.deepEqual(node.summary,rust.summary,name);
    assert.deepEqual(node.rows.map(row=>row.status),rust.rows.map(row=>row.status),name);
    assert.deepEqual(node.rows.map(row=>normalizedIssues(row.issues)),rust.rows.map(row=>row.issues),name);
    assert.deepEqual(node.rows.map(row=>row.metadataHash),rust.rows.map(row=>row.metadataHash),name);
    assert.deepEqual(node.rows.map(row=>row.media?.reason??null),rust.rows.map(row=>row.media?.reason??null),name);
    console.log(`NFT_HTTP_PARITY_${name}=PASS`);
  }
  console.log('PIT_V1_V2_NFT_HTTP_PARITY_PASS');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
