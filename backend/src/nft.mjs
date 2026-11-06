import { createHash } from 'node:crypto';
import { parseAbi } from 'viem';
import { assertChain, clientFor } from './rpc.mjs';
import { limits } from './config.mjs';
import { safeFetch, normalizeMetadataUri } from './safe-http.mjs';

const abi=parseAbi(['function tokenURI(uint256) view returns (string)','function uri(uint256) view returns (string)']);
const digest=v=>createHash('sha256').update(v).digest('hex');
export async function checkNft(input,{client=clientFor(input.chain),fetcher=safeFetch,previous={}}={}){
  await assertChain(client,input.chain);
  const code=await client.getCode({address:input.contract});if(!code||code==='0x')throw new Error('NO_CONTRACT_CODE');
  const rows=[],seen=new Set(),hashes=new Map();
  for(const tokenId of input.tokenIds){
    if(seen.has(tokenId)){rows.push({tokenId,status:'DUPLICATE_TOKEN_ID'});continue;}seen.add(tokenId);
    const row={tokenId,status:'UNKNOWN',uri:null,metadataHash:null,media:null,issues:[]};rows.push(row);
    try{
      let uri=await client.readContract({address:input.contract,abi,functionName:'tokenURI',args:[BigInt(tokenId)]}).catch(()=>null);
      if(uri===null)uri=await client.readContract({address:input.contract,abi,functionName:'uri',args:[BigInt(tokenId)]});
      uri=uri.replaceAll('{id}',BigInt(tokenId).toString(16).padStart(64,'0'));
      row.uri=uri;normalizeMetadataUri(uri);
      const response=await fetcher(uri,{maxBytes:limits.metadataBytes});
      if(!String(response.contentType).toLowerCase().includes('json'))row.issues.push('METADATA_CONTENT_TYPE');
      const value=JSON.parse(response.body.toString('utf8'));
      if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('METADATA_OBJECT_REQUIRED');
      if(typeof value.name!=='string'||!value.name.trim())row.issues.push('NAME_MISSING');
      if(typeof value.description!=='string')row.issues.push('DESCRIPTION_MISSING');
      row.metadataHash=digest(response.body);
      if(hashes.has(row.metadataHash))row.issues.push(`DUPLICATE_METADATA_WITH_${hashes.get(row.metadataHash)}`);else hashes.set(row.metadataHash,tokenId);
      if(previous[tokenId]&&previous[tokenId]!==row.metadataHash)row.issues.push('METADATA_CHANGED');
      if(typeof value.image==='string'){
        try{normalizeMetadataUri(value.image);const media=await fetcher(value.image,{method:'HEAD',maxBytes:0});if(!/^(image|video|audio)\//i.test(String(media.contentType)))throw new Error('MEDIA_CONTENT_TYPE');row.media={uri:value.image,contentType:media.contentType,status:'ACCESSIBLE'};}
        catch(error){row.media={uri:value.image,status:'UNAVAILABLE',reason:error.message};row.issues.push('MEDIA_UNAVAILABLE');}
      }else row.issues.push('IMAGE_MISSING');
      row.status=row.issues.length?'ISSUES':'OK';
    }catch(error){row.status='UNAVAILABLE';row.issues.push(String(error.message).slice(0,100));}
  }
  return {status:rows.every(r=>r.status==='OK')?'COMPLETE':'PARTIAL',chain:input.chain,contract:input.contract,rows,summary:{checked:rows.length,ok:rows.filter(r=>r.status==='OK').length,issues:rows.filter(r=>r.status!=='OK').length},limitations:['Availability at scan time does not prove permanent IPFS pinning or immutable content.','Token enumeration and ownership are not inferred.']};
}
