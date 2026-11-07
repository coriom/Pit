import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPool } from './db.mjs';
const pool=createPool();
try{
  for(const name of ['001_init.sql','002_edge_nonces.sql']){
    const file=fileURLToPath(new URL(`../migrations/${name}`,import.meta.url));
    await pool.query(await readFile(file,'utf8'));
    console.log(`PIT migration ${name} applied`);
  }
}finally{await pool.end();}
