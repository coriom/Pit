import { createPool } from './db.mjs';

const pool = createPool();
try {
  const { rows } = await pool.query(
    `SELECT last_seen > now() - interval '2 minutes' AS live
       FROM pit_worker_heartbeat WHERE singleton = true`,
  );
  if (!rows[0]?.live) process.exitCode = 1;
} catch {
  process.exitCode = 1;
} finally {
  await pool.end();
}
