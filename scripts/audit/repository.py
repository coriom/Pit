import subprocess,hashlib,pathlib

def run(*cmd):
 print('$ '+' '.join(cmd),flush=True)
 subprocess.run(cmd,check=True)
run('git','status','--short')
run('git','log','--oneline','-8')
run('git','rev-parse','HEAD')
for rev in ['4a3084f','b7fb676','3bf7b19','a3d367d','c65a14e']:
 run('git','merge-base','--is-ancestor',rev,'HEAD')
 print(rev+': REACHABLE',flush=True)
run('node','--version');run('pnpm','--version')
a=pathlib.Path('schemas/events.v1.json');b=pathlib.Path('/home/corio/TAXLOT/schemas/events.v1.json')
for p in [a,b]:print(str(p)+': '+hashlib.sha256(p.read_bytes()).hexdigest(),flush=True)
assert a.read_bytes()==b.read_bytes()
print('Taxlot schemas byte-identical: true',flush=True)
run('git','-C','/home/corio/TAXLOT','rev-parse','HEAD')
