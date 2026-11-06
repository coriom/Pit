import http from 'node:http';
import { createPool, hashToken, newAccess, newId, safeTokenMatch } from './db.mjs';
import { limits, validateJob } from './config.mjs';
import { monitorSchema } from './monitor.mjs';
import { clientFor, assertChain } from './rpc.mjs';
import { verifyEdgeRequest } from './edge-auth.mjs';

const prefix='/pit/api/v1';
const header={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
const send=(res,status,value,extra={})=>{res.writeHead(status,{...header,...extra});res.end(JSON.stringify(value));};
const bearer=req=>req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{32,200})$/)?.[1];
const csvCell=value=>{let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s=`'${s}`;return `"${s.replaceAll('"','""')}"`;};
function csvFor(kind,result){const rows=kind==='events'?result.events:kind==='distribution'?result.rows:kind==='nft'?result.rows:kind==='permissions'?result.history:[];if(!rows?.length)return '';
  const columns=kind==='events'?['chainId','contract','blockNumber','blockHash','transactionHash','logIndex','signature','decoded']:kind==='distribution'?['recipient','amount','observedAmount','transferCount','balanceEvidence','status']:kind==='nft'?['tokenId','status','uri','metadataHash','issues','media']:['event','blockNumber','transactionHash','args'];
  return [columns.join(','),...rows.map(row=>columns.map(key=>csvCell(typeof row[key]==='object'?JSON.stringify(row[key]):row[key])).join(','))].join('\n');}
