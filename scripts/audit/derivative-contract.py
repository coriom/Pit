import pathlib,subprocess,hashlib,json
root=pathlib.Path('/home/corio/TAXLOT')
def run(*cmd):
 print('$ '+' '.join(cmd),flush=True);subprocess.run(cmd,check=True)
run('git','rev-parse','HEAD');run('git','-C',str(root),'rev-parse','HEAD')
local=pathlib.Path('schemas/events.v1.json').read_bytes();upstream=(root/'schemas/events.v1.json').read_bytes();assert local==upstream
print('Exact schema byte equality: True; SHA256 '+hashlib.sha256(local).hexdigest())
schema=json.loads(local)['definitions']['EventV1']
print('Root: $ref #/definitions/EventV1; object additionalProperties='+str(schema['additionalProperties']))
for name,constraints in schema['properties'].items():print(json.dumps({'pointer':'#/definitions/EventV1/properties/'+name,'required':name in schema['required'],'constraints':constraints},sort_keys=True))
for name in ['src/importers/index.ts','src/domain/events.ts','src/tax/engine.ts','src/tax/scope.ts']:
 p=root/name;print('\nSOURCE '+str(p)+' SHA256 '+hashlib.sha256(p.read_bytes()).hexdigest())
 for n,line in enumerate(p.read_text().splitlines(),1):print(f'{n}: {line}')
print('\nProtected files compared against accepted Phase H:')
run('git','diff','--exit-code','a5830a1','--','src/lib/config.ts','src/lib/cow.ts','src/lib/hyperliquid.ts','src/lib/storage-origins.ts','src/lib/storage-policy.ts','schemas/events.v1.json','src/pages/legal.astro','scripts/deploy.sh')
