# PIT Netcup retirement preparation — 2026-11-25

Scope: PIT only. CORIMOX V31.7 was active during this inventory. No PIT or neighboring container was stopped, redeployed or removed. No Coolify, Docker network, volume, timer, proxy or firewall setting was changed. **Deletion and deactivation still require the operator's separate approval after the CORIMOX campaign.**

## Current source and runtime identities

- GitHub `coriom/Pit` `main`: `2f2cf4cffc908418ecfcc603277d26fa72a8387c` (`git ls-remote` checked). The original PIT worktree remains at `832b9892a321bde671a97c765581feb9c6d401fa` with five protected Phase CE files unchanged. This report was prepared in an isolated worktree.
- V1 Node image: `ghcr.io/coriom/pit-backend@sha256:b9e9c812e00b0a782c92579c22254941dddc81ca7b24fd49077acb7525486000` (434,763,317 Docker reported bytes).
- V2 Rust image: `ghcr.io/coriom/pit-rust-backend@sha256:af396343aabd7e4988d1fd9bdb4308848c79702a0a47baaab73ab043325b9e3d` (45,975,974 Docker reported bytes). Both exact registry manifests were readable on 2026-11-25. Those sizes are image sizes, **not** an estimate of uniquely reclaimable disk space.
- PostgreSQL image: `postgres@sha256:43f9275df91e012c3da3d86bea5d7bb5e67a473296cc906c5f9e80b8176b1a37`. Ownership is not proven exclusive to PIT; retain it unless an all-container image-user check proves otherwise.
- Source Compose SHA-256: V1 `backend/compose.canary.coolify-raw.yml` = `cb1c27b8ff48c11cde2ac77abcbd7e85cb8f02017684fd2e9aa53f494dc506f1`; V2 `backend-rust/compose.v2-candidate.yml` = `1412cf03b8f349d8ca5893149deeeb584d3b9ea1e6615f26e92bf6695de71bdc`.

## Exclusive PIT resources inventoried on Netcup

The SHA-verified, read-only inventory ran at `2026-11-25T06:39:47Z` on host `v2202611448349549977` with Docker 29.9.2. It identified 12 PIT containers and three Coolify resources:

| Coolify resource | UUID | State and attached database volume |
| --- | --- | --- |
| Old V1 Compose Service | `d47gm6kkdopzfurtmcd4lgpo` | Four old containers exited; `d47gm6kkdopzfurtmcd4lgpo_pit-db-data` retained. |
| V1 Raw Application | `c1fsywygziaxxyz2aeks8ktt` | API, worker and DB healthy; migration exited 0; `pit-crypto-backend-canary_pit-db-data`. |
| V2 Raw Application | `b8ohynbyx8dwsl5n46qdgjop` | API, worker and DB healthy; migration exited 0; `pit-crypto-v2-canary_pit-v2-db-data`. |

All PIT containers had no host port and no Traefik router. V1/V2 application networks were separate: `pit-crypto-backend-canary_pit-data` and `_pit-rpc`, `pit-crypto-v2-canary_pit-v2-data` and `_pit-v2-rpc`. The two data networks were Docker `internal`. The old Service still had empty `_pit-data` and `_pit-rpc` networks. The two Raw Application management networks, `c1fsywygziaxxyz2aeks8ktt` and `b8ohynbyx8dwsl5n46qdgjop`, contained **the shared `coolify-proxy`**. They must not be removed or detached while other services are being validated. The proxy was outside both PIT data and RPC networks.

PIT-only host paths included `/opt/pit-v2-backup`, `/var/backups/pit-v2`, `/home/deoptops/.config/pit-canary-v14`, `pit-v25`, `pit-v26`, `pit-v23-canary`, the two Coolify Application deployment directories under `/data/coolify/applications/`, and three `pit-v2-backup*` systemd units. The V2 backup timer was enabled and active; its latest trigger was 2026-11-25 03:26:45 UTC and service result was success. Seven local V2 dump archives were present; the newest was `pit-v2-20261125T032645Z-927c5fbb.dump`, 13,658 bytes, SHA-256 `9f050a999987c5a50eff41aa80040f94854ea496900b2d6c5033eeed7ca29ec4`, with matching sidecar. `/etc/pit-v2-offsite` and `pit-v2-offsite.service` were absent. No root cron entry matched PIT. Current Coolify autodeploy and preview settings were not re-read in this inventory; the earlier deployment gates reported them disabled. Recheck their actual values before cleanup.

The two PIT GitHub image workflows are `workflow_dispatch` only in the current source and do not deploy on a push. Docker healthchecks and the Coolify Application status are the observed runtime monitoring mechanisms; no separate PIT watchdog was inventoried. Current Coolify autodeploy and preview settings remain a cleanup-time verification gate.

The generated Coolify `.env` files were mode `0644` inside Application directories mode `0755`. A later `namei -l` check showed `/data/coolify/applications` is mode `0700` (UID 9999), so the unprivileged SSH account cannot traverse to those files. Their contents were **not printed**. Rotate PIT secrets for CORIMOX redeployment after an approved migration; do not copy them into Git.

