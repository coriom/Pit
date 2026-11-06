import { randomUUID } from 'node:crypto';
import { keccak256, stringToHex } from 'viem';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { address, limits, rpcFor } from './config.mjs';
import { clientFor, assertChain } from './rpc.mjs';
import { scanEvents } from './events.mjs';

const sig=s=>keccak256(stringToHex(s)).toLowerCase();
const topics={Transfer:sig('Transfer(address,address,uint256)'),OwnershipTransferred:sig('OwnershipTransferred(address,address)'),RoleGranted:sig('RoleGranted(bytes32,address,address)'),RoleRevoked:sig('RoleRevoked(bytes32,address,address)'),Paused:sig('Paused(address)'),Unpaused:sig('Unpaused(address)'),Upgraded:sig('Upgraded(address)')};
export const monitorSchema=z.object({chain:z.enum(['ethereum','base','base-sepolia']),contract:address,startBlock:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),rule:z.discriminatedUnion('type',[
  z.object({type:z.literal('transfer-threshold'),minimum:z.string().regex(/^\d{1,78}$/)}).strict(),
  z.object({type:z.literal('mint')}).strict(),z.object({type:z.literal('burn')}).strict(),
  z.object({type:z.literal('ownership')}).strict(),z.object({type:z.literal('roles')}).strict(),
  z.object({type:z.literal('pause')}).strict(),z.object({type:z.literal('proxy-upgrade')}).strict()]),email:z.string().email().max(254).optional()}).strict();
