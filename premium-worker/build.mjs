import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
mkdirSync('dist-premium-worker',{recursive:true});
mkdirSync('dist-premium-worker-test',{recursive:true});
for (const [entry,outfile] of [['premium-worker/worker.ts','dist-premium-worker/worker.mjs'],['premium-worker/test-entry.ts','dist-premium-worker-test/worker.mjs']]) {
  const result=await build({entryPoints:[entry],outfile,bundle:true,platform:'node',format:'esm',target:'es2022',conditions:['workerd','browser'],sourcemap:false,metafile:true,logLevel:'warning'});
  const imports=Object.values(result.metafile.outputs).flatMap(item=>item.imports);
  const supported=new Set(['node:async_hooks','node:crypto','node:fs','node:fs/promises','node:os','node:path']);
  if (imports.some(item=>item.external && !supported.has(item.path))) throw new Error(`Worker bundle contains a forbidden external import: ${imports.filter(item=>item.external).map(x=>x.path).join(', ')}`);
}
// Better Auth's general SQLite adapter emits a variable import of node:sqlite.
// This Worker uses D1 exclusively; remove that unreachable Node-only probe so
// workerd's static module scanner can verify the production bundle. Fail on SDK drift.
const nodeProbe=/await import\(\s*\/\* @vite-ignore \*\/\s*\/\* webpackIgnore: true \*\/\s*nodeSqlite\s*\)/g;
for(const path of ['dist-premium-worker/worker.mjs','dist-premium-worker-test/worker.mjs']) {
  let source=readFileSync(path,'utf8');
  if ([...source.matchAll(nodeProbe)].length!==1) throw new Error('Pinned Better Auth Node-SQLite probe changed; review Worker build.');
  source=source.replace(nodeProbe,"Promise.reject({code:'ERR_UNKNOWN_BUILTIN_MODULE'})");
  writeFileSync(path,source);
}
const prod=readFileSync('dist-premium-worker/worker.mjs','utf8');
if (/X-Local-Test-Identity|__test\/(sql|payment)|local-fixture|whsec_local|premium\/server/.test(prod)) throw new Error('Fixture identity leaked into production Worker bundle.');
console.log('Premium Worker and separate nondeployable test Worker bundles built.');
