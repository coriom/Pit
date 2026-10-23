// This file is bundled only into dist-premium-worker-test/ and must never be deployed.
import { route } from './router';
import { authRequestAllowed, createAuth, type PremiumEnv } from './auth';
import { D1Billing, BillingError } from './db';
import { portfolioBatchRisk, advancedTradingJournal } from '../premium/reports';
import { boundedAuthRequest } from './worker';
export default { async fetch(request:Request,env:PremiumEnv) {
  if (new URL(request.url).pathname.startsWith('/api/auth/')) {
    if (!authRequestAllowed(request,env)) return Response.json({error:'Origin denied.'},{status:403});
    const bounded=await boundedAuthRequest(request);
    return bounded ? createAuth(env).handler(bounded) : Response.json({error:'Authentication request exceeds 16 KiB.'},{status:413});
  }
  if (new URL(request.url).pathname==='/__test/payment') return (async () => {
    try {
      const body=await request.json() as {action:'paid'|'refund'|'subscription';event:Record<string,unknown>;now:string};
      const store=new D1Billing(env.DB);
      return Response.json(body.action==='paid' ? await store.applyVerifiedCredit(body.event as never,body.now) : body.action==='refund' ? await store.reverseVerifiedCredit(body.event as never,body.now) : await store.applyVerifiedSubscriptionEvent(body.event as never));
    } catch(error) {return Response.json({error:error instanceof BillingError?error.message:'Test payment failed.'},{status:error instanceof BillingError?error.status:503});}
  })();
  if (new URL(request.url).pathname==='/__test/sql') return (async () => {
    const body=await request.json() as {sql:string;bindings?:unknown[];mode?:'run'|'all'|'first'|'exec'};
    if (body.mode==='exec') return Response.json(await env.DB.exec(body.sql));
    const query=env.DB.prepare(body.sql).bind(...(body.bindings??[]));
    return Response.json(body.mode==='all' ? await query.all() : body.mode==='first' ? await query.first() : await query.run());
  })();
  if (new URL(request.url).pathname==='/__test/engine-timing') {
    const body=await request.json() as {operation:'portfolio-batch-risk'|'trading-journal-advanced';input:unknown};
    const runner=body.operation==='portfolio-batch-risk' ? portfolioBatchRisk : advancedTradingJournal;
    const start=performance.now();
    const stages:{stage:string;elapsedMs:number}[]=[];
    const result=runner(body.input,(stage,elapsedMs)=>stages.push({stage,elapsedMs}));
    const synchronousMs=performance.now()-start;
    const outputStart=performance.now();
    const responseBytes=new TextEncoder().encode(JSON.stringify(result)).byteLength;
    return Response.json({synchronousMs,responseBytes,jsonOutputMs:performance.now()-outputStart,stages});
  }
  if (new URL(request.url).pathname==='/__test/request-timing') {
    const body=await request.json() as {operation:'portfolio-batch-risk'|'trading-journal-advanced';input:unknown;requestId:string};
    const stages:{stage:string;elapsedMs:number}[]=[];
    const profileRequest=new Request(`${env.PUBLIC_ORIGIN}/v1/reports/${body.operation}`,{method:'POST',headers:{Origin:env.PUBLIC_ORIGIN ?? '', 'Content-Type':'application/json'},body:JSON.stringify({requestId:body.requestId,input:body.input})});
    const started=performance.now();
    const result=await route(profileRequest,env,request.headers.get('X-Local-Test-Identity'),(stage,elapsedMs)=>stages.push({stage,elapsedMs}));
    return Response.json({status:result.status,requestWallMs:performance.now()-started,stages,body:await result.json()});
  }
  if (new URL(request.url).pathname==='/__test/auth-session-timing') {
    const started=performance.now();
    const auth=createAuth(env);
    const creationWallMs=performance.now()-started;
    const sessionStarted=performance.now();
    const session=await auth.api.getSession({headers:request.headers});
    return Response.json({authenticated:!!session?.user?.id,creationWallMs,sessionWallMs:performance.now()-sessionStarted});
  }
  const testId=request.headers.get('X-Local-Test-Identity');
  const start=performance.now();
  const response=await route(request,env,testId);
  response.headers.set('X-Local-Worker-Wall-Ms',String(performance.now()-start));
  return response;
} };
