# PIT V2.5 Netcup finalization — observed execution

## Authorization and artifact identity

The operator authorized exactly `GO PIT V2 FINALIZATION 7d25cca79d8012761d85bd0bc4f3c17a939b6e2b6bd4e0f042c40f378254bc64`. The approved manifest is `deployments/netcup-v2-finalization-v25.json`, with that SHA-256. Its source commit is `f32f7b0f1331afd942df75e5656e96bf84da1638`; the Compose SHA-256 is `1412cf03b8f349d8ca5893149deeeb584d3b9ea1e6615f26e92bf6695de71bdc`. The runtime image remains `ghcr.io/coriom/pit-rust-backend@sha256:af396343aabd7e4988d1fd9bdb4308848c79702a0a47baaab73ab043325b9e3d`.

The privileged prechange gate finished with `PIT_V25_PRECHANGE_GATE_PASS`. It confirmed Coolify 4.7.5, the Raw Application `b8ohynbyx8dwsl5n46qdgjop`, the approved Git reference, the prior Compose, the single historical deployment job, all six private variable **names**, the existing V2 volume, host capacity, HTTPS trust and healthy neighbors. No secret value was printed.

## Single V2 redeployment

The approved Git reference was saved through the authenticated Coolify UI. One deployment was started: `ocolnyn4nxqqsse7m1wwhtjk`. The UI showed the exact source commit, one-shot migration exit, and the new API and worker starting. The subsequent privileged Coolify check confirmed two deployment jobs total, with both historical and new jobs `finished`, and stored application status `running:healthy`. No second deployment was started. The generated Compose SHA-256 is `621de06bc6014d347dc8f94b2a5c1ae649419869f04d432b2ce287230471ba52`; its effective configuration passed validation, including `pit-v2-migrate` `restart: "no"`.

The poststart Docker guard ended `PIT_V23_POSTSTART_ISOLATION_PASS`. The migration exited successfully. API, worker and PostgreSQL were running and Docker-healthy with zero observed OOM events. Their limits remained API 0.25 vCPU / 256 MiB, worker 0.5 vCPU / 512 MiB, PostgreSQL 0.5 vCPU / 512 MiB. V2 had no published port or Traefik route. The management network `b8ohynbyx8dwsl5n46qdgjop` contained only `coolify-proxy`. The proxy was absent from both V2 service networks. The V2 database was attached only to `pit-crypto-v2-canary_pit-v2-data`; the API and worker used that data network plus `pit-crypto-v2-canary_pit-v2-rpc`. Both old and current V1 volumes remained present. V1, DeOpt, HBI, Toolio and the shared proxy were Docker-healthy; DeOpt's historical restart count stayed at 12.

## Backup and recovery

Only PIT V2 resources were created: database role `pit_v2_backup`, root-owned scripts under `/opt/pit-v2-backup`, root-owned archives under `/var/backups/pit-v2`, and PIT V2 systemd service/timer/failure units. The dedicated role has read access, no password, and no superuser/create privileges. Archive directory mode was `0700`; archives and checksum sidecars are `0600`. The first `pg_dump -Fc` archive, `pit-v2-20261114T112318Z-763fd68a.dump`, was 13,658 bytes with SHA-256 `e0a407696e5b384a75af7ced4556dd0449b40b213878010a8e4fc319648af6b0`. `pg_restore --list`, checksum verification, and restoration into a distinct disposable V2 database passed. The disposable database was removed after its schema check; the live database was not restored over.

The daily `pit-v2-backup.timer` is enabled and active. At the final observation its next planned trigger was `2026-11-15 04:29:34 CET`, equivalent to `03:29:34 UTC` and within the configured 03:17 UTC plus 15-minute randomized window. `LastTriggerUSec` was empty: **the first scheduled run has not happened yet**. The service has an `OnFailure` logger, but no external alert was configured or tested. Retention is seven newest archives, at most 4 GiB total, with a 1 GiB per-archive limit. This backup is on the same VPS and does not cover VPS or SSD loss. Off-host encrypted storage and a verified off-host restore remain required before real user data.

The final hosted database check found six expected PIT tables, one recent worker heartbeat, and zero current jobs, monitors and alerts. Thus this hosted restore demonstrates archive integrity and schema recovery for the current disposable canary contents; representative record recovery was demonstrated separately in the local PostgreSQL 16 rehearsal, not from this empty hosted dataset.

## Final point-in-time observations

The API returned 403 without a gateway signature, and signed `/health` and `/ready` returned 200. Hosted NFT fetch remained disabled. DeOpt and HBI HTTPS health returned 200 with normal TLS verification. Host available memory was 6,103 MiB, root filesystem had 142 GiB free, and CPU pressure `full` was zero in the final sample. Docker stats at that instant reported API 0.00% CPU / 1.477 MiB accounted memory, worker 0.09% / 1.352 MiB, PostgreSQL 0.15% / 44.66 MiB. These are instantaneous Docker accounting figures, not peak RSS or sustained capacity proof.

No fresh blockchain job was submitted after this redeployment because the earlier synthetic invitation was removed after its authorized smoke test and changing the invitation would require another V2 configuration change. The V2 image is unchanged, and prior hosted read-only event, permission, distribution and export workflows passed; the V2.5 postchange checks establish health, readiness, auth boundary, migration, persistence, isolation and backup behavior. They do not establish a new postchange RPC job completion.

## Operational limits and recovery

The V2 canary remains internal. No public route, Cloudflare deployment, NFT fetch, payment, signing or external blockchain write was enabled. The Node.js V1 canary remains the independent rollback candidate. For a V2 isolation failure, stop only V2 API and worker, preserve all V1/V2 volumes, and investigate before another deployment. For a backup failure, inspect `systemctl status pit-v2-backup.service` and `journalctl -u pit-v2-backup.service`; disable only `pit-v2-backup.timer` if needed, preserving archives. Do not perform global Docker cleanup or manually edit Coolify status.
