# Phase AF — read-only beta hosting preflight

Status: **LOCAL HOST PACKAGE PASS; HOSTED QA NOT DEPLOYED; PUBLIC PILOT NO-GO**. Baseline was clean `main` at `3e9352194ed68e496f18d58ae2bfac8d12e915c5`, upstream `origin/main` at `git@github.com:coriom/Pit.git`, divergence 0/0. This phase creates no hosting project, deployment, DNS record, tester invitation, credential or transaction. The protected `pit-testnet-staging` project is untouched. `FEES_ENABLED=false`, `MAINNET_ENABLED=false`, and ordinary `UNISWAP_EXECUTION_ACCEPTED=false` remain unchanged.

## Hosting decision and isolation

**Proposed provider:** Vercel, using a completely separate project tentatively named `pit-readonly-beta-qa`. Its dedicated hostname is **unconfirmed**; a possible project alias is `pit-readonly-beta-qa-<team>.vercel.app`, subject to Vercel assignment and protection review. The existing PIT staging alias and accounting-origin allowlist are excluded. Cloudflare Pages is only a fallback if Vercel cannot demonstrate the artifact, protection and header controls in hosted QA.

Official [Vercel configuration documentation](https://vercel.com/docs/project-configuration/vercel-json) requires `vercel.json` at the project root and supports `framework: null`, `outputDirectory` and path-matched response headers. The candidate's `_headers` is a Cloudflare Pages convention, not evidence that Vercel would apply it. `pnpm beta:check` now builds `dist-readonly-beta/`, validates that candidate, and creates `dist-readonly-beta-host/` with `vercel.json` at the package root and only the reviewed static files under `public/`. The package has no `package.json`, API/function directory, server runtime, redirects or rewrites. Its config forces `framework: null` and `outputDirectory: public`. The future project must use the package directory itself as its project root; pointing Vercel at the PIT repository root would use the full application's `vercel.json` and is **forbidden**. No Git connection or auto-deploy should be attached to the QA project; upload only a freshly verified package after authorization. Verify actual project settings, env vars, integrations and output inventory before deployment.

**Exact served inventory (10 files):**

```text
_astro/index.BMUxgpwn.css
index.html
robots.txt
tools/bridge-cost/index.html
tools/impermanent-loss/index.html
tools/index.html
tools/liquidation/index.html
tools/pnl/index.html
tools/portfolio-exposure/index.html
tools/swap-cost/index.html
```

The eleventh package file is root `vercel.json`; it is outside `public/` and must not be served. The Cloudflare `_headers` template is likewise excluded from Vercel's served tree. The guard rejects unreviewed routes, JavaScript chunks, wallet/execution/Taxlot code, remote CSS resources, symlinks, changed copies, and extra host config keys such as rewrites. There is no `/tools/swap/`, `/tools/perps/`, `/tools/wallet/`, `/tools/taxlot-export/`, API path or fallback rewrite in the package. This is local file-set evidence; hosted 404 behavior still requires an actual protected deployment.

Candidate tree SHA-256: `951fc927bf07dbb06974b96de5c13734b7edb7b66ec30a6676391ca1c59aa32d`. Host package tree SHA-256: `f2907ac694594531e16ab5501e3be7d066edf98f528553f2bf2164dde725a425`. The tree hash algorithm appends each sorted relative filename, NUL, file bytes, NUL to SHA-256. These are local artifact identities, not hosted deployment identities. The Phase AE candidate hash changed because the beta-only privacy copy and conservative HSTS template changed; the six calculation engines did not.

## Header policy

The generated root `vercel.json` applies a single `/(.*)` header rule to pages and assets. It contains the same generated Astro CSP as the candidate plus HTTP-only `frame-ancestors 'none'`. It retains `connect-src 'none'`, `default-src 'none'`, restrictive object/base/form directives, `script-src 'self'` plus Astro's generated hashes, and no `unsafe-eval` or script `unsafe-inline`. All four distinct executable inline scripts in the eight-page tree are covered by their actual SHA-256 hashes. The Astro policy currently includes five additional generated script hashes beyond the four scripts emitted in this candidate; the Vercel rule copies the generated policy exactly. This is an explicit limitation of the generated policy, not evidence of an extra emitted script. No external executable script appears in the package. `style-src 'unsafe-inline'` remains in the pre-existing Astro policy.

The other proposed response headers are `Strict-Transport-Security: max-age=86400` without `includeSubDomains` or `preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `X-Robots-Tag: noindex`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`. The short host-scoped HSTS duration is a preflight choice for an unconfirmed dedicated hostname. The local `robots.txt` disallows all crawlers. **Actual HTTP headers, 404 behavior, TLS and host identity are NOT VERIFIED.**

## Access, privacy and legal gates

[Vercel Deployment Protection](https://vercel.com/docs/deployment-protection) states that Standard Protection does not protect production domains; All Deployments protection, including production domains, is a Pro/Enterprise feature. A stable protected project alias must not be assumed safe on a Hobby plan. [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication) supports individually granted, revocable Vercel-account access. It is available on all plans, but Hobby permits only one external user per account; the account plan and 10–20-tester access capacity are **NOT VERIFIED**. Protected QA should be restricted to authorized project viewers with protection verified on every URL. For a later invited pilot, grant individually revocable Vercel-account access only after confirming plan capacity and project isolation; do not use shareable bypass links, reusable passwords or automation secrets. The invite itself requires separate approval.

The candidate has no app analytics, wallet calls, RPC calls, PIT Taxlot IndexedDB writes or server-side storage of form fields. Browser inputs and CSV files remain local in the reviewed code. The host still sees ordinary HTTP metadata; Vercel Authentication may set its own cookies for protected QA. [Draft privacy and legal notices](../../product/PHASE-AF-NOTICES-DRAFT.md) are **not publishable yet**: operator must supply the publisher's legal identity/status, contact channel/address, jurisdiction, hosting metadata/retention details and applicable legal review. A dedicated notice route is deferred until those facts are supplied, then requires a revised allowlist, hashes and tests. Calculator legal review is distinct from PIT's closed mainnet, trading and monetization gates. Assumption 8 stays **OPEN** for its existing unresolved accounting/legacy criteria.

The `noindex` header, page metadata and robots policy reduce discoverability; they are **not** access control. Hosting protection must be independently verified before any QA deployment is considered private.

## Hosted QA and deployment decision

The [hosted QA checklist](HOSTED-QA-CHECKLIST.md) covers exact source/deployment identity, protection, TLS, actual headers, allowlisted 200 and excluded 404 responses, no fallback, Chromium/Firefox, synthetic local CSV/report tests, mobile/keyboard access and no unexpected network requests. Safari/mobile-device check remains **PENDING**. No local result is promoted to hosted PASS.

| Gate | Decision | Remaining evidence |
| --- | --- | --- |
| Local candidate and host package | PASS | Exact file list, copied bytes, config and CSP coverage checked locally. |
| Protected hosting project | NO-GO pending approval | New project ID, plan, alias, no inherited secrets/integrations, All Deployments protection. |
| Actual HTTP and browser QA | NOT VERIFIED | No deployment; run the checklist after authorization. |
| Privacy/legal notice | NO-GO for invited pilot | Publisher/contact/hosting facts and legal review missing. |
| 10–20 invited-user access | NO-GO | Verify plan capacity and individually revocable access; invitations separately approved. |
| Public beta/indexing | NO-GO | No public release, public hostname approval or legal/mainnet gate change. |

**Authorization manifest for a later decision:** create one separate Vercel project named `pit-readonly-beta-qa` (proposed only); use a dedicated HTTPS hostname assigned to that project (unconfirmed); deploy only `dist-readonly-beta-host/` with `public/` as output; compare the tree hashes above against the final candidate; enable Vercel Authentication for **all URLs**, including production aliases, before the first deployment; no Git connection, env vars, functions, integration inheritance, redirect, rewrite or indexing; allow only authorized project viewers. Confirm the account has a plan that can protect the intended hostname and record any plan charges before creation. Rollback: disable/remove the new alias/deployment or delete the new project, revoke per-user access, and verify the hostname no longer serves the candidate. This approval would cover a **protected QA candidate only**, not public access, tester invitations, indexing or marketing.

## Validation record

Targeted unit command ran the whole Vitest suite due the repository script's argument forwarding: **321/321 tests across 37 files PASS**, including five new host-package tests. An initial local Playwright attempt failed to start its loopback server under the sandbox (`connect EPERM 127.0.0.1:4398`); the same targeted suite under authorized local-process access passed **5/5**, including a direct `file:` browser test of candidate CSV preview, explicit import, JSON download, zero wallet calls, zero IndexedDB opens and zero network requests. This is local Chromium evidence, not hosted or Firefox evidence.

The [complete clean-source release transcript](release-check.txt.gz) tested implementation commit `2b5ba57c94076d6727f6844004ae686ff685c6de` and exited 0: **321/321 unit tests across 37 files; 172 files typechecked with 0 errors, 0 warnings and 1 pre-existing hint; 15 full-build pages; 143 guarded full-build files; and 59/59 Playwright tests**. The full-build SHA-256 remained `9aecfcc3a8ba9a0ea03481c24a59db7377e335321272e2190a27bdda9365df1b`; the candidate and host package hashes are listed above. The transcript is retained byte-for-byte after `gzip -d`; the compressed artifact avoids treating terminal-formatting spaces as source whitespace. The audit-only transcript amendment does not change executable source; a final check against its clean committed source is reported in the Phase AF delivery. The prior Phase AE Playwright readiness timeout evidence remains in its audit and is not erased by this passing run.
