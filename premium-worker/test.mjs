import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { createSiweMessage } from 'viem/siwe';
import { privateKeyToAccount } from 'viem/accounts';
import { portfolioExample, journalExample } from '../premium/examples.mjs';

const origin='https://premium.example.test', now='2026-10-23T00:00:00.000Z';
const settings={modules:true,compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'12345678-1234-1234-1234-123456789012'},bindings:{PUBLIC_ORIGIN:origin,PREMIUM_REPORTS_ENABLED:'true',BETTER_AUTH_SECRET:'0123456789abcdef0123456789abcdef0123456789abcdef'}};
const wallet1=privateKeyToAccount(`0x${'11'.repeat(32)}`),wallet2=privateKeyToAccount(`0x${'22'.repeat(32)}`);
async function walletLogin(mf,wallet=wallet1,overrides={}) {
  const nonceResponse=await mf.dispatchFetch(`${origin}/api/auth/siwe/nonce`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.10'},body:'{}'});
  assert.equal(nonceResponse.status,200,await nonceResponse.clone().text());
  const nonce=(await nonceResponse.json()).nonce;
  const message=createSiweMessage({domain:overrides.domain??new URL(origin).host,address:wallet.address,uri:overrides.uri??`${origin}/`,version:'1',chainId:overrides.chainId??8453,nonce,issuedAt:overrides.issuedAt??new Date(),expirationTime:overrides.expirationTime??new Date(Date.now()+240000)});
  const signature=await wallet.signMessage({message});
  const verify=()=>mf.dispatchFetch(`${origin}/api/auth/siwe/verify`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.10'},body:JSON.stringify({message,signature})});
  const response=await verify();
  return {response,nonce,message,signature,verify,cookie:response.headers.getSetCookie().find(x=>x.startsWith('__Secure-better-auth.session_token='))?.split(';')[0]};
}
async function fixture(bindings={}) {
  const mf=new Miniflare({...settings,bindings:{...settings.bindings,...bindings},scriptPath:'dist-premium-worker-test/worker.mjs'});
  const call=async(path,body,headers={}) => {
    const response=await mf.dispatchFetch(`${origin}${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:origin,...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const text=await response.text(); let data; try { data=JSON.parse(text); } catch { data={raw:text}; }
    return {status:response.status,data};
  };
  for(const name of ['0000_auth.sql','0001_billing.sql','0002_wallet_siwe.sql']) {
    const sql=readFileSync(new URL(`./migrations/${name}`,import.meta.url),'utf8').replace(/^--.*$/gm,'');
    const response=await call('/__test/sql',{sql,mode:'exec'});
    assert.equal(response.status,200,`migration ${name}: ${JSON.stringify(response.data)}`);
  }
  for(const id of ['alice','bob']) {
    const response=await call('/__test/sql',{sql:'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',bindings:[id,id,`${id}@example.test`,1,0,0]});
    assert.equal(response.status,200);
  }
  return {mf,call,async paid(credits=50,userId='alice',eventId='paid1') { return call('/__test/payment',{action:'paid',event:{provider:'crypto-fixture',eventId,digest:'a'.repeat(64),userId,credits,kind:'pack-paid'},now}); }};
}
const report=(requestId,input=portfolioExample,operation='portfolio-batch-risk')=>({path:`/v1/reports/${operation}`,body:{requestId,input},headers:{'X-Local-Test-Identity':'alice'}});

test('production Worker has no fixture identity path and no credentials fail closed',async()=>{
  const mf=new Miniflare({...settings,bindings:{PUBLIC_ORIGIN:origin,PREMIUM_REPORTS_ENABLED:'false'},scriptPath:'dist-premium-worker/worker.mjs'});
  try {
    const response=await mf.dispatchFetch(`${origin}/v1/account`,{headers:{'X-Local-Test-Identity':'alice',Origin:origin}});
    assert.equal(response.status,503);
    const route=await mf.dispatchFetch(`${origin}/__test/payment`,{headers:{'X-Local-Test-Identity':'alice',Origin:origin}});
    assert.equal(route.status,503);
  } finally { await mf.dispose(); }
});

test('production SIWE signs in an EOA, strips bearer token, isolates wallets, expires and logs out',async()=>{
  const mf=new Miniflare({...settings,scriptPath:'dist-premium-worker/worker.mjs',outboundService:()=>{throw Error('No RPC or OAuth request permitted.')}});
  try {
    const db=await mf.getD1Database('DB');
    for(const name of ['0000_auth.sql','0001_billing.sql','0002_wallet_siwe.sql']) await db.exec(readFileSync(new URL(`./migrations/${name}`,import.meta.url),'utf8').replace(/^--.*$/gm,''));
    const first=await walletLogin(mf);
    assert.equal(first.response.status,200,await first.response.clone().text());
    assert.ok(first.cookie);
    assert.match(first.response.headers.get('set-cookie')??'',/HttpOnly;.*Secure/i);
    assert.equal(Object.hasOwn(await first.response.json(),'token'),false);
    assert.equal((await first.verify()).status,401);
    const identity=await mf.dispatchFetch(`${origin}/v1/identity`,{headers:{Cookie:first.cookie}});
    assert.equal(identity.status,200);
    assert.equal((await identity.json()).address,wallet1.address);
    const account=await mf.dispatchFetch(`${origin}/v1/account`,{headers:{Cookie:first.cookie}});
    assert.equal(account.status,200,await account.clone().text());
    const firstId=(await account.json()).userId;
    const user=await db.prepare('SELECT email,emailVerified FROM user WHERE id=?').bind(firstId).first();
    assert.match(user.email,/\.invalid$/);
    assert.equal(user.emailVerified,0);
    await db.prepare('UPDATE billing_wallets SET credits=50 WHERE user_id=?').bind(firstId).run();
    const second=await walletLogin(mf,wallet2);
    assert.equal(second.response.status,200,await second.response.clone().text());
    const secondAccount=await mf.dispatchFetch(`${origin}/v1/account`,{headers:{Cookie:second.cookie}});
    const secondState=await secondAccount.json();
    assert.equal(secondState.credits,0);
    assert.notEqual(secondState.userId,firstId);
    await db.prepare('DELETE FROM walletAddress WHERE userId=?').bind(secondState.userId).run();
    assert.equal((await mf.dispatchFetch(`${origin}/v1/account`,{headers:{Cookie:second.cookie}})).status,401);
    const logout=await mf.dispatchFetch(`${origin}/api/auth/sign-out`,{method:'POST',headers:{Cookie:first.cookie,Origin:origin,'Content-Type':'application/json'},body:'{}'});
    assert.equal(logout.status,200,await logout.clone().text());
    assert.equal((await mf.dispatchFetch(`${origin}/v1/account`,{headers:{Cookie:first.cookie}})).status,401);
    const again=await walletLogin(mf);
    assert.equal(again.response.status,200);
    assert.equal((await (await mf.dispatchFetch(`${origin}/v1/account`,{headers:{Cookie:again.cookie}})).json()).credits,50);
    await db.prepare('UPDATE session SET expiresAt=0 WHERE userId=?').bind(firstId).run();
    assert.equal((await mf.dispatchFetch(`${origin}/v1/account`,{headers:{Cookie:again.cookie}})).status,401);
    assert.equal((await mf.dispatchFetch(`${origin}/api/auth/sign-in/social`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'})).status,404);
  } finally {await mf.dispose();}
});

test('SIWE rejects wrong signer, URI, domain, chain, stale time and cross-origin requests',async()=>{
  const mf=new Miniflare({...settings,scriptPath:'dist-premium-worker/worker.mjs',outboundService:()=>{throw Error('No external request permitted.')}});
  try {
    const db=await mf.getD1Database('DB');
    for(const name of ['0000_auth.sql','0001_billing.sql','0002_wallet_siwe.sql']) await db.exec(readFileSync(new URL(`./migrations/${name}`,import.meta.url),'utf8').replace(/^--.*$/gm,''));
    for(const invalid of [{domain:'evil.example.test'},{uri:'https://evil.example.test/'},{chainId:1},{issuedAt:new Date(Date.now()-600000),expirationTime:new Date(Date.now()+10000)},{expirationTime:new Date(Date.now()-1000)}]) {
      const attempt=await walletLogin(mf,wallet1,invalid);
      assert.equal(attempt.response.status,401,JSON.stringify(invalid));
    }
    const nonceResponse=await mf.dispatchFetch(`${origin}/api/auth/siwe/nonce`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.10'},body:'{}'});
    const {nonce}=await nonceResponse.json();
    const message=createSiweMessage({domain:new URL(origin).host,address:wallet1.address,uri:`${origin}/`,version:'1',chainId:8453,nonce,issuedAt:new Date(),expirationTime:new Date(Date.now()+240000)});
    const wrongSignature=await wallet2.signMessage({message});
    const rejected=await mf.dispatchFetch(`${origin}/api/auth/siwe/verify`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.10'},body:JSON.stringify({message,signature:wrongSignature})});
    assert.equal(rejected.status,401);
    const validSignature=await wallet1.signMessage({message});
    const reused=await mf.dispatchFetch(`${origin}/api/auth/siwe/verify`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.10'},body:JSON.stringify({message,signature:validSignature})});
    assert.equal(reused.status,401);
    const unknownNonceMessage=createSiweMessage({domain:new URL(origin).host,address:wallet1.address,uri:`${origin}/`,version:'1',chainId:8453,nonce:'A1B2C3D4E5F6G7H8',issuedAt:new Date(),expirationTime:new Date(Date.now()+240000)});
    const unknownNonceSignature=await wallet1.signMessage({message:unknownNonceMessage});
    const unknownNonce=await mf.dispatchFetch(`${origin}/api/auth/siwe/verify`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.10'},body:JSON.stringify({message:unknownNonceMessage,signature:unknownNonceSignature})});
    assert.equal(unknownNonce.status,401);
    const contractSignature=await mf.dispatchFetch(`${origin}/api/auth/siwe/verify`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.10'},body:JSON.stringify({message:unknownNonceMessage,signature:'0x1626ba7e'})});
    assert.equal(contractSignature.status,401);
    const badOrigin=await mf.dispatchFetch(`${origin}/api/auth/siwe/nonce`,{method:'POST',headers:{Origin:'https://evil.example.test','Content-Type':'application/json'},body:'{}'});
    assert.equal(badOrigin.status,403);
  } finally {await mf.dispose();}
});

test('production nonce issuance is bounded by an atomic D1 rate limit',async()=>{
  const mf=new Miniflare({...settings,scriptPath:'dist-premium-worker/worker.mjs'});
  try {
    const db=await mf.getD1Database('DB');
    for(const name of ['0000_auth.sql','0001_billing.sql','0002_wallet_siwe.sql']) await db.exec(readFileSync(new URL(`./migrations/${name}`,import.meta.url),'utf8').replace(/^--.*$/gm,''));
    const issue=()=>mf.dispatchFetch(`${origin}/api/auth/siwe/nonce`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.55'},body:'{}'});
    for(let i=0;i<20;i++) assert.equal((await issue()).status,200);
    assert.equal((await issue()).status,429);
    const rows=await db.prepare('SELECT ip_digest,attempts FROM wallet_auth_rate_limits').all();
    assert.equal(rows.results.length,1);
    assert.equal(rows.results[0].attempts,20);
    assert.match(rows.results[0].ip_digest,/^[a-f0-9]{64}$/);
  } finally {await mf.dispose();}
});

test('D1 account isolation, atomic debit, exact retry and input collision',async()=>{
  const {mf,call,paid}=await fixture();
  try {
    assert.equal((await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data.credits,0);
    assert.equal((await call('/v1/account',undefined,{'X-Local-Test-Identity':'bob'})).data.credits,0);
    assert.equal((await call('/v1/account')).status,401);
    assert.equal((await paid()).status,200);
    const x=report('same'); const first=await call(x.path,x.body,x.headers);
    assert.equal(first.status,200,JSON.stringify(first.data));
    assert.equal(first.data.receipt.charged,true);
    assert.equal(first.data.entitlement.credits,40);
    const retry=await call(x.path,x.body,x.headers);
    assert.equal(retry.status,200); assert.equal(retry.data.receipt.charged,false);
    assert.deepEqual(retry.data.report,first.data.report);
    assert.equal((await call(x.path,{...x.body,input:{...portfolioExample,currency:'EUR'}},x.headers)).status,409);
    assert.equal((await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data.credits,40);
    assert.equal((await call('/v1/account',undefined,{'X-Local-Test-Identity':'bob'})).data.credits,0);
    const ledger=await call('/v1/ledger',undefined,{'X-Local-Test-Identity':'alice'});
    assert.equal(ledger.data.entries.filter(x=>x.kind==='premium-report').length,1);
    assert.equal((await call('/v1/ledger',undefined,{'X-Local-Test-Identity':'bob'})).data.entries.length,0);
  } finally { await mf.dispose(); }
});

test('invalid reports, absent origin, disabled premium and D1 failures never debit',async()=>{
  const {mf,call,paid}=await fixture();
  try {
    await paid(); const x=report('bad',{...portfolioExample,assets:[]});
    assert.equal((await call(x.path,x.body,x.headers)).status,400);
    const wrong=await mf.dispatchFetch(`${origin}${x.path}`,{method:'POST',headers:{'Content-Type':'application/json','X-Local-Test-Identity':'alice',Origin:'https://evil.example'},body:JSON.stringify(x.body)});
    assert.equal(wrong.status,403);
    const oversized=await mf.dispatchFetch(`${origin}${x.path}`,{method:'POST',headers:{'Content-Type':'application/json','X-Local-Test-Identity':'alice',Origin:origin},body:'x'.repeat(65537)});
    assert.equal(oversized.status,413);
    assert.equal((await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data.credits,50);
    await call('/__test/sql',{sql:'DROP TABLE billing_report_receipts'});
    assert.equal((await call(report('db-fail').path,report('db-fail').body,report('db-fail').headers)).status,503);
    assert.equal((await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data.credits,50);
  } finally { await mf.dispose(); }
});

test('production default disables both reports even for a credited verified test identity',async()=>{
  const {mf,call,paid}=await fixture({PREMIUM_REPORTS_ENABLED:'false'});
  try {
    await paid(20);
    for(const operation of ['portfolio-batch-risk','trading-journal-advanced']) {
      const x=report(`disabled-${operation}`,operation==='portfolio-batch-risk'?portfolioExample:journalExample,operation);
      assert.equal((await call(x.path,x.body,x.headers)).status,503);
    }
    assert.equal((await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data.credits,20);
  } finally {await mf.dispose();}
});

test('D1 contention permits only five ten-credit reports and no overspend',async()=>{
  const {mf,call,paid}=await fixture();
  try {
    await paid(50);
    const attempts=await Promise.all(Array.from({length:8},(_,i)=>{const x=report(`parallel-${i}`,journalExample,'trading-journal-advanced');return call(x.path,x.body,x.headers);}));
    assert.equal(attempts.filter(x=>x.status===200).length,5,JSON.stringify(attempts.map(x=>x.status)));
    assert.equal(attempts.filter(x=>x.status===402).length,3);
    assert.equal((await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data.credits,0);
    const first=report(`parallel-${attempts.findIndex(x=>x.status===200)}`,journalExample,'trading-journal-advanced');
    assert.equal((await call(first.path,first.body,first.headers)).data.receipt.charged,false);
    const rows=await call('/__test/sql',{sql:'SELECT COUNT(*) AS n FROM billing_report_receipts',mode:'first'});
    assert.equal(rows.data.n,5);
  } finally { await mf.dispose(); }
});

test('verified event replay and refund freeze with deficit are atomic',async()=>{
  const {mf,call,paid}=await fixture();
  try {
    assert.equal((await paid(20)).data.duplicate,false);
    assert.equal((await paid(20)).data.duplicate,true);
    const x=report('spent'); assert.equal((await call(x.path,x.body,x.headers)).status,200);
    const event={provider:'crypto-fixture',eventId:'refund1',digest:'b'.repeat(64),referenceEventId:'paid1',userId:'alice'};
    assert.equal((await call('/__test/payment',{action:'refund',event,now})).status,200);
    const account=(await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data;
    assert.equal(account.credits,0); assert.equal(account.unrecovered,10); assert.equal(account.frozen,true);
    assert.equal((await call(x.path,x.body,x.headers)).status,403);
    const recovered=await paid(20,'alice','paid2');
    assert.equal(recovered.status,200);
    const after=(await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data;
    assert.equal(after.credits,10); assert.equal(after.unrecovered,0); assert.equal(after.frozen,true);
    const ledger=(await call('/v1/ledger',undefined,{'X-Local-Test-Identity':'alice'})).data.entries;
    assert.equal(ledger.filter(x=>x.kind==='liability-recovery').length,1);
    assert.equal(ledger.reduce((sum,x)=>sum+x.delta,0),after.credits);
    const db=await mf.getD1Database('DB');
    await assert.rejects(()=>db.prepare("UPDATE billing_ledger SET delta=999 WHERE user_id='alice'").run());
    await assert.rejects(()=>db.prepare("DELETE FROM billing_ledger WHERE user_id='alice'").run());
  } finally { await mf.dispose(); }
});

test('report rate limit is enforced before computation or debit',async()=>{
  const {mf,call,paid}=await fixture();
  try {
    await paid(100);
    const x=report('limit-test',{...portfolioExample,assets:[]});
    for(let i=0;i<10;i++) assert.equal((await call(x.path,x.body,x.headers)).status,400);
    assert.equal((await call(x.path,x.body,x.headers)).status,429);
    assert.equal((await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data.credits,100);
  } finally {await mf.dispose();}
});

test('out-of-order reversal blocks later credit; Pro expiration is read-only and cannot be forged',async()=>{
  const {mf,call}=await fixture();
  try {
    const invalid={provider:'crypto-fixture',eventId:'invalid',digest:'a'.repeat(64),userId:'alice',credits:10,kind:'pro-paid',periodEnd:'not-a-date'};
    assert.equal((await call('/__test/payment',{action:'paid',event:invalid,now})).status,400);
    assert.equal((await call('/__test/payment',{action:'paid',event:{...invalid,kind:'unverified',periodEnd:'2026-11-23T00:00:00.000Z'},now})).status,400);
    assert.equal((await call('/__test/payment',{action:'paid',event:{...invalid,kind:'pack-paid',credits:1_000_000_001},now})).status,400);
    const refund={provider:'crypto-fixture',eventId:'early-refund',digest:'b'.repeat(64),referenceEventId:'late-paid',userId:'alice'};
    assert.equal((await call('/__test/payment',{action:'refund',event:refund,now})).data.pending,true);
    assert.equal((await call('/__test/payment',{action:'refund',event:refund,now})).data.duplicate,true);
    const late={provider:'crypto-fixture',eventId:'late-paid',digest:'a'.repeat(64),userId:'alice',credits:100,kind:'pro-paid',periodEnd:'2026-11-23T00:00:00.000Z'};
    assert.equal((await call('/__test/payment',{action:'paid',event:late,now})).data.blocked,true);
    const account=(await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data;
    assert.equal(account.credits,0); assert.equal(account.plan,'free');
    assert.equal((await call('/__test/payment',{action:'paid',event:late,now})).data.duplicate,true);
    assert.equal((await call('/__test/payment',{action:'paid',event:{...late,eventId:'pro2'},now})).status,200);
    const active=(await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data;
    assert.equal(active.plan,'pro'); assert.equal(active.credits,100);
    const canceled=await call('/__test/payment',{action:'subscription',event:{provider:'crypto-fixture',eventId:'cancel1',digest:'c'.repeat(64),userId:'alice',kind:'pro-cancel-requested',occurredAt:'2026-10-24T00:00:00.000Z'}});
    assert.equal(canceled.data.applied,true);
    const canceling=(await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data;
    assert.equal(canceling.plan,'pro'); assert.equal(canceling.subscription.status,'canceling');
    const failed=await call('/__test/payment',{action:'subscription',event:{provider:'crypto-fixture',eventId:'fail1',digest:'d'.repeat(64),userId:'alice',kind:'pro-renewal-failed',occurredAt:'2026-10-25T00:00:00.000Z'}});
    assert.equal(failed.data.applied,true);
    assert.equal((await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data.plan,'free');
    const lateCancel=await call('/__test/payment',{action:'subscription',event:{provider:'crypto-fixture',eventId:'cancel2',digest:'e'.repeat(64),userId:'alice',kind:'pro-cancel-requested',occurredAt:'2026-10-25T12:00:00.000Z'}});
    assert.equal(lateCancel.data.applied,false);
    assert.equal((await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data.plan,'free');
    await call('/__test/payment',{action:'paid',event:{...late,eventId:'late-renewal'},now:'2026-10-24T12:00:00.000Z'});
    assert.equal((await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data.subscription.status,'past_due');
    await call('/__test/payment',{action:'paid',event:{...late,eventId:'new-renewal',periodEnd:'2026-12-23T00:00:00.000Z'},now:'2026-10-26T00:00:00.000Z'});
    assert.equal((await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data.plan,'pro');
    assert.equal((await call('/__test/sql',{sql:"UPDATE billing_subscriptions SET period_end='2025-01-01T00:00:00.000Z' WHERE user_id='alice'"})).status,200);
    const expired=(await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data;
    assert.equal(expired.plan,'free'); assert.equal(expired.subscription.status,'expired');
    assert.equal((await call('/v1/account',undefined,{'X-Local-Test-Identity':'bob'})).data.plan,'free');
  } finally { await mf.dispose(); }
});
