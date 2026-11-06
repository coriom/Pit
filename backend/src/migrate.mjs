import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPool } from './db.mjs';
const pool=createPool();
try{const file=fileURLToPath(new URL('../migrations/001_init.sql',import.meta.url));await pool.query(await readFile(file,'utf8'));console.log('PIT migration 001 applied');}finally{await pool.end();}
