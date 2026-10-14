# Phase Y.9 — offline Vercel bypass request diagnosis

Status: **documented request-contract defect corrected; original HTTP 400 body UNKNOWN; staging A–E BLOCKED**. This phase made no live Vercel credential mutation, browser accounting write, deployment, or transaction. Assumption 8 remains **OPEN**.

## Baseline and preserved Phase Y.8 evidence

Initial HEAD was `d28f6abf62c99581ff9264ce96fb60e1378fc0aa` on clean `main`, upstream `origin/main`, divergence `0 0`; remote `git@github.com:coriom/Pit.git`. `FEES_ENABLED=false` and `MAINNET_ENABLED=false`. No PIT accounting record or the operator's personal Brave profile was accessed.

The separately authorized Y.8 attempt reached local credential retention at `2026-10-14T05:54:47.525Z`. Creation returned `VERCEL_HTTP_400` at `05:54:48.015Z`; the response body was **not retained**. The cleanup PATCH returned `VERCEL_HTTP_404` at `05:54:49.565Z`. Readback at `05:54:50.898Z` found zero project bypass entries, old-credential HTTP 302 and anonymous HTTP 302. The local temporary file was deleted at `05:54:50.899Z`; a later independent read-only preflight again found zero entries with Vercel Authentication enabled. No protected PIT HTTP 200 or A–E browser stage occurred. The 400's exact Vercel error code/message and why the cleanup returned 404 are **UNKNOWN**. These observations prove no active bypass at readback, not that one was successfully created and revoked.

## Official request contract versus PIT's request

Source: [Vercel's current REST endpoint](https://vercel.com/docs/rest-api/projects/update-protection-bypass-for-automation) and its [published OpenAPI schema](https://vercel.com/openapi.json), retrieved 2026-10-14. The HTML page collapses nested properties; the OpenAPI body schema supplies the precise pattern and types. The published example renders `regenerate` as a string, but the OpenAPI schema defines a **boolean**, matching PIT's `false`.

| Field | Published contract | Prior PIT request | Result |
| --- | --- | --- | --- |
| URL/method | `PATCH /v1/projects/{idOrName}/protection-bypass` | exact PIT project ID, PATCH | MATCH |
| Auth/content type | bearer token; `application/json` | bearer token; JSON serialization | MATCH |
| `teamId`/`slug` | optional query fields | both omitted | MATCH; no wrong query was sent |
| `generate.secret` | caller-supplied string matching `^[a-zA-Z0-9]{32}$` | `randomBytes(32).toString("base64url")`, 43 characters and potentially `-`/`_` | **PROVEN CONTRACT VIOLATION** |
| `generate.note` | string, at most 100 characters | 50-character fixed note | MATCH |
| `revoke.secret` | string | retained candidate | MATCH type; remote existence not proven |
| `revoke.regenerate` | required boolean | `false` | MATCH; no replacement requested |

The invalid prior `generate.secret` is a sufficient **plausible** explanation for HTTP 400; the original response body is missing, so its actual server-side rejection reason remains **UNKNOWN**. The creation operation now generates 32 uniformly selected alphanumeric characters using Node's cryptographic `randomInt`. It validates the exact body shape and note length before any HTTP call. Only the documented project path is built; the optional team query is omitted. The former 43-character format remains readable only for safe recovery of an interrupted old local file.

## Diagnostic and lifecycle correction

For a future unsuccessful PATCH, the runner reads only the error response, then records HTTP status, a bounded and recursively redacted structured Vercel code/message, a validated request ID if supplied, UTC time, and validated **field names/types**. It never records request field values, bearer tokens, cookies, URLs, raw error bodies, or nested causes. Malformed/absent JSON becomes `UNAVAILABLE_OR_MALFORMED_ERROR_BODY`; it is not converted into a guessed Vercel error. Arbitrary text containing the candidate secret, credential-labelled nested values, bearer strings, long token-shaped values and URLs are redacted before report serialization. Success responses remain unread because they may echo the credential.

The sanitizer is deliberately bounded to structured error fields and identifiable text. It does not claim to detect arbitrary encoded or deliberately fragmented credentials; unexpected response fields are not copied into the report.

HTTP 400 maps to `CREATION_REJECTED`, while successful API creation maps to `CREATION_CONFIRMED`; a protected PIT HTTP 200 with CSP maps separately to `ACCESS_CONFIRMED`. The runner still attempts bounded cleanup after a rejected creation, but a cleanup 404 plus zero entries and old/anonymous HTTP 302 maps to `NO_ACTIVE_BYPASS_OBSERVED`, **not** `REVOCATION_CONFIRMED`. The latter requires a confirmed creation, successful revoke request, and inactive readback. Missing `protectionBypass` metadata now makes preflight fail and revocation confirmation `SECURITY_STATUS_UNKNOWN`; absence is never inferred from a missing response field. No state-changing retry or replacement exists. The local secret is deleted only after an inactive readback; uncertainty retains it for manual resolution.

The deterministic tests use inert synthetic material and mocked HTTP responses only. They cover the documented 32-character request, invalid/legacy secret shapes, malformed request/response JSON, invalid notes, exact no-query URL, structured and bodyless HTTP 400, cleanup 404 after rejected creation, delayed readback, still-active and unknown states, nested redaction, and absence of secret text in serialized stdout/stderr/report evidence. Production artifact guards prohibit the audit marker and staging credential-loader code from normal browser assets. No protected application HTTP/CSP, real IndexedDB A–E sequence, CSV validation or cleanup was performed in Y.9. The operator's existing Brave fixture remains untouched.

[Exact targeted test output](bypass-targeted-y9.txt): 44/44 tests across the two staging access and lifecycle test files passed.

The expanded local control run passed 92/92 tests across staging access, lifecycle, release invariants and static artifacts. The candidate-file credential/protected-identity scan passed on 316 tracked and untracked files. A current read-only PIT preflight returned the expected project/deployment/stable alias, Vercel Authentication PASS, `existingBypasses: 0`, and `secretCreated: false`; the local bypass file remains absent. The project response explicitly contained an empty `protectionBypass` object. These are current protection-state checks, not a live creation, acceptance or revocation test.

The complete clean-commit `pnpm release:check` transcript and final build SHA-256 are retained outside the repository so the release guard can test a clean tree; the final delivery identifies the exact tested commit and output path. A future credential attempt requires a separate explicit authorization. Assumption 8 remains OPEN for actual protected staging accounting, legacy-record recovery, derivative accounting and other unresolved criteria.
