import { authConfigured, authRequestAllowed, createAuth, type PremiumEnv } from './auth';
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
        const bounded=await boundedAuthRequest(request);
        return bounded ? auth.handler(bounded) : Response.json({error:'Authentication request exceeds 16 KiB.'},{status:413});
      }
      const session=await auth.api.getSession({headers:request.headers});
      return route(request,env,session?.user?.id??null);
    } catch {
      return Response.json({error:'Premium service unavailable.'},{status:503,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
    }
  },
};
