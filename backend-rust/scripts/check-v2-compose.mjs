import {readFileSync} from 'node:fs';

const expectedImage=process.env.PIT_V2_EXPECTED_IMAGE;
if(!expectedImage)throw Error('EXPECTED_IMAGE_REQUIRED');
const value=JSON.parse(readFileSync(0,'utf8'));
const services=value.services??{};
const expected=['pit-v2-api','pit-v2-db','pit-v2-migrate','pit-v2-worker'];
if(JSON.stringify(Object.keys(services).sort())!==JSON.stringify(expected))throw Error('SERVICE_SET_CHANGED');
const networks=Object.keys(value.networks??{}).sort();
if(JSON.stringify(networks)!==JSON.stringify(['pit-v2-data','pit-v2-rpc']))throw Error('NETWORK_SET_CHANGED');
if(!value.networks['pit-v2-data'].name?.endsWith('_pit-v2-data')||!value.networks['pit-v2-rpc'].name?.endsWith('_pit-v2-rpc'))throw Error('NETWORK_IDENTITY_CHANGED');
if(JSON.stringify(Object.keys(value.volumes??{}))!==JSON.stringify(['pit-v2-db-data'])||!value.volumes['pit-v2-db-data'].name?.endsWith('_pit-v2-db-data'))throw Error('VOLUME_SET_CHANGED');
const expectedNetworks={
  'pit-v2-api':['pit-v2-data','pit-v2-rpc'],
  'pit-v2-worker':['pit-v2-data','pit-v2-rpc'],
  'pit-v2-migrate':['pit-v2-data'],
  'pit-v2-db':['pit-v2-data'],
};
const expectedMemory={'pit-v2-api':268435456,'pit-v2-worker':536870912,'pit-v2-db':536870912,'pit-v2-migrate':201326592};
const expectedCpu={'pit-v2-api':0.25,'pit-v2-worker':0.5,'pit-v2-db':0.5,'pit-v2-migrate':0.25};
for(const name of expected){
  const service=services[name];
  const labels=service.labels??{};
  if(labels['traefik.enable']!=='false'||Object.keys(labels).some(key=>key.startsWith('traefik.')&&key!=='traefik.enable'))throw Error('TRAEFIK_EXPOSURE');
  if(service.ports?.length||service.expose?.length||service.privileged||service.network_mode||service.extra_hosts?.length)throw Error('PUBLIC_OR_HOST_EXPOSURE');
  if(service.cpus!==expectedCpu[name]||!/^\d+$/.test(String(service.mem_limit))||Number(service.mem_limit)!==expectedMemory[name])throw Error('RESOURCE_LIMIT_CHANGED');
  if(JSON.stringify(Object.keys(service.networks??{}).sort())!==JSON.stringify(expectedNetworks[name].sort()))throw Error('NETWORK_MEMBERSHIP_CHANGED');
  if(name!=='pit-v2-db'&&service.image!==expectedImage)throw Error('IMAGE_CHANGED');
  if(name!=='pit-v2-db'&&service.environment?.PIT_NFT_FETCH_ENABLED!=='0'&&name!=='pit-v2-migrate')throw Error('HOSTED_NFT_ENABLED');
  for(const mount of service.volumes??[]){if(mount.type!=='volume'||mount.source!=='pit-v2-db-data'||name!=='pit-v2-db')throw Error('MOUNT_CHANGED')}
}
if(value.networks['pit-v2-data'].internal!==true)throw Error('DATA_NETWORK_NOT_INTERNAL');
console.log('PIT_V2_COMPOSE_ISOLATION_PASS');
