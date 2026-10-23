import { readFileSync, statSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { Miniflare } from 'miniflare';

const origin='https://premium.example.test';
const dates=Array.from({length:60},(_,i)=>new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10));
const portfolio={currency:'USD',periodsPerYear:365,dates,assets:Array.from({length:8},(_,i)=>({id:`asset${i}`,label:`Asset ${i}`,value:String((i+1)*1000),returnsPct:dates.map((_,j)=>String(((j*(i+3))%13)-6)),shockPct:String(i-4)}))};
const journal={currency:'USD',startingCapital:'1000000',tradesCsv:['id,date,strategy,grossPnl,fees,initialRisk',...Array.from({length:500},(_,i)=>`trade${i},${new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10)},${i%2?'Trend':'Range'},${i%3?'12':'-15'},1,10`)].join('\r\n')};
const workerdMemory=()=>{try{return execFileSync('ps',['-C','workerd','-o','pid=,rss='],{encoding:'utf8'}).trim().split('\n').filter(Boolean).map(line=>{const [pid,rssKiB]=line.trim().split(/\s+/).map(Number);return {pid,rssMiB:+(rssKiB/1024).toFixed(2)};});}catch{return [];}};
const initialWorkerdPids=new Set(workerdMemory().map(x=>x.pid));
const mf=new Miniflare({modules:true,scriptPath:'dist-premium-worker-test/worker.mjs',compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'12345678-1234-1234-1234-123456789012'},bindings:{PUBLIC_ORIGIN:origin,PREMIUM_REPORTS_ENABLED:'true',BETTER_AUTH_SECRET:'0123456789abcdef0123456789abcdef0123456789abcdef',GOOGLE_CLIENT_ID:'local-fixture-client',GOOGLE_CLIENT_SECRET:'local-fixture-secret'}});
const dispatch=async(path,value,headers={})=>mf.dispatchFetch(`${origin}${path}`,{method:value===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:value===undefined?undefined:JSON.stringify(value)});
const check=async(response,label)=>{if(!response.ok)throw Error(`${label}: ${response.status} ${(await response.text()).slice(0,300)}`);return response;};
const stats=values=>{const a=[...values].sort((x,y)=>x-y);return {count:a.length,medianMs:+a[Math.floor(a.length/2)].toFixed(3),p95Ms:+a[Math.ceil(a.length*.95)-1].toFixed(3),maxMs:+a.at(-1).toFixed(3)};};
try {
  for(const migration of ['0000_auth.sql','0001_billing.sql']) {
    const sql=readFileSync(new URL(`./migrations/${migration}`,import.meta.url),'utf8').replace(/^--.*$/gm,'');
    await check(await dispatch('/__test/sql',{sql,mode:'exec'}),migration);
  }
  await check(await dispatch('/__test/sql',{sql:'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',bindings:['bench','Benchmark','bench@example.test',1,0,0]}),'user');
  await check(await dispatch('/v1/account',undefined,{'X-Local-Test-Identity':'bench'}),'account');
  await check(await dispatch('/__test/payment',{action:'paid',event:{provider:'benchmark',eventId:'paid1',digest:'a'.repeat(64),userId:'bench',credits:500,kind:'pack-paid'},now:new Date().toISOString()}),'credit');
  const output={runtime:'Miniflare workerd, local D1 emulation',workerBundleBytes:statSync('dist-premium-worker/worker.mjs').size,workloads:{}};
  for(const [name,input] of [['portfolio-batch-risk',portfolio],['trading-journal-advanced',journal]]) {
    const pure=[],requestWall=[],responseBytes=[];
    for(let i=0;i<30;i++) {
      const response=await check(await dispatch('/__test/engine-timing',{operation:name,input}),`${name} engine`);
      const result=await response.json(); pure.push(result.synchronousMs);responseBytes.push(result.responseBytes);
    }
    for(let i=0;i<4;i++) {
      const response=await check(await dispatch(`/v1/reports/${name}`,{requestId:`${name}-${i}`,input},{'X-Local-Test-Identity':'bench'}),`${name} report`);
      requestWall.push(Number(response.headers.get('X-Local-Worker-Wall-Ms')));
    }
    output.workloads[name]={engineSynchronous:stats(pure),fullRequestWall:stats(requestWall),responseBytes:Math.max(...responseBytes)};
  }
  const d1=[];
  for(let i=0;i<30;i++) {
    const start=performance.now();
    const response=await check(await dispatch('/__test/sql',{sql:'SELECT 1 AS n',mode:'all'}),'D1 query');
    const result=await response.json();
    d1.push({clientWall:performance.now()-start,reportedDuration:result.meta?.duration??null});
  }
  output.d1={simpleQueryClientWall:stats(d1.map(x=>x.clientWall)),reportedDurationMs:d1.every(x=>typeof x.reportedDuration==='number')?stats(d1.map(x=>x.reportedDuration)):null,successfulReportStatementCountExcludingAuth:12};
  const report={requestId:'concurrent-1',input:journal};
  const concurrent=await Promise.all([dispatch('/v1/reports/trading-journal-advanced',report,{'X-Local-Test-Identity':'bench'}),dispatch('/v1/account',undefined,{'X-Local-Test-Identity':'bench'}),dispatch('/v1/ledger',undefined,{'X-Local-Test-Identity':'bench'})]);
  output.concurrentReportAndReads=concurrent.map(x=>x.status);
  output.nodeHarnessRssMiB=+(process.memoryUsage().rss/1048576).toFixed(2);
  output.workerdProcessRssMiB=workerdMemory().filter(x=>!initialWorkerdPids.has(x.pid)).map(x=>x.rssMiB);
  output.memoryScope='Host process RSS, not isolated Worker heap or per-request peak';
  console.log(JSON.stringify(output,null,2));
} finally {await mf.dispose();}
