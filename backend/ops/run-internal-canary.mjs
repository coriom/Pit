// After an exact canary deployment approval, run this on the VPS with a PIT-only
// invite file (mode 0600). It touches only the four containers in this project.
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const project='pit-crypto-backend-canary';
const expectedNames=['pit-api','pit-db','pit-migrate','pit-worker'];
const image='ghcr.io/coriom/pit-backend@sha256:b9e9c812e00b0a782c92579c22254941dddc81ca7b24fd49077acb7525486000';
const dbImage='postgres@sha256:43f9275df91e012c3da3d86bea5d7bb5e67a473296cc906c5f9e80b8176b1a37';
const limits={'pit-api':[250000000,268435456,['pit-data','pit-rpc']], 'pit-worker':[500000000,536870912,['pit-data','pit-rpc']], 'pit-db':[500000000,536870912,['pit-data']], 'pit-migrate':[250000000,201326592,['pit-data']]};
const fail=code=>{throw new Error(code);};
const sh=(args,options={})=>execFileSync('docker',args,{encoding:'utf8',maxBuffer:1024*1024,...options});
const labels=service=>service.Config.Labels??{};
const sorted=value=>[...value].sort();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

function inspectProject(){
  const ids=sh(['ps','-aq','--filter',`label=com.docker.compose.project=${project}`]).trim().split(/\s+/).filter(Boolean);
  if(ids.length!==4)fail('CONTAINER_COUNT');
  const entries=JSON.parse(sh(['inspect',...ids]));
  const byService=new Map();
  for(const container of entries){
    const service=labels(container)['com.docker.compose.service'];
    if(labels(container)['com.docker.compose.project']!==project||byService.has(service)||!expectedNames.includes(service))fail('SERVICE_IDENTITY');
    byService.set(service,container);
  }
  if(!same(sorted(byService.keys()),sorted(expectedNames)))fail('SERVICES');
  for(const [name,container] of byService){
    const [nanoCpus,memory,networks]=limits[name];
    const config=container.Config,host=container.HostConfig;
    if(config.Image!==(name==='pit-db'?dbImage:image))fail('IMAGE_'+name);
    if(host.NanoCpus!==nanoCpus||host.Memory!==memory)fail('LIMIT_'+name);
    if(host.PortBindings&&Object.keys(host.PortBindings).length||host.PublishAllPorts||Object.values(container.NetworkSettings.Ports??{}).some(x=>Array.isArray(x)&&x.length)||host.Privileged||host.NetworkMode==='host')fail('PUBLIC_EXPOSURE_'+name);
    if(!same(sorted(Object.keys(container.NetworkSettings.Networks??{})),networks.map(n=>`${project}_${n}`).sort()))fail('NETWORK_'+name);
    if(labels(container)['traefik.enable']!=='false'||Object.keys(labels(container)).some(x=>x.startsWith('traefik.')&&x!=='traefik.enable'))fail('TRAEFIK_'+name);
    if(name!=='pit-db'&&(!host.ReadonlyRootfs||!host.CapDrop?.includes('ALL')))fail('FILESYSTEM_'+name);
    if(name==='pit-migrate'){
      if(container.State.Status!=='exited'||container.State.ExitCode!==0)fail('MIGRATION');
    }else if(container.State.Status!=='running'||container.State.Health?.Status!=='healthy')fail('HEALTH_'+name);
    const env=config.Env??[];
    if(['pit-api','pit-worker'].includes(name)&&(!env.includes('PIT_NFT_FETCH_ENABLED=0')||env.some(x=>x.startsWith('PIT_SMTP_'))))fail('DISABLED_FEATURES_'+name);
    if(name==='pit-api'&&(!env.includes('PIT_ALLOWED_ORIGIN=http://127.0.0.1:8790')||!env.includes('PIT_EMAIL_ALLOWED_RECIPIENTS=')))fail('API_CONFIGURATION');
  }
  for(const [name,internal] of [['pit-data',true],['pit-rpc',false]]){
    const network=JSON.parse(sh(['network','inspect',`${project}_${name}`]))[0];
    if(network?.Internal!==internal||network.Labels?.['com.docker.compose.project']!==project)fail('NETWORK_POLICY_'+name);
    if(Object.keys(network.Containers??{}).some(id=>!entries.some(container=>container.Id===id)))fail('FOREIGN_NETWORK_MEMBER_'+name);
  }
  return byService;
}

function assertCgroups(container,name){
  const cpu=sh(['exec',container.Id,'cat','/sys/fs/cgroup/cpu.max']).trim();
  const memory=sh(['exec',container.Id,'cat','/sys/fs/cgroup/memory.max']).trim();
  const [nanoCpus,expectedMemory]=limits[name];
  const [quota,period]=cpu.split(/\s+/).map(Number);
  if(!Number.isFinite(quota)||!Number.isFinite(period)||Math.abs(quota/period-nanoCpus/1e9)>0.001||Number(memory)!==expectedMemory)fail('CGROUP_'+name);
}

function phase(apiId,code,name,input=''){
  try{
    const output=sh(['exec','-i',apiId,'node','--input-type=module','-e',code,name],{input,timeout:120000});
    process.stdout.write(output);
  }catch(error){
    const result=String(error.stderr??'').trim().slice(0,200);
    if(result)console.error(result);
    fail(`SMOKE_${name}`);
  }
}

try{
  const invitePath=process.argv[2];
  if(!invitePath)fail('INVITE_FILE_REQUIRED');
  const info=lstatSync(invitePath);
  if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o777)!==0o600||info.uid!==process.getuid())fail('INVITE_FILE_PERMISSIONS');
  const invite=readFileSync(invitePath,'utf8').trim();
  if(invite.length<32)fail('INVITE_TOO_SHORT');
  const containers=inspectProject();
  for(const name of ['pit-api','pit-worker','pit-db'])assertCgroups(containers.get(name),name);
  const code=readFileSync(fileURLToPath(new URL('./internal-canary-smoke.mjs',import.meta.url)),'utf8');
  phase(containers.get('pit-api').Id,code,'baseline');
  let stopped=false;
  try{
    sh(['stop','--time','30',containers.get('pit-worker').Id]);stopped=true;
    phase(containers.get('pit-api').Id,code,'pre',invite+'\n');
  }finally{
    if(stopped)sh(['start',containers.get('pit-worker').Id]);
  }
  let workerHealthy=false;
  for(let attempt=0;attempt<30;attempt++){
    const worker=JSON.parse(sh(['inspect',containers.get('pit-worker').Id]))[0];
    if(worker.State.Health?.Status==='healthy'){workerHealthy=true;break;}
    await sleep(2000);
  }
  if(!workerHealthy)fail('WORKER_RESTART');
  phase(containers.get('pit-api').Id,code,'post');
  console.log('PIT_INTERNAL_CANARY_SMOKE_PASS');
}catch(error){console.error('PIT_INTERNAL_CANARY_SMOKE_REJECTED',error.message);process.exitCode=1;}
