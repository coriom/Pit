# Phase K — dedicated testnet origin

**Status: BLOCKED — dedicated public origin credentials unavailable.** No Pages project, deployment ID, assigned public origin, TLS response or real HTTP headers were obtained. PIT's production accounting-origin allowlist remains empty. No live transaction, public deployment, ENS/DNS update, record migration or record deletion occurred.

## Assumption 8, exact text before and after

Before Phase K, accepted commit `229cad0f140b9ebf5ce25fa1c168f55b66055da5`:

> 8. **OPEN — Accounting and public-origin acceptance.** No dedicated public origin was deployed or verified. Phase I verifies two synthetic CoW crypto-to-crypto fills (including stablecoins) through the real recorder, IndexedDB, CSV and actual workspace Taxlot Generic importer: two valid imports, zero issues, deterministic economic-field reconciliation. Importer metadata changes are explicitly documented; this is not live or tax-calculation acceptance. Hyperliquid derivative normalization remains **BLOCKED — unsupported_derivative_v1**: exact schema and engine evidence establish that v1 lacks a faithful derivative contract. Fills/funding are append-only raw observations in a separate origin-guarded database, never Taxlot events/CSV. Existing records are preserved. See [Phase I capability matrix, model, importer differences and evidence](docs/audit/phase-i/DERIVATIVE-ACCOUNTING.md). Real execution/reconciliation, future upstream derivative support and public-origin verification remain outstanding. The schema definition is unchanged.

After Phase K, the numbered item is **unchanged verbatim**:

> 8. **OPEN — Accounting and public-origin acceptance.** No dedicated public origin was deployed or verified. Phase I verifies two synthetic CoW crypto-to-crypto fills (including stablecoins) through the real recorder, IndexedDB, CSV and actual workspace Taxlot Generic importer: two valid imports, zero issues, deterministic economic-field reconciliation. Importer metadata changes are explicitly documented; this is not live or tax-calculation acceptance. Hyperliquid derivative normalization remains **BLOCKED — unsupported_derivative_v1**: exact schema and engine evidence establish that v1 lacks a faithful derivative contract. Fills/funding are append-only raw observations in a separate origin-guarded database, never Taxlot events/CSV. Existing records are preserved. See [Phase I capability matrix, model, importer differences and evidence](docs/audit/phase-i/DERIVATIVE-ACCOUNTING.md). Real execution/reconciliation, future upstream derivative support and public-origin verification remain outstanding. The schema definition is unchanged.

The existing Phase G clarification also remains authoritative:

> Phase G clarification: **assumption 8 remains OPEN** for accounting/import semantics. PIT-F-01 is mitigated in source by default-deny origin policy; public deployment acceptance and legacy shared-origin recovery remain OPEN. The production allowlist is intentionally empty. Tests of approved dedicated HTTPS origins use an explicit test-only policy fixture, not a public deployment.

Phase K appends evidence below that item in `ASSUMPTIONS.md`; it does not redefine the acceptance criteria or close the assumption.

## Deployment target and credential blocker

