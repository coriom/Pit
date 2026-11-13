import assert from 'node:assert/strict';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const compose=JSON.parse(raw);
const expectedImage=process.env.PIT_V2_EXPECTED_IMAGE;
assert.match(expectedImage??'',/^ghcr\.io\/coriom\/pit-rust-backend@sha256:[0-9a-f]{64}$/,'exact immutable V2 image required');
assert.deepEqual(Object.keys(compose.services).sort(),['pit-v2-api','pit-v2-db','pit-v2-migrate','pit-v2-worker']);
assert.deepEqual(Object.keys(compose.networks).sort(),['pit-v2-data','pit-v2-rpc']);
assert.equal(compose.networks['pit-v2-data'].internal,true);
assert.equal(compose.networks['pit-v2-rpc'].internal??false,false);
for(const [name,service] of Object.entries(compose.services)){
  assert.equal(service.privileged??false,false,`${name} privileged`);
  assert.equal(service.ports?.length??0,0,`${name} ports`);
  assert.equal(service.network_mode??'', '',`${name} network mode`);
  const traefik=service.labels?.['traefik.enable']??service.labels?.find?.(x=>x==='traefik.enable=false')?.split('=')[1];
  assert.equal(String(traefik),'false',`${name} Traefik`);
  assert(!JSON.stringify(service).includes('/var/run/docker.sock'),`${name} Docker socket`);
  assert(!JSON.stringify(service.labels).includes('traefik.http.routers'),`${name} route`);
  const networks=Object.keys(service.networks||{}).sort();
  assert.deepEqual(networks,name==='pit-v2-db'||name==='pit-v2-migrate'?['pit-v2-data']:['pit-v2-data','pit-v2-rpc'],`${name} networks`);
  if(name!=='pit-v2-db')assert.equal(service.image,expectedImage,`${name} image`);
}
assert.equal(compose.services['pit-v2-api'].environment.PIT_NFT_FETCH_ENABLED,'0');
assert.equal(compose.services['pit-v2-worker'].environment.PIT_NFT_FETCH_ENABLED,'0');
assert.deepEqual(Object.keys(compose.volumes),['pit-v2-db-data']);
console.log('PIT_V2_CANDIDATE_ISOLATION_PASS source-compose-only');