async function rawBody(req){if(req.pitRawBody)return req.pitRawBody;let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limits.bodyBytes)throw new Error('BODY_LIMIT');chunks.push(chunk);}req.pitRawBody=Buffer.concat(chunks);return req.pitRawBody;}
async function body(req){try{return JSON.parse((await rawBody(req)).toString('utf8'));}catch{throw new Error('INVALID_JSON');}}
async function authorized(pool,table,id,token){if(!token)return null;const {rows}=await pool.query(`SELECT * FROM ${table} WHERE id=$1`,[id]);return rows[0]&&safeTokenMatch(rows[0].access_hash,token)?rows[0]:null;}
async function withInviteLock(pool,inviteHash,task){const db=await pool.connect();try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[inviteHash]);const result=await task(db);await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}
export function createApi(pool,{inviteHash=process.env.PIT_BACKEND_INVITE_SHA256,allowedOrigin=process.env.PIT_ALLOWED_ORIGIN,allowedEmails=process.env.PIT_EMAIL_ALLOWED_RECIPIENTS?.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)??[],edgeSecret=process.env.PIT_EDGE_HMAC_KEY,clientFactory=clientFor}={}){
  if(!/^[a-f0-9]{64}$/.test(inviteHash??''))throw new Error('INVITE_HASH_REQUIRED');
  if(!/^https:\/\/[^/]+$|^http:\/\/127\.0\.0\.1:\d+$/.test(allowedOrigin??''))throw new Error('ALLOWED_ORIGIN_REQUIRED');
  if(process.env.NODE_ENV==='production' && (!edgeSecret || edgeSecret.length<32))throw new Error('EDGE_AUTH_REQUIRED');
  if(edgeSecret && edgeSecret.length<32)throw new Error('EDGE_AUTH_WEAK');
  return http.createServer(async(req,res)=>{try{
    const url=new URL(req.url,'http://localhost');const path=url.pathname;
    const localHealth = ['/pit/api/v1/health','/pit/api/v1/ready'].includes(path) && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if(edgeSecret && !localHealth){
      if(!verifyEdgeRequest(req,await rawBody(req),edgeSecret))return send(res,403,{code:'EDGE_AUTH_REQUIRED'});
    }
    if(req.headers.origin && req.headers.origin!==allowedOrigin)return send(res,403,{code:'ORIGIN_DENIED'});
    if(req.method==='OPTIONS'){res.writeHead(204,{...header,'Access-Control-Allow-Origin':allowedOrigin??'','Access-Control-Allow-Methods':'GET,POST,DELETE','Access-Control-Allow-Headers':'Content-Type,Authorization,X-PIT-Invite,Idempotency-Key'});res.end();return;}
    if(req.headers.origin&&allowedOrigin)res.setHeader('Access-Control-Allow-Origin',allowedOrigin);
    if(path===`${prefix}/health`&&req.method==='GET')return send(res,200,{status:'UP'});
    if(path===`${prefix}/ready`&&req.method==='GET'){const {rows}=await pool.query(`SELECT last_seen>now()-interval '2 minutes' AS live FROM pit_worker_heartbeat WHERE singleton=true`);return send(res,rows[0]?.live?200:503,{status:rows[0]?.live?'READY':'WORKER_UNAVAILABLE'});}
    if(!path.startsWith(prefix))return send(res,404,{code:'NOT_FOUND'});
    const parts=path.slice(prefix.length).split('/').filter(Boolean);
    if(req.method==='POST'&&parts[0]==='jobs'&&parts.length===1){
      const invite=req.headers['x-pit-invite'];if(!safeTokenMatch(inviteHash,invite))return send(res,403,{code:'INVITE_REQUIRED'});
      const payload=await body(req),input=validateJob(payload.kind,payload.input);
      const idempotency=req.headers['idempotency-key'];if(typeof idempotency!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(idempotency))return send(res,400,{code:'IDEMPOTENCY_REQUIRED'});
      const created=await withInviteLock(pool,inviteHash,async db=>{
        if(idempotency){const {rows}=await db.query(`SELECT id FROM pit_jobs WHERE invite_hash=$1 AND idempotency_key=$2`,[inviteHash,idempotency]);if(rows.length)return {status:409,body:{code:'ALREADY_SUBMITTED',jobId:rows[0].id}};}
        const {rows:q}=await db.query(`SELECT count(*)::int AS n FROM pit_jobs WHERE invite_hash=$1 AND created_at>now()-interval '1 day'`,[inviteHash]);if(q[0].n>=limits.maxJobsPerDay)return {status:429,body:{code:'DAILY_QUOTA'}};
        const {rows:recent}=await db.query(`SELECT count(*)::int AS n FROM pit_jobs WHERE invite_hash=$1 AND created_at>now()-interval '1 minute'`,[inviteHash]);if(recent[0].n>=limits.maxJobsPerMinute)return {status:429,body:{code:'RATE_LIMIT'}};
        const token=newAccess(),id=newId();await db.query(`INSERT INTO pit_jobs(id,kind,access_hash,invite_hash,input_json,idempotency_key) VALUES($1,$2,$3,$4,$5,$6)`,[id,payload.kind,hashToken(token),inviteHash,JSON.stringify(input),idempotency??null]);return {status:202,body:{id,accessToken:token,status:'QUEUED'}};
      });return send(res,created.status,created.body);
    }
    if(parts[0]==='jobs'&&parts[1]&&parts.length<=3){const job=await authorized(pool,'pit_jobs',parts[1],bearer(req));if(!job)return send(res,404,{code:'NOT_FOUND'});
      if(req.method==='DELETE'&&parts.length===2){await pool.query('DELETE FROM pit_jobs WHERE id=$1',[job.id]);return send(res,200,{status:'DELETED'});}
      if(req.method==='POST'&&parts[2]==='cancel'){const {rowCount}=await pool.query(`UPDATE pit_jobs SET status='CANCELLED',lease_until=NULL WHERE id=$1 AND status IN ('QUEUED','RUNNING')`,[job.id]);return send(res,200,{status:rowCount?'CANCELLED':job.status});}
      if(req.method!=='GET')return send(res,405,{code:'METHOD_NOT_ALLOWED'});
      if(parts[2]==='export'){if(!['COMPLETED','PARTIAL'].includes(job.status))return send(res,409,{code:'RESULT_NOT_READY'});const format=url.searchParams.get('format');if(format!=='csv'&&format!=='json')return send(res,400,{code:'FORMAT_INVALID'});const content=format==='csv'?csvFor(job.kind,job.result_json):JSON.stringify(job.result_json);res.writeHead(200,{...header,'Content-Type':format==='csv'?'text/csv; charset=utf-8':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="pit-${job.kind}-${job.id}.${format}"`});res.end(content);return;}
      const offset=Math.max(0,Math.min(5000,Number(url.searchParams.get('offset')??0)||0)),limit=Math.max(1,Math.min(100,Number(url.searchParams.get('limit')??50)||50));let result=job.result_json;
      if(result?.events)result={...result,events:result.events.slice(offset,offset+limit),totalEvents:result.events.length};
      const {events:_checkpointEvents,...progress}=job.progress_json??{};
      return send(res,200,{id:job.id,kind:job.kind,status:job.status,progress,result,errorCode:job.error_code,expiresAt:job.expires_at});
    }
    if(parts[0]==='monitors'&&parts.length===1&&req.method==='POST'){
      const invite=req.headers['x-pit-invite'];if(!safeTokenMatch(inviteHash,invite))return send(res,403,{code:'INVITE_REQUIRED'});
      const idempotency=req.headers['idempotency-key'];if(typeof idempotency!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(idempotency))return send(res,400,{code:'IDEMPOTENCY_REQUIRED'});
      const input=monitorSchema.parse(await body(req));if(input.email&&!allowedEmails.includes(input.email.toLowerCase()))return send(res,403,{code:'EMAIL_NOT_ALLOWED'});
      const client=clientFactory(input.chain);await assertChain(client,input.chain);const head=await client.getBlockNumber();if(BigInt(input.startBlock)>head||head-BigInt(input.startBlock)>BigInt(limits.maxBlockSpan))return send(res,400,{code:'START_BLOCK_LIMIT'});
      const created=await withInviteLock(pool,inviteHash,async db=>{
        const {rows:existing}=await db.query(`SELECT id FROM pit_monitors WHERE invite_hash=$1 AND idempotency_key=$2`,[inviteHash,idempotency]);if(existing.length)return {status:409,body:{code:'ALREADY_SUBMITTED',monitorId:existing[0].id}};
        const {rows:count}=await db.query(`SELECT count(*)::int AS n FROM pit_monitors WHERE invite_hash=$1 AND expires_at>now()`,[inviteHash]);if(count[0].n>=limits.maxMonitorsPerOwner)return {status:429,body:{code:'MONITOR_QUOTA'}};
        const {rows:recent}=await db.query(`SELECT count(*)::int AS n FROM pit_monitors WHERE invite_hash=$1 AND created_at>now()-interval '1 minute'`,[inviteHash]);if(recent[0].n>=limits.maxMonitorsPerMinute)return {status:429,body:{code:'RATE_LIMIT'}};
        const token=newAccess(),id=newId();await db.query(`INSERT INTO pit_monitors(id,access_hash,invite_hash,chain,contract,rule_json,cursor_block,email,expires_at,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '72 hours',$9)`,[id,hashToken(token),inviteHash,input.chain,input.contract,JSON.stringify(input.rule),input.startBlock-1,input.email??null,idempotency]);return {status:202,body:{id,accessToken:token,status:'ACTIVE',expiresInHours:limits.monitorLifetimeHours}};
      });return send(res,created.status,created.body);
    }
    if(parts[0]==='monitors'&&parts[1]){const monitor=await authorized(pool,'pit_monitors',parts[1],bearer(req));if(!monitor)return send(res,404,{code:'NOT_FOUND'});
      if(req.method==='DELETE'){await pool.query('DELETE FROM pit_monitors WHERE id=$1',[monitor.id]);return send(res,200,{status:'DELETED'});}
      if(req.method==='POST'&&parts[2]==='pause'){await pool.query(`UPDATE pit_monitors SET status='PAUSED' WHERE id=$1`,[monitor.id]);return send(res,200,{status:'PAUSED'});}
      if(req.method==='POST'&&parts[2]==='resume'){await pool.query(`UPDATE pit_monitors SET status='ACTIVE',next_poll_at=now() WHERE id=$1 AND expires_at>now()`,[monitor.id]);return send(res,200,{status:'ACTIVE'});}
      if(req.method==='GET'&&parts[2]==='alerts'){const {rows}=await pool.query(`SELECT id,block_hash,block_number,transaction_hash,log_index,event_json,status,created_at FROM pit_alerts WHERE monitor_id=$1 ORDER BY created_at DESC LIMIT 100`,[monitor.id]);return send(res,200,{alerts:rows});}
      if(req.method==='GET'&&parts.length===2)return send(res,200,{id:monitor.id,chain:monitor.chain,contract:monitor.contract,rule:monitor.rule_json,cursorBlock:monitor.cursor_block,status:monitor.status,expiresAt:monitor.expires_at,emailEnabled:!!monitor.email});
    }
    return send(res,404,{code:'NOT_FOUND'});
  }catch(error){const raw=error?.issues?'VALIDATION_ERROR':String(error.message??'INTERNAL_ERROR');const clientError=/^(BODY_LIMIT|VALIDATION_ERROR|CSV_[A-Z_]+|TOKEN_[A-Z_]+|BLOCK_[A-Z_]+|INVALID_[A-Z_]+|UNSUPPORTED_[A-Z_]+|IDEMPOTENCY_REQUIRED|EMPTY_CSV|DUPLICATE_RECIPIENT)$/.test(raw);const code=clientError?raw:'INTERNAL_ERROR';const status=code==='BODY_LIMIT'?413:clientError?400:500;return send(res,status,{code});}});
}
if(import.meta.url===`file://${process.argv[1]}`){const pool=createPool(),server=createApi(pool);server.listen(Number(process.env.PIT_API_PORT||8789),'0.0.0.0');const stop=()=>server.close(()=>pool.end());process.on('SIGTERM',stop);process.on('SIGINT',stop);}
