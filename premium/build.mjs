import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
mkdirSync('dist-premium-local', { recursive: true });
await build({ entryPoints: ['premium/reports.ts'], outfile: 'dist-premium-local/reports.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', sourcemap: false, minify: false, logLevel: 'warning' });
console.log('Premium server-only report bundle built in dist-premium-local/; no static Toolbox or Explorer import.');
