# Phase Y.1 — protected Vercel staging candidate

Observed 2026-10-10 UTC. This is a static configuration and access audit, **not** a deployed-application or browser acceptance. No wallet, trade, accounting record, DNS, or production deployment was touched.

## Baseline and preserved preparation

```text
$ git rev-parse HEAD
8fc5f5697991c240d27fea5409386df1a18c048b
$ git status --short
 M package.json
 M scripts/release/artifacts.mjs
 M tests/unit/static-artifacts.test.ts
?? scripts/add-vercel-config.mjs
$ git branch --show-current
main
$ git remote -v
origin  git@github.com:coriom/Pit.git (fetch)
origin  git@github.com:coriom/Pit.git (push)
```

These are the four Phase Y preparation files. The build generates `dist/vercel.json` **after** Astro and static CSP generation, from the same `dist/_headers` policy. The release artifact guard compares the two exact header sets and rejects extra Vercel configuration keys/functions. Two negative unit tests reject a changed CSP or a function key. The diff contains no credential or fee/network change. `src/lib/config.ts` still defines `FEES_ENABLED: false` and `MAINNET_ENABLED: false`; `src/lib/storage-origins.ts` still defines an empty approved-origin list. No Vercel credential was put in the tree.

The candidate deployment ID is `dpl_GJrqHLzK9TEvgsJEU7Bv2bKhzLZC` in project `prj_G17pKAhw8I1Ou9bQFFYV6DTB9ydE`, scope `corioms-projects`. The reported deployment URL is `https://pit-testnet-staging-l43vpinpv-corioms-projects.vercel.app`; the stable alias is `https://pit-testnet-staging-corioms-projects.vercel.app`. Both answer with Vercel Authentication redirects. The deployment's READY status was reported by the earlier deployment attempt; application content and deployment-file identity could not be independently read in this phase.

## Access result

`vercel` is not installed in the shell (`command -v vercel` has no output). CLI authentication metadata exists locally, but its contents were not read and CLI scope/authentication cannot be established without the CLI. Consequently, `vercel curl` was unavailable. The connected Vercel account lookup succeeds for user `coriom`, but `GET /v9/projects/prj_G17pKAhw8I1Ou9bQFFYV6DTB9ydE` and `GET /v6/deployments/dpl_GJrqHLzK9TEvgsJEU7Bv2bKhzLZC/files` both return `403 forbidden`: `Not authorized: Trying to access resource under scope "corioms-projects". You must re-authenticate to this scope or use a token with access to this scope.` This account lookup does not prove project ownership or grant protected deployment access.

The Vercel protected-access share-link attempt was refused by automatic approval review because creating a temporary SSO bypass link could expose the protected deployment without an approved access-granting action. No bypass URL or secret was created. Deployment protection was not changed. **Required external action:** in the Vercel connection authorization UI, grant the existing connection access to the `corioms-projects` scope and `pit-testnet-staging` project, then retry an authorized protected read. Do not disable Vercel Authentication or place a bypass secret in a CLI argument, environment file, report, or browser capture.

The following unauthenticated `curl --max-redirs 0` requests reached Vercel, but each returned the authentication response, not PIT:

| Exact stable-alias path | HTTP | Observed safe response headers |
|---|---:|---|
| `/` | 302 | `content-type: text/plain`; `strict-transport-security: max-age=63072000; includeSubDomains; preload`; `x-frame-options: DENY`; `x-robots-tag: noindex` |
| `/tools/` | 302 | same |
| `/tools/swap/` | 302 | same |
| `/tools/pnl/` | 302 | same |
| `/_astro/index.CVsDNC_4.css` | 302 | same |

The exact deployment URL `/` also returned HTTP 302. The 302 lacks PIT's `Content-Security-Policy`, `X-Content-Type-Options`, and `Referrer-Policy`; it cannot establish whether the application would send them after authentication. Cookie and redirect values were intentionally not retained. No browser session or credential was used.

## Static artifact and configuration timing

`pnpm build` creates 11 HTML pages and `dist/vercel.json` with `framework:null`, `outputDirectory:"."`, one `/(.*)` header rule, and the five headers generated from `dist/_headers`: `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`, and `Content-Security-Policy`. The CSP has nine generated inline-script hashes and `frame-ancestors 'none'`; generated pages remain `noindex,nofollow`, `robots.txt` disallows indexing, and no sitemap is published. `node scripts/release/artifacts.mjs` reports `PASS static artifacts: 138 files; 11 HTML pages; 0 external scripts/styles; CSP, SRI, telemetry, secret, source-map and mainnet endpoint guards`. The local manifest hash was `d8e7e1da8cfc56fb351df1b1126a0272a23dde9849698b70f0fb1c6b4efa39e0` before the final clean-source release run; use that run's hash as authoritative for the committed source.

