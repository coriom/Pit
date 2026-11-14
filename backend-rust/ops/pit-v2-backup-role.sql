-- Run only inside the dedicated PIT V2 PostgreSQL container after authorization.
-- Local Unix-socket access is required; no password is stored in this file.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pit_v2_backup') THEN
    CREATE ROLE pit_v2_backup LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END $$;
ALTER ROLE pit_v2_backup LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT CONNECT ON DATABASE pit_crypto_v2 TO pit_v2_backup;
GRANT pg_read_all_data TO pit_v2_backup WITH INHERIT TRUE;
