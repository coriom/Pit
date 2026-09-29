"""Capture exact command stdout/stderr and exit status; no shell interpretation."""
import pathlib, subprocess, sys, shlex
out=pathlib.Path(sys.argv[1]); command=sys.argv[2:]
r=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
out.write_bytes(('$ '+shlex.join(command)+'\n').encode()+r.stdout+f'\n[exit_code={r.returncode}]\n'.encode())
print(f'{out}: exit_code={r.returncode}, output_bytes={len(r.stdout)}')
sys.exit(r.returncode)
