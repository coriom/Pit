import { Pool } from 'pg';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export const hashToken=value=>createHash('sha256').update(value).digest('hex');
export const newAccess=()=>randomBytes(32).toString('base64url');
export const newId=()=>randomUUID();
export function safeTokenMatch(expected,provided){if(typeof provided!=='string'||provided.length>200)return false;const a=Buffer.from(expected,'hex'),b=Buffer.from(hashToken(provided),'hex');return a.length===b.length&&timingSafeEqual(a,b);}
export function createPool(url=process.env.PIT_DATABASE_URL){if(!url)throw new Error('DATABASE_NOT_CONFIGURED');return new Pool({connectionString:url,max:5,connectionTimeoutMillis:3000,idleTimeoutMillis:30000,allowExitOnIdle:true});}
export async function claimJob(pool){const db=await pool.connect();try{await db.query('BEGIN');const {rows}=await db.query(`SELECT * FROM pit_jobs WHERE (status='QUEUED' OR (status='RUNNING' AND lease_until<now())) AND expires_at>now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`);if(!rows[0]){await db.query('COMMIT');return null;}const job=rows[0],claimToken=randomUUID();await db.query(`UPDATE pit_jobs SET status='RUNNING',attempts=attempts+1,lease_until=now()+interval '2 minutes',claim_token=$2,updated_at=now() WHERE id=$1`,[job.id,claimToken]);await db.query('COMMIT');return {...job,claim_token:claimToken};}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
export async function expireData(pool){await pool.query(`DELETE FROM pit_jobs WHERE expires_at<now()`);await pool.query(`DELETE FROM pit_monitors WHERE expires_at<now()`);}
