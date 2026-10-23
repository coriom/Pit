import type { D1Database } from '@cloudflare/workers-types';

export class BillingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const validId = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,96}$/.test(value);
const validDigest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validInstant = (value: unknown): value is string => typeof value==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString()===value;
const requireId = (value: unknown, name: string): string => {
  if (!validId(value)) throw new BillingError(400, `Invalid ${name}.`);
  return value as string;
};
const fail = (status: number, message: string): never => { throw new BillingError(status, message); };

export class D1Billing {
  constructor(private db: D1Database) {}
  async schemaReady() {
    const row = await this.db.prepare('SELECT version FROM billing_schema_version WHERE version=1').first<{version:number}>();
    return row?.version === 1;
  }
  async ensureAccount(userId: string) {
    requireId(userId, 'user ID');
    const result = await this.db.prepare('INSERT OR IGNORE INTO billing_wallets(user_id) SELECT id FROM user WHERE id=?').bind(userId).run();
    if (!result.success) fail(503, 'Account unavailable.');
    const found = await this.db.prepare('SELECT 1 AS present FROM billing_wallets WHERE user_id=?').bind(userId).first();
    if (!found) fail(401, 'Verified account required.');
    await this.db.prepare("INSERT OR IGNORE INTO billing_subscriptions(user_id,status,updated_at) VALUES (?,'inactive','1970-01-01T00:00:00.000Z')").bind(userId).run();
  }
  async account(userId: string, now: string) {
    await this.ensureAccount(userId);
    const row = await this.db.prepare('SELECT w.credits,w.frozen,w.unrecovered,s.status,s.period_end FROM billing_wallets w JOIN billing_subscriptions s ON s.user_id=w.user_id WHERE w.user_id=?').bind(userId).first<{credits:number;frozen:number;unrecovered:number;status:string;period_end:string|null}>();
    if (!row) throw new BillingError(503, 'Account unavailable.');
    const active = (row.status === 'active' || row.status === 'canceling') && !!row.period_end && row.period_end > now;
    return { userId, plan: active ? 'pro' : 'free', credits: row.credits, frozen: !!row.frozen, unrecovered: row.unrecovered, subscription: { status: (row.status === 'active' || row.status === 'canceling') && !active ? 'expired' : row.status, periodEnd: row.period_end } };
  }
  async history(userId: string) {
    await this.ensureAccount(userId);
    const rows = await this.db.prepare('SELECT delta,kind,source,created_at FROM billing_ledger WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100').bind(userId).all();
    if (!rows.success) fail(503, 'History unavailable.');
    return rows.results;
  }
  async limitReport(userId: string, now: number) {
    const window = Math.floor(now / 60000) * 60000;
    const result = await this.db.prepare('INSERT INTO billing_rate_limits(user_id,window_start,requests) VALUES (?,?,1) ON CONFLICT(user_id,window_start) DO UPDATE SET requests=requests+1 WHERE requests<10').bind(userId,window).run();
    if (result.meta.changes !== 1) fail(429, 'Local report request limit reached.');
  }
  async receipt(userId: string, requestId: string) {
    return this.db.prepare('SELECT operation_id,input_digest,credits FROM billing_report_receipts WHERE user_id=? AND request_id=?').bind(userId,requestId).first<{operation_id:string;input_digest:string;credits:number}>();
  }
  async debitReport(userId: string, operationId: string, requestId: string, digest: string, amount: number, now: string) {
    requireId(userId,'user ID'); requireId(operationId,'operation ID'); requireId(requestId,'request ID');
    if (!validDigest(digest) || !Number.isSafeInteger(amount) || amount <= 0) fail(400,'Invalid debit.');
    const prior = await this.receipt(userId,requestId);
    if (prior) {
      if (prior.operation_id !== operationId || prior.input_digest !== digest) fail(409,'Request identity collision.');
      const account = await this.account(userId,now);
      if (account.frozen || account.unrecovered) fail(403,'Account frozen.');
      return { charged:false, credits:prior.credits };
    }
    try {
      // D1 batch is one transaction. changes() observes the immediately preceding UPDATE.
      // A failed CHECK or UNIQUE rolls back the balance update and every following write.
      await this.db.batch([
        this.db.prepare('UPDATE billing_wallets SET credits=credits-? WHERE user_id=? AND credits>=? AND frozen=0 AND unrecovered=0').bind(amount,userId,amount),
        this.db.prepare('INSERT INTO billing_report_receipts(user_id,request_id,operation_id,input_digest,credits,debited,created_at) VALUES (?,?,?,?,?,changes(),?)').bind(userId,requestId,operationId,digest,amount,now),
        this.db.prepare("INSERT INTO billing_ledger(id,user_id,delta,kind,source,created_at) VALUES (?,?,?,'premium-report',?,?)").bind(`report:${userId}:${requestId}`,userId,-amount,`report:${userId}:${requestId}`,now),
      ]);
      return { charged:true, credits:amount };
    } catch {
      const race = await this.receipt(userId,requestId);
      if (race) {
        if (race.operation_id !== operationId || race.input_digest !== digest) fail(409,'Request identity collision.');
        return { charged:false, credits:race.credits };
      }
      const account = await this.account(userId,now);
      if (account.frozen || account.unrecovered) fail(403,'Account frozen.');
      if (account.credits < amount) fail(402,'Insufficient credits.');
      fail(503,'Debit unavailable.');
    }
  }
  // Called only after an independently verified provider event. There is deliberately no HTTP grant endpoint.
  async applyVerifiedCredit(event: {provider:string;eventId:string;digest:string;userId:string;credits:number;kind:'pack-paid'|'pro-paid';periodEnd?:string}, now:string) {
    const {provider,eventId,digest,userId,credits,kind,periodEnd}=event;
    requireId(provider,'provider'); requireId(eventId,'event ID'); requireId(userId,'user ID');
    if (!validDigest(digest) || !validInstant(now) || !Number.isSafeInteger(credits) || credits<=0 || credits>1_000_000_000 || (kind!=='pack-paid' && kind!=='pro-paid') || (kind==='pro-paid' && (!validInstant(periodEnd) || periodEnd<=now))) fail(400,'Invalid verified credit event.');
    const prior = await this.db.prepare('SELECT event_digest,kind FROM billing_verified_events WHERE provider=? AND event_id=?').bind(provider,eventId).first<{event_digest:string;kind:string}>();
    if (prior) { if (prior.event_digest!==digest) fail(409,'Payment event collision.'); return { duplicate:true,blocked:prior.kind==='pre-reversed' }; }
    await this.ensureAccount(userId);
    try {
      const items = [
        this.db.prepare("INSERT INTO billing_verified_events(provider,event_id,event_digest,user_id,kind,credits,recovered,created_at) SELECT ?,?,?,?,CASE WHEN EXISTS(SELECT 1 FROM billing_pending_reversals WHERE provider=? AND reference_event_id=?) THEN 'pre-reversed' ELSE ? END,?,CASE WHEN EXISTS(SELECT 1 FROM billing_pending_reversals WHERE provider=? AND reference_event_id=?) THEN 0 ELSE MIN(unrecovered,?) END,? FROM billing_wallets WHERE user_id=?").bind(provider,eventId,digest,userId,provider,eventId,kind,credits,provider,eventId,credits,now,userId),
        this.db.prepare("UPDATE billing_wallets SET credits=credits+?-(SELECT recovered FROM billing_verified_events WHERE provider=? AND event_id=?),unrecovered=unrecovered-(SELECT recovered FROM billing_verified_events WHERE provider=? AND event_id=?) WHERE user_id=? AND EXISTS (SELECT 1 FROM billing_verified_events WHERE provider=? AND event_id=? AND kind IN ('pack-paid','pro-paid'))").bind(credits,provider,eventId,provider,eventId,userId,provider,eventId),
        this.db.prepare("INSERT INTO billing_ledger(id,user_id,delta,kind,source,created_at) SELECT ?,?,?,'purchase',?,? FROM billing_verified_events WHERE provider=? AND event_id=? AND kind IN ('pack-paid','pro-paid')").bind(`paid:${provider}:${eventId}`,userId,credits,`paid:${provider}:${eventId}`,now,provider,eventId),
        this.db.prepare("INSERT INTO billing_ledger(id,user_id,delta,kind,source,created_at) SELECT ?,?,-recovered,'liability-recovery',?,? FROM billing_verified_events WHERE provider=? AND event_id=? AND recovered>0 AND kind IN ('pack-paid','pro-paid')").bind(`recovery:${provider}:${eventId}`,userId,`recovery:${provider}:${eventId}`,now,provider,eventId),
      ];
      if (kind==='pro-paid') items.push(this.db.prepare("UPDATE billing_subscriptions SET status='active',period_end=?,updated_at=? WHERE user_id=? AND updated_at<=? AND EXISTS (SELECT 1 FROM billing_verified_events WHERE provider=? AND event_id=? AND kind='pro-paid')").bind(periodEnd!,now,userId,now,provider,eventId));
      await this.db.batch(items);
      const applied=await this.db.prepare('SELECT kind FROM billing_verified_events WHERE provider=? AND event_id=?').bind(provider,eventId).first<{kind:string}>();
      return { duplicate:false,blocked:applied?.kind==='pre-reversed' };
    } catch {
      const race = await this.db.prepare('SELECT event_digest,kind FROM billing_verified_events WHERE provider=? AND event_id=?').bind(provider,eventId).first<{event_digest:string;kind:string}>();
      if (race?.event_digest===digest) return {duplicate:true,blocked:race.kind==='pre-reversed'};
      fail(503,'Verified credit unavailable.');
    }
  }
  async reverseVerifiedCredit(event:{provider:string;eventId:string;digest:string;referenceEventId:string;userId:string},now:string) {
    const {provider,eventId,digest,referenceEventId,userId}=event;
    requireId(provider,'provider'); requireId(eventId,'event ID'); requireId(referenceEventId,'reference'); requireId(userId,'user ID');
    if (!validDigest(digest) || !validInstant(now) || eventId===referenceEventId) fail(400,'Invalid reversal.');
    await this.ensureAccount(userId);
    const associated=await this.db.prepare('SELECT user_id FROM billing_verified_events WHERE provider=? AND event_id=?').bind(provider,referenceEventId).first<{user_id:string}>();
    if (associated && associated.user_id!==userId) fail(409,'Payment account collision.');
    const pendingBefore=await this.db.prepare('SELECT event_id,event_digest,user_id FROM billing_pending_reversals WHERE provider=? AND reference_event_id=?').bind(provider,referenceEventId).first<{event_id:string;event_digest:string;user_id:string}>();
    if (pendingBefore && (pendingBefore.event_id!==eventId || pendingBefore.event_digest!==digest || pendingBefore.user_id!==userId)) fail(409,'Reversal collision.');
    await this.db.prepare('INSERT OR IGNORE INTO billing_pending_reversals(provider,reference_event_id,event_id,event_digest,user_id,created_at) VALUES (?,?,?,?,?,?)').bind(provider,referenceEventId,eventId,digest,userId,now).run();
    const pending=await this.db.prepare('SELECT event_id,event_digest,user_id FROM billing_pending_reversals WHERE provider=? AND reference_event_id=?').bind(provider,referenceEventId).first<{event_id:string;event_digest:string;user_id:string}>();
    if (!pending || pending.event_id!==eventId || pending.event_digest!==digest || pending.user_id!==userId) fail(409,'Reversal collision.');
    const paid = await this.db.prepare("SELECT credits,kind FROM billing_verified_events WHERE provider=? AND event_id=? AND user_id=? AND kind IN ('pack-paid','pro-paid')").bind(provider,referenceEventId,userId).first<{credits:number;kind:string}>();
    if (!paid) return {duplicate:!!pendingBefore,pending:true};
    const prior = await this.db.prepare('SELECT event_digest FROM billing_verified_events WHERE provider=? AND event_id=?').bind(provider,eventId).first<{event_digest:string}>();
    if (prior) { if (prior.event_digest!==digest) fail(409,'Payment event collision.'); return {duplicate:true}; }
    try {
      await this.db.batch([
        this.db.prepare("INSERT INTO billing_verified_events(provider,event_id,event_digest,user_id,kind,credits,reference_event_id,recovered,deficit,created_at) SELECT ?,?, ?,?, 'refund', ?, ?, MIN(credits,?),MAX(?-credits,0),? FROM billing_wallets WHERE user_id=?").bind(provider,eventId,digest,userId,paid.credits,referenceEventId,paid.credits,paid.credits,now,userId),
        this.db.prepare('UPDATE billing_wallets SET credits=credits-(SELECT recovered FROM billing_verified_events WHERE provider=? AND event_id=?),unrecovered=unrecovered+(SELECT deficit FROM billing_verified_events WHERE provider=? AND event_id=?),frozen=1 WHERE user_id=?').bind(provider,eventId,provider,eventId,userId),
        this.db.prepare("INSERT INTO billing_ledger(id,user_id,delta,kind,source,created_at) SELECT ?,?,-recovered,'refund',?,? FROM billing_verified_events WHERE provider=? AND event_id=? AND recovered>0").bind(`refund:${provider}:${eventId}`,userId,`refund:${provider}:${eventId}`,now,provider,eventId),
        this.db.prepare("UPDATE billing_subscriptions SET status='canceled',updated_at=? WHERE user_id=? AND updated_at<=? AND ?='pro-paid'").bind(now,userId,now,paid.kind),
      ]);
      return {duplicate:false};
    } catch {
      const race=await this.db.prepare('SELECT event_digest FROM billing_verified_events WHERE provider=? AND event_id=?').bind(provider,eventId).first<{event_digest:string}>();
      if (race?.event_digest===digest) return {duplicate:true};
      fail(503,'Reversal unavailable.');
    }
  }
  // A signed provider adapter may call this after verifying the subscription event.
  // The event's occurredAt controls ordering; a delayed older event cannot replace a newer state.
  async applyVerifiedSubscriptionEvent(event:{provider:string;eventId:string;digest:string;userId:string;kind:'pro-cancel-requested'|'pro-renewal-failed';occurredAt:string}) {
    const {provider,eventId,digest,userId,kind,occurredAt}=event;
    requireId(provider,'provider'); requireId(eventId,'event ID'); requireId(userId,'user ID');
    if (!validDigest(digest) || !validInstant(occurredAt) || (kind!=='pro-cancel-requested' && kind!=='pro-renewal-failed')) fail(400,'Invalid subscription event.');
    await this.ensureAccount(userId);
    const prior=await this.db.prepare('SELECT event_digest,user_id FROM billing_verified_events WHERE provider=? AND event_id=?').bind(provider,eventId).first<{event_digest:string;user_id:string}>();
    if (prior) {
      if (prior.event_digest!==digest || prior.user_id!==userId) fail(409,'Subscription event collision.');
      return {duplicate:true,applied:false};
    }
    try {
      const result=await this.db.batch([
        this.db.prepare('INSERT INTO billing_verified_events(provider,event_id,event_digest,user_id,kind,credits,created_at) VALUES (?,?,?,?,?,0,?)').bind(provider,eventId,digest,userId,kind,occurredAt),
        this.db.prepare("UPDATE billing_subscriptions SET status=?,updated_at=? WHERE user_id=? AND updated_at<=? AND ((?='pro-cancel-requested' AND status IN ('active','canceling')) OR (?='pro-renewal-failed' AND status IN ('active','canceling','past_due')))").bind(kind==='pro-cancel-requested'?'canceling':'past_due',occurredAt,userId,occurredAt,kind,kind),
      ]);
      return {duplicate:false,applied:result[1]?.meta.changes===1};
    } catch {
      const race=await this.db.prepare('SELECT event_digest,user_id FROM billing_verified_events WHERE provider=? AND event_id=?').bind(provider,eventId).first<{event_digest:string;user_id:string}>();
      if (race?.event_digest===digest && race.user_id===userId) return {duplicate:true,applied:false};
      fail(503,'Subscription event unavailable.');
    }
  }
}
