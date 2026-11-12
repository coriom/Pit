# PIT Backend V1.4 internal canary execution

Status: **FAILED security gate; all PIT containers stopped**. This record does not certify the canary.

## Approved artifacts

- Authorization: `GO PIT INTERNAL CANARY 295a3b1657c84bdf7f8ff5f1c10f719f57845503163b9580dbd96deafddf76ba`.
- Manifest SHA-256: `295a3b1657c84bdf7f8ff5f1c10f719f57845503163b9580dbd96deafddf76ba`.
- Source checkout and origin/main: `fb2af49a8ca2dbe2911c6fc56d718c1b84f9c991`.
- Approved Compose SHA-256: `7644907195bccac2cbf4764275175487eb533031f8b85cfd861364438481e2df`.
- With Coolify's predeployment **Preview Generated Compose** control selected, the browser automation captured the first Monaco model at `/tmp/pit-canary-deployable-v14.yml`, mode `0600`. Its SHA-256 was identical to the source Compose, and rendering those bytes with PIT-only private values passed `backend/ops/check-canary-config.mjs` (`PIT_INTERNAL_CANARY_COMPOSE_PASS`). The later runtime discrepancy shows this check did **not** prove the effective Coolify Compose project/network identity. The actual deployed configuration must be obtained and validated in a revised gate before any restart.
- Runtime image digest: `ghcr.io/coriom/pit-backend@sha256:b9e9c812e00b0a782c92579c22254941dddc81ca7b24fd49077acb7525486000`, independently readable from GHCR.

## Coolify resource

- Coolify version observed: `4.7.5`.
- Project `PIT Crypto Backend`: `gdzyjsit2cpznnv0kvisqnsk`.
- Environment `internal-canary`: `n34msfdthposcwlsy5hd0luj`.
- Compose Empty resource `pit-crypto-backend-canary`: `d47gm6kkdopzfurtmcd4lgpo`.
- The UI showed `Use the stack network only` and `No domains configured` before deployment.
- Four PIT-only environment variable names were imported. Two disposable secrets were rotated after a browser diagnostic inadvertently repeated their old values; no container had started at that point. No values are stored in this record.
- Coolify started PostgreSQL, API and worker as `Running (healthy)`; the one-shot migration showed `Exited`. This is UI evidence only.

## Host and neighbor observations

- Before start: 6,225 MiB RAM available; 142 GiB disk free; load average 0.34/0.36/0.36.
- After start: 6,135 MiB RAM available; 141 GiB disk free; load average 0.70/0.78/0.65; CPU full pressure 0.
- DeOpt and HBI HTTPS health endpoints returned HTTP 200 with normal TLS verification after start.
- External port 8789 refused connections. `/pit/api/v1/health` and an unrelated nonexistent path both returned the same shared-proxy 503 response (3,492 bytes); this is consistent with no PIT route, but Docker router labels still require inspection.

## Verification failure

The approved `run-internal-canary.mjs` first locates containers by `com.docker.compose.project=pit-crypto-backend-canary`. The privileged grouped verification found no matching API container and stopped before Docker inspection and smoke tests (`must specify at least one container source`). Its fallback stop used the same unmatched project label, so it did not stop PIT. Coolify still showed PIT API and worker running afterward.

A second, PIT-image-scoped privileged inspection established the actual runtime project label as `d47gm6kkdopzfurtmcd4lgpo`, the Coolify service UUID. Coolify also attached each PIT container to an additional `d47gm6kkdopzfurtmcd4lgpo` network, alongside the PIT data/RPC networks with UUID-derived names. The API, worker, database and migration had the approved images and CPU/RAM limits, no published ports, and `traefik.enable=false` with no other Traefik labels. The operator's PIT-scoped script then stopped the API and worker.

The final privileged network inspection found the additional `d47gm6kkdopzfurtmcd4lgpo` network was **not internal** and had both `coolify-proxy` and `pit-db-d47gm6kkdopzfurtmcd4lgpo` as members. The approved `pit-data` network was internal and had only the PIT database as a remaining active member; `pit-rpc` had no active members. The proxy was not on either PIT-declared network, but its membership in Coolify's extra network violates the manifest's no-shared-proxy attachment and PIT database isolation. The operator then stopped the PIT database, preserving the PIT volume. Coolify subsequently displayed all four PIT components as `Exited`.

The runtime project identity and network attachments differ materially from the previewed `name:` and approved manifest. The approved runner's fail-closed check therefore prevented all functional smoke tests. The API and worker were stopped before any job was submitted. Do not reinterpret the failure as a passing canary or silently change approved artifacts. No customer traffic, payments, signing or blockchain writes were sent.

## Next gate

The existing Coolify Service cannot be restarted under the V1.4 authorization. The Service remains configured but stopped; PIT-only volumes and networks remain for evidence review. A new deployment design must avoid Coolify's automatic proxy attachment to the resource network. A directly managed Docker Compose stack is a possible minimal alternative, but requires a new, explicit hash-bound authorization and its own pre-start validation. Browser-accessible beta remains a separate, unauthorised milestone.
