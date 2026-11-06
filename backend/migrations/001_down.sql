-- Manual rollback on a disposable/restored PIT database only. Back up before applying.
BEGIN;
DROP TABLE IF EXISTS pit_deliveries;
DROP TABLE IF EXISTS pit_alerts;
DROP TABLE IF EXISTS pit_monitors;
DROP TABLE IF EXISTS pit_jobs;
DROP TABLE IF EXISTS pit_worker_heartbeat;
COMMIT;
