"""Review the baseline scanner's historical artifact-hash matches without printing values."""
import hashlib,json,pathlib,re,subprocess
r=subprocess.run(['python3','scripts/audit/secrets.py'],capture_output=True,text=True)
assert r.returncode in (0,1),r.stderr
result=json.loads(r.stdout)
name='docs/audit/phase-f/build-1.manifest.json'
original=subprocess.check_output(['git','show','079abb7:'+name])
assert pathlib.Path(name).read_bytes()==original
blob=subprocess.check_output(['git','rev-parse','079abb7:'+name]).decode().strip()
fingerprints={hashlib.sha256(m.group().encode()).hexdigest()[:12] for m in re.finditer(r'(?<![0-9A-Za-z])(?:0x)?[0-9a-fA-F]{64}(?![0-9A-Za-z])',original.decode())}
unresolved=[c for c in result['candidates'] if not(c['rule']=='hex256' and c['fingerprint'] in fingerprints and c['location'] in {f'worktree:{name}',f'git:{blob}:{name}'})]
print('Underlying Phase F scanner exit:',r.returncode)
print('Available Git commits/blobs:',result['commits'],result['git_blobs'])
print('Current env files:',result['current_env_files'])
print('Historical Phase F manifest byte-identical to 079abb7: True')
print('Historical public artifact hash matches reviewed:',len(result['candidates'])-len(unresolved))
print('Unresolved credential candidates:',len(unresolved))
print('Limits: original pattern-scan exclusions and limitations still apply; no absence guarantee.')
raise SystemExit(1 if unresolved else 0)
