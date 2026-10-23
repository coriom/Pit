import { portfolioBatchRisk, advancedTradingJournal } from '../premium/reports';
import { D1Billing, BillingError } from './db';
import { authConfigured, type PremiumEnv } from './auth';

const operations = Object.freeze({
  'portfolio-batch-risk': portfolioBatchRisk,
  'trading-journal-advanced': advancedTradingJournal,
});
const MAX_INPUT = 65536, MAX_OUTPUT = 262144;
const headers = { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex, nofollow', 'Referrer-Policy':'no-referrer', 'Cross-Origin-Resource-Policy':'same-origin', 'Content-Security-Policy':"default-src 'none'; connect-src 'none'; frame-ancestors 'none'" };
const respond = (value:unknown,status=200) => Response.json(value,{status,headers});
const errorResponse = (status:number,message:string) => respond({error:message},status);
const allowedOrigin = (request:Request, env:PremiumEnv) => {
  const origin = request.headers.get('Origin');
  const site = request.headers.get('Sec-Fetch-Site');
  return !!env.PUBLIC_ORIGIN && new URL(request.url).origin===env.PUBLIC_ORIGIN && (!origin || origin===env.PUBLIC_ORIGIN) && (!site || site==='same-origin' || site==='none');
};
async function boundedJson(request:Request) {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') throw new BillingError(415,'JSON required.');
  const reader=request.body?.getReader(); if (!reader) throw new BillingError(400,'Request body required.');
  const chunks:Uint8Array[]=[]; let bytes=0;
  while (true) {
    const part=await reader.read(); if (part.done) break;
    bytes+=part.value.byteLength;
    if (bytes>MAX_INPUT) { await reader.cancel(); throw new BillingError(413,'Report input exceeds 64 KiB.'); }
    chunks.push(part.value);
  }
  const joined=new Uint8Array(bytes); let cursor=0;
  for (const chunk of chunks) { joined.set(chunk,cursor); cursor+=chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined)) as unknown; }
  catch { throw new BillingError(400,'Malformed JSON.'); }
}
const digest = async (value:string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');

// Only the production entrypoint may supply a user ID, after Better Auth getSession.
// Local tests use a separate, never-deployed entrypoint; no request field selects identity here.
export type RouteProfile = (stage:string, elapsedMs:number) => void;
export async function route(request:Request, env:PremiumEnv, verifiedUserId:string|null, profile?:RouteProfile):Promise<Response> {
  let started=profile ? performance.now() : 0;
  const stage=(name:string)=>{if(profile){const now=performance.now();profile(name,now-started);started=now;}};
  try {
    const path=new URL(request.url).pathname;
    if (!allowedOrigin(request,env)) return errorResponse(403,'Origin denied.');
    const db=new D1Billing(env.DB);
    if (path==='/health' && request.method==='GET') {
      let schema=false; try { schema=await db.schemaReady(); } catch { /* no database detail disclosed */ }
      return respond({service:'pit-premium',schemaReady:schema,authConfigured:authConfigured(env),reportsEnabled:env.PREMIUM_REPORTS_ENABLED==='true'});
    }
    if (!verifiedUserId) return errorResponse(401,'Verified session required.');
    if (!/^[A-Za-z0-9:_-]{1,96}$/.test(verifiedUserId)) return errorResponse(401,'Verified session required.');
    if (path==='/v1/account' && request.method==='GET') return respond(await db.account(verifiedUserId,new Date().toISOString()));
    if (path==='/v1/ledger' && request.method==='GET') return respond({entries:await db.history(verifiedUserId)});
    const match=/^\/v1\/reports\/(portfolio-batch-risk|trading-journal-advanced)$/.exec(path);
    if (!match || request.method!=='POST') return errorResponse(404,'Route unavailable.');
    if (request.headers.get('Origin')!==env.PUBLIC_ORIGIN) return errorResponse(403,'Origin required.');
    if (env.PREMIUM_REPORTS_ENABLED!=='true') return errorResponse(503,'Premium reports disabled.');
    await db.ensureAccount(verifiedUserId);
    stage('d1-ensure-account');
    await db.limitReport(verifiedUserId,Date.now());
    stage('d1-rate-limit');
    const payload=await boundedJson(request);
    if (!payload || typeof payload!=='object' || Array.isArray(payload)) throw new BillingError(400,'Report request must be an object.');
    const record=payload as Record<string,unknown>;
    if (Object.keys(record).some(x=>!['requestId','input'].includes(x)) || typeof record.requestId!=='string' || !/^[A-Za-z0-9_-]{1,80}$/.test(record.requestId)) throw new BillingError(400,'Invalid report request.');
    stage('request-read-parse-validation');
    const operationId=match[1] as keyof typeof operations;
    const input=record.input;
    const inputDigest=await digest(JSON.stringify([operationId,input]));
    stage('input-digest');
    let bundle;
    try { bundle=operations[operationId](input); }
    catch { throw new BillingError(400,'Report input is invalid or unsupported.'); }
    stage('report-calculation-csv');
    const serialized=JSON.stringify(bundle);
    if (new TextEncoder().encode(serialized).byteLength>MAX_OUTPUT) throw new BillingError(413,'Report output exceeds 256 KiB.');
    stage('report-json-output');
    const receipt=await db.debitReport(verifiedUserId,operationId,record.requestId,inputDigest,10,new Date().toISOString());
    stage('d1-atomic-debit');
    const entitlement=await db.account(verifiedUserId,new Date().toISOString());
    stage('d1-entitlement-read');
    // The bounded bundle was just serialized successfully; avoid parsing it again.
    const response=respond({...bundle,receipt,entitlement});
    stage('response-json-output');
    return response;
  } catch (error) {
    if (error instanceof BillingError) return errorResponse(error.status,error.message);
    return errorResponse(503,'Premium service unavailable.');
  }
}
