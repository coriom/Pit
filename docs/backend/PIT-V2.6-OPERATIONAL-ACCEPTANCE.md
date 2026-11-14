# PIT V2.6 — operational acceptance snapshot

## Verified internal state

At `2026-11-14T11:41:16Z`, the bounded, privileged read-only check finished `PIT_V26_READONLY_PASS`. Coolify 4.7.5 stored `running:healthy` for the V2 Raw Application `b8ohynbyx8dwsl5n46qdgjop`; both deployment records were `finished`. The Rust image remained `ghcr.io/coriom/pit-rust-backend@sha256:af396343aabd7e4988d1fd9bdb4308848c79702a0a47baaab73ab043325b9e3d`.

API, worker and PostgreSQL were running and Docker-healthy, with zero observed restarts or OOM flags. Their effective limits remained 0.25 vCPU / 256 MiB, 0.5 vCPU / 512 MiB and 0.5 vCPU / 512 MiB, respectively. The migration container was exited with code 0. No PIT V2 host port or Traefik route existed; hosted NFT fetching was disabled. The Coolify management network contained only `coolify-proxy`, which was absent from both V2 service networks. V2 PostgreSQL belonged only to the internal data network. The old and current V1 volumes remained present. The V1 API, worker and database, DeOpt, HBI, Toolio and Traefik were healthy; DeOpt's earlier restart count of 12 had not increased. DeOpt and HBI HTTPS health returned 200 with normal TLS verification. Available host RAM was 6,063 MiB and root disk free space 141 GiB. These are bounded observations, not continuous monitoring.

## Scheduled backup gate

`pit-v2-backup.timer` was enabled and active. Its next run was `2026-11-15 04:29:34 CET` (`03:29:34 UTC`), within the configured 03:17 UTC start plus 15-minute randomized delay. `LastTriggerUSec` was empty at the observation, so `SCHEDULED_BACKUP=PENDING`. The service showed `Result=success`, exit 0 and inactive, but this does **not** prove the timer has run. The PIT backup journal had zero success and failure entries. Do not trigger a manual backup as a substitute for this gate.

The one manual archive from V2.5, `pit-v2-20261114T112318Z-763fd68a.dump`, remained present at 13,658 bytes. Its SHA-256 was `e0a407696e5b384a75af7ced4556dd0449b40b213878010a8e4fc319648af6b0`. All archive checksums, root ownership and permissions, the custom-format PostgreSQL table of contents and the seven-archive/4 GiB retention bounds passed. The V2.5 disposable restore passed for this archive. The first real timer cycle must be checked after the trigger by confirming `LastTriggerUSec`, service exit 0, a newer PIT V2 archive and its checksum. Retention pruning cannot be demonstrated until more than seven valid archives exist; current storage is within policy.

## Off-VPS recovery gate

No PIT-specific external destination was configured in the checked VPS paths. `rclone` 1.60.1-DEV and GnuPG 2.4.7 are installed, but neither a PIT rclone remote nor an offsite recipient was found. The current archive directory is on the same VPS as PostgreSQL. **OFFSITE_BACKUP_AND_RESTORE=BLOCKED** until an operator designates a PIT-only, operator-controlled S3-compatible bucket and a GPG public recipient whose private key is kept outside the VPS. No bucket, credential or object was created by V2.6.

The proposed PIT-only configuration is:

- One root-owned rclone S3 remote file at `/etc/pit-v2-offsite/rclone.conf` (`0600`) with a PIT-only write/read identity restricted to one bucket/prefix. Neither its content nor credentials belong in Git, shell history or logs.
- One operator-verified GPG public recipient certificate at `/etc/pit-v2-offsite/recipient.asc`; record and pin its full fingerprint. The private decryption key stays on a separate trusted recovery machine.
- For each verified local `pit-v2-*.dump`, encrypt **before upload** to `pit-v2/YYYY/MM/<archive>.gpg`; upload the ciphertext and its SHA-256 sidecar with rclone. Download the ciphertext to recheck its hash. Set a 30-day lifecycle on only the PIT prefix, and record an object inventory after each run. Local plaintext remains under `/var/backups/pit-v2` with the existing seven-archive/4 GiB cap.
- On the separate recovery machine, download one encrypted copy, verify its SHA-256, decrypt using the offline private key to a `0600` temporary file, and restore into a disposable PostgreSQL 16 database. Verify PIT tables and representative records. Never restore over the live V2 database.

