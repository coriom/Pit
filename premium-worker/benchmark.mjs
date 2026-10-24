import { readFileSync, statSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { Miniflare } from 'miniflare';
import { createSiweMessage } from 'viem/siwe';
import { privateKeyToAccount } from 'viem/accounts';

const origin='https://premium.example.test';
const dates=Array.from({length:60},(_,i)=>new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10));
const portfolio={currency:'USD',periodsPerYear:365,dates,assets:Array.from({length:8},(_,i)=>({id:`asset${i}`,label:`Asset ${i}`,value:String((i+1)*1000),returnsPct:dates.map((_,j)=>String(((j*(i+3))%13)-6)),shockPct:String(i-4)}))};
const journal={currency:'USD',startingCapital:'1000000',tradesCsv:['id,date,strategy,grossPnl,fees,initialRisk',...Array.from({length:500},(_,i)=>`trade${i},${new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10)},${i%2?'Trend':'Range'},${i%3?'12':'-15'},1,10`)].join('\r\n')};
const worstPortfolio={...portfolio,assets:portfolio.assets.map((asset,i)=>({...asset,id:`asset${i}_${'x'.repeat(16)}`,label:`Asset ${i} ${'Long Label '.repeat(3)}`.slice(0,40),returnsPct:dates.map((_,j)=>`${(j*(i+3))%13-6}.1234`)})),snapshots:dates.slice(0,30).map((date,i)=>({date,endingValue:String(100000+i*1000),externalFlow:'0'}))};
const worstJournal={currency:'USD',startingCapital:'1000000',tradesCsv:['id,date,strategy,grossPnl,fees,initialRisk',...Array.from({length:500},(_,i)=>`T${String(i).padStart(3,'0')}${'x'.repeat(28)},${new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10)},S${String(i%4)}${'y'.repeat(29)},${i%3?'12.00000000':'-15.00000000'},1.00000000,10.00000000`)].join('\r\n')};
const wallet=privateKeyToAccount(`0x${'11'.repeat(32)}`);
async function walletSession(mf) {
  const headers={Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.11'};
  const nonce=await mf.dispatchFetch(`${origin}/api/auth/siwe/nonce`,{method:'POST',headers,body:'{}'});
  if(nonce.status!==200)throw Error(`SIWE nonce: ${nonce.status}`);
  const message=createSiweMessage({domain:new URL(origin).host,address:wallet.address,uri:`${origin}/`,version:'1',chainId:8453,nonce:(await nonce.json()).nonce,issuedAt:new Date(),expirationTime:new Date(Date.now()+240000)});
  const signed=await mf.dispatchFetch(`${origin}/api/auth/siwe/verify`,{method:'POST',headers,body:JSON.stringify({message,signature:await wallet.signMessage({message})})});
  if(signed.status!==200)throw Error(`SIWE verify: ${signed.status}`);
  const cookie=signed.headers.getSetCookie().find(value=>value.startsWith('__Secure-better-auth.session_token='))?.split(';')[0];
  if(!cookie)throw Error('SIWE fixture did not create a secure session.');
  return cookie;
}
const workerdMemory=()=>{try{return execFileSync('ps',['-C','workerd','-o','pid=,rss='],{encoding:'utf8'}).trim().split('\n').filter(Boolean).map(line=>{const [pid,rssKiB]=line.trim().split(/\s+/).map(Number);return {pid,rssMiB:+(rssKiB/1024).toFixed(2)};});}catch{return [];}};
const initialWorkerdPids=new Set(workerdMemory().map(x=>x.pid));
const mf=new Miniflare({modules:true,scriptPath:'dist-premium-worker-test/worker.mjs',compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'12345678-1234-1234-1234-123456789012'},bindings:{PUBLIC_ORIGIN:origin,PREMIUM_REPORTS_ENABLED:'true',BETTER_AUTH_SECRET:'0123456789abcdef0123456789abcdef0123456789abcdef'},outboundService:()=>{throw Error('No external request permitted.')}});
const dispatch=async(path,value,headers={})=>mf.dispatchFetch(`${origin}${path}`,{method:value===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:value===undefined?undefined:JSON.stringify(value)});
const check=async(response,label)=>{if(!response.ok)throw Error(`${label}: ${response.status} ${(await response.text()).slice(0,300)}`);return response;};
const stats=values=>{const a=[...values].sort((x,y)=>x-y);return {count:a.length,medianMs:+a[Math.floor(a.length/2)].toFixed(3),p95Ms:+a[Math.ceil(a.length*.95)-1].toFixed(3),maxMs:+a.at(-1).toFixed(3)};};
const stageStats=samples=>Object.fromEntries([...new Set(samples.flatMap(x=>x.map(y=>y.stage)))].map(stage=>[stage,stats(samples.map(x=>x.find(y=>y.stage===stage)?.elapsedMs??0))]));
try {
  for(const migration of ['0000_auth.sql','0001_billing.sql','0002_wallet_siwe.sql']) {
    const sql=readFileSync(new URL(`./migrations/${migration}`,import.meta.url),'utf8').replace(/^--.*$/gm,'');
    await check(await dispatch('/__test/sql',{sql,mode:'exec'}),migration);
  }
  const authCookie=await walletSession(mf);
  await check(await dispatch('/__test/sql',{sql:'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',bindings:['bench','Benchmark','bench@example.test',1,0,0]}),'user');
  await check(await dispatch('/__test/sql',{sql:'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',bindings:['bench-journal','Benchmark Journal','bench-journal@example.test',1,0,0]}),'journal user');
  await check(await dispatch('/v1/account',undefined,{'X-Local-Test-Identity':'bench'}),'account');
  await check(await dispatch('/__test/payment',{action:'paid',event:{provider:'benchmark',eventId:'paid1',digest:'a'.repeat(64),userId:'bench',credits:500,kind:'pack-paid'},now:new Date().toISOString()}),'credit');
  await check(await dispatch('/__test/payment',{action:'paid',event:{provider:'benchmark',eventId:'paid2',digest:'b'.repeat(64),userId:'bench-journal',credits:500,kind:'pack-paid'},now:new Date().toISOString()}),'journal credit');
  const output={runtime:'Miniflare workerd, local D1 emulation',workerBundleBytes:statSync('dist-premium-worker/worker.mjs').size,workloads:{}};
  const authSetup=[],authSession=[];
  for(let i=0;i<11;i++){
    const value=await (await check(await dispatch('/__test/auth-session-timing',undefined,{Cookie:authCookie}),'auth timing')).json();
    if(!value.authenticated)throw Error('Auth timing fixture lost its verified session.');
    authSetup.push(value.creationWallMs);authSession.push(value.sessionWallMs);
  }
  output.authStagesWall={coldSetupMs:+authSetup[0].toFixed(3),coldSessionMs:+authSession[0].toFixed(3),warmSetup:stats(authSetup.slice(1)),warmSessionLookup:stats(authSession.slice(1))};
  for(const [name,input] of [['portfolio-batch-risk',portfolio],['trading-journal-advanced',journal]]) {
    const pure=[],jsonOutput=[],requestWall=[],responseBytes=[],engineStages=[],requestStages=[];
    for(let i=0;i<31;i++) {
      const response=await check(await dispatch('/__test/engine-timing',{operation:name,input}),`${name} engine`);
      const result=await response.json(); pure.push(result.synchronousMs);jsonOutput.push(result.jsonOutputMs);engineStages.push(result.stages);responseBytes.push(result.responseBytes);
    }
    for(let i=0;i<8;i++) {
      const response=await check(await dispatch('/__test/request-timing',{operation:name,requestId:`${name}-${i}`,input},{'X-Local-Test-Identity':name==='portfolio-batch-risk'?'bench':'bench-journal'}),`${name} report`);
      const result=await response.json();if(result.status!==200)throw Error(`${name} report: ${result.status}`);
      requestWall.push(result.requestWallMs);requestStages.push(result.stages);
    }
    output.workloads[name]={coldEngineMs:+pure[0].toFixed(3),engineSynchronous:stats(pure.slice(1)),engineStages:stageStats(engineStages.slice(1)),jsonOutputSynchronous:stats(jsonOutput.slice(1)),coldFixtureRequestWallMs:+requestWall[0].toFixed(3),fixtureRequestWall:stats(requestWall.slice(1)),requestStagesWall:stageStats(requestStages.slice(1)),responseBytes:Math.max(...responseBytes)};
  }
  const d1=[];
  for(let i=0;i<30;i++) {
    const start=performance.now();
    const response=await check(await dispatch('/__test/sql',{sql:'SELECT 1 AS n',mode:'all'}),'D1 query');
    const result=await response.json();
    d1.push({clientWall:performance.now()-start,reportedDuration:result.meta?.duration??null});
  }
  output.d1={simpleQueryClientWall:stats(d1.map(x=>x.clientWall)),reportedDurationMs:d1.every(x=>typeof x.reportedDuration==='number')?stats(d1.map(x=>x.reportedDuration)):null,successfulReportStatementCountExcludingAuth:12};
  output.worstSupported={};
  for(const [name,input] of [['portfolio-batch-risk',worstPortfolio],['trading-journal-advanced',worstJournal]]){
    const engine=[],requestWall=[];
    for(let i=0;i<21;i++){
      const result=await (await check(await dispatch('/__test/engine-timing',{operation:name,input}),`worst ${name} engine`)).json();engine.push(result.synchronousMs);
    }
    await check(await dispatch('/__test/sql',{sql:'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',bindings:[`worst-${name}`,name,`${name}@example.test`,1,0,0]}),'worst user');
    await check(await dispatch('/__test/payment',{action:'paid',event:{provider:'benchmark',eventId:`paid-${name}`,digest:'c'.repeat(64),userId:`worst-${name}`,credits:100,kind:'pack-paid'},now:new Date().toISOString()}),'worst credit');
    for(let i=0;i<3;i++){
      const result=await (await check(await dispatch('/__test/request-timing',{operation:name,requestId:`worst-${i}`,input},{'X-Local-Test-Identity':`worst-${name}`}),`worst ${name} request`)).json();
      if(result.status!==200)throw Error(`Worst ${name} request: ${result.status}`);requestWall.push(result.requestWallMs);
    }
    output.worstSupported[name]={inputBytes:Buffer.byteLength(JSON.stringify({requestId:'worst-0',input})),coldEngineMs:+engine[0].toFixed(3),warmEngine:stats(engine.slice(1)),fixtureRequestWall:stats(requestWall)};
  }
  const report={requestId:'concurrent-1',input:journal};
  const concurrent=await Promise.all([dispatch('/v1/reports/trading-journal-advanced',report,{'X-Local-Test-Identity':'bench'}),dispatch('/v1/account',undefined,{'X-Local-Test-Identity':'bench'}),dispatch('/v1/ledger',undefined,{'X-Local-Test-Identity':'bench'})]);
  output.concurrentReportAndReads=concurrent.map(x=>x.status);
  const parallel=await Promise.all(Array.from({length:4},()=>dispatch('/__test/engine-timing',{operation:'trading-journal-advanced',input:journal})));
  output.concurrentJournalEngine=await Promise.all(parallel.map(async x=>{const value=await (await check(x,'parallel journal')).json();return +value.synchronousMs.toFixed(3);}));
  // Exercise the real Worker entrypoint and a locally signed SIWE session.
  const authMf=new Miniflare({modules:true,scriptPath:'dist-premium-worker/worker.mjs',compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'12345678-1234-1234-1234-123456789013'},bindings:{PUBLIC_ORIGIN:origin,PREMIUM_REPORTS_ENABLED:'true',BETTER_AUTH_SECRET:'0123456789abcdef0123456789abcdef0123456789abcdef'},outboundService:()=>{throw Error('No external request permitted.')}});
  try {
    const db=await authMf.getD1Database('DB');
    for(const migration of ['0000_auth.sql','0001_billing.sql','0002_wallet_siwe.sql'])await db.exec(readFileSync(new URL(`./migrations/${migration}`,import.meta.url),'utf8').replace(/^--.*$/gm,''));
    const sessionCookie=await walletSession(authMf);
    const user=await db.prepare('SELECT userId AS id FROM walletAddress WHERE address=?').bind(wallet.address).first();
    if(!user?.id)throw Error('Local SIWE fixture did not create a user.');
    await db.prepare('INSERT INTO billing_wallets(user_id,credits) VALUES (?,100)').bind(user.id).run();
    await db.prepare("INSERT INTO billing_ledger(id,user_id,delta,kind,source,created_at) VALUES (?,?,100,'pack-paid',?,?)").bind('benchmark-credit',user.id,'benchmark-credit',new Date().toISOString()).run();
    output.authenticatedFullRequestWall={};
    for(const [name,input] of [['portfolio-batch-risk',portfolio],['trading-journal-advanced',journal]]) {
      const durations=[];
      for(let i=0;i<5;i++){
        const begun=performance.now();
        const response=await authMf.dispatchFetch(`${origin}/v1/reports/${name}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:sessionCookie},body:JSON.stringify({requestId:`auth-${name}-${i}`,input})});
        if(response.status!==200)throw Error(`Authenticated ${name}: ${response.status} ${(await response.text()).slice(0,150)}`);
        await response.arrayBuffer();durations.push(performance.now()-begun);
      }
      output.authenticatedFullRequestWall[name]={coldMs:+durations[0].toFixed(3),warm:stats(durations.slice(1))};
    }
  } finally {await authMf.dispose();}
  output.nodeHarnessRssMiB=+(process.memoryUsage().rss/1048576).toFixed(2);
  output.workerdProcessRssMiB=workerdMemory().filter(x=>!initialWorkerdPids.has(x.pid)).map(x=>x.rssMiB);
  output.memoryScope='Host process RSS, not isolated Worker heap or per-request peak';
  output.timingScope='Engine/stage timings are workerd performance.now wall intervals. Authenticated full request is client wall including local D1; neither is hosted Cloudflare CPU.';
  console.log(JSON.stringify(output,null,2));
  if(process.argv.includes('--assert')) {
    if(output.workloads['portfolio-batch-risk'].engineSynchronous.p95Ms>15 || output.workloads['trading-journal-advanced'].engineSynchronous.p95Ms>25 ||
       output.worstSupported['portfolio-batch-risk'].warmEngine.p95Ms>20 || output.worstSupported['trading-journal-advanced'].warmEngine.p95Ms>30)
      throw Error('Local workerd engine performance regressed beyond the generous diagnostic ceiling; this is not a hosted CPU certification.');
  }
} finally {await mf.dispose();}
