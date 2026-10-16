# Phase AE — product launch readiness

Status: **LOCAL CANDIDATE ONLY — PUBLIC RELEASE NO-GO**. No public deployment, indexing, telemetry, outreach or transaction occurred in this phase. Source baseline: `b901d6c0ad1a0e6e0f017706338546bd1c72a909` on clean `main`, upstream `origin/main` at `git@github.com:coriom/Pit.git`, divergence `0/0` at phase start.

## Product and route inventory

| Tool | Classification | Ordinary visitor without wallet? | Candidate |
| --- | --- | --- | --- |
| Portfolio Exposure Analyzer | Browser-local manual spot analysis | Yes | Yes |
| Swap Cost Simulator | Browser-local manual cost model | Yes | Yes |
| Impermanent Loss Calculator | Browser-local model | Yes | Yes |
| PnL Calculator | Browser-local model | Yes | Yes |
| Bridge Cost Comparator | Browser-local hypothetical routes | Yes | Yes |
| Liquidation Price Calculator | Browser-local generic model | Yes | Yes |
| Token Approval Inspector | Blockchain read-only Sepolia RPC | Yes, public address and network needed | No |
| Wallet connection | Wallet-dependent provider read | No | No |
| Swap | Testnet execution / CoW; Uniswap execution disabled | No | No |
| Perps | Hyperliquid testnet execution lab | No | No |
| Taxlot export | Accounting/testnet integration with connected wallet | No | No |

The previous homepage loaded `TradingApp` and led with CoW/Hyperliquid. The new homepage leads with the three wallet-free tools, makes the assumptions and privacy boundary visible, links to the full registry-driven toolbox, and separates the testnet trading lab. The full toolbox sorts local tools first and continues to label wallet/network requirements. The three flagship pages now give a clear sample and limitations before personal input. The portfolio CSV still requires explicit preview acceptance.

## Read-only candidate architecture

`astro.readonly-beta.config.mjs` builds a separate Astro page tree under `src/read-only-beta/pages` with an empty public-asset directory except `robots.txt`. It imports only the six reviewed local tool components and a static homepage/toolbox. The output is `dist-readonly-beta/`, ignored by Git and never deployed. The normal 15-page PIT build remains separate. The candidate has no wallet, execution, RPC lookup or Taxlot page entries. `pnpm beta:check` validates the emitted route/file allowlist, rejects every executable JS chunk, checks inline executable script hashes against the generated CSP, rejects wallet/network/storage calls in executable HTML, checks internal links, rejects remote CSS resources, emits a restrictive `_headers`, and preserves noindex in each page and `robots.txt`. This is stronger than hiding routes in the full build. Production execution gates remain false and full-build trading routes retain their existing preflights.

The candidate is strictly browser-local and carries no PIT accounting IndexedDB namespace. It contains no signing adapter, autonomous signer, market API or analytics integration. A future public candidate should use a **new dedicated HTTPS hostname and separate static-host project** with only `dist-readonly-beta/` uploaded, no alias to the protected staging project, no shared-origin PIT accounting storage, and a verified restrictive response-header configuration. Before release, independently prove ownership, TLS, actual CSP/HSTS/noindex headers, mobile/browser behavior and privacy, then obtain legal and explicit public-release authorization. The existing SSO-protected staging origin must remain protected; it is not the proposed public origin. The current candidate's `_headers` is a static-host template, **not evidence of actual HTTP headers on a deployed site**.

## GO / NO-GO

| Gate | Status | Evidence / next condition |
| --- | --- | --- |
| Product clarity | Local PASS; human NOT VERIFIED | Tool-first copy and clear local/testnet labels; invited users must test comprehension. |
| First-use experience | Local PASS; human NOT VERIFIED | Illustrative flagship journeys and Playwright checks; no real tester observations. |
| Mobile and browser QA | Local PASS; public NOT VERIFIED | Local Chromium checks; public HTTPS/mobile browser matrix still needed. |
| Security isolation | Local PASS; host NOT VERIFIED | Separate eight-page allowlisted artifact, zero JS chunks and static CSP checks; actual hosted headers pending. |
| Privacy | Local PASS; operational NOT VERIFIED | No telemetry, wallet or storage in candidate; feedback process requires consent and review. |
| Hosting and public access | NO-GO | No dedicated approved public origin, deployment, or live response-header evidence. |
| Legal claims and restrictions | NO-GO | Existing legal/mainnet gates remain closed; public language requires review. |
| Human beta readiness | NO-GO | 10–20 invitations and five conversations are targets, not completed research. |