Endpoint, bucket, identity, recipient fingerprint, lifecycle and restore workstation remain unassigned. This is a configuration contract, not a deployed offsite system or a cost estimate. A separate PIT-only approval must bind these actual identities before changing the VPS or transferring data.

## Hosted Rust smoke gate

The Rust API requires the raw private invitation to match `PIT_BACKEND_INVITE_SHA256` in addition to HMAC gateway signing. The previous synthetic invitation was removed from the VPS after the earlier hosted test; the checked private staging directory contains no invitation file. The operator confirmed that the original raw value is unavailable. No raw invitation was sought in logs or recovered from hashes. Consequently no new API job was submitted in this V2.6 observation. Existing V2.5 evidence confirms unsigned `/health` is rejected, signed health/readiness pass and the worker heartbeat is recent; it does not replace the requested **post-redeployment** job lifecycle and RPC test.

`backend-rust/ops/pit-v2-hosted-smoke-v26.py` (SHA-256 `3fb2b1e23696dc338a3583eb023d9a299943bf25787cdbfc96ccca89a34901f5`) is a bounded PIT-only test that requires a matching invitation in `/home/deoptops/.config/pit-v26/invite-test-only` with owner `deoptops`, parent mode `0700` and file mode `0600`. Its missing-invitation gate was tested locally and stopped before Docker access or a network request. Before submitting a job it checks the invitation hash in memory, API identity, isolation, NFT disablement, signed health, unsigned denial, nonce replay and body integrity. It then submits one Base Sepolia event query for a single known block, waits at most 120 seconds, checks exact coverage and persisted completion, validates JSON/CSV exports, deletes the synthetic job and checks the worker heartbeat. It prints neither the invitation nor HMAC key. The hosted test itself is **not yet executed**. Installing a newly generated invitation hash in Coolify requires the separately reviewed PIT V2 change specified in the V2.6 synthetic-smoke candidate manifest.

The non-authorized candidate is `deployments/netcup-v2-synthetic-smoke-v26-candidate.json`, SHA-256 `9bebfeb3834d07e150e8fe0819f0484c17cc9f15f1811a27012dd502df94627a`. It binds one PIT V2-only invitation-verifier rotation and one standard Coolify deployment, with the source, image and Compose unchanged. The new random token is deliberately late-bound: its raw value must stay outside Git, logs and this manifest. This candidate does not authorize any mutation until an explicit matching `GO PIT V2 SYNTHETIC SMOKE` is given. The existing V2 remains healthy meanwhile.

## Separate decisions and rollback

- **Internal Rust operation:** healthy and isolated at the observed time, with an active local backup timer; the requested post-redeployment job test and first scheduled backup remain outstanding.
- **Retire Node.js V1:** no. Keep its independent image, database, networks and volume until Rust job smoke, scheduled backup and independent offsite recovery are demonstrated, then review a PIT-only retirement plan. No automatic deletion or migration.
- **Private browser beta:** no. A DNS hostname, matching trusted TLS, private gateway/Cloudflare Access deployment and direct-origin denial tests are separate gates. This internal API has no route.
- **Public commercial use:** no. No real customer data, payment, signing, hosted NFT fetch or external email acceptance was granted here.

For an isolation or neighboring-service failure, stop only V2 API and worker, keep V1 and all volumes, and investigate before another Coolify deployment. For a backup failure, inspect only the PIT timer/service and archives; disable only `pit-v2-backup.timer` if necessary. Do not restart Traefik, alter DeOpt/HBI/Toolio or run global Docker cleanup.