[Vercel's project configuration reference](https://vercel.com/docs/project-configuration/vercel-json) says `vercel.json` belongs in the project root. Here it is generated **inside `dist`**, so it is at the upload root only for a static upload that uploads the contents of `dist` as its project root. A Git deployment rooted at the repository would not consume this generated file during its pre-build configuration phase. The actual deployment file tree and served HTTP headers remain unverified because project-scoped API access returned 403. Do not infer that Vercel consumed the rule solely from the local artifact or its READY label. The next authorized check must inspect the protected application response, and if it lacks the headers, correct the deployment method/configuration before approving the origin.

## Acceptance criteria

| Criterion | Status | Evidence or blocker |
|---|---|---|
| Dedicated HTTPS staging URL exists and SSO stays enabled | PARTIAL | Exact hosts return HTTPS 302 with Vercel Authentication; ownership and isolation not independently confirmed. |
| Actual app HTTP CSP, HSTS, nosniff, referrer, frame, indexing headers | BLOCKED | Only authentication 302 headers obtained. |
| Served HTML CSP hashes match HTTP CSP | BLOCKED | Built artifact matches generated config; served HTML/HTTP policy inaccessible. |
| Wallet UI, Sepolia-only execution gate, zero PIT fees | BLOCKED | Local release tests cover gates; protected staging browser unavailable. |
| IndexedDB opens, persists across reload, CSV export | BLOCKED | Stable alias is not approved in `accountingOrigins`; no authenticated browser readback. |
| CoW read-only quote and no telemetry | BLOCKED | No authenticated browser request capture. |
| Shared-origin IPFS path rejected | PASS locally only | Existing release/browser guards; no public gateway test in this phase. |
| Legacy shared-origin record recovery and real public accounting | OPEN | Neither is established by a static build or SSO redirect. |

The stable alias was **not** added to the origin allowlist. No wildcard `vercel.app` origin was approved. Assumption 8 remains **OPEN**. The Phase W live CoW accounting result remains valid but was performed on an approved local origin; Hyperliquid derivative accounting, the legal/mainnet fee gate, and public-origin acceptance remain separate blockers.

## Release evidence

The exact 376-line clean-committed-source `pnpm release:check` transcript is in [release-check.txt](release-check.txt). It tested source commit `b847225854af59709d29107be2f67b5c35c73c39` and exited 0: 182 unit tests, 28 Playwright tests, 116 files typechecked with zero errors, zero warnings and one pre-existing hint in `scripts/audit/verify-live-setup.mjs`, 11 static pages, 138 guarded artifacts, build SHA-256 `d8e7e1da8cfc56fb351df1b1126a0272a23dde9849698b70f0fb1c6b4efa39e0`. The first full run [failed one Playwright mount-timeout check](release-check-initial-failure.txt) after 27 other tests passed; that same case passed in isolation, and the clean-source full rerun passed 28/28. The initial sandbox-only attempt failed before tests at `spawnSync git EPERM` and was rerun with the required filesystem permission; it is not a product failure. The final commit adds only these release transcripts and audit-document corrections after the tested source commit. No live staging acceptance is implied by an offline release PASS.

## Phase Y.2 — scope-free API readback, 2026-10-11

The earlier 403 was specific to calls supplying the `corioms-projects` scope. In this Codex session, the connected Vercel MCP succeeded when the same exact IDs were passed **without** `slug` or `teamId`. No Vercel CLI was installed, no shareable SSO bypass was requested or created, and Vercel Authentication remains enabled.

| Read-only MCP call, without scope argument | Selected exact result |
|---|---|
| `get_project({idOrName:"prj_G17pKAhw8I1Ou9bQFFYV6DTB9ydE"})` | `id=prj_G17pKAhw8I1Ou9bQFFYV6DTB9ydE`, `name=pit-testnet-staging`, `accountId=team_jh3uGhEAzuuNEO6gehL1vHE4`, `framework=null`, `domains=["pit-testnet-staging-corioms-projects.vercel.app"]`, `ssoProtection={"enabled":true,"deploymentType":"all_except_custom_domains"}`, `latestDeployment=dpl_GJrqHLzK9TEvgsJEU7Bv2bKhzLZC`. The connected user `coriom` has the same default team ID. |
| `get_deployment({idOrUrl:"dpl_GJrqHLzK9TEvgsJEU7Bv2bKhzLZC"})` | `id=dpl_GJrqHLzK9TEvgsJEU7Bv2bKhzLZC`, `name=pit-testnet-staging`, `state=READY`, `target=staging`, `url=pit-testnet-staging-l43vpinpv-corioms-projects.vercel.app`, `alias=["pit-testnet-staging-corioms-projects.vercel.app"]`, `creator.username=coriom`, `project.id=prj_G17pKAhw8I1Ou9bQFFYV6DTB9ydE`. |
| `list_deployment_aliases({id:"dpl_GJrqHLzK9TEvgsJEU7Bv2bKhzLZC"})` | One alias: `pit-testnet-staging-corioms-projects.vercel.app`. |
| `list_deployment_files({id:"dpl_GJrqHLzK9TEvgsJEU7Bv2bKhzLZC"})` | Deployment API source tree has root `src/` with `src/vercel.json`, `src/_headers`, `src/index.html`, `src/robots.txt`, `src/tools/swap/index.html`, and Astro JS assets. Response reports `truncated=true`, 23 array entries omitted; it is not a complete file enumeration. |

The deployment API's file IDs for those six representative files exactly match independent local `sha1sum dist/...` output:

```text
6a4dfd570fd6e9d97fabd27138ed1858462ee8c5  dist/vercel.json
43cf32c6551c1a801c89daa7969c9dae6a1e2495  dist/_headers
a9bc0896d4e93dd50192d32379d7ad896fd6f644  dist/index.html
63657cbb7d7086c56b0cd4e5c6999bb683664868  dist/robots.txt
848d64e0e9439133308a88ab4af73562d0ad08b1  dist/tools/swap/index.html
b584ad8483bb988612bd20fdab38d96127a99d2b  dist/_astro/Swap.CTeNxFEU.js
```

The MCP file-content responses for `_headers` and `robots.txt` were complete and byte-identical to the local artifact. Larger file-content responses, including `vercel.json` and HTML, were truncated by the connector, so their direct byte comparison is **not verified**; the matching API file IDs provide upload identity evidence. This establishes that the generated Vercel config file was uploaded under `src/`, but it does **not** establish that Vercel consumed its header rule or served its CSP. Only an authenticated PIT application HTTP 200 with the expected response headers can establish that.

Current unauthenticated HTTPS requests to the stable alias for `/`, `/tools/`, `/tools/swap/`, `/tools/pnl/`, and `/_astro/index.CVsDNC_4.css` all exited 0 from `curl` and returned **HTTP 302** with `content-type: text/plain`, `strict-transport-security: max-age=63072000; includeSubDomains; preload`, `x-frame-options: DENY`, and `x-robots-tag: noindex`. These are Vercel Authentication headers, not PIT application headers. No application HTTP 200, HTTP CSP, browser location, IndexedDB, reload persistence, CSV export, read-only CoW quote, telemetry capture, or live mainnet rejection was observed on staging. The local release tests do not substitute for those checks.

**Updated acceptance disposition:** connected project ownership, staging deployment READY state, stable alias ownership, SSO configuration, and representative artifact-upload identity are verified by scope-free API readback. Actual application response headers/CSP hash match, browser behavior, origin-scoped accounting persistence/CSV, public shared-origin negative behavior, legacy record recovery and real public accounting remain **BLOCKED/OPEN**. The exact stable origin is still absent from `accountingOrigins`; no wildcard is approved. Assumption 8 remains **OPEN**. No redeployment or wallet action occurred.

**Next operator action:** establish a legitimate authenticated test-browser path to this exact SSO-protected staging deployment. The operator can open the stable alias while signed in to the owning Vercel team in an isolated non-wallet browser. Automated PIT browser verification requires a separately authorized, project-scoped protected-access mechanism; no cookie, token, bypass secret or shareable link should be placed in this repository, command arguments, screenshots or report. Until such access exists, stop at the SSO boundary and do not approve the accounting origin.

The exact [Phase Y.2 clean-tree `pnpm release:check` output](release-check-y2.txt) tested source `11509e7eca109f5cee3c6180688e6a1a758ddf03` and exited 0: 182 unit tests, 28 Playwright tests, 116 typechecked files with zero errors, zero warnings and one existing hint, 11 static pages, 138 guarded artifacts, build SHA-256 `d8e7e1da8cfc56fb351df1b1126a0272a23dde9849698b70f0fb1c6b4efa39e0`. The transcript contains 376 lines and SHA-256 `022bb1d30b5117f3ead1bf54d9330e54bd0ea84daaa2dba1accdd9f5f904b3d7`. Phase Y.2 changes audit documentation and its exact release transcript only; tested source/configuration/tests/public assets remain identical.

## Phase Y.3 — project-root configuration and protected-access checkpoint, 2026-10-12

The operator confirmed in the Vercel dashboard that the temporary Phase Y.3 project automation bypass was revoked. This is **OPERATOR-CONFIRMED**, not independently verified: the connected read-only project API exposes neither bypass inventory nor a revocation receipt. No second bypass, shareable link, `vercel curl`, cookie export, or protected application request was used. Vercel `get_project` without team scope still reports `ssoProtection.enabled=true` and `deploymentType=all_except_custom_domains`; `get_deployment` still reports READY deployment `dpl_GJrqHLzK9TEvgsJEU7Bv2bKhzLZC` and stable alias `https://pit-testnet-staging-corioms-projects.vercel.app`.

The local baseline HEAD was `154912e7a0314548c6226d789aa84803fc93194b`, `main`, clean, with `origin/main` divergence `0/0`. The supplied expected hash `154912e7eca109f5cee3c6180688e6a1a758ddf03` differs from actual HEAD; no reset or history rewrite was performed. `src/lib/config.ts` remains `FEES_ENABLED=false` and `MAINNET_ENABLED=false`, and the exact accounting-origin allowlist remains empty.

[Vercel's configuration reference](https://vercel.com/docs/project-configuration/vercel-json) requires `vercel.json` at the project root. The existing API deployment's uploaded file tree places the generated artifact under `src/vercel.json`; it does not expose a root `vercel.json`. The connected project/deployment summaries do not expose effective `rootDirectory` or `outputDirectory`, so their values and whether the prior config was consumed remain **NOT VERIFIED**. The repository now also carries a root `vercel.json` for a repository-root Git build with `outputDirectory: "dist"`. Its headers pin the current Astro-generated CSP hashes; `scripts/release/artifacts.mjs` rejects stale hashes, different headers, a wrong output directory, or added routing/function keys. `dist/vercel.json` remains the separate direct-upload config with `outputDirectory: "."`. A future direct API upload must place the **contents** of `dist` at its deployment root rather than under `src/`. These are local configuration invariants, not proof of actual HTTP header application.

An unauthenticated HTTPS `HEAD /tools/` on the stable alias returned `HTTP/2 302`, `content-type: text/plain`, `strict-transport-security: max-age=63072000; includeSubDomains; preload`, `x-frame-options: DENY`, and `x-robots-tag: noindex`. No PIT HTML HTTP 200 was observed. The 302 is the Vercel Authentication response; its headers cannot establish PIT's CSP, nosniff, referrer policy or served-HTML hash match.

**Single manual authenticated readback:** In an isolated browser already signed in to the owning Vercel team, with no wallet or remote debugging, open the exact stable alias `/tools/`. In DevTools Network select the final *document* response, confirm final origin and HTTP 200, and transcribe only `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, and `X-Robots-Tag`. Omit cookies, request headers, tokens, and credential-bearing redirect URLs. If the document is PIT, compare its inline-script hashes to the HTTP CSP, then test toolbox/calculator navigation and the existing read-only CoW diagnostic without a wallet. The accounting origin is still deliberately unapproved; do not insert synthetic records there until actual response headers and dedicated-origin isolation have been accepted and the exact origin is compiled into a new staging artifact. A subsequent isolated-browser test must then validate synthetic Taxlot-v1 record write, reload persistence and CSV export without touching existing user records.

| Criterion | Phase Y.3 status | Exact limit |
|---|---|---|
| Temporary bypass revoked | OPERATOR-CONFIRMED | Dashboard confirmation only; read-only MCP has no bypass inventory. |
| Vercel Authentication | PASS | Project API still reports enabled. |
| Project-root Git configuration | PASS locally | Root `vercel.json` and generated CSP are release-checked; no redeployment/readback yet. |
| Effective deployed config/root/output | NOT VERIFIED | Project API omits these settings; uploaded `src/vercel.json` alone proves no header application. |
| Actual PIT HTTP 200 and CSP/security headers | BLOCKED | Authentication response remains 302 without an automated authorized browser session. |
| Toolbox, quotes, testnet gates and telemetry on staging | BLOCKED | No authenticated application/browser readback. |
| Exact-origin accounting, reload and CSV | BLOCKED | Origin not approved; no authorized browser acceptance. |
| Shared IPFS path rejection | PASS locally only | Existing deterministic origin guards; no public gateway readback this phase. |
| Legacy shared-origin recovery and real public accounting | OPEN | Neither is established by local checks. |

Assumption 8 remains **OPEN**. No staging redeployment, origin approval, wallet action, trade, or public release was performed in this phase.

The [complete 376-line release transcript](release-check-y3.txt) tested clean source/configuration commit `56651cc548f6fd87e77fcdd2c3af5f0ebdf58247` and exited 0: 185 unit tests, 28 Playwright tests, 116 typechecked files with zero errors and warnings (one existing hint), 11 static pages, 138 guarded artifacts, and build SHA-256 `d8e7e1da8cfc56fb351df1b1126a0272a23dde9849698b70f0fb1c6b4efa39e0`. The transcript SHA-256 is `d87cc3125e21769065e2d92dbe4127119c81e827030050e455468a79031aee92`. The [initial sandbox-only attempt](release-sandbox-failure-y3.txt) failed before tests at `spawnSync git EPERM`; the complete rerun used the required local process permission. Only this evidence paragraph and the two transcript files were appended after the clean-source run; no tested source, config, tests, lockfiles, scripts, or public assets changed afterward.

## Phase Y.3 manual authenticated HTTP readback

The operator used an existing authenticated Vercel browser session and reported the final URL `https://pit-testnet-staging-corioms-projects.vercel.app/tools/` with **HTTP 200 OK**. This is **PASS — operator-provided PIT response evidence**, distinct from the earlier unauthenticated HTTP 302. The operator reported these response-header values: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `X-Robots-Tag: noindex`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`. They reported an HTTP `Content-Security-Policy` containing `default-src 'none'`, restricted `connect-src` for PIT's configured CoW/Hyperliquid-testnet/Sepolia hosts, SHA-256 script hashes, `style-src 'self' 'unsafe-inline'`, `frame-ancestors 'none'`, and no `unsafe-eval`. The complete served CSP value was not supplied, so its exact hash/source set is **NOT VERIFIED**.

The connected deployment file IDs are `src/vercel.json=6a4dfd570fd6e9d97fabd27138ed1858462ee8c5` and `src/tools/index.html=d8ff87c84165be53ee8af399621b53ad88a45d5a`, matching independent SHA-1 digests of local `dist/vercel.json` and `dist/tools/index.html`. The uploaded config and HTML each contain nine script hashes and those hash lists are byte-identical locally. This proves uploaded artifact identity and internal CSP consistency; it does not compare the actual served HTTP CSP to the HTML. `get_project` still reports the exact stable alias owned by `pit-testnet-staging`, SSO enabled, and the same READY deployment. The dedicated HTTPS project alias is a plausible exact-origin candidate under Phase G's policy, with no path-gateway or wildcard approval. **No accounting origin has been approved yet.**

| Criterion | Updated status | Evidence / remaining requirement |
|---|---|---|
| Authenticated PIT HTML and reported security headers | PASS — operator-provided | `/tools/` final URL and HTTP 200 with the header values above; no cookies or credentials collected. |
| Exact served CSP hash/source equality to deployed HTML | NOT VERIFIED | Need full public CSP header and HTML meta CSP from the served response; local/uploaded artifact equality alone is insufficient. |
| Actual effective Vercel root/output configuration | NOT VERIFIED | Project summary omits settings; HTTP 200 and reported CSP support successful serving but do not expose effective configuration placement. |
| Dedicated exact HTTPS alias eligibility | PASS preliminarily | Exact project-owned stable alias, HTTPS, SSO; no wildcard or shared path. Approval still waits for served CSP and browser checks. |
| Browser toolbox, read-only quotes, fees/mainnet gates, telemetry | BLOCKED | No operator-observed test results beyond `/tools/` HTTP 200. |
| Public IndexedDB, reload persistence and synthetic CSV | BLOCKED | Origin remains outside `accountingOrigins`; no record written or deleted. |
| Legacy recovery, real public accounting and derivative normalization | OPEN/BLOCKED | Existing Assumption 8 criteria unchanged. |

The next manual action is to provide only the complete *public* `Content-Security-Policy` value from the authenticated `/tools/` HTTP 200 and the served page's meta CSP content, with no cookies, request headers or credential-bearing URLs. Then compare exact hashes/sources before considering the narrow origin allowlist and a protected staging redeployment. Assumption 8 remains **OPEN**.

## Phase Y.4 CSP reconciliation and exact-origin candidate

The operator subsequently supplied the [complete public response CSP](observed-csp-y4.txt) for the authenticated HTTP 200 at `https://pit-testnet-staging-corioms-projects.vercel.app/tools/`. This remains **operator-observed** HTTP evidence; the agent did not independently fetch an authenticated response. The connected deployment's `/tools/index.html` file ID, `d8ff87c84165be53ee8af399621b53ad88a45d5a`, equals the independent SHA-1 digest of local `dist/tools/index.html`. The MCP content response itself is truncated, so the file ID is the available deployment identity check. [Reconciliation script](../../../scripts/audit/reconcile-staging-csp.py) and [exact output](csp-reconciliation-y4.txt) compare that identified artifact, its meta CSP, the submitted header, `dist/vercel.json` and the repository-root `vercel.json`.

**Result:** the complete observed CSP equals both generated Vercel configurations byte-for-byte. `/tools/` has exactly one meta CSP and one executable inline script. The meta CSP equals the observed header with only the HTTP-only `frame-ancestors 'none'` removed. The script's recomputed hash is `sha256-LYShsMwrJnwcDz0OAj+P0H5H8AsYdLVuQCyraoYct+c=`, present in the header. No executable `/tools/` script hash is missing. Of the header's nine distinct script hashes, the other eight are extra relative to `/tools/`; across the current 11-page build four distinct hashes match executable inline scripts, and five header hashes have no executable inline-script counterpart. Seven page-specific `application/ld+json` data scripts were excluded because they are not executable. These extra hash allowances are exact hashes, not wildcard/unsafe-eval sources, but they are recorded as residual policy breadth rather than hidden. All current built pages have the same meta policy; there is no meta/header policy conflict on `/tools/`.

The effective **header value** on the existing deployment is supported by the operator's HTTP readback, and it exactly matches the intended generated configuration. The deployment file API reports `src/vercel.json`, while the project summary omits `rootDirectory` and `outputDirectory`; the API cannot prove whether that file, a project-root setting or another deployment configuration supplied the header. Repository-root `vercel.json` is the correct root-file placement for a Git deployment; direct upload must place the *contents* of `dist` at the deployment root. Configuration-source attribution remains **NOT VERIFIED**, and the old deployment is not evidence that the new candidate has been deployed.

The stable alias is the exact project-owned HTTPS origin, is SSO protected, has a real application HTTP 200 with the reported noindex/security headers, and is not an IPFS path gateway or wildcard. These are sufficient preliminary criteria to add only `https://pit-testnet-staging-corioms-projects.vercel.app` to the versioned accounting allowlist. The source allowlist now contains that single origin; the old deployment does **not** contain the source change. Existing PIT storage records are untouched. Actual browser IndexedDB persistence, reload, CSV export, read-only CoW requests, mainnet gate and absence of telemetry on the new deployment remain **BLOCKED** pending protected redeployment and authenticated browser testing. Assumption 8 remains **OPEN**, including legacy shared-origin recovery and real public accounting.

## Phase Y.5 protected staging synthetic accounting check

The operator reported authenticated HTTP 200 for `/tools/`, `/build-manifest.json`, and `/tools/taxlot-export/` on deployment `dpl_7N8RpZhSHRscc2drpW781qLWUfwT`. The Taxlot page rendered with no unapproved-origin warning, but its wallet-dependent export button was disabled while disconnected. These are **operator-observed** results, not IndexedDB or CSV acceptance. The operator then supplied the [complete new-deployment public CSP](observed-csp-y5.txt). It is byte-for-byte equal to the previously observed CSP; this was checked against the supplied value, not inferred from the old deployment. [Exact reconciliation output](csp-reconciliation-y5.txt) confirms its nine hashes match the identified uploaded HTML and generated Vercel configuration. `/tools/` has one executable inline script and no missing hash. Five header hashes lack a current executable-script counterpart across the 11 application pages, an existing policy breadth item.

Read-only Vercel project/deployment calls confirmed that `dpl_7N8RpZhSHRscc2drpW781qLWUfwT` was READY/staging, owned by project `prj_G17pKAhw8I1Ou9bQFFYV6DTB9ydE`, assigned to the exact stable alias, and protected by Vercel Authentication. The deployment API file IDs match local SHA-1 for `tools/index.html` (`d8ff87c84165be53ee8af399621b53ad88a45d5a`), `tools/taxlot-export/index.html` (`db6ccd653a0bf914e61e89670ea964f494e5e7a7`), `vercel.json` (`6a4dfd570fd6e9d97fabd27138ed1858462ee8c5`), and `build-manifest.json` (`3e54aafd04c507e7a97472491fbbaee14753ef90`). The manifest *does* contain `algorithm: sha256` and the aggregate `hash: c1cfff57f2560fa911c754a05f9aaf373c9e9b15cef1bfb12b04ba857dd3f4fc`; this was read from the actual local manifest structure, not assumed.

The normal Taxlot export UI requires a connected wallet account to choose which account to export. For wallet-free synthetic acceptance, `scripts/audit/build-staging-accounting.mjs` emits an **isolated audit addendum under `/tmp`**, never into `dist`. Its fixed, click-driven page bundles the real PIT `appendEvent`, `assertEvent`, `listEvents`, `downloadCSV`, and `eventsCSV` implementation. It runs only at the exact approved staging origin and path, with no wallet import or external request. It refuses any database containing existing events, raw records, or metadata. It creates one fixed-economics synthetic WETH→USDC `trade`, requires reload/readback, downloads through PIT's CSV helper, compares the operator-selected downloaded file byte-for-byte to PIT's serializer, and deletes only its own event/raw/sequence after all checks. If store state changes unexpectedly, cleanup fails closed. No wallet or transaction API is present. The production artifact guard rejects the audit path or its retained runtime marker; a negative unit test proves this.

Local deterministic acceptance: 186 unit tests passed; the two new Playwright tests proved synthetic write/reload/CSV readback/cleanup and preexisting-record/unapproved-origin rejection. A wallet-request spy stayed at zero, and the test page requested only its same-origin assets. The normal Astro build remains 11 noindex pages, 138 guarded artifacts, and SHA-256 `c1cfff57f2560fa911c754a05f9aaf373c9e9b15cef1bfb12b04ba857dd3f4fc`.

The audit addendum and otherwise unchanged build were uploaded to the **same SSO-protected staging project** as deployment `dpl_CwZD54BuYB3AvAEL6JHavMSW12LA`, which the read-only API reports READY/staging on the stable alias. Its uploaded file IDs match the two local addendum SHA-1 values (`index.html=1e97813d25da78741939ae12baf9839f29fa86ef`, `audit.js=9813c6cd50022536416739caa2526aee25d5b4fb`) and the unchanged app/manifest/config file IDs above. No bypass credential, share link, wallet action, trade, or accounting write was used by the agent. The *new* deployment's effective HTTP headers and operator-browser IndexedDB/reload/download results are still **BLOCKED pending authenticated readback**. The former deployment's HTTP CSP cannot substitute for that check. Assumption 8 remains **OPEN**, including legacy-record recovery and real public accounting.

The [complete 378-line clean-source `pnpm release:check` transcript](release-check-y5.txt) tested commit `08aa360076b687ba1d706cfa4ee58fa5667472cd` and exited 0: **186 unit tests**, **30 Playwright tests**, **119 typechecked files with 0 errors, 0 warnings, 1 preexisting hint**, **11 static pages**, **138 guarded production artifacts**, and unchanged production build SHA-256 `c1cfff57f2560fa911c754a05f9aaf373c9e9b15cef1bfb12b04ba857dd3f4fc`. Its final line is `RELEASE CHECK PASS — offline testnet candidate only; no live acceptance or deployment`. This transcript and this paragraph are evidence-only additions after the clean-source run; the staged accounting harness, production guards, tests, configuration, lockfile, public assets and application source are identical to the tested commit.

## Phase Y.7 offline lifecycle correction

The [separate Phase Y.7 diagnostic](STAGING-LIFECYCLE-Y7.md) preserves the failed Phase Y.6 runner evidence and replaces its unsupported active-bypass classification with explicit creation, access, browser, revocation-request and readback states. No bypass credential was created in Y.7. The current read-only project check reports Vercel Authentication enabled and zero bypass entries; unauthenticated PIT remains HTTP 302. Real A–E protected-browser acceptance is still **BLOCKED**, and Assumption 8 remains **OPEN**.

## Phase Y.9 offline HTTP 400 diagnosis

The [Phase Y.9 request-contract audit](STAGING-BYPASS-Y9.md) records the separately authorized Y.8 attempt: Vercel returned HTTP 400 for creation and HTTP 404 for cleanup; the original 400 body is unavailable. The published OpenAPI pattern requires a caller-supplied 32-character alphanumeric `generate.secret`, while the old runner supplied 43 base64url characters. This is a proven request-contract defect and a plausible, **not proven**, cause of that particular 400. The local test-only generator and fail-closed request validation are corrected; future error reports retain only redacted code/message, request ID, UTC time and field types. Rejected creation plus a failed cleanup request and inactive readback now reports `NO_ACTIVE_BYPASS_OBSERVED`, not a successful revocation. Phase Y.9 performs no live credential operation or staging browser A–E test. Vercel Authentication, noindex and Assumption 8's **OPEN** status remain unchanged.

## Phase Y-D — staged CSV File selection diagnostics, 2026-10-14

The operator's existing Brave fixture `pit-staging-synthetic-92c4578a-472e-452e-99f8-a47653bd1e26` passed A (synthetic IndexedDB insertion) and B (same record after reload); C downloaded `pit-taxlot.csv`. D twice returned `BLOCKED`, `Error: Select the downloaded PIT CSV file`, after the operator reported seeing the filename in the picker. E was not attempted. This establishes only that the D handler did not have a `File` object at its check. It does not establish CSV corruption, schema divergence, economic mismatch, or IndexedDB loss. The original Brave profile and fixture were not accessed by the agent.

Source inspection found one `#csv-file` input and one D handler. The original handler synchronously read `fileInput.files?.[0]` before any IndexedDB await. The page updates only report text, so there is no demonstrated page-owned input replacement or reset. The previous deployment `dpl_DexGHUv9wG64aH1BVPBqQXJaYQro` identified `audit.js` as SHA-1 `fb4bd4c291ddc1d5d0463a2d77fc0565bd96661b`, matching the locally built source. The cause of the operator browser's empty FileList remains **UNKNOWN**.

The staging-only audit page now displays selection-event receipt, live FileList length, captured File presence, selected filename and size, input attachment, and File availability at D. It captures the genuine browser `File` on the input's `change` event and binds it to the URL's fixture ID. Cancellation clears that reference. D is disabled until a File is captured for the current fixture, and E remains disabled until D validates the actual file bytes against PIT's schema-validated stored event and `eventsCSV` serializer. A stale filename or a page reload cannot satisfy D. The normal production build does not contain the audit addendum, and the existing artifact guard rejects it if accidentally bundled.

Local targeted Playwright tests passed **6/6** after correcting two test-fixture issues found on the first run: Playwright's temporary download path uses a UUID filename, and one negative test selected a file before asynchronous fixture creation completed. The passing tests cover real downloaded CSV bytes, reload persistence, DOM report updates/input replacement, cancellation/missing selection, invalid bytes, and cleanup gating. `pnpm check` reported 127 files, zero errors, zero warnings, one existing hint. `pnpm build` produced 11 static pages with SHA-256 `26c93d99609eafd11c72470f6c254c8cc7679af41ce77c346aa2fd8d49c6b101`; the production artifact guard passed 138 files and confirmed the staging addendum was absent.

Exactly one staging redeployment was created through Vercel's static-file API: `dpl_B1p5h4wki54zuf5jjW5cY36UGLjC`, **READY**, target `staging`, owned by project `prj_G17pKAhw8I1Ou9bQFFYV6DTB9ydE`, assigned to the exact stable alias `https://pit-testnet-staging-corioms-projects.vercel.app`. Read-only project API verification reports Vercel Authentication enabled. Uploaded staging addendum file IDs match the validated local SHA-1 values: `index.html=c88291cc53357801f979576d11e2d69ab502497b`, `audit.js=f368d48524875d9ae2683051eaa50a59b1bb5d56`. No bypass credential or share link was created. These API file IDs prove upload identity; they do not themselves prove browser D or E acceptance.

The operator handoff is a single reload of the existing fixture URL in the same Brave profile, selection of the original downloaded `pit-taxlot.csv`, and one D click if enabled. Only the visible File-state JSON and D result JSON are requested. A/B/C are not repeated and E remains prohibited until D returns `CSV VERIFIED`. Assumption 8 stays **OPEN** for D/E, real public accounting, legacy shared-origin recovery and derivative support.

The full release check tested clean source commit `c2d24b44547f59c5481cbd09c35d6bd344fe31bf`. [Attempt 1](release-check-y-d-attempt1.txt) failed with 33/34 Playwright tests after the disconnected readiness row did not appear within five seconds. That test passed alone, 1/1. [Attempt 2](release-check-y-d-attempt2.txt) failed with 33/34 after a different public-observer element did not appear within five seconds; it too passed alone, 1/1. Neither timeout occurred in the six staging harness tests or justified an unrelated UI change. A final complete run with `CI=1` to bound Playwright workers to two [passed](release-check-y-d-ci.txt): 231/231 unit tests, 34/34 Playwright tests, 127 typechecked files with zero errors/zero warnings/one existing hint, 11 noindex static pages, 138 guarded production artifacts, and production build SHA-256 `26c93d99609eafd11c72470f6c254c8cc7679af41ce77c346aa2fd8d49c6b101`. This is offline local release evidence, not operator-browser D/E acceptance. The source, configuration, tests, lockfiles, scripts and public assets were not changed after this release run; subsequent additions to this phase record are evidence only.
