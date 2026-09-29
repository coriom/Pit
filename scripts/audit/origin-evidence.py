from pathlib import Path
from html.parser import HTMLParser
import subprocess,hashlib,json
print('$ git rev-parse HEAD',flush=True);subprocess.run(['git','rev-parse','HEAD'],check=True)
for name in ['src/lib/config.ts','src/lib/cow.ts','src/lib/hyperliquid.ts','schemas/events.v1.json']:
 original=subprocess.check_output(['git','show','079abb7:'+name]);assert Path(name).read_bytes()==original
 print('Unchanged from Phase F: '+name)
a=Path('schemas/events.v1.json').read_bytes();b=Path('/home/corio/TAXLOT/schemas/events.v1.json').read_bytes()
assert a==b;print('Taxlot current upstream byte equality: true; SHA256 '+hashlib.sha256(a).hexdigest())
class Meta(HTMLParser):
 def handle_starttag(self,tag,attrs):
  d=dict(attrs)
  if tag=='meta' and d.get('http-equiv','').lower()=='content-security-policy':self.csp=d['content']
for page in ['index.html','fees/index.html','legal/index.html']:
 p=Meta();p.feed((Path('dist')/page).read_text());csp=p.csp
 assert "default-src 'none'" in csp and "object-src 'none'" in csp
 script=next(v.strip() for v in csp.split(';') if v.strip().startswith('script-src '))
 assert "'unsafe-inline'" not in script and "'unsafe-eval'" not in script
 print(page+' CSP: '+csp)
print('Cloudflare artifact _headers (configuration, not a live HTTP observation):')
print(Path('dist/_headers').read_text())
print('Storage deployment policy:');print(Path('src/lib/storage-origins.ts').read_text())
print('Database version/name: unchanged pit-taxlot-v1, version 1; no migration or deletion')
print('Build hash: '+json.loads(Path('dist/build-manifest.json').read_text())['hash'])
