# PIT Crypto V1.4.2 — Coolify Raw internal canary result

Observation date: 2026-11-13 UTC. This is an internal-only canary, not a browser-accessible beta.

## Authorized artifact and job

- Operator approval: `GO PIT INTERNAL CANARY RAW 62379e645a9165c0e9b05ace89407763d95080ea5ce94eca6b35dca260fe86e9`.
- Coolify 4.7.5 Application `pit-backend-canary-raw`, UUID `c1fsywygziaxxyz2aeks8ktt`.
- Pinned source `7491452b31efe6e8465447ee3760a2dbef553a8f`; GHCR image `ghcr.io/coriom/pit-backend@sha256:b9e9c812e00b0a782c92579c22254941dddc81ca7b24fd49077acb7525486000`.
- Source Compose SHA-256 `cb1c27b8ff48c11cde2ac77abcbd7e85cb8f02017684fd2e9aa53f494dc506f1`; Coolify-generated Compose SHA-256 `d336bab79447d661bd2a2c48f57a1325ff451e32a826dc960ca76e96f495c122`.
- Only the Application custom start command was cleared. The SHA-pinned V4 gate returned `PIT_RAW_START_GATE_PASS` immediately before one Deploy click. Deployment job `4sweal2djpfkw5haas9eplcl` reached `Finished` and the Application showed `Running`. No second Deploy click occurred.

## Actual isolation

The operator's SHA-pinned privileged inspection returned `PIT_POSTSTART_ISOLATION_PASS`:

| Container | State / health | CPU limit | RAM limit | Actual networks |
| --- | --- | ---: | ---: | --- |
| PIT API | running / healthy | 0.25 vCPU | 256 MiB | `pit-data`, `pit-rpc` |
| PIT worker | running / healthy | 0.50 vCPU | 512 MiB | `pit-data`, `pit-rpc` |
| PIT PostgreSQL | running / healthy | 0.50 vCPU | 512 MiB | `pit-data` |
| PIT migration | exited | 0.25 vCPU | 192 MiB | `pit-data` |

The real Docker networks are `pit-crypto-backend-canary_pit-data` and `pit-crypto-backend-canary_pit-rpc`. Only PIT containers were members. `coolify-proxy` remained outside both networks; the Application management network contained only that proxy. The PIT containers had no published host ports and no Traefik routers. External `https://94.16.113.122/pit/api/v1/health` returned 503 with normal TLS validation. The old Service volume `d47gm6kkdopzfurtmcd4lgpo_pit-db-data` and new canary volume were both present; neither was deleted.

## Functional evidence

The PIT-only smoke test returned `PIT_INTERNAL_CANARY_SMOKE_PASS`. It verified effective cgroup CPU and memory limits; API health and readiness; expected migration tables and recent worker heartbeat; rejection of an unsigned request and an HMAC nonce replay; Base Sepolia chain ID; a bounded real event-history job with two events and complete requested block coverage; JSON and CSV exports; capability-scoped access; PostgreSQL persistence and expiry; deletion; and worker recovery after stopping and restarting only the PIT worker.

A separate signed request returned `PIT_HOSTED_NFT_FETCH_DISABLED_PASS`: hosted NFT metadata fetching remained disabled. No external blockchain transaction, payment, customer CSV or external email was used.

Two further capability-scoped jobs used only existing public Base Sepolia evidence, exported JSON, then deleted their results. A bounded permissions analysis of the previously deployed advanced PIT token returned `COMPLETE`, `Ownable` and `COMPLETE` coverage **for its requested single block**; this does not establish complete contract history. A distribution check against the pre-existing PIT standard-token MultiSender receipt returned `VERIFIED`: two expected recipients, two `VERIFIED` rows and an integer-exact observed total of `30000000000000000000` base units (30 tokens). Neither job signed or broadcast a transaction.

## Resource and neighbor observation

At 04:32:52 UTC, Docker reported: API 0.01% CPU / 31.76 MiB; worker 0.20% / 35.32 MiB; PostgreSQL 0.12% / 29.47 MiB. All three were healthy with zero restarts and no OOM. The VPS had 6,122 MiB RAM available and 142 GiB disk free; CPU pressure `full avg10/60/300` was zero. These are bounded snapshots, not sustained capacity measurements.

`coolify-proxy`, HBI Web, Toolio Commerce and DeOpt backend remained healthy; restart counts stayed 0, 0, 0 and 12 respectively, with no OOM. Trusted HTTPS checks returned 200 for DeOpt `/health` and HBI `/hbi/api/health`. The served Let's Encrypt production certificate covered IPv4 `94.16.113.122` and was valid until 2026-11-19 14:57:18 UTC. No shared service or proxy was restarted or modified.

After the additional read-only jobs, the 04:44:47 UTC host snapshot still showed 6,104 MiB RAM available, 142 GiB disk free and load average 0.36/0.48/0.46. DeOpt and HBI HTTPS remained 200 with normal TLS verification; the public PIT API path remained 503.

## Boundary

This proves the internal canary's observed isolation and the tested event, permissions and distribution workflows. It does not prove long-term resource stability or a browser-accessible private beta. Persistent monitor detection and external email delivery were not exercised on Netcup; hosted NFT fetching was deliberately rejected. A PIT-specific backup destination and verified restore, operator-controlled DNS hostname with matching trusted TLS, Cloudflare gateway deployment and direct-origin authentication tests are still required before real users. Hosted NFT fetching remains disabled until independent outbound restrictions are proven.
