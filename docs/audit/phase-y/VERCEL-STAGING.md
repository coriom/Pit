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
