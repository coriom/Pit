# Phase Y.7 — offline staging bypass lifecycle diagnostics

Status: **offline runner correction PASS; protected browser acceptance BLOCKED**. No Vercel credential was created, renewed, rotated, or used in Phase Y.7. The operator's personal Brave profile and synthetic fixture were not accessed. Assumption 8 remains **OPEN**.

## Preserved baseline and prior failure

Initial `git rev-parse HEAD`: `4eea7f45e7556e5ed83f80aa12e2d589a081be29`. Branch: `main`. Remote: `git@github.com:coriom/Pit.git`; initial upstream divergence: `0 0`. The initial dirty tree consisted of `package.json`, `scripts/audit/staging-accounting-harness.ts`, `scripts/release/artifacts.mjs`, `tests/e2e/staging-accounting-harness.spec.ts`, `tests/unit/static-artifacts.test.ts`, and the untracked `scripts/audit/staging-acceptance.mjs`, `staging-access.mjs`, `staging-preflight.mjs`, `staging-readonly.mjs`, `tests/staging-access.test.ts`. These Phase Y.6 preparations were preserved. `src/lib/config.ts` still has `FEES_ENABLED: false` and `MAINNET_ENABLED: false`.

The previous authorized command was `pnpm staging:acceptance --run-authorized`. Its sanitized output ended with exit 2 and `SECURITY BLOCKER — ACTIVE BYPASS`, with empty `stages` and report path `/tmp/pit-staging-report-DV6Eqq/result.json`. The report was written on 2026-10-13 at 17:26:58 +08:00 and contains only `error: "Browser operation failed; private browser details omitted"` plus the active-bypass label. No original API status, response body, nested cause code, or per-state UTC timing was retained. Those values cannot be reconstructed from this report.

| Lifecycle state | Supported evidence from the prior attempt |
| --- | --- |
| PREFLIGHT | PASS: project/deployment identity, SSO enabled, zero existing bypass entries, unauthenticated 302. |
| CREDENTIAL_CREATION | UNKNOWN: a local secret file existed after the attempt, but the mutation response/status was not captured. |
| CREDENTIAL_RETAINED | PASS: a local outside-repository file existed with directory mode 700 and file mode 600; its contents were never printed. |
| BYPASS_HTTP_AUTHENTICATION | UNKNOWN: no protected PIT HTTP 200 was preserved. |
| BROWSER_AUTHENTICATION | UNKNOWN: empty `stages` does not prove Chromium launched or reached PIT. |
| STAGING_TEST | BLOCKED: no A–E stage result exists; no autonomous accounting acceptance occurred. |
| REVOKE_REQUEST | UNKNOWN: the old `finally` block invoked `revokeBypass()` because the local file existed, but no PATCH response/status was retained. |
| REVOKE_CONFIRMATION | FAILED TO VERIFY IN RUNNER: every exception was mislabeled active. Subsequent read-only checks found zero project entries, old credential HTTP 302, anonymous HTTP 302, and SSO enabled. This subsequent observation proves no active bypass at that readback time, not the earlier PATCH outcome. |
| LOCAL_SECRET_DELETION | PASS after that later readback: the temporary file was deleted and its absence checked. |

The last proven successful state **during the original run** is `CREDENTIAL_RETAINED`. The underlying operational failure—creation API, edge propagation, protected HTTP read, or another pre-browser error—is **UNKNOWN**. A separate source-code defect **is established**: `created` became true only after a protected HTTP 200, but `finally` attempted revocation whenever the local file existed; any revocation exception, including API rejection or an inconclusive read, became `SECURITY BLOCKER — ACTIVE BYPASS`. `safeReason()` also erased the earlier safe failure code. The active label was unsupported by the recorded state.

## Correction and offline controls

`scripts/audit/staging-lifecycle.mjs` now drives the actual runner with injected effects, records UTC state transitions, and separates creation response, protected HTTP access, browser invocation, revocation request, and read-only revocation confirmation. Only a current project entry or an old credential receiving HTTP 200 supports `CREDENTIAL_STILL_ACCEPTED`. A timeout or unavailable read yields `SECURITY_STATUS_UNKNOWN`. Zero entries plus old-credential and anonymous HTTP 302 yields `REVOCATION_CONFIRMED`. The runner deletes the local secret only after confirmation; a failed revoke PATCH remains `REVOCATION_REQUEST_FAILED` even if later reads prove the credential inactive. It never retries a state-changing API mutation or generates a replacement secret. The explicit `--run-authorized` mode remains required; ordinary invocation returns `AUTHORIZATION_REQUIRED` without a network mutation.

The Vercel API wrapper now exposes only approved status codes (`VERCEL_HTTP_###`, timeout, unavailable); it does not read or print mutation response bodies. Unexpected nested errors collapse to `UNCLASSIFIED_ERROR`. The actual browser workflow records whether Chromium launched and whether PIT returned an authenticated HTTP 200, avoiding a claim based merely on invoking the function. The existing exact-origin header filter excludes cookies and authorization headers and refuses CoW, Hyperliquid, RPC, mainnet, lookalike, userinfo, HTTP, and wrong-port URLs. No browser trace, screenshot, or storageState export is configured. The production artifact guard rejects audit code/loader markers. The PIT accounting harness's earlier file-selection fix and its browser regression remain preserved.

Deterministic tests use inert synthetic strings and mock the effect callbacks plus the actual HTTP wrappers. They cover successful create/access/revoke, local and remote creation failure, SSO 302 and HTTP 200 without CSP, browser failure, revoke API failure, delayed propagation, timeout, still-accepted credential, inactive credential with zero entries, cleanup order, failure before creation, no replacement creation, URL/header scope, and nested error redaction. No test contacts Vercel or creates a credential.

During offline validation, the first 31-test Playwright run had **30 pass / 1 fail**: the local observer panel was not found within its five-second assertion window under six workers. The saved page snapshot contained the observer text; the isolated case passed **1/1**, and a complete rerun passed **31/31** without a source change. This remains a transient browser-test failure, not proof of a staging HTTP result.

## Read-only security posture

At 2026-10-13 10:16 UTC, an authorized **read-only** project/deployment/page check returned project `prj_G17pKAhw8I1Ou9bQFFYV6DTB9ydE`, deployment `dpl_DexGHUv9wG64aH1BVPBqQXJaYQro` READY, Vercel Authentication `all_except_custom_domains`, zero bypass entries, and unauthenticated PIT HTTP 302. The deleted old credential was **not** retested in Phase Y.7. No real staging browser HTTP/CSP, IndexedDB reload, downloaded CSV validation, or cleanup result was obtained.

The [exact targeted test transcript](lifecycle-targeted-y7.txt) is versioned here. The clean-source full release transcript is retained separately from the source tree, whose release guard requires a clean working tree. A future real bypass attempt requires a fresh, separate operator authorization. Nothing in this offline correction closes Assumption 8's public accounting, legacy-record recovery, derivative-accounting, or legal requirements.