const topicAddress=t=>`0x${t.slice(-40)}`.toLowerCase();
export function matchesRule(log,rule){const t=log.signature?.toLowerCase();
  if(rule.type==='transfer-threshold'||rule.type==='mint'||rule.type==='burn'){
    if(t!==topics.Transfer||log.topics.length<3||!/^0x[0-9a-fA-F]{64}$/.test(log.data))return false;
    const from=topicAddress(log.topics[1]),to=topicAddress(log.topics[2]),zero=`0x${'0'.repeat(40)}`;
    return rule.type==='mint'?from===zero:rule.type==='burn'?to===zero:BigInt(log.data)>=BigInt(rule.minimum);
  }
  return rule.type==='ownership'?t===topics.OwnershipTransferred:rule.type==='roles'?[topics.RoleGranted,topics.RoleRevoked].includes(t):rule.type==='pause'?[topics.Paused,topics.Unpaused].includes(t):rule.type==='proxy-upgrade'?t===topics.Upgraded:false;
}
export async function pollMonitor(pool,monitor,{client=clientFor(monitor.chain)}={}){
  await assertChain(client,monitor.chain);
  const head=await client.getBlockNumber(),safe=head>BigInt(limits.confirmedDepth)?head-BigInt(limits.confirmedDepth):0n;
  let cursor=BigInt(monitor.cursor_block);
  if(monitor.cursor_hash&&cursor>0n){const canonical=await client.getBlock({blockNumber:cursor});if(canonical.hash.toLowerCase()!==monitor.cursor_hash.toLowerCase()){
    cursor=cursor>BigInt(limits.confirmedDepth)?cursor-BigInt(limits.confirmedDepth):0n;
    const {rowCount}=await pool.query(`UPDATE pit_monitors SET lease_until=now()+interval '2 minutes' WHERE id=$1 AND lease_token=$2 AND status='ACTIVE'`,[monitor.id,monitor.lease_token]);if(!rowCount)throw new Error('STALE_LEASE');
    await pool.query(`UPDATE pit_alerts SET status='REORGANIZED' WHERE monitor_id=$1 AND block_number>$2`,[monitor.id,cursor.toString()]);
  }}
  if(safe<=cursor)return {status:'WAITING',cursor:Number(cursor)};
  const end=cursor+500n<safe?cursor+500n:safe;
  const result=await scanEvents({chain:monitor.chain,contract:monitor.contract,fromBlock:Number(cursor+1n),toBlock:Number(end)},{client});
  if(result.status!=='COMPLETE')return {status:'PARTIAL',missing:result.missing,cursor:Number(cursor)};
  const matched=result.events.filter(e=>matchesRule(e,monitor.rule_json));
  if(matched.length>limits.maxAlertsPerPoll){await pool.query(`UPDATE pit_monitors SET status='PAUSED',lease_until=NULL WHERE id=$1 AND lease_token=$2`,[monitor.id,monitor.lease_token]);return {status:'PAUSED',reason:'ALERT_LIMIT',cursor:Number(cursor)};}
  const block=await client.getBlock({blockNumber:end});const db=await pool.connect();
  try{await db.query('BEGIN');
    for(const event of matched){const id=randomUUID();const {rows}=await db.query(`INSERT INTO pit_alerts(id,monitor_id,chain_id,block_hash,block_number,transaction_hash,log_index,event_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id`,[id,monitor.id,rpcFor(monitor.chain).id,event.blockHash,event.blockNumber,event.transactionHash,event.logIndex,JSON.stringify(event)]);
      if(rows.length&&monitor.email){const {rows:sent}=await db.query(`SELECT count(*)::int AS n FROM pit_deliveries d JOIN pit_alerts a ON a.id=d.alert_id WHERE a.monitor_id=$1 AND d.next_attempt_at>now()-interval '1 day'`,[monitor.id]);if(sent[0].n<50)await db.query(`INSERT INTO pit_deliveries(id,alert_id,email) VALUES($1,$2,$3)`,[randomUUID(),rows[0].id,monitor.email]);}
    }
    const updated=await db.query(`UPDATE pit_monitors SET cursor_block=$2,cursor_hash=$3,next_poll_at=now()+interval '30 seconds',lease_until=NULL WHERE id=$1 AND lease_token=$4 AND cursor_block=$5 AND status='ACTIVE'`,[monitor.id,end.toString(),block.hash,monitor.lease_token,monitor.cursor_block]);if(!updated.rowCount)throw new Error('STALE_LEASE');await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  return {status:'COMPLETE',cursor:Number(end),newAlerts:matched.length};
}
export async function claimMonitor(pool){const db=await pool.connect();try{await db.query('BEGIN');const {rows}=await db.query(`SELECT * FROM pit_monitors WHERE status='ACTIVE' AND next_poll_at<=now() AND expires_at>now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_poll_at FOR UPDATE SKIP LOCKED LIMIT 1`);if(!rows[0]){await db.query('COMMIT');return null;}const leaseToken=randomUUID();await db.query(`UPDATE pit_monitors SET lease_until=now()+interval '2 minutes',lease_token=$2 WHERE id=$1`,[rows[0].id,leaseToken]);await db.query('COMMIT');return {...rows[0],lease_token:leaseToken};}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
export async function sendQueuedDelivery(pool,env=process.env){if(!env.PIT_SMTP_HOST||!env.PIT_SMTP_FROM)return 'DISABLED';
  const {rows}=await pool.query(`SELECT d.id,d.email,d.attempts,a.monitor_id,a.transaction_hash FROM pit_deliveries d JOIN pit_alerts a ON a.id=d.alert_id WHERE d.status='QUEUED' AND d.next_attempt_at<=now() AND a.status='CONFIRMED' ORDER BY d.next_attempt_at LIMIT 1`);const d=rows[0];if(!d)return 'EMPTY';
  const transport=nodemailer.createTransport({host:env.PIT_SMTP_HOST,port:Number(env.PIT_SMTP_PORT||1025),secure:env.PIT_SMTP_SECURE==='1',auth:env.PIT_SMTP_USER?{user:env.PIT_SMTP_USER,pass:env.PIT_SMTP_PASSWORD}:undefined,connectionTimeout:5000,socketTimeout:5000});
  try{await transport.sendMail({from:env.PIT_SMTP_FROM,to:d.email,subject:'PIT Crypto contract alert',text:`Monitor ${d.monitor_id} observed confirmed transaction ${d.transaction_hash}. Review your PIT Crypto inbox.`});await pool.query(`UPDATE pit_deliveries SET status='SENT',sent_at=now(),attempts=attempts+1 WHERE id=$1`,[d.id]);return 'SENT';}
  catch{await pool.query(`UPDATE pit_deliveries SET attempts=attempts+1,status=CASE WHEN attempts>=2 THEN 'FAILED' ELSE 'QUEUED' END,next_attempt_at=now()+interval '5 minutes' WHERE id=$1`,[d.id]);return 'RETRY';}
}
