"""Offline credential-pattern audit; prints only paths/rules/digests, never values.
Not a guarantee against encrypted, split, arbitrary-password or image-hidden secrets.
"""
import hashlib,json,pathlib,re,subprocess,os
root=pathlib.Path.cwd()
def git(*args):return subprocess.check_output(['git',*args])
patterns={
 'private-key-pem':r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
 'provider-token':r'\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{15,})\b',
 'credential-assignment':r'''(?im)(?:private[_-]?key|secret[_-]?key|api[_-]?(?:key|token)|access[_-]?token|client[_-]?secret|mnemonic|seed[_-]?phrase|wallet[_-]?(?:password|credential))\s*[=:]\s*["']([^"'\r\n]{8,})["']''',
 'rpc-credential-url':r'https?://[^\s"\x27]*(?:infura\.io/v3/|alchemy\.com/v2/)[A-Za-z0-9_-]{12,}|https?://[^\s/:"\x27]+:[^\s/@"\x27]+@[^\s"\x27]+',
 'credential-query':r'(?i)[?&](?:api[_-]?key|token|secret|password)=[A-Za-z0-9_%+-]{8,}',
 'hex256':r'(?<![0-9A-Za-z])(?:0x)?[0-9a-fA-F]{64}(?![0-9A-Za-z])',
 'seed-word-string':r'''["']((?:[a-z]+\s+){11,23}[a-z]+)["']''',
}
# Only public SHA-256 identities used by the committed schema/build evidence.
# Context alone never allowlists an alleged private key.
public_hashes={'d8eb339ed7acd7da3b68ef09fe5c1b01c4cc3258cb401a4f2ba8805e7a3b07d7','fa712013bdc5279ae30e617ae8e75c731b0bf446dcb09648bef8f2ffb1453216'}
triage=json.loads((root/"scripts/audit/public-patterns.json").read_text())
# Independently recompute public artifact hashes rather than trusting manifest fields.
manifest_path=root/'dist/build-manifest.json'
if manifest_path.exists():
 manifest=json.loads(manifest_path.read_text())
 entries=[]
 for name in sorted(manifest['files']):
  digest=hashlib.sha256((root/'dist'/name).read_bytes()).hexdigest()
  public_hashes.add(digest);entries.append([name,digest])
 public_hashes.add(hashlib.sha256(json.dumps(entries,separators=(',',':')).encode()).hexdigest())
candidates=[];hash_hits=0;binary=0;reviewed=[]

def scan(name,data):
 global hash_hits,binary
 if b'\0' in data:binary+=1;return
 text=data.decode('utf8',errors='replace')
 for rule,pattern in patterns.items():
  for m in re.finditer(pattern,text):
   value=m.group(0)
   if rule=='hex256':
    if value in public_hashes:hash_hits+=1;continue
   if rule=='seed-word-string' and len(m.group(1).split()) not in (12,15,18,21,24):continue
   fingerprint=hashlib.sha256(value.encode()).hexdigest()[:12]
   if fingerprint in triage:
    reviewed.append({'location':name,'fingerprint':fingerprint,'reason':triage[fingerprint]});continue
   candidates.append({'location':name,'line':text.count('\n',0,m.start())+1,'rule':rule,'fingerprint':hashlib.sha256(value.encode()).hexdigest()[:12]})
objects=git('cat-file','--batch-all-objects','--batch-check=%(objectname) %(objecttype)').decode().splitlines()
blobs=[line.split()[0] for line in objects if line.endswith(' blob')]
paths={}
for line in git('rev-list','--objects','--all').decode().splitlines():
 oid,_,path=line.partition(' ');paths[oid]=path
for oid in blobs:scan('git:'+oid+':'+paths.get(oid,'unreachable-or-metadata'),git('cat-file','blob',oid))
files=[]
def authored_files():
 for base,dirs,names in os.walk(root):
  dirs[:]=[d for d in dirs if d not in {'.git','node_modules','.astro','test-results','playwright-report'}]
  for name in names:yield pathlib.Path(base)/name
for p in authored_files():
 if not p.is_file() or p.is_symlink():continue
 rel=p.relative_to(root)
 if any(x in {'.git','node_modules','.astro','test-results','playwright-report'} for x in rel.parts):continue
 files.append(str(rel));scan('worktree:'+str(rel),p.read_bytes())
for name in ['.git/config','.git/logs/HEAD']:
 p=root/name
 if p.exists():scan('metadata:'+name,p.read_bytes())
env_history=[]
for rev in git('rev-list','--all').decode().splitlines():
 for p in git('ls-tree','-r','--name-only',rev).decode().splitlines():
  if pathlib.PurePosixPath(p).name.startswith('.env'):env_history.append((rev,p))
print(json.dumps({'scope':'all Git object-store blobs (reachable and unreachable), current authored files including ignored env files and dist; .git/config and HEAD reflog; third-party dependencies and caches excluded','commits':int(git('rev-list','--all','--count')),'git_blobs':len(blobs),'current_files':len(files),'binary_files_or_blobs_not_text_scanned':binary,'allowlisted_public_sha256_occurrences':hash_hits,'env_history':env_history,'current_env_files':[f for f in files if pathlib.Path(f).name.startswith('.env')],'reviewed_public_patterns':reviewed,'candidates':candidates,'limitations':'Pattern scan, not mathematical proof of absence. Binary screenshot pixels, encrypted/split secrets and arbitrary passwords cannot be exhaustively classified.'},indent=2))
raise SystemExit(1 if candidates else 0)
