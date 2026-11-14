# PIT V2.4 — Coolify health reconciliation

## Evidence boundary

The deployed V2 Raw Application is `b8ohynbyx8dwsl5n46qdgjop` and its Compose project is `pit-crypto-v2-canary`. The approved V2 image and deployed Compose are unchanged. The previous hosted post-start inspection recorded API, worker and PostgreSQL as Docker `running/healthy`, the migration container as `exited` with exit code 0, and Coolify as `degraded:unhealthy`. All PIT data/RPC networks excluded `coolify-proxy`; no PIT ports or routes were public. These are historical observations from the V2.3 deployment, not a fresh privileged Docker snapshot.

The official Coolify 4.7.5 source (tag commit `378ce3735c4522ebb6b68e93b909b0511f278763`) explains this exact status: `PushServerUpdateJob::aggregateMultiContainerStatuses` collects Compose service states and calls `getExcludedContainersFromDockerCompose`. The exclusion helper accepts `exclude_from_hc: true` or **explicit** `restart: "no"`. `ContainerStatusAggregator::resolveStatus` returns `degraded:unhealthy` when its relevant services contain both running and exited containers. The deployed V2 source Compose had neither exclusion on `pit-v2-migrate`; Docker's implicit no-restart default does not satisfy Coolify's explicit-string check. The one-shot migration is therefore the strongly supported cause. A current read-only inspection of Coolify's stored raw Compose and Docker labels is still required to exclude stale state or another container from the final diagnosis.

Sources: [Coolify status collector](https://github.com/coollabsio/coolify/blob/v4.7.5/app/Jobs/PushServerUpdateJob.php), [exclusion rule](https://github.com/coollabsio/coolify/blob/v4.7.5/app/Traits/CalculatesExcludedStatus.php), [state resolver](https://github.com/coollabsio/coolify/blob/v4.7.5/app/Services/ContainerStatusAggregator.php).

## Local correction, not deployed

`backend-rust/compose.v2-candidate.yml` now sets `restart: "no"` on `pit-v2-migrate`. This explicitly describes its existing one-shot runtime behavior and makes Coolify 4.7.5 exclude its successful exit from application health. The two Compose validators require that declaration. The modified source Compose SHA-256 is `1412cf03b8f349d8ca5893149deeeb584d3b9ea1e6615f26e92bf6695de71bdc`; it differs from the approved live Compose. No Coolify setting, image, live container or volume was changed. Applying this correction to Netcup requires a separately approved manifest and a controlled V2-only deployment. A status refresh without a deployment may only help if Coolify stored a stale status; it cannot make the currently stored Compose exclude `pit-v2-migrate`.

## Focused local acceptance

- Same on-chain HTTPS URI and actual disposable HTTP metadata bytes through local fixture adapters: V1 and V2 match for valid metadata, duplicate/partial result, malformed JSON (normalized to the stable V2 error code), unavailable media, oversized body and timeout. `PIT_V1_V2_NFT_HTTP_PARITY_PASS`. V1's production fetcher deliberately blocks loopback; the comparison injects a test-only loopback adapter. The separate Rust API → worker → PostgreSQL NFT journey passed with its local-only fixture flag. Hosted NFT fetching remains disabled.
- A real Rust worker process was killed with `SIGKILL` while its second Anvil `eth_getLogs` request was held. Its first checkpoint contained two canonical Transfer logs. After lease expiry, a new worker resumed only the uncovered interval: attempts=2, coverage `[[1,500],[501,600]]`, exactly two distinct events, one log request after recovery and final `COMPLETE`. `PIT_RUST_WORKER_HARD_KILL_RECOVERY_PASS`.
- Rust unit suite: 22 test functions passed; environment-gated integration tests without fixture variables return early. The Anvil/PostgreSQL/API/worker test was separately run with disposable services and passed. Local V1 backup → distinct restore → additive migration → interrupted migration recovery passed.
- Both source Compose validators passed with a synthetic local environment. This validates only the candidate source; the generated Coolify Compose and live health remain separately gated.

## Remaining hosted checks

A sanitized read-only diagnostic script `/tmp/pit-v24-coolify-readonly.py` was copied to the VPS with SHA-256 `ff63cd45133dfa2d9f9d9071dc84eb61a9ea82cad576ff5a8801e23e3b8fdaf5`. The SSH account cannot inspect Docker/Coolify without interactive sudo. The script must establish the current stored status, Compose exclusion fields, per-container labels and states, management/data/RPC network membership, effective limits and three bounded health observations. No password is needed by the script or stored in its output.

At 2026-11-14 09:29 UTC, nonprivileged checks showed 6,022 MiB available RAM, 142 GiB free, strict HTTPS 200 for DeOpt and HBI, and HTTP 503 for the absent public PIT API route. Current Docker and Coolify states remain unverified until the read-only diagnostic runs. The prior V2-only hosted `pg_dump` and disposable restore passed; no scheduled backup and completed scheduled restore test are evidenced. V2 cannot replace V1 yet.