Preferred target is a fresh, PIT controlled Cloudflare Pages **Direct Upload** project tentatively named `pit-testnet-stage-k-229cad0`, with candidate URL `https://pit-testnet-stage-k-229cad0.pages.dev/`. This is a **candidate only**, not an assigned or verified origin. Cloudflare may allocate another hostname if that name is taken; the actual canonical URL must come from project creation and be independently reviewed before allowlisting. The project must have no production custom domain, production ENS relation, Pages Function or unrelated content on its origin. A project used only for testnet staging is operationally distinct from any production project even though Pages calls its primary branch “production.” [Cloudflare Direct Upload instructions](https://developers.cloudflare.com/pages/get-started/direct-upload/) explain project creation and the `pages.dev` hostname.

The PIT process had no Cloudflare credential-named environment variables; no Wrangler CLI or standard local Wrangler auth files were found. No supplied Cloudflare account/project identifier or operator-authenticated browser session was available. We did not generate credentials, start Wrangler login, publish a site, or attempt a write to an external service. [Exact local availability output](credential-availability.txt). The [candidate-origin refusal](unapproved-origin-refusal.txt) independently shows that merely supplying public URL strings does not bypass the empty allowlist. The command `pnpm staging:smoke` without the two required public target URLs exited nonzero before opening a browser; [exact refusal output](staging-smoke-blocked.txt).

To resume this phase once credentials are available, the operator should create a **new** project under a reviewed PIT controlled Cloudflare account using an external Wrangler login or dashboard session. First deploy the current static artifact, leaving accounting blocked. Record the allocated exact HTTPS origin, project/deployment identifiers, ownership/isolation evidence, server response headers and the remote build-manifest hash. Only after that review should an exact HTTPS origin be added to `src/lib/storage-origins.ts`, its protected release hash reviewed/updated, and the artifact rebuilt and uploaded to the same staging project. `pnpm release:check` must pass from a clean tree before the second upload. Never add a wildcard, gateway path, arbitrary CID hostname or production domain. No credentials enter repo, client bundle, `.env.local`, docs or Git history. The user controls every wallet connection; no real swap/order belongs in this phase.

The runbook for a future readback is:

1. Capture the exact assigned origin and deployment ID from the new Pages project. Verify the origin belongs solely to this staging project, not an existing production project or custom domain.
2. From the operator's machine, run `curl -i --max-redirs 0 <exact-origin>/`, `curl -i --max-redirs 0 <exact-origin>/fees/`, and `curl -i --max-redirs 0 <exact-origin>/build-manifest.json`. Retain status, final URL, TLS/HTTPS details and the complete response headers. A meta CSP alone is insufficient.
3. Compare the deployed build manifest hash and artifact files to the clean local build. Check actual `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`; specifically require `frame-ancestors 'none'` in the HTTP CSP.
4. Run `PIT_STAGING_ORIGIN=<exact-root-URL> PIT_STAGING_SHARED_GATEWAY_URL=<actual-shared-gateway-IPFS-or-IPNS-path> pnpm staging:smoke`. The smoke test refuses arbitrary origins and an unapproved compiled origin. It uses a new browser context and public synthetic wallet address only; it never signs. It checks actual HTTPS response headers, remote build-manifest match, wallet UI, disabled fees, testnet presentation, wrong-mainnet preflight, IndexedDB write/reload and CSV, outbound hosts, and shared gateway query/reload denial.
5. Preserve the returned public HTTP headers, browser origin, deploy/build IDs and smoke output. Test legacy-record recovery separately in a controlled browser profile without deleting source records. Do not infer legacy migration from the new-context fixture test.

Cloudflare applies `_headers` to static asset responses, not Pages Function responses; PIT uses a static Astro build and does not add Pages Functions. [Cloudflare header behavior](https://developers.cloudflare.com/pages/configuration/headers/) is documentation for the intended target, not evidence that this unpublished PIT build has returned those headers over HTTPS.

## What is verified locally

The static build now fails if any of the three pages lacks Astro's generated CSP or the policies diverge. `scripts/add-static-csp.mjs` copies that policy into `dist/_headers` and appends HTTP-only `frame-ancestors 'none'`; it checks for duplicate rules, line breaks and Cloudflare's 2,000-character line limit. `tests/e2e/interface.spec.ts` compares the emitted header to the actual generated HTML meta policy. [Exact generated `_headers` and asset hashes](static-artifact.txt). The `_headers` file is a deployment instruction, **not an HTTP response capture**. The build manifest includes `_headers`, so a remote manifest hash match will bind this intended header policy to the uploaded artifact. The staged script has no force or localStorage override.

The existing Phase J preflight gates CoW at Ethereum Sepolia chain ID 11155111 and exact CoW contracts/API; Base Sepolia, every configured mainnet and unknown IDs fail. Hyperliquid uses exact testnet API/RPC endpoints and `isTestnet` independently. `FEES_ENABLED=false`, `MAINNET_ENABLED=false`, fee recipients/rates and upstream Taxlot schema remain protected by the clean-tree release check. Phase I still stores Hyperliquid derivative fills only as `unsupported_derivative_v1` raw evidence. These statements are source/test facts; the unpublished staging site has no runtime readback. [Phase J network matrix](../phase-j/RELEASE-SAFETY.md).

Browser tests use a test-only approved origin and a production-artifact path fixture. They show accounting persistence/CSV on a dedicated origin fixture, denial on sibling/shared origins, and refusal after reload, IPFS/IPNS paths, encoded paths and query manipulation. They are **local fixtures**, not public-gateway evidence. Existing IndexedDB records are neither migrated nor deleted. [Full clean-tree release output](release-check.txt) contains the new browser checks: 75 unit tests, 16 offline Playwright tests, a clean 54-file typecheck and a successful 3-page build (artifact hash `86866a41be5a047320081a7a81422fa7d968f14ecd4a8aea42124f16e60e11b7`).

## Criterion-by-criterion disposition

| Existing acceptance criterion | Phase K evidence | Status |
| --- | --- | --- |
| PIT controlled dedicated public HTTPS origin | Candidate project only; no project or assigned URL | BLOCKED |
| HTTP/TLS and real CSP/security header readback | Local generated `_headers`; no public response | BLOCKED |
| Wallet UI and testnet/fee preflight at that origin | Local browser/source evidence only | BLOCKED |
| Public-origin IndexedDB survives reload; CSV works | Dedicated test-origin fixture only | BLOCKED |
| Shared public IPFS/IPNS path refuses accounting/CSV after manipulation | Local path/query/reload fixtures only; no published CID gateway | BLOCKED |
| Real CoW execution and Taxlot reconciliation | No funded external wallet or live swap | BLOCKED (Phase H) |
| Faithful Hyperliquid derivative normalization | Taxlot v1 lacks the contract; raw evidence only | BLOCKED (future contract) |
| Legacy shared-origin record recovery | No controlled recovery session; no migration | OPEN |

**Assumption 8 remains OPEN.** The public-origin subset is not verified, and closing the broader accounting assumption would additionally require the outstanding live/future-contract and legacy-recovery evidence above. No claim about a deployed origin, TLS, returned headers or wallet address analytics is made. The smoke test rejects unknown outbound hosts in its synthetic session, but no public session ran.

## Remaining blockers before Phase H-live

An externally controlled, funded Ethereum Sepolia wallet and separately funded Hyperliquid testnet account; operator review of every signature; real CoW/Hyperliquid order and fill evidence; actual Taxlot reconciliation for CoW; faithful future derivative contract; and dedicated public-origin/legacy recovery verification. Fee activation and mainnet remain forbidden under the existing legal gate.
