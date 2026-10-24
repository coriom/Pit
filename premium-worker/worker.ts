import { authConfigured, authRequestAllowed, createAuth, limitWalletAuth, verifiedWallet, type PremiumEnv } from './auth';
import { route } from './router';

export async function boundedAuthRequest(request:Request):Promise<Request|null> {
  if (request.method==='GET' || request.method==='HEAD' || !request.body) return request;
  const limit=16*1024;
  const declared=Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared>limit) return null;
  const reader=request.body.getReader(); const chunks:Uint8Array[]=[]; let bytes=0;
  while(true) {
    const part=await reader.read(); if(part.done) break;
    bytes+=part.value.byteLength;
    if(bytes>limit) {await reader.cancel();return null;}
    chunks.push(part.value);
  }
  const body=new Uint8Array(bytes); let cursor=0;
  for(const chunk of chunks) {body.set(chunk,cursor);cursor+=chunk.byteLength;}
  return new Request(request,{body});
}

export default {
  async fetch(request:Request,env:PremiumEnv):Promise<Response> {
    try {
      const url=new URL(request.url);
      if (url.pathname==='/health') return route(request,env,null);
      if (!authConfigured(env)) return Response.json({error:'Authentication unavailable.'},{status:503,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
      if (!authRequestAllowed(request,env)) return Response.json({error:'Origin denied.'},{status:403});
      const auth=createAuth(env);
      if (url.pathname.startsWith('/api/auth/')) {
        const allowed=new Map([['/api/auth/siwe/nonce','POST'],['/api/auth/siwe/verify','POST'],['/api/auth/sign-out','POST']]);
        if (allowed.get(url.pathname)!==request.method) return Response.json({error:'Authentication route unavailable.'},{status:404});
        if (url.pathname!=='/api/auth/sign-out' && !await limitWalletAuth(request,env)) return Response.json({error:'Wallet authentication rate limited or unavailable.'},{status:429});
        const bounded=await boundedAuthRequest(request);
        if (!bounded) return Response.json({error:'Authentication request exceeds 16 KiB.'},{status:413});
        const response=await auth.handler(bounded);
        if (url.pathname==='/api/auth/siwe/verify' && response.ok) {
          // Better Auth's SIWE endpoint also returns the bearer session token in
          // JSON. PIT uses only the HttpOnly cookie and removes that body field.
          const {token:_token,...safe}=await response.json() as Record<string,unknown>;
          return Response.json(safe,{status:response.status,headers:response.headers});
        }
        return response;
      }
      const session=await auth.api.getSession({headers:request.headers});
      const wallet=session?.user?.id ? await verifiedWallet(env,session.user.id) : null;
      if (url.pathname==='/v1/identity') return wallet ? Response.json({address:wallet.address,chainId:wallet.chainId},{headers:{'Cache-Control':'no-store'}}) : Response.json({error:'Verified wallet session required.'},{status:401});
      return route(request,env,wallet ? session!.user.id : null);
    } catch {
      return Response.json({error:'Premium service unavailable.'},{status:503,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
    }
  },
};
