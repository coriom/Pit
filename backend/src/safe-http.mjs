import dns from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import ipaddr from 'ipaddr.js';

export function publicAddress(ip) {
  try { return ipaddr.process(ip).range() === 'unicast'; } catch { return false; }
}
export async function resolvePublic(hostname, lookup=dns.lookup) {
  if (ipaddr.isValid(hostname)) throw new Error('IP_LITERAL_FORBIDDEN');
  if (!/^[a-z0-9.-]{3,253}$/i.test(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) throw new Error('HOST_FORBIDDEN');
  const results=await lookup(hostname,{all:true,verbatim:true});
  if(!results.length||results.some(x=>!publicAddress(x.address)))throw new Error('PRIVATE_ADDRESS_FORBIDDEN');
  return results[0];
}
export function normalizeMetadataUri(uri) {
  if(typeof uri!=='string'||uri.length>2048)throw new Error('URI_INVALID');
  if(uri.startsWith('ipfs://')){
    const path=uri.slice(7).replace(/^ipfs\//,'');
    if(!/^[a-zA-Z0-9]{46,60}(?:\/[a-zA-Z0-9._~!$&'()+,;=:@%/-]*)?$/.test(path)||path.includes('..'))throw new Error('IPFS_PATH_INVALID');
    return new URL(`https://ipfs.io/ipfs/${path}`);
  }
  const url=new URL(uri);
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||ipaddr.isValid(url.hostname.replace(/^\[|\]$/g,'')))throw new Error('URI_SCHEME_FORBIDDEN');
  return url;
}
export function ensureResponseStatus(status){if(status>=300&&status<400)throw new Error('REDIRECT_FORBIDDEN');if(status<200||status>=300)throw new Error(`HTTP_${status}`);}
export async function safeFetch(uri,{ method='GET', maxBytes=512*1024, timeoutMs=8000, lookup=dns.lookup }={}){
  const url=normalizeMetadataUri(uri),resolved=await resolvePublic(url.hostname,lookup);
  return new Promise((resolve,reject)=>{
    const req=(url.protocol==='https:'?httpsRequest:httpRequest)(url,{method,agent:false,timeout:timeoutMs,lookup:(_h,_o,cb)=>cb(null,resolved.address,resolved.family),headers:{'Accept':'application/json,image/*;q=0.5','User-Agent':'PIT-Crypto-Metadata-Checker/1.0'},maxHeaderSize:8192},res=>{
      try{ensureResponseStatus(res.statusCode);}catch(error){res.resume();reject(error);return;}
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){req.destroy(new Error('BODY_LIMIT'));return;}chunks.push(chunk);});
      res.on('end',()=>resolve({status:res.statusCode,contentType:res.headers['content-type']??'',body:Buffer.concat(chunks)}));
      res.on('error',reject);
    });
    req.on('timeout',()=>req.destroy(new Error('TIMEOUT')));req.on('error',reject);req.end();
  });
}
