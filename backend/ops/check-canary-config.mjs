// Fail-closed check for both the source Compose render and any Coolify-generated render.
// Pipe JSON from `docker compose config --format json`; never print its secret values.
import { pathToFileURL } from 'node:url';

const apiImage='ghcr.io/coriom/pit-backend@sha256:b9e9c812e00b0a782c92579c22254941dddc81ca7b24fd49077acb7525486000';
const dbImage='postgres@sha256:43f9275df91e012c3da3d86bea5d7bb5e67a473296cc906c5f9e80b8176b1a37';
const expected={
  'pit-api':{image:apiImage,cpus:0.25,bytes:268435456,networks:['pit-data','pit-rpc']},
  'pit-worker':{image:apiImage,cpus:0.5,bytes:536870912,networks:['pit-data','pit-rpc']},
  'pit-migrate':{image:apiImage,cpus:0.25,bytes:201326592,networks:['pit-data']},
  'pit-db':{image:dbImage,cpus:0.5,bytes:536870912,networks:['pit-data']},
};
const fail=code=>{throw new Error(code);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=value=>Object.keys(value??{}).sort();
const labelsFor=service=>({...(service.labels??{}),...(service.deploy?.labels??{})});

export function validateCanaryConfig(config){
  if(config?.name!=='pit-crypto-backend-canary')fail('PROJECT_NAME');
  if(!same(keys(config.services),keys(expected)))fail('SERVICES');
  if(!same(keys(config.networks),['pit-data','pit-rpc']))fail('NETWORKS');
  if(config.networks['pit-data'].name!=='pit-crypto-backend-canary_pit-data'||config.networks['pit-data'].internal!==true||config.networks['pit-data'].external)fail('DATA_NETWORK');
  if(config.networks['pit-rpc'].name!=='pit-crypto-backend-canary_pit-rpc'||config.networks['pit-rpc'].internal===true||config.networks['pit-rpc'].external)fail('RPC_NETWORK');
  if(!same(keys(config.volumes),['pit-db-data'])||config.volumes['pit-db-data'].name!=='pit-crypto-backend-canary_pit-db-data'||config.volumes['pit-db-data'].external)fail('VOLUME');
  for(const [name,spec] of Object.entries(expected)){
    const service=config.services[name];
    if(service.image!==spec.image||service.platform&&service.platform!=='linux/amd64')fail('IMAGE_'+name);
    if(Number(service.cpus)!==spec.cpus||Number(service.mem_limit)!==spec.bytes||!Number.isInteger(Number(service.pids_limit))||Number(service.pids_limit)>100)fail('LIMIT_'+name);
    if(!same(keys(service.networks),spec.networks))fail('SERVICE_NETWORK_'+name);
    if((service.ports??[]).length||(service.expose??[]).length||service.network_mode||service.privileged||service.devices?.length||service.extra_hosts?.length||service.cap_add?.length||service.links?.length||service.external_links?.length||service.volumes_from?.length||service.pid||service.ipc||service.uts||service.userns_mode||service.cgroupns_mode||service.secrets?.length||service.configs?.length)fail('EXPOSURE_'+name);
    if(service.scale&&Number(service.scale)!==1||service.deploy?.replicas&&Number(service.deploy.replicas)!==1||service.deploy?.resources)fail('REPLICAS_OR_LIMIT_OVERRIDE_'+name);
    if(!service.labels||Array.isArray(service.labels)||service.deploy?.labels&&Array.isArray(service.deploy.labels))fail('LABEL_FORMAT_'+name);
    const labels=labelsFor(service);
    if(labels['traefik.enable']!=='false'||Object.keys(labels).some(x=>x.startsWith('traefik.')&&x!=='traefik.enable'))fail('TRAEFIK_'+name);
    if((name!=='pit-migrate'&&!service.healthcheck)||!service.security_opt?.includes('no-new-privileges:true'))fail('RUNTIME_'+name);
    if(name!=='pit-db'&&(!service.read_only||!service.cap_drop?.includes('ALL')||(service.volumes??[]).length))fail('FILESYSTEM_'+name);
  }
  const db=config.services['pit-db'];
  if(!same(db.volumes?.map(v=>[v.type,v.source,v.target]),[['volume','pit-db-data','/var/lib/postgresql/data']]))fail('DB_VOLUME');
  if(db.environment?.POSTGRES_DB!=='pit_crypto'||db.environment?.POSTGRES_USER!=='pit_api'||typeof db.environment?.POSTGRES_PASSWORD!=='string'||db.environment.POSTGRES_PASSWORD.length<32)fail('DB_IDENTITY');
  const api=config.services['pit-api'].environment,worker=config.services['pit-worker'].environment,migration=config.services['pit-migrate'].environment;
  if(api?.PIT_NFT_FETCH_ENABLED!=='0'||worker?.PIT_NFT_FETCH_ENABLED!=='0'||api?.PIT_EMAIL_ALLOWED_RECIPIENTS!=='')fail('DISABLED_CAPABILITIES');
  if(Object.keys(worker).some(k=>k.startsWith('PIT_SMTP_'))||Object.keys(api).some(k=>k.startsWith('PIT_SMTP_')))fail('SMTP');
  if(api?.PIT_ALLOWED_ORIGIN!=='http://127.0.0.1:8790'||api?.PIT_API_PORT!=='8789'||!(/^[a-f0-9]{64}$/.test(api?.PIT_BACKEND_INVITE_SHA256??''))||typeof api?.PIT_EDGE_HMAC_KEY!=='string'||api.PIT_EDGE_HMAC_KEY.length<32)fail('API_AUTH');
  let databaseUrl;
  try{databaseUrl=new URL(api.PIT_DATABASE_URL);}catch{fail('DATABASE_URL');}
  if(databaseUrl.protocol!=='postgres:'||databaseUrl.hostname!=='pit-db'||databaseUrl.port&&databaseUrl.port!=='5432'||databaseUrl.username!=='pit_api'||databaseUrl.pathname!=='/pit_crypto'||decodeURIComponent(databaseUrl.password)!==db.environment.POSTGRES_PASSWORD||worker?.PIT_DATABASE_URL!==api.PIT_DATABASE_URL||migration?.PIT_DATABASE_URL!==api.PIT_DATABASE_URL)fail('DATABASE_URL');
  return true;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    let input='';for await(const chunk of process.stdin)input+=chunk;
    validateCanaryConfig(JSON.parse(input));
    console.log('PIT_INTERNAL_CANARY_COMPOSE_PASS');
  }catch(error){
    const code=/^[A-Z0-9_]+$/.test(error?.message??'')?error.message:'INVALID_CONFIGURATION';
    console.error('PIT_INTERNAL_CANARY_COMPOSE_REJECTED',code);process.exitCode=1;
  }
}