Overall public beta decision: **NO-GO**. An isolated local artifact is prepared for review, not a live public beta or approval to index.

## Validation record

Targeted `tests/unit/read-only-beta.test.ts`: 8/8 PASS, including forbidden route/script/chunk, CSP and robots mutations. An initial `tests/e2e/product-beta.spec.ts` run had one test expectation failure: the actual portfolio sample displayed `$3000` while the assertion expected `3,000`; the assertion was corrected without changing financial logic. The first unprivileged Playwright run could not bind loopback (`listen EPERM`); the authorized local-process rerun of `tests/e2e/interface.spec.ts` passed 5/5. The corrected targeted product browser run passed 4/4, including a direct browser run of the isolated candidate. Precommit unit tests passed 316/316; typecheck covered 170 files with zero errors, zero warnings and one preexisting hint.

The [first full clean-source release transcript](release-check-initial-failure.txt) tested initial implementation commit `3b3916d` and exited 1: all 316 unit tests, typecheck, 15-page build, 143-artifact guard and separate beta guard passed; Playwright finished **51 passed, 7 failed**. Six failures came from legacy swap tests still opening `/`, which now intentionally has no trading controls. The seventh found two identical `../swap/` anchors after the global Trading lab link joined a registry-generated related link. Tests now open the unchanged `/tools/swap/` route; the global link uses a different relative URL that remains compatible with IPFS subpaths. The targeted confirmation of those three suites passed **13/13**. No execution logic, fee gate or wallet preflight was changed.

The [first full passing confirmation transcript](release-check-three-worker-pass.txt) tested corrected implementation commit `a55260c4a05c71b3810cc526000f5893d58915aa` and exited 0: **316/316 unit tests across 36 files, 170 files typechecked with 0 errors/0 warnings/1 preexisting hint, 15 noindex static pages, 143 guarded production artifacts, and 58/58 Playwright tests**. The production build SHA-256 was `9aecfcc3a8ba9a0ea03481c24a59db7377e335321272e2190a27bdda9365df1b`. The separately built beta candidate contained eight allowlisted pages, one CSS asset, 11 total files and no JS chunks, SHA-256 `fa15a5858164ae35399cb027272e55ae55520ae5eaf4d5d18171e427a2d630f8`.

A subsequent clean-source check on audit-amended commit `c3cec53` again passed unit, typecheck, both builds and artifact guards, but [its exact transcript](release-check-readiness-timeout.txt) ended with **56 Playwright passed, 2 failed**. Both failures captured the static `/tools/swap/` page before its React island mounted, with a five-second missing-element assertion; a focused rerun of the two affected suites passed **9/9**. This is evidence of load-sensitive browser-test readiness, not evidence that the app's trading gate changed. `playwright.config.ts` now bounds CI execution to one Chromium worker on this constrained host. These failed runs are retained and are not reclassified as passing.

The [complete one-worker clean-source release transcript](release-check.txt) tested commit `bc0f4bbae57bcdf5a0544f9de4ebe115bf0c8c18` and exited 0: **316/316 unit tests, 58/58 Playwright tests, 170-file typecheck with 0 errors/0 warnings/1 preexisting hint, 15 noindex pages and 143 guarded full-build artifacts**. The separate beta guard passed eight allowlisted pages, one CSS asset, zero JS chunks, SHA-256 `fa15a5858164ae35399cb027272e55ae55520ae5eaf4d5d18171e427a2d630f8`; the full-build SHA-256 remained `9aecfcc3a8ba9a0ea03481c24a59db7377e335321272e2190a27bdda9365df1b`. The last amendment contains only audit evidence; the final clean commit is checked again before delivery.

Assumption 8 remains **OPEN**: the operator-observed synthetic protected-staging accounting acceptance and local CoW settlement evidence do not establish public origin accounting/legacy recovery or derivative support. This phase changes neither Taxlot semantics nor legal gates. See `ASSUMPTIONS.md` and the earlier Phase Y/Z audits.
