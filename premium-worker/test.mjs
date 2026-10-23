import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { portfolioExample, journalExample } from '../premium/examples.mjs';

const origin='https://premium.example.test', now='2026-10-23T00:00:00.000Z';
const settings={modules:true,compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'12345678-1234-1234-1234-123456789012'},bindings:{PUBLIC_ORIGIN:origin,PREMIUM_REPORTS_ENABLED:'true',BETTER_AUTH_SECRET:'0123456789abcdef0123456789abcdef0123456789abcdef',GOOGLE_CLIENT_ID:'local-fixture-client',GOOGLE_CLIENT_SECRET:'local-fixture-secret'}};
async function fixture(bindings={}) {
  const mf=new Miniflare({...settings,bindings:{...settings.bindings,...bindings},scriptPath:'dist-premium-worker-test/worker.mjs'});
  const call=async(path,body,headers={}) => {
    const response=await mf.dispatchFetch(`${origin}${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:origin,...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const text=await response.text(); let data; try { data=JSON.parse(text); } catch { data={raw:text}; }
    return {status:response.status,data};
  };
  for(const name of ['0000_auth.sql','0001_billing.sql']) {
    const sql=readFileSync(new URL(`./migrations/${name}`,import.meta.url),'utf8').replace(/^--.*$/gm,'');
    const response=await call('/__test/sql',{sql,mode:'exec'});
    assert.equal(response.status,200,`migration ${name}: ${JSON.stringify(response.data)}`);
  }
  for(const id of ['alice','bob']) {
    const response=await call('/__test/sql',{sql:'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',bindings:[id,id,`${id}@example.test`,1,0,0]});
    assert.equal(response.status,200);
  }
  return {mf,call,async paid(credits=50,userId='alice',eventId='paid1') { return call('/__test/payment',{action:'paid',event:{provider:'stripe-test',eventId,digest:'a'.repeat(64),userId,credits,kind:'pack-paid'},now}); }};
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

test('Better Auth starts Google OAuth with secure state cookies; untrusted origin fails',async()=>{
  const {mf}=await fixture();
  try {
    const request=(originHeader)=>mf.dispatchFetch(`${origin}/api/auth/sign-in/social`,{method:'POST',headers:{'Content-Type':'application/json',Origin:originHeader},body:JSON.stringify({provider:'google',callbackURL:origin})});
    const good=await request(origin);
    const body=await good.text();
    assert.equal(good.status,200,body.slice(0,400));
    assert.match(body,/accounts\.google\.com/);
    assert.match(body,/code_challenge=/);
    assert.match(good.headers.get('set-cookie')??'',/HttpOnly/i);
    assert.match(good.headers.get('set-cookie')??'',/Secure/i);
    const bad=await request('https://evil.example');
    assert.ok(bad.status>=400);
    const tooLarge=await mf.dispatchFetch(`${origin}/api/auth/sign-in/social`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:'x'.repeat(16385)});
    assert.equal(tooLarge.status,413);
  } finally { await mf.dispose(); }
});

test('production OAuth callback creates an isolated session and logout revokes it using a mocked Google exchange',async()=>{
  let tokenCalls=0;
  const fakeJwt=(subject,email)=>`${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:subject,email,email_verified:true,name:'Fixture Person',iss:'https://accounts.google.com',aud:'local-fixture-client',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.fixture`;
  let subject='google-subject-1',email='fixture@example.test';
  const mf=new Miniflare({...settings,scriptPath:'dist-premium-worker/worker.mjs',outboundService:request=>{
    if (new URL(request.url).href==='https://oauth2.googleapis.com/token') {
      tokenCalls++;
      return Response.json({access_token:'local-only-fixture',token_type:'Bearer',expires_in:3600,id_token:fakeJwt(subject,email)});
    }
    throw new Error('Unexpected outbound request in OAuth fixture.');
  }});
  try {
    const db=await mf.getD1Database('DB');
    for(const name of ['0000_auth.sql','0001_billing.sql']) await db.exec(readFileSync(new URL(`./migrations/${name}`,import.meta.url),'utf8').replace(/^--.*$/gm,''));
    const start=async()=>{
      const response=await mf.dispatchFetch(`${origin}/api/auth/sign-in/social`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({provider:'google',callbackURL:origin})});
      assert.equal(response.status,200,await response.clone().text());
      return {url:(await response.json()).url,stateCookie:(response.headers.get('set-cookie')??'').split(';')[0]};
    };
    const finish=async()=>{
      const started=await start();
      const url=new URL(started.url);
      const response=await mf.dispatchFetch(`${origin}/api/auth/callback/google?code=local-only&state=${encodeURIComponent(url.searchParams.get('state'))}`,{headers:{Cookie:started.stateCookie},redirect:'manual'});
      assert.equal(response.status,302,await response.clone().text());
      const cookies=response.headers.getSetCookie();
      const sessionCookie=cookies.find(value=>value.startsWith('__Secure-better-auth.session_token='));
      assert.ok(sessionCookie,`Cookie names: ${cookies.map(value=>value.split('=')[0]).join(', ')}`);
      assert.match(sessionCookie,/HttpOnly/); assert.match(sessionCookie,/Secure/);
      return sessionCookie.split(';')[0];
    };
    const cookie=await finish();
    const account=await mf.dispatchFetch(`${origin}/v1/account`,{headers:{Cookie:cookie,Origin:origin}});
    assert.equal(account.status,200,await account.clone().text());
    assert.equal((await account.json()).credits,0);
    assert.equal(tokenCalls,1);
    const signout=await mf.dispatchFetch(`${origin}/api/auth/sign-out`,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:'{}'});
    assert.equal(signout.status,200,await signout.clone().text());
    assert.equal((await mf.dispatchFetch(`${origin}/v1/account`,{headers:{Cookie:cookie,Origin:origin}})).status,401);
    const restored=await finish();
    assert.notEqual(restored,cookie);
    assert.equal((await mf.dispatchFetch(`${origin}/v1/account`,{headers:{Cookie:restored,Origin:origin}})).status,200);
    await db.prepare('UPDATE session SET expiresAt=? WHERE userId=(SELECT id FROM user WHERE email=?)').bind(0,'fixture@example.test').run();
    assert.equal((await mf.dispatchFetch(`${origin}/v1/account`,{headers:{Cookie:restored,Origin:origin}})).status,401);
    subject='google-subject-2';
    const started=await start();
    const second=new URL(started.url);
    const collision=await mf.dispatchFetch(`${origin}/api/auth/callback/google?code=local-only&state=${encodeURIComponent(second.searchParams.get('state'))}`,{headers:{Cookie:started.stateCookie},redirect:'manual'});
    assert.equal(collision.status,302);
    assert.doesNotMatch(collision.headers.get('set-cookie')??'',/__Secure-better-auth\.session_token=/);
    const users=await db.prepare('SELECT COUNT(*) AS n FROM user').first();
    assert.equal(users.n,1);
    email='second@example.test';
    const secondCookie=await finish();
    const secondAccount=await mf.dispatchFetch(`${origin}/v1/account`,{headers:{Cookie:secondCookie,Origin:origin}});
    assert.equal(secondAccount.status,200);
    assert.notEqual((await secondAccount.json()).userId,(await db.prepare('SELECT id FROM user WHERE email=?').bind('fixture@example.test').first()).id);
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
    const event={provider:'stripe-test',eventId:'refund1',digest:'b'.repeat(64),referenceEventId:'paid1',userId:'alice'};
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
    const invalid={provider:'stripe-test',eventId:'invalid',digest:'a'.repeat(64),userId:'alice',credits:10,kind:'pro-paid',periodEnd:'not-a-date'};
    assert.equal((await call('/__test/payment',{action:'paid',event:invalid,now})).status,400);
    assert.equal((await call('/__test/payment',{action:'paid',event:{...invalid,kind:'unverified',periodEnd:'2026-11-23T00:00:00.000Z'},now})).status,400);
    assert.equal((await call('/__test/payment',{action:'paid',event:{...invalid,kind:'pack-paid',credits:1_000_000_001},now})).status,400);
    const refund={provider:'stripe-test',eventId:'early-refund',digest:'b'.repeat(64),referenceEventId:'late-paid',userId:'alice'};
    assert.equal((await call('/__test/payment',{action:'refund',event:refund,now})).data.pending,true);
    assert.equal((await call('/__test/payment',{action:'refund',event:refund,now})).data.duplicate,true);
    const late={provider:'stripe-test',eventId:'late-paid',digest:'a'.repeat(64),userId:'alice',credits:100,kind:'pro-paid',periodEnd:'2026-11-23T00:00:00.000Z'};
    assert.equal((await call('/__test/payment',{action:'paid',event:late,now})).data.blocked,true);
    const account=(await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data;
    assert.equal(account.credits,0); assert.equal(account.plan,'free');
    assert.equal((await call('/__test/payment',{action:'paid',event:late,now})).data.duplicate,true);
    assert.equal((await call('/__test/payment',{action:'paid',event:{...late,eventId:'pro2'},now})).status,200);
    const active=(await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data;
    assert.equal(active.plan,'pro'); assert.equal(active.credits,100);
    const canceled=await call('/__test/payment',{action:'subscription',event:{provider:'stripe-test',eventId:'cancel1',digest:'c'.repeat(64),userId:'alice',kind:'pro-cancel-requested',occurredAt:'2026-10-24T00:00:00.000Z'}});
    assert.equal(canceled.data.applied,true);
    const canceling=(await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data;
    assert.equal(canceling.plan,'pro'); assert.equal(canceling.subscription.status,'canceling');
    const failed=await call('/__test/payment',{action:'subscription',event:{provider:'stripe-test',eventId:'fail1',digest:'d'.repeat(64),userId:'alice',kind:'pro-renewal-failed',occurredAt:'2026-10-25T00:00:00.000Z'}});
    assert.equal(failed.data.applied,true);
    assert.equal((await call('/v1/account',undefined,{'X-Local-Test-Identity':'alice'})).data.plan,'free');
    const lateCancel=await call('/__test/payment',{action:'subscription',event:{provider:'stripe-test',eventId:'cancel2',digest:'e'.repeat(64),userId:'alice',kind:'pro-cancel-requested',occurredAt:'2026-10-25T12:00:00.000Z'}});
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