## Preservation completed outside Netcup

One PIT-only preservation bundle was encrypted with `age` recipient `age1degj2m0cc2spmswztv5ks7h3lqc7kwmjnh0j354mxqgzhhenrshsu3pn47` (recipient SHA-256 `38491e09ea047c92227a1d87583a8a72534b01225394f374f2caa8d7fe358830`). The private identity remained on WSL at `~/.config/pit-recovery/identity.agekey`; it was never copied to Netcup, Git or this report. The bundle contains fresh V1 and V2 `pg_dump -Fc` snapshots, a raw copy of the stopped old PostgreSQL volume, generated Coolify Compose and `.env` files, PIT staging directories, the V2 local backup files and PIT backup units. Only the encrypted `.age` output was stored persistently by the preparation script.

- VPS staging copy: `/home/deoptops/.config/pit-cleanup-prep/pit-netcup-preservation-20261125T064735Z.tar.age`.
- Independent WSL copy: `~/.config/pit-recovery/pit-netcup-preservation-20261125T064735Z.tar.age`, mode `0600`.
- Encrypted size: **51,038,568 bytes**; SHA-256 `b5a7f2923bd487765407df2ef9d9ee92bc7a2a463ccc685c6f15270f50c53c6a` on both ends.
- WSL decryption, tar structure, recipient, V1/V2 dump checksums and old-volume PostgreSQL 16 control file: PASS.
- Distinct disposable WSL PostgreSQL 16 restores: V1 six PIT tables and zero jobs, V2 six PIT tables and zero jobs: PASS. The old stopped volume snapshot also started as a disposable PostgreSQL 16 cluster on WSL after supplying its `en_US.utf8` locale locally; six PIT tables were readable. Only the disposable copy was changed; the Netcup volume stayed stopped and unchanged.

This is an off-VPS recovery copy and a proven local restore. The private identity and encrypted archive currently share the same WSL machine; a second protected copy on independent media has **not** been evidenced. There is no verified PIT R2/offsite service. Preserve the WSL files and make an independent second copy before irreversible volume deletion if stronger disaster recovery is required. Never publish the private identity, archive or plaintext database contents.

## Shared resources and safety boundary

`coolify`, `coolify-proxy`, HBI Web, Toolio Commerce and DeOpt backend were Docker healthy at inventory time. Six CORIMOX control-plane containers were observed by name and were not touched. Shared Coolify database, proxy, certificates, host firewall, Docker daemon and PostgreSQL image remain outside the deletion scope. No PIT-only resource was reclaimed in this preparation, so measured freed space is **0 bytes**. Available host RAM was 5,874 MiB and root disk available was 141 GiB at inventory time.

A later normal-trust HTTPS check returned HBI `/hbi/api/health` 200, PIT public `/pit/api/v1/health` 503 (expected private canary), and `/health` 502 in four bounded observations. DeOpt's container was Docker healthy in the earlier inventory, but this later HTTPS discrepancy is unresolved. Do not attribute it to the read-only PIT dumps without evidence. The CORIMOX campaign and the 502 response prevent any assertion that all neighbors are presently healthy or unaffected. Do not alter DeOpt or the shared proxy under a PIT cleanup authorization.

## Approved-action boundary for the next session

Preparation is complete. **No cleanup execution is approved while CORIMOX V31.7 is active.** After that campaign and a separate exact PIT cleanup authorization:

1. Reverify this encrypted bundle and local restore, CORIMOX status, neighbor HTTPS/Docker health, three volume identities, the two GHCR digests and actual Coolify autodeploy/preview settings.
2. Disable only PIT application autodeploy/preview mechanisms if still enabled. Stop only the three PIT resources through Coolify; disable only `pit-v2-backup.timer` after the V2 database is quiesced. Preserve volumes until the independently accessible backup is reconfirmed.
3. Remove only the three identified PIT Coolify resources and their 12 PIT containers. Review Coolify's proxy management-network detach effects before applying; never restart the shared proxy or change neighbor networks.
4. Remove only proven-exclusive PIT networks, the three named PIT volumes and PIT-only staging/backup paths after the corresponding data checks. Never use global Docker cleanup. Remove Node/Rust image references only after proving no non-PIT users; retain the shared/uncertain PostgreSQL image.
5. Recheck CORIMOX and every neighbor, PIT absence, archive accessibility and disk/RAM before/after. Record actual released bytes; Docker image sizes are not a reliable freed-space estimate.

CORIMOX redeployment still needs a dedicated application manifest, separate restored PostgreSQL volume, PIT-only secrets supplied through CORIMOX, private data/RPC networks, no public routes, hosted NFT fetch disabled, and a separate authorization. Keep the published source, image digests, this encrypted archive and the decryption identity until independent CORIMOX recovery is demonstrated.

**READY_FOR_CLEANUP: preparation complete; execution NO_GO pending explicit approval and CORIMOX campaign completion.**
