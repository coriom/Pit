# PIT verification — dedicated public origin BLOCKED

## Phase Y.2 — scope-free Vercel API readback; application SSO still blocks

The connected Vercel MCP now retrieves the exact PIT project and READY staging deployment by ID **without** a team scope argument. It confirms the dedicated stable alias, connected owner/team, Vercel Authentication enabled, and uploaded `vercel.json`, `_headers`, HTML and JS file IDs matching the local artifact. The connector truncates larger file bodies. Unauthenticated HTTPS requests to five staging paths still return Vercel Authentication 302, not PIT application HTTP 200; no actual PIT response CSP or browser storage/CSV check was possible. No shareable bypass was created, no origin was approved, and Assumption 8 remains OPEN. [Exact API selections, artifact identities, HTTP result matrix and blockers](audit/phase-y/VERCEL-STAGING.md).

The [complete 376-line `pnpm release:check` output](audit/phase-y/release-check-y2.txt) tested clean source `11509e7eca109f5cee3c6180688e6a1a758ddf03` and exited 0: **182 unit tests; 28 Playwright tests; 116 files typechecked with 0 errors, 0 warnings and 1 existing hint; 11 pages; 138 guarded artifacts; build SHA-256 `d8e7e1da8cfc56fb351df1b1126a0272a23dde9849698b70f0fb1c6b4efa39e0`**. This phase adds only evidence documentation and the exact transcript after the tested source snapshot.

## Phase Y.1 — protected Vercel staging candidate

Four inherited Phase Y preparation files generate `dist/vercel.json` from the built CSP and require the Vercel header rule to equal `dist/_headers`; negative tests reject drift or function configuration. The stable staging alias `https://pit-testnet-staging-corioms-projects.vercel.app` and exact deployment URL return Vercel Authentication HTTP 302. All five requested alias paths returned 302, including the CSS asset; those are **authentication responses, not PIT application responses**. Connected Vercel account lookup worked, but project and deployment-file reads returned scope 403. `vercel` CLI is unavailable. An automatic approval review rejected a temporary SSO-bypass share link. No browser acceptance, application HTTP-header verification, or exact-origin accounting approval occurred. [Full access result, safe header matrix and Assumption 8 criteria](audit/phase-y/VERCEL-STAGING.md).

`FEES_ENABLED=false`, `MAINNET_ENABLED=false`, the default-deny accounting-origin policy and noindex remain unchanged. Phase W's CoW live result remains valid; Hyperliquid testnet collateral, public-origin/legacy recovery, and the legal/mainnet-fee gate remain open. The [exact 376-line clean-source release transcript](audit/phase-y/release-check.txt) tested commit `b847225854af59709d29107be2f67b5c35c73c39` and exited 0: **182 unit tests; 28 Playwright tests; 116 typechecked files with 0 errors, 0 warnings, 1 existing hint; 11 static pages; 138 guarded artifacts; build SHA-256 `d8e7e1da8cfc56fb351df1b1126a0272a23dde9849698b70f0fb1c6b4efa39e0`**. The [initial full run](audit/phase-y/release-check-initial-failure.txt) failed one transient Perps-island mount timeout; its isolated rerun and the next full 28-test run passed. Only the two exact transcripts and audit-document corrections were added after the tested source commit. An offline PASS cannot establish Vercel's served headers or browser storage.

## Phase W — live Sepolia CoW execution and accounting

The disposable test operator at `0x29d0B5939dcC4D0492D72ABd1210dEbd6c90cC96` completed one exact WETH wrap, one exact relayer approval, and one CoW order through PIT's built wallet-facing swap UI. The order UID `0x5c6cb1b029fa885e0c80d1d8023aaf863d610432a27ebf28de8437273686a34929d0b5939dcc4d0492d72abd1210debd6c90cc966ac87673` reached `fulfilled` at Sepolia block 11875047. Independent receipt/token-transfer readback and the CoW trades/order APIs confirm 5,000,000,000,000,000 WETH wei sold and 250,299,154 Circle test-USDC base units received. The order's fee and executed-fee fields are zero; appData has `appCode=PIT` and no partner-fee metadata. The Taxlot-v1 event was stored as `trade`, not `disposal`; corrected browser CSV re-export imported through the current real Taxlot Generic importer with zero issues and matching integer economic fields. [Full live evidence, original importer failure, fix and metadata differences](audit/phase-w/AUTONOMOUS-TEST-OPERATOR.md). Public 32-byte hashes in committed evidence use the documented reversible `public-hash:` form.

The first browser CSV export exposed a real compatibility defect against a newer upstream Taxlot importer: extra PIT provenance columns caused a blocking `AMBIGUOUS` issue. The original file and failure are retained in Phase W. `eventsCSV` now emits only the nine mapped financial columns; the unchanged full event remains in IndexedDB. This change has a targeted regression test. The autonomous signer is confined to Node audit scripts; release guards reject its import or secret-loader marker in production source/artifacts. **Dedicated public HTTPS origin verification (Assumption 8), Hyperliquid live/derivative accounting, and the legal/mainnet fee gate remain open.** The repository had no Git remote at baseline, so GitHub push and remote HEAD parity are not yet verified.

The [complete exact clean-committed-source `pnpm release:check` output](audit/phase-w/release-check.txt) tested commit `1c53d7839ebf0ea398ed4334928bcc571ba8e11c` and exited 0: **180/180 unit tests, 28/28 Playwright tests, 115 files typechecked with zero diagnostics, 11 built pages**, 137 production artifacts passing the guard, and build SHA-256 `fbd0a0526942d5abc5e5c284376155ef6dad461cf98d6af819fdcb33596af1a4`. The first clean-source run failed one obsolete CSV-metadata E2E expectation; [its exact transcript](audit/phase-w/release-check-initial-failure.txt) is preserved. The final amendment changes only evidence/docs, leaving tested source/configuration/scripts/tests/lockfiles/public assets identical. Historical Phase K/V results below describe their earlier snapshots and remain unchanged.

## Phase V — read-only operator observation

The local public-address observer and public-identifier verifier are documented in [Phase V evidence](audit/phase-v/OPERATOR-OBSERVER.md). The current Ethereum Sepolia address has 0.05 ETH, 20 test USDC, 0 WETH and zero CoW relayer allowance; read-only approval gas estimation returned 56,240 units. The pinned CoW API returned `HTTP 404 NoLiquidity: no route found` for 1 and 5 test USDC → WETH. No wallet approval/signature/order is authorized from this result. Observer quotes remain outside the private execution map; approval/submission reject them. The CLI cannot prove browser origin or IndexedDB state. Phase H-live, dedicated public-origin acceptance, derivative accounting and legal gates remain open. `pnpm release:check` passed on clean tested source `ea0dd61212c440187caf391f8105a3bf67ad76da`: 164 unit tests, 28 Playwright tests, 106 files typechecked without diagnostics, 11 static pages, build SHA-256 `a36c5cd3ab49332af49df939d774df07e090b2e8c21bf6c8eb1f0a7ec7cbf253`. [The complete 369-line output](audit/phase-v/release-check.txt) is unchanged evidence, with SHA-256 `617772b772845c173783ef7d1159bbb30a35d3386ded0c2dc7a47ca36e00557b`.

No Cloudflare staging credential/project access or assigned HTTPS origin was available. No public deployment, TLS readback or actual HTTP response-header capture occurred. Assumption 8 remains OPEN. [Before/after assumption text, criterion table, planned staging target and blockers](audit/phase-k/DEDICATED-ORIGIN.md).

`pnpm release:check` passed from clean source revision `ef1bccee99e56946d5d6d995fa0abfaf3f42d987`: **75 unit tests, 16 Playwright tests, 54 Astro/TypeScript files with 0 errors/0 warnings/0 hints, and a successful 3-page production build**. Build SHA-256: `86866a41be5a047320081a7a81422fa7d968f14ecd4a8aea42124f16e60e11b7`. [Every tested non-documentation tracked file hash](audit/phase-k/tested-source.json) shows source identity after the evidence amendment. The final amendment changes audit documentation only.

Local Cloudflare artifact evidence: [generated `_headers` and hashes](audit/phase-k/static-artifact.txt), including CSP with `frame-ancestors 'none'`. **This is not an actual HTTP response.** [Credential availability](audit/phase-k/credential-availability.txt), [missing-target smoke refusal](audit/phase-k/staging-smoke-blocked.txt), and [unapproved-origin refusal](audit/phase-k/unapproved-origin-refusal.txt) establish the fail-closed blocker. No external origin, gateway or wallet was exercised.

## Exact clean-tree `pnpm release:check` output

Combined stdout/stderr follows verbatim with command and exit-code framing, including terminal escapes, timing and third-party build warnings. Playwright uses local offline fixtures. No live transaction or deployment command ran.

```text
$ pnpm release:check

> pit@0.1.0 release:check /home/corio/PIT
> node scripts/release/check.mjs

Clean release source: ef1bccee99e56946d5d6d995fa0abfaf3f42d987
PASS protected fee/network configuration: FEES_ENABLED=false; MAINNET_ENABLED=false; recipients/rates unchanged
PASS exact Taxlot v1 schema SHA256 d8eb339ed7acd7da3b68ef09fe5c1b01c4cc3258cb401a4f2ba8805e7a3b07d7
PASS origin policy: default-deny; production allowlist empty; legal page unchanged
PASS tracked-file credential patterns and environment-file policy (not a proof against encoded secrets)

$ pnpm test

> pit@0.1.0 test /home/corio/PIT
> vitest run


 RUN  v3.2.7 /home/corio/PIT

 ✓ tests/schema-provenance.test.ts (1 test) 5ms
 ✓ tests/release-invariants.test.ts (11 tests) 29ms
 ✓ tests/storage-policy.test.ts (5 tests) 66ms
 ✓ tests/schema-capabilities.test.ts (3 tests) 81ms
 ✓ tests/events.test.ts (4 tests) 315ms
 ✓ tests/derivative-boundary.test.ts (6 tests) 144ms
 ✓ tests/audit-taxlot.test.ts (1 test) 269ms
 ✓ tests/audit-builder-path.test.ts (1 test) 17ms
 ✓ tests/hyperliquid-release-path.test.ts (3 tests) 87ms
 ✓ tests/cow.test.ts (6 tests) 38ms
 ✓ tests/execution-paths.test.ts (4 tests) 84ms
 ✓ tests/execution-preflight.test.ts (24 tests) 55ms
 ✓ tests/hyperliquid.test.ts (2 tests) 9ms
 ✓ tests/audit-fees.test.ts (4 tests) 7ms

 Test Files  14 passed (14)
      Tests  75 passed (75)
   Start at  16:47:51
   Duration  4.68s (transform 2.18s, setup 1.30s, collect 21.74s, tests 1.21s, environment 13ms, prepare 5.12s)


$ pnpm check

> pit@0.1.0 check /home/corio/PIT
> astro check

16:47:58 [content] Syncing content
16:47:58 [content] Synced content
16:47:58 [types] Generated 60ms
16:47:58 [check] Getting diagnostics for Astro files in /home/corio/PIT...
Result (54 files): 
- 0 errors
- 0 warnings
- 0 hints


$ pnpm build

> pit@0.1.0 build /home/corio/PIT
> node scripts/generate-validator.mjs && astro build && node scripts/prepare-static.mjs && node scripts/add-static-csp.mjs && node scripts/build-manifest.mjs

16:48:13 [content] Syncing content
16:48:13 [content] Synced content
16:48:13 [types] Generated 76ms
16:48:13 [build] output: "static"
16:48:13 [build] mode: "static"
16:48:13 [build] directory: /home/corio/PIT/dist/
16:48:13 [build] Collecting build info...
16:48:13 [build] ✓ Completed in 130ms.
16:48:13 [build] Building static entrypoints...
16:48:14 [vite] ✓ built in 1.24s
16:48:14 [build] ✓ Completed in 1.28s.

 building client (vite) 
16:48:14 [vite] transforming...
16:48:18 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js (6:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
16:48:18 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js (6:27): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
16:48:19 [WARN] [vite] node_modules/.pnpm/ox@0.9.17_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js (6:27): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.9.17_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
16:48:20 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js (2:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
16:48:20 [WARN] [vite] node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment

"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle."

in "node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
16:48:20 [WARN] [vite] node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment

"/** Anchors a pattern source. The interpolation lives here rather than at the call site because
 * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it
 * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */"

in "node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
16:48:21 [WARN] [vite] node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js (6:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
16:48:21 [WARN] [vite] node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js (2:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
16:48:27 [vite] ✓ 5294 modules transformed.
16:48:28 [vite] rendering chunks...
16:48:29 [vite] computing gzip size...
16:48:29 [vite] dist/_astro/TradingApp.PLSYCTbZ.js                     0.10 kB │ gzip:   0.10 kB
16:48:29 [vite] dist/_astro/base16.BPd3-eEf.js                         0.33 kB │ gzip:   0.24 kB
16:48:29 [vite] dist/_astro/cursor.S60aeUGS.js                         0.38 kB │ gzip:   0.27 kB
16:48:29 [vite] dist/_astro/chevron-left.LQQeTiSz.js                   0.52 kB │ gzip:   0.33 kB
16:48:29 [vite] dist/_astro/chevron-top.IeDAT5Zj.js                    0.52 kB │ gzip:   0.33 kB
16:48:29 [vite] dist/_astro/external-link.t58zmrQ8.js                  0.52 kB │ gzip:   0.33 kB
16:48:29 [vite] dist/_astro/chevron-bottom.CwBLUaaI.js                 0.52 kB │ gzip:   0.33 kB
16:48:29 [vite] dist/_astro/chevron-right.BKjOSN9r.js                  0.52 kB │ gzip:   0.32 kB
16:48:29 [vite] dist/_astro/arrow-top.Duw25wY6.js                      0.53 kB │ gzip:   0.34 kB
16:48:29 [vite] dist/_astro/arrow-bottom.CClwQL0h.js                   0.53 kB │ gzip:   0.34 kB
16:48:29 [vite] dist/_astro/arrow-left.Tk-oqnpR.js                     0.53 kB │ gzip:   0.34 kB
16:48:29 [vite] dist/_astro/arrow-right.DZsO11Bc.js                    0.53 kB │ gzip:   0.34 kB
16:48:29 [vite] dist/_astro/off.DmA_pVBl.js                            0.55 kB │ gzip:   0.34 kB
16:48:29 [vite] dist/_astro/search.DX39E23F.js                         0.56 kB │ gzip:   0.35 kB
16:48:29 [vite] dist/_astro/close.f70JnuuT.js                          0.56 kB │ gzip:   0.34 kB
16:48:29 [vite] dist/_astro/all-wallets.DkypzUKI.js                    0.57 kB │ gzip:   0.32 kB
16:48:29 [vite] dist/_astro/filters.CH2GXug-.js                        0.57 kB │ gzip:   0.33 kB
16:48:29 [vite] dist/_astro/info-circle.D-389jwx.js                    0.59 kB │ gzip:   0.35 kB
16:48:29 [vite] dist/_astro/more.DOxiYfyh.js                           0.61 kB │ gzip:   0.36 kB
16:48:29 [vite] dist/_astro/refresh.BEU7jrZf.js                        0.61 kB │ gzip:   0.38 kB
16:48:29 [vite] dist/_astro/warning-circle.DqvSOAG8.js                 0.62 kB │ gzip:   0.37 kB
16:48:29 [vite] dist/_astro/coinPlaceholder.DsngoEWH.js                0.62 kB │ gzip:   0.40 kB
16:48:29 [vite] dist/_astro/compass.BdLSAzpU.js                        0.64 kB │ gzip:   0.39 kB
16:48:29 [vite] dist/_astro/swapVertical.CZeamyKZ.js                   0.67 kB │ gzip:   0.39 kB
16:48:29 [vite] dist/_astro/swapHorizontal.C2DhOe2F.js                 0.67 kB │ gzip:   0.38 kB
16:48:29 [vite] dist/_astro/x.DFSm3W2t.js                              0.69 kB │ gzip:   0.44 kB
16:48:29 [vite] dist/_astro/cursor-transparent.DDThTXRR.js             0.70 kB │ gzip:   0.41 kB
16:48:29 [vite] dist/_astro/twitterIcon.DPY6Mu4d.js                    0.70 kB │ gzip:   0.43 kB
16:48:29 [vite] dist/_astro/mobile.CWoKnVbO.js                         0.71 kB │ gzip:   0.38 kB
16:48:29 [vite] dist/_astro/checkmark-bold.D0z6YOnw.js                 0.77 kB │ gzip:   0.49 kB
16:48:29 [vite] dist/_astro/etherscan.CbjOR1Kk.js                      0.82 kB │ gzip:   0.50 kB
16:48:29 [vite] dist/_astro/checkmark.qTuC9hG0.js                      0.82 kB │ gzip:   0.52 kB
16:48:29 [vite] dist/_astro/help-circle.CvATBFlt.js                    0.83 kB │ gzip:   0.48 kB
16:48:29 [vite] dist/_astro/wallet.CEMVlr_1.js                         0.84 kB │ gzip:   0.47 kB
16:48:29 [vite] dist/_astro/plus.EpuCmEVO.js                           0.88 kB │ gzip:   0.48 kB
16:48:29 [vite] dist/_astro/verify-filled.BZeh24sf.js                  0.89 kB │ gzip:   0.52 kB
16:48:29 [vite] dist/_astro/add.BFWnl9S8.js                            0.89 kB │ gzip:   0.48 kB
16:48:29 [vite] dist/_astro/google.Dag1nzTQ.js                         0.93 kB │ gzip:   0.51 kB
16:48:29 [vite] dist/_astro/three-dots.BVyTnNYU.js                     0.96 kB │ gzip:   0.46 kB
16:48:29 [vite] dist/_astro/clock.CvTHkZje.js                          0.96 kB │ gzip:   0.53 kB
16:48:29 [vite] dist/_astro/disconnect.B5shidEl.js                     1.01 kB │ gzip:   0.56 kB
16:48:29 [vite] dist/_astro/twitch.CV5acKTJ.js                         1.02 kB │ gzip:   0.55 kB
16:48:29 [vite] dist/_astro/bank.rNgcohmT.js                           1.06 kB │ gzip:   0.58 kB
16:48:29 [vite] dist/_astro/apple.BskG6okc.js                          1.08 kB │ gzip:   0.58 kB
16:48:29 [vite] dist/_astro/play-store.BwqwHHDk.js                     1.13 kB │ gzip:   0.57 kB
16:48:29 [vite] dist/_astro/farcaster.CgPZjoCa.js                      1.13 kB │ gzip:   0.58 kB
16:48:29 [vite] dist/_astro/arrow-bottom-circle.YJmMqGqt.js            1.25 kB │ gzip:   0.59 kB
16:48:29 [vite] dist/_astro/github.DcWuhzGs.js                         1.25 kB │ gzip:   0.65 kB
16:48:29 [vite] dist/_astro/swapHorizontalBold.C2bpB94b.js             1.28 kB │ gzip:   0.67 kB
16:48:29 [vite] dist/_astro/app-store.DBhndipH.js                      1.32 kB │ gzip:   0.73 kB
16:48:29 [vite] dist/_astro/mail.DPwtF1Qc.js                           1.32 kB │ gzip:   0.71 kB
16:48:29 [vite] dist/_astro/v0.1.0-452JMA5G.CxDlBNav.js                1.33 kB │ gzip:   0.64 kB
16:48:29 [vite] dist/_astro/facebook.DK4mlPIh.js                       1.35 kB │ gzip:   0.70 kB
16:48:29 [vite] dist/_astro/wallet-placeholder.C3gLLbzq.js             1.38 kB │ gzip:   0.65 kB
16:48:29 [vite] dist/_astro/desktop.CBJnPO_v.js                        1.39 kB │ gzip:   0.70 kB
16:48:29 [vite] dist/_astro/discord.DF8H6Xcw.js                        1.42 kB │ gzip:   0.70 kB
16:48:29 [vite] dist/_astro/swapHorizontalMedium.CS5r0uv_.js           1.42 kB │ gzip:   0.73 kB
16:48:29 [vite] dist/_astro/recycle-horizontal.VZUYIsEw.js             1.46 kB │ gzip:   0.76 kB
16:48:29 [vite] dist/_astro/base32.l_RPZY32.js                         1.50 kB │ gzip:   0.51 kB
16:48:29 [vite] dist/_astro/extension.Bb92KjfH.js                      1.55 kB │ gzip:   0.75 kB
16:48:29 [vite] dist/_astro/telegram.Bu3Bh9LC.js                       1.57 kB │ gzip:   0.89 kB
16:48:29 [vite] dist/_astro/swapHorizontalRoundedBold.1nq0_iG6.js      1.57 kB │ gzip:   0.82 kB
16:48:29 [vite] dist/_astro/verify.Cjjs-Xqy.js                         1.59 kB │ gzip:   0.77 kB
16:48:29 [vite] dist/_astro/qr-code.Hi22C8b9.js                        1.63 kB │ gzip:   0.58 kB
16:48:29 [vite] dist/_astro/browser.BBzfH0Eb.js                        1.70 kB │ gzip:   0.84 kB
16:48:29 [vite] dist/_astro/network-placeholder.BrW-_n3b.js            1.77 kB │ gzip:   0.79 kB
16:48:29 [vite] dist/_astro/client.BHjpRL8Y.js                         1.84 kB │ gzip:   0.91 kB
16:48:29 [vite] dist/_astro/id.BwFPKqJL.js                             1.87 kB │ gzip:   0.86 kB
16:48:29 [vite] dist/_astro/nftPlaceholder.DXE5hBKF.js                 1.87 kB │ gzip:   0.93 kB
16:48:29 [vite] dist/_astro/v0.2.0-RZSAEYWJ.BO42Ib25.js                1.90 kB │ gzip:   0.80 kB
16:48:29 [vite] dist/_astro/v0.4.0-XWYIU6OQ.dtmZJ7oB.js                2.00 kB │ gzip:   0.86 kB
16:48:29 [vite] dist/_astro/v0.3.0-QEEYHNXA.C8R-2dRU.js                2.09 kB │ gzip:   0.87 kB
16:48:29 [vite] dist/_astro/info.D8YuHTfU.js                           2.38 kB │ gzip:   1.20 kB
16:48:29 [vite] dist/_astro/v0.5.0-6JWER4SU.B0qvJgU-.js                2.44 kB │ gzip:   0.93 kB
16:48:29 [vite] dist/_astro/exclamation-triangle.CpV3nj-t.js           2.54 kB │ gzip:   1.19 kB
16:48:29 [vite] dist/_astro/send.DHgqh7ZX.js                           2.54 kB │ gzip:   1.34 kB
16:48:29 [vite] dist/_astro/card.BheLlegR.js                           2.71 kB │ gzip:   1.23 kB
16:48:29 [vite] dist/_astro/chrome-store.xPh-uXAW.js                   2.71 kB │ gzip:   1.07 kB
16:48:29 [vite] dist/_astro/reown-logo.5m1oXg63.js                     2.72 kB │ gzip:   1.13 kB
16:48:29 [vite] dist/_astro/lightbulb.BoQI2gpB.js                      2.83 kB │ gzip:   1.28 kB
16:48:29 [vite] dist/_astro/ccip.CFYnbhvB.js                           2.92 kB │ gzip:   1.35 kB
16:48:29 [vite] dist/_astro/v0.8.0-MA4RCSXJ.BzWVU6mD.js                3.40 kB │ gzip:   1.22 kB
16:48:29 [vite] dist/_astro/v0.6.0-DCUHOIX6.D0nK_KNa.js                3.44 kB │ gzip:   1.21 kB
16:48:29 [vite] dist/_astro/v0.7.0-WUIYE67P.DHAtTBPF.js                3.46 kB │ gzip:   1.22 kB
16:48:29 [vite] dist/_astro/image.BOYsJ2OD.js                          3.61 kB │ gzip:   1.57 kB
16:48:29 [vite] dist/_astro/copy.BggZCoTL.js                           3.94 kB │ gzip:   1.54 kB
16:48:29 [vite] dist/_astro/walletconnect.5j_LqiJp.js                  4.18 kB │ gzip:   1.72 kB
16:48:29 [vite] dist/_astro/base.DMz8QJ2S.js                           4.32 kB │ gzip:   1.80 kB
16:48:29 [vite] dist/_astro/v0.9.0-MODYXNNJ.CW56i5Hn.js                4.79 kB │ gzip:   1.60 kB
16:48:29 [vite] dist/_astro/v0.10.0-OHB5VFCY.BxLkbVOM.js               5.20 kB │ gzip:   1.71 kB
16:48:29 [vite] dist/_astro/v0.11.0-YC4BNGSG.ZJUKLJPn.js               5.72 kB │ gzip:   1.77 kB
16:48:29 [vite] dist/_astro/cid.DuD6wXc4.js                            5.83 kB │ gzip:   2.45 kB
16:48:29 [vite] dist/_astro/v1.0.0-LO3INJ7G.Cn81q8wR.js                6.36 kB │ gzip:   1.93 kB
16:48:29 [vite] dist/_astro/v1.1.0-VDZLWY4U.BWHazOd8.js                6.82 kB │ gzip:   2.08 kB
16:48:29 [vite] dist/_astro/v1.2.0-J7HBJ6X3.DAO9TS_K.js                6.98 kB │ gzip:   2.15 kB
16:48:29 [vite] dist/_astro/v1.3.0-YE5Z6DA7.WxjICRnn.js                7.32 kB │ gzip:   2.29 kB
16:48:29 [vite] dist/_astro/v1.4.0-XW4S4BWH.BE1DD-uT.js                8.88 kB │ gzip:   2.53 kB
16:48:29 [vite] dist/_astro/v1.5.0-RPBY3HCV.BChBsCfx.js                9.72 kB │ gzip:   2.83 kB
16:48:29 [vite] dist/_astro/v1.6.0-WTOLS5Y6.BrJvDjHz.js               10.73 kB │ gzip:   3.03 kB
16:48:29 [vite] dist/_astro/v1.7.0-7V2ZPHKV.1d-zW9eS.js               10.98 kB │ gzip:   3.07 kB
16:48:29 [vite] dist/_astro/v1.8.0-UKWSFP36.wayCITfA.js               10.98 kB │ gzip:   3.06 kB
16:48:29 [vite] dist/_astro/v1.9.0-SQYL3FIK.ehOfOIud.js               11.19 kB │ gzip:   3.12 kB
16:48:29 [vite] dist/_astro/v1.10.0-HV5QAMRI.DtfFbtUQ.js              11.67 kB │ gzip:   3.32 kB
16:48:29 [vite] dist/_astro/v1.11.0-7OORRXZT.CGwSLHNc.js              12.77 kB │ gzip:   3.58 kB
16:48:29 [vite] dist/_astro/v1.13.0-F46Z6ASK.CtOs43cv.js              13.89 kB │ gzip:   3.96 kB
16:48:29 [vite] dist/_astro/v1.12.0-JRP6T6PK.BrocjUYM.js              13.89 kB │ gzip:   3.96 kB
16:48:29 [vite] dist/_astro/v1.15.0-4YFUPOOT.Bi1u4Jfv.js              13.90 kB │ gzip:   4.00 kB
16:48:29 [vite] dist/_astro/v1.14.0-4GFOYRNY.B8nGQ1Rg.js              13.92 kB │ gzip:   4.01 kB
16:48:29 [vite] dist/_astro/secp256k1.B1LqEP__.js                     31.50 kB │ gzip:  12.59 kB
16:48:29 [vite] dist/_astro/w3m-modal.CnuQSanP.js                     39.50 kB │ gzip:   9.25 kB
16:48:29 [vite] dist/_astro/index.BRY0MC3S.js                         39.67 kB │ gzip:   9.39 kB
16:48:29 [vite] dist/_astro/ajv.B0PCc7TN.js                          124.94 kB │ gzip:  39.27 kB
16:48:29 [vite] dist/_astro/basic.rdyGA4vs.js                        141.77 kB │ gzip:  32.77 kB
16:48:29 [vite] dist/_astro/index.BKL_-_Dm.js                        142.40 kB │ gzip:  45.69 kB
16:48:29 [vite] dist/_astro/index.es.BjdPYf1l.js                     398.87 kB │ gzip: 115.66 kB
16:48:29 [vite] dist/_astro/core.Bgt9hSD5.js                         471.49 kB │ gzip: 129.00 kB
16:48:29 [vite] dist/_astro/TradingApp.BHzARLx0.js                 1,440.98 kB │ gzip: 441.02 kB
16:48:29 [WARN] [vite] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
16:48:29 [vite] ✓ built in 14.53s

 generating static routes 
16:48:30 ▶ src/pages/fees.astro
16:48:30   └─ /fees/index.html (+11ms) 
16:48:30 ▶ src/pages/index.astro
16:48:30   └─ /index.html (+6ms) 
16:48:30 ▶ src/pages/legal.astro
16:48:30   └─ /legal/index.html (+4ms) 
16:48:30 ✓ Completed in 732ms.

16:48:30 [build] 3 page(s) built in 18.37s
16:48:30 [build] Complete!
Static Pages HTTP CSP generated from Astro meta CSP, with frame-ancestors 'none'.
Build SHA-256: 86866a41be5a047320081a7a81422fa7d968f14ecd4a8aea42124f16e60e11b7

$ pnpm test:e2e

> pit@0.1.0 test:e2e /home/corio/PIT
> playwright test

[2m[WebServer] [22m(node:103849) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[2m[WebServer] [22m(Use `node --trace-warnings ...` to show where the warning was created)
[2m[WebServer] [22m(node:103863) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[2m[WebServer] [22m(Use `node --trace-warnings ...` to show where the warning was created)

Running 16 tests using 4 workers

(node:103892) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:103891) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:103898) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:103904) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:103891) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:103898) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:103904) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:103892) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
Attack reproduction: {"stolen":{"event":{"account":"fixture","quantity":"1"},"raw":{"fill":"original"},"sequence":1},"poisoned":{"account":"fixture","quantity":"999"},"deleted":true,"sequence":999,"origin":"http://127.0.0.1:4398"}
  ✓   1 tests/e2e/storage-origin.spec.ts:2:1 › shared-origin attack reads, poisons and deletes events raw and meta (496ms)
Dedicated origin https://pit.example: reload persistence and CSV passed; https://sibling.example: no PIT database.
  ✓   4 tests/e2e/origin-guard.spec.ts:54:1 › approved dedicated HTTPS origin persists and exports; sibling origin cannot read records (739ms)
Shared path: eventDB, appendEvent, listEvents, downloadCSV rejected; existing valid event preserved.
  ✓   5 tests/e2e/origin-guard.spec.ts:93:1 › unsafe path denies open/write/read/download and preserves pre-existing valid records (268ms)
  ✓   6 tests/e2e/origin-guard.spec.ts:133:1 › unapproved production origin never creates PIT storage; approved stable IPNS origin works (245ms)
  ✓   7 tests/e2e/origin-guard.spec.ts:163:1 › dedicated-origin derivative evidence never enters Taxlot events and unsafe origins cannot open its store (256ms)
  ✓   2 tests/e2e/interface.spec.ts:10:1 › production swap, wallet dialog, navigation and CSP (1.6s)
  ✓   8 tests/e2e/origin-guard.spec.ts:220:1 › shared-origin query, encoded path and reload cannot enable accounting (386ms)
  ✓   9 tests/e2e/interface.spec.ts:50:1 › perps fields render against public info fixture and mobile does not overflow (716ms)
  ✓   3 tests/e2e/preflight.spec.ts:3:3 › CoW UI refuses chain 84532 before any signature (2.4s)
  ✓  10 tests/e2e/interface.spec.ts:77:1 › injected test provider connects without secrets; invalid swaps cannot sign (2.1s)
  ✓  11 tests/e2e/preflight.spec.ts:3:3 › CoW UI refuses chain 1 before any signature (2.0s)
  ✓  12 tests/e2e/interface.spec.ts:173:1 › IPFS-style subpath hydrates and links stay beneath the CID (693ms)
  ✓  14 tests/e2e/interface.spec.ts:235:1 › Cloudflare static artifact emits a response CSP alongside Astro meta CSP (61ms)
  ✓  13 tests/e2e/preflight.spec.ts:3:3 › CoW UI refuses chain 8453 before any signature (1.9s)
  ✓  15 tests/e2e/preflight.spec.ts:3:3 › CoW UI refuses chain 42161 before any signature (1.8s)
  ✓  16 tests/e2e/preflight.spec.ts:3:3 › CoW UI refuses chain 999 before any signature (1.9s)

  16 passed (14.6s)

RELEASE CHECK PASS — offline testnet candidate only; no live acceptance or deployment

[exit_code=0]
```

---

Historical Phase J/I/H/G/F evidence follows; its counts and claims refer to those earlier revisions.

# Phase J verification — offline testnet release check PASS

**75 unit tests, 14 Playwright tests, typecheck: 52 files with 0 errors/0 warnings/0 hints, production build: 3 pages.** `pnpm release:check` exited 0 from clean revision `afca1d22d1ae987b57dcc4a2e1bd64d68a99e7a6`. The same command rejected the dirty tree and stopped on an initial failing test; both outputs are retained below. The failing test incorrectly mocked only one IndexedDB handle and was corrected to simulate a transaction failure at the underlying database prototype. No production implementation changed to weaken that assertion.

[Execution architecture and exact accepted/rejected matrix](audit/phase-j/RELEASE-SAFETY.md) · [Operator runbook](audit/phase-j/TESTNET-RUNBOOK.md) · [Assumptions](../ASSUMPTIONS.md).

The final amendment adds audit evidence/docs only. [Hashes of every tested non-documentation tracked file](audit/phase-j/tested-source.json) establish executable-source identity independently of the amended commit ID. Build SHA-256: `48c7b98c73289fc32abaf7ba22f963b4ba7d958f89194363220fef6e4cfcbd2d`. This phase does not claim a fresh reproducibility comparison.

Fees/network config, schema, origin policy/allowlist, Phase I accounting boundary and legal gate remain unchanged. Assumption 8 remains OPEN. No live signature, transaction, protocol order or public deployment occurred. A funded external Ethereum Sepolia wallet and independently funded Hyperliquid testnet account, operator confirmation, real fill evidence/reconciliation and public-origin verification remain outstanding.

## Exact clean-tree release output

Combined stdout/stderr follows verbatim, with command/exit-code framing and terminal escapes retained. Playwright uses authorized localhost/Chromium permissions with offline fixtures. The clean-tree check runs before and after all commands; the output was captured outside the repository.

```text
$ pnpm release:check

> pit@0.1.0 release:check /home/corio/PIT
> node scripts/release/check.mjs

Clean release source: afca1d22d1ae987b57dcc4a2e1bd64d68a99e7a6
PASS protected fee/network configuration: FEES_ENABLED=false; MAINNET_ENABLED=false; recipients/rates unchanged
PASS exact Taxlot v1 schema SHA256 d8eb339ed7acd7da3b68ef09fe5c1b01c4cc3258cb401a4f2ba8805e7a3b07d7
PASS origin policy: default-deny; production allowlist empty; legal page unchanged
PASS tracked-file credential patterns and environment-file policy (not a proof against encoded secrets)

$ pnpm test

> pit@0.1.0 test /home/corio/PIT
> vitest run


 RUN  v3.2.7 /home/corio/PIT

 ✓ tests/release-invariants.test.ts (11 tests) 23ms
 ✓ tests/storage-policy.test.ts (5 tests) 48ms
 ✓ tests/schema-capabilities.test.ts (3 tests) 34ms
 ✓ tests/events.test.ts (4 tests) 169ms
 ✓ tests/audit-builder-path.test.ts (1 test) 11ms
 ✓ tests/schema-provenance.test.ts (1 test) 17ms
 ✓ tests/audit-taxlot.test.ts (1 test) 133ms
 ✓ tests/derivative-boundary.test.ts (6 tests) 92ms
 ✓ tests/hyperliquid-release-path.test.ts (3 tests) 28ms
 ✓ tests/cow.test.ts (6 tests) 37ms
 ✓ tests/execution-paths.test.ts (4 tests) 52ms
 ✓ tests/execution-preflight.test.ts (24 tests) 57ms
 ✓ tests/hyperliquid.test.ts (2 tests) 9ms
 ✓ tests/audit-fees.test.ts (4 tests) 12ms

 Test Files  14 passed (14)
      Tests  75 passed (75)
   Start at  20:49:12
   Duration  3.30s (transform 1.43s, setup 511ms, collect 14.86s, tests 722ms, environment 5ms, prepare 3.00s)


$ pnpm check

> pit@0.1.0 check /home/corio/PIT
> astro check

20:49:18 [content] Syncing content
20:49:18 [content] Synced content
20:49:18 [types] Generated 56ms
20:49:18 [check] Getting diagnostics for Astro files in /home/corio/PIT...
Result (52 files): 
- 0 errors
- 0 warnings
- 0 hints


$ pnpm build

> pit@0.1.0 build /home/corio/PIT
> node scripts/generate-validator.mjs && astro build && node scripts/prepare-static.mjs && node scripts/build-manifest.mjs

20:49:36 [content] Syncing content
20:49:36 [content] Synced content
20:49:36 [types] Generated 63ms
20:49:36 [build] output: "static"
20:49:36 [build] mode: "static"
20:49:36 [build] directory: /home/corio/PIT/dist/
20:49:36 [build] Collecting build info...
20:49:36 [build] ✓ Completed in 104ms.
20:49:36 [build] Building static entrypoints...
20:49:38 [vite] ✓ built in 1.50s
20:49:38 [build] ✓ Completed in 1.55s.

 building client (vite) 
20:49:38 [vite] transforming...
20:49:44 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js (6:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:49:44 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js (6:27): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:49:44 [WARN] [vite] node_modules/.pnpm/ox@0.9.17_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js (6:27): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.9.17_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:49:45 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js (2:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:49:45 [WARN] [vite] node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment

"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle."

in "node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:49:45 [WARN] [vite] node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment

"/** Anchors a pattern source. The interpolation lives here rather than at the call site because
 * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it
 * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */"

in "node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:49:49 [WARN] [vite] node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js (6:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:49:49 [WARN] [vite] node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js (2:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:49:56 [vite] ✓ 5294 modules transformed.
20:49:57 [vite] rendering chunks...
20:49:58 [vite] computing gzip size...
20:49:58 [vite] dist/_astro/TradingApp.PLSYCTbZ.js                     0.10 kB │ gzip:   0.10 kB
20:49:58 [vite] dist/_astro/base16.BPd3-eEf.js                         0.33 kB │ gzip:   0.24 kB
20:49:58 [vite] dist/_astro/cursor.S60aeUGS.js                         0.38 kB │ gzip:   0.27 kB
20:49:58 [vite] dist/_astro/chevron-left.LQQeTiSz.js                   0.52 kB │ gzip:   0.33 kB
20:49:58 [vite] dist/_astro/chevron-top.IeDAT5Zj.js                    0.52 kB │ gzip:   0.33 kB
20:49:58 [vite] dist/_astro/external-link.t58zmrQ8.js                  0.52 kB │ gzip:   0.33 kB
20:49:58 [vite] dist/_astro/chevron-bottom.CwBLUaaI.js                 0.52 kB │ gzip:   0.33 kB
20:49:58 [vite] dist/_astro/chevron-right.BKjOSN9r.js                  0.52 kB │ gzip:   0.32 kB
20:49:58 [vite] dist/_astro/arrow-top.Duw25wY6.js                      0.53 kB │ gzip:   0.34 kB
20:49:58 [vite] dist/_astro/arrow-bottom.CClwQL0h.js                   0.53 kB │ gzip:   0.34 kB
20:49:58 [vite] dist/_astro/arrow-left.Tk-oqnpR.js                     0.53 kB │ gzip:   0.34 kB
20:49:58 [vite] dist/_astro/arrow-right.DZsO11Bc.js                    0.53 kB │ gzip:   0.34 kB
20:49:58 [vite] dist/_astro/off.DmA_pVBl.js                            0.55 kB │ gzip:   0.34 kB
20:49:58 [vite] dist/_astro/search.DX39E23F.js                         0.56 kB │ gzip:   0.35 kB
20:49:58 [vite] dist/_astro/close.f70JnuuT.js                          0.56 kB │ gzip:   0.34 kB
20:49:58 [vite] dist/_astro/all-wallets.DkypzUKI.js                    0.57 kB │ gzip:   0.32 kB
20:49:58 [vite] dist/_astro/filters.CH2GXug-.js                        0.57 kB │ gzip:   0.33 kB
20:49:58 [vite] dist/_astro/info-circle.D-389jwx.js                    0.59 kB │ gzip:   0.35 kB
20:49:58 [vite] dist/_astro/more.DOxiYfyh.js                           0.61 kB │ gzip:   0.36 kB
20:49:58 [vite] dist/_astro/refresh.BEU7jrZf.js                        0.61 kB │ gzip:   0.38 kB
20:49:58 [vite] dist/_astro/warning-circle.DqvSOAG8.js                 0.62 kB │ gzip:   0.37 kB
20:49:58 [vite] dist/_astro/coinPlaceholder.DsngoEWH.js                0.62 kB │ gzip:   0.40 kB
20:49:58 [vite] dist/_astro/compass.BdLSAzpU.js                        0.64 kB │ gzip:   0.39 kB
20:49:58 [vite] dist/_astro/swapVertical.CZeamyKZ.js                   0.67 kB │ gzip:   0.39 kB
20:49:58 [vite] dist/_astro/swapHorizontal.C2DhOe2F.js                 0.67 kB │ gzip:   0.38 kB
20:49:58 [vite] dist/_astro/x.DFSm3W2t.js                              0.69 kB │ gzip:   0.44 kB
20:49:58 [vite] dist/_astro/cursor-transparent.DDThTXRR.js             0.70 kB │ gzip:   0.41 kB
20:49:58 [vite] dist/_astro/twitterIcon.DPY6Mu4d.js                    0.70 kB │ gzip:   0.43 kB
20:49:58 [vite] dist/_astro/mobile.CWoKnVbO.js                         0.71 kB │ gzip:   0.38 kB
20:49:58 [vite] dist/_astro/checkmark-bold.D0z6YOnw.js                 0.77 kB │ gzip:   0.49 kB
20:49:58 [vite] dist/_astro/etherscan.CbjOR1Kk.js                      0.82 kB │ gzip:   0.50 kB
20:49:58 [vite] dist/_astro/checkmark.qTuC9hG0.js                      0.82 kB │ gzip:   0.52 kB
20:49:58 [vite] dist/_astro/help-circle.CvATBFlt.js                    0.83 kB │ gzip:   0.48 kB
20:49:58 [vite] dist/_astro/wallet.CEMVlr_1.js                         0.84 kB │ gzip:   0.47 kB
20:49:58 [vite] dist/_astro/plus.EpuCmEVO.js                           0.88 kB │ gzip:   0.48 kB
20:49:58 [vite] dist/_astro/verify-filled.BZeh24sf.js                  0.89 kB │ gzip:   0.52 kB
20:49:58 [vite] dist/_astro/add.BFWnl9S8.js                            0.89 kB │ gzip:   0.48 kB
20:49:58 [vite] dist/_astro/google.Dag1nzTQ.js                         0.93 kB │ gzip:   0.51 kB
20:49:58 [vite] dist/_astro/three-dots.BVyTnNYU.js                     0.96 kB │ gzip:   0.46 kB
20:49:58 [vite] dist/_astro/clock.CvTHkZje.js                          0.96 kB │ gzip:   0.53 kB
20:49:58 [vite] dist/_astro/disconnect.B5shidEl.js                     1.01 kB │ gzip:   0.56 kB
20:49:58 [vite] dist/_astro/twitch.CV5acKTJ.js                         1.02 kB │ gzip:   0.55 kB
20:49:58 [vite] dist/_astro/bank.rNgcohmT.js                           1.06 kB │ gzip:   0.58 kB
20:49:58 [vite] dist/_astro/apple.BskG6okc.js                          1.08 kB │ gzip:   0.58 kB
20:49:58 [vite] dist/_astro/play-store.BwqwHHDk.js                     1.13 kB │ gzip:   0.57 kB
20:49:58 [vite] dist/_astro/farcaster.CgPZjoCa.js                      1.13 kB │ gzip:   0.58 kB
20:49:58 [vite] dist/_astro/arrow-bottom-circle.YJmMqGqt.js            1.25 kB │ gzip:   0.59 kB
20:49:58 [vite] dist/_astro/github.DcWuhzGs.js                         1.25 kB │ gzip:   0.65 kB
20:49:58 [vite] dist/_astro/swapHorizontalBold.C2bpB94b.js             1.28 kB │ gzip:   0.67 kB
20:49:58 [vite] dist/_astro/app-store.DBhndipH.js                      1.32 kB │ gzip:   0.73 kB
20:49:58 [vite] dist/_astro/mail.DPwtF1Qc.js                           1.32 kB │ gzip:   0.71 kB
20:49:58 [vite] dist/_astro/v0.1.0-452JMA5G.CxDlBNav.js                1.33 kB │ gzip:   0.64 kB
20:49:58 [vite] dist/_astro/facebook.DK4mlPIh.js                       1.35 kB │ gzip:   0.70 kB
20:49:58 [vite] dist/_astro/wallet-placeholder.C3gLLbzq.js             1.38 kB │ gzip:   0.65 kB
20:49:58 [vite] dist/_astro/desktop.CBJnPO_v.js                        1.39 kB │ gzip:   0.70 kB
20:49:58 [vite] dist/_astro/discord.DF8H6Xcw.js                        1.42 kB │ gzip:   0.70 kB
20:49:58 [vite] dist/_astro/swapHorizontalMedium.CS5r0uv_.js           1.42 kB │ gzip:   0.73 kB
20:49:58 [vite] dist/_astro/recycle-horizontal.VZUYIsEw.js             1.46 kB │ gzip:   0.76 kB
20:49:58 [vite] dist/_astro/base32.l_RPZY32.js                         1.50 kB │ gzip:   0.51 kB
20:49:58 [vite] dist/_astro/extension.Bb92KjfH.js                      1.55 kB │ gzip:   0.75 kB
20:49:58 [vite] dist/_astro/telegram.Bu3Bh9LC.js                       1.57 kB │ gzip:   0.89 kB
20:49:58 [vite] dist/_astro/swapHorizontalRoundedBold.1nq0_iG6.js      1.57 kB │ gzip:   0.82 kB
20:49:58 [vite] dist/_astro/verify.Cjjs-Xqy.js                         1.59 kB │ gzip:   0.77 kB
20:49:58 [vite] dist/_astro/qr-code.Hi22C8b9.js                        1.63 kB │ gzip:   0.58 kB
20:49:58 [vite] dist/_astro/browser.BBzfH0Eb.js                        1.70 kB │ gzip:   0.84 kB
20:49:58 [vite] dist/_astro/network-placeholder.BrW-_n3b.js            1.77 kB │ gzip:   0.79 kB
20:49:58 [vite] dist/_astro/client.BHjpRL8Y.js                         1.84 kB │ gzip:   0.91 kB
20:49:58 [vite] dist/_astro/id.BwFPKqJL.js                             1.87 kB │ gzip:   0.86 kB
20:49:58 [vite] dist/_astro/nftPlaceholder.DXE5hBKF.js                 1.87 kB │ gzip:   0.93 kB
20:49:58 [vite] dist/_astro/v0.2.0-RZSAEYWJ.BO42Ib25.js                1.90 kB │ gzip:   0.80 kB
20:49:58 [vite] dist/_astro/v0.4.0-XWYIU6OQ.dtmZJ7oB.js                2.00 kB │ gzip:   0.86 kB
20:49:58 [vite] dist/_astro/v0.3.0-QEEYHNXA.C8R-2dRU.js                2.09 kB │ gzip:   0.87 kB
20:49:58 [vite] dist/_astro/info.D8YuHTfU.js                           2.38 kB │ gzip:   1.20 kB
20:49:58 [vite] dist/_astro/v0.5.0-6JWER4SU.B0qvJgU-.js                2.44 kB │ gzip:   0.93 kB
20:49:58 [vite] dist/_astro/exclamation-triangle.CpV3nj-t.js           2.54 kB │ gzip:   1.19 kB
20:49:58 [vite] dist/_astro/send.DHgqh7ZX.js                           2.54 kB │ gzip:   1.34 kB
20:49:58 [vite] dist/_astro/card.BheLlegR.js                           2.71 kB │ gzip:   1.23 kB
20:49:58 [vite] dist/_astro/chrome-store.xPh-uXAW.js                   2.71 kB │ gzip:   1.07 kB
20:49:58 [vite] dist/_astro/reown-logo.5m1oXg63.js                     2.72 kB │ gzip:   1.13 kB
20:49:58 [vite] dist/_astro/lightbulb.BoQI2gpB.js                      2.83 kB │ gzip:   1.28 kB
20:49:58 [vite] dist/_astro/ccip.CFYnbhvB.js                           2.92 kB │ gzip:   1.35 kB
20:49:58 [vite] dist/_astro/v0.8.0-MA4RCSXJ.BzWVU6mD.js                3.40 kB │ gzip:   1.22 kB
20:49:58 [vite] dist/_astro/v0.6.0-DCUHOIX6.D0nK_KNa.js                3.44 kB │ gzip:   1.21 kB
20:49:58 [vite] dist/_astro/v0.7.0-WUIYE67P.DHAtTBPF.js                3.46 kB │ gzip:   1.22 kB
20:49:58 [vite] dist/_astro/image.BOYsJ2OD.js                          3.61 kB │ gzip:   1.57 kB
20:49:58 [vite] dist/_astro/copy.BggZCoTL.js                           3.94 kB │ gzip:   1.54 kB
20:49:58 [vite] dist/_astro/walletconnect.5j_LqiJp.js                  4.18 kB │ gzip:   1.72 kB
20:49:58 [vite] dist/_astro/base.DMz8QJ2S.js                           4.32 kB │ gzip:   1.80 kB
20:49:58 [vite] dist/_astro/v0.9.0-MODYXNNJ.CW56i5Hn.js                4.79 kB │ gzip:   1.60 kB
20:49:58 [vite] dist/_astro/v0.10.0-OHB5VFCY.BxLkbVOM.js               5.20 kB │ gzip:   1.71 kB
20:49:58 [vite] dist/_astro/v0.11.0-YC4BNGSG.ZJUKLJPn.js               5.72 kB │ gzip:   1.77 kB
20:49:58 [vite] dist/_astro/cid.DuD6wXc4.js                            5.83 kB │ gzip:   2.45 kB
20:49:58 [vite] dist/_astro/v1.0.0-LO3INJ7G.Cn81q8wR.js                6.36 kB │ gzip:   1.93 kB
20:49:58 [vite] dist/_astro/v1.1.0-VDZLWY4U.BWHazOd8.js                6.82 kB │ gzip:   2.08 kB
20:49:58 [vite] dist/_astro/v1.2.0-J7HBJ6X3.DAO9TS_K.js                6.98 kB │ gzip:   2.15 kB
20:49:58 [vite] dist/_astro/v1.3.0-YE5Z6DA7.WxjICRnn.js                7.32 kB │ gzip:   2.29 kB
20:49:58 [vite] dist/_astro/v1.4.0-XW4S4BWH.BE1DD-uT.js                8.88 kB │ gzip:   2.53 kB
20:49:58 [vite] dist/_astro/v1.5.0-RPBY3HCV.BChBsCfx.js                9.72 kB │ gzip:   2.83 kB
20:49:58 [vite] dist/_astro/v1.6.0-WTOLS5Y6.BrJvDjHz.js               10.73 kB │ gzip:   3.03 kB
20:49:58 [vite] dist/_astro/v1.7.0-7V2ZPHKV.1d-zW9eS.js               10.98 kB │ gzip:   3.07 kB
20:49:58 [vite] dist/_astro/v1.8.0-UKWSFP36.wayCITfA.js               10.98 kB │ gzip:   3.06 kB
20:49:58 [vite] dist/_astro/v1.9.0-SQYL3FIK.ehOfOIud.js               11.19 kB │ gzip:   3.12 kB
20:49:58 [vite] dist/_astro/v1.10.0-HV5QAMRI.DtfFbtUQ.js              11.67 kB │ gzip:   3.32 kB
20:49:58 [vite] dist/_astro/v1.11.0-7OORRXZT.CGwSLHNc.js              12.77 kB │ gzip:   3.58 kB
20:49:58 [vite] dist/_astro/v1.13.0-F46Z6ASK.CtOs43cv.js              13.89 kB │ gzip:   3.96 kB
20:49:58 [vite] dist/_astro/v1.12.0-JRP6T6PK.BrocjUYM.js              13.89 kB │ gzip:   3.96 kB
20:49:58 [vite] dist/_astro/v1.15.0-4YFUPOOT.Bi1u4Jfv.js              13.90 kB │ gzip:   4.00 kB
20:49:58 [vite] dist/_astro/v1.14.0-4GFOYRNY.B8nGQ1Rg.js              13.92 kB │ gzip:   4.01 kB
20:49:58 [vite] dist/_astro/secp256k1.B1LqEP__.js                     31.50 kB │ gzip:  12.59 kB
20:49:58 [vite] dist/_astro/w3m-modal.CnuQSanP.js                     39.50 kB │ gzip:   9.25 kB
20:49:58 [vite] dist/_astro/index.BRY0MC3S.js                         39.67 kB │ gzip:   9.39 kB
20:49:58 [vite] dist/_astro/ajv.B0PCc7TN.js                          124.94 kB │ gzip:  39.27 kB
20:49:58 [vite] dist/_astro/basic.rdyGA4vs.js                        141.77 kB │ gzip:  32.77 kB
20:49:58 [vite] dist/_astro/index.BKL_-_Dm.js                        142.40 kB │ gzip:  45.69 kB
20:49:58 [vite] dist/_astro/index.es.BjdPYf1l.js                     398.87 kB │ gzip: 115.66 kB
20:49:58 [vite] dist/_astro/core.Bgt9hSD5.js                         471.49 kB │ gzip: 129.00 kB
20:49:58 [vite] dist/_astro/TradingApp.BHzARLx0.js                 1,440.98 kB │ gzip: 441.02 kB
20:49:58 [WARN] [vite] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
20:49:58 [vite] ✓ built in 20.38s

 generating static routes 
20:49:59 ▶ src/pages/fees.astro
20:49:59   └─ /fees/index.html (+13ms) 
20:49:59 ▶ src/pages/index.astro
20:49:59   └─ /index.html (+12ms) 
20:49:59 ▶ src/pages/legal.astro
20:49:59   └─ /legal/index.html (+4ms) 
20:49:59 ✓ Completed in 537ms.

20:49:59 [build] 3 page(s) built in 22.60s
20:49:59 [build] Complete!
Build SHA-256: 48c7b98c73289fc32abaf7ba22f963b4ba7d958f89194363220fef6e4cfcbd2d

$ pnpm test:e2e

> pit@0.1.0 test:e2e /home/corio/PIT
> playwright test

[2m[WebServer] [22m(node:215288) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[2m[WebServer] [22m(Use `node --trace-warnings ...` to show where the warning was created)
[2m[WebServer] [22m(node:215311) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[2m[WebServer] [22m(Use `node --trace-warnings ...` to show where the warning was created)

Running 14 tests using 4 workers

(node:215358) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:215359) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:215365) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:215371) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:215365) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:215358) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:215371) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:215359) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
Attack reproduction: {"stolen":{"event":{"account":"fixture","quantity":"1"},"raw":{"fill":"original"},"sequence":1},"poisoned":{"account":"fixture","quantity":"999"},"deleted":true,"sequence":999,"origin":"http://127.0.0.1:4398"}
  ✓   1 tests/e2e/storage-origin.spec.ts:2:1 › shared-origin attack reads, poisons and deletes events raw and meta (301ms)
Dedicated origin https://pit.example: reload persistence and CSV passed; https://sibling.example: no PIT database.
  ✓   3 tests/e2e/origin-guard.spec.ts:54:1 › approved dedicated HTTPS origin persists and exports; sibling origin cannot read records (514ms)
Shared path: eventDB, appendEvent, listEvents, downloadCSV rejected; existing valid event preserved.
  ✓   5 tests/e2e/origin-guard.spec.ts:93:1 › unsafe path denies open/write/read/download and preserves pre-existing valid records (307ms)
  ✓   6 tests/e2e/origin-guard.spec.ts:133:1 › unapproved production origin never creates PIT storage; approved stable IPNS origin works (244ms)
  ✓   7 tests/e2e/origin-guard.spec.ts:163:1 › dedicated-origin derivative evidence never enters Taxlot events and unsafe origins cannot open its store (237ms)
  ✓   2 tests/e2e/interface.spec.ts:10:1 › production swap, wallet dialog, navigation and CSP (1.4s)
  ✓   8 tests/e2e/interface.spec.ts:50:1 › perps fields render against public info fixture and mobile does not overflow (692ms)
  ✓   4 tests/e2e/preflight.spec.ts:3:3 › CoW UI refuses chain 84532 before any signature (2.2s)
  ✓  10 tests/e2e/preflight.spec.ts:3:3 › CoW UI refuses chain 1 before any signature (1.9s)
  ✓   9 tests/e2e/interface.spec.ts:77:1 › injected test provider connects without secrets; invalid swaps cannot sign (2.1s)
  ✓  12 tests/e2e/interface.spec.ts:173:1 › IPFS-style subpath hydrates and links stay beneath the CID (664ms)
  ✓  11 tests/e2e/preflight.spec.ts:3:3 › CoW UI refuses chain 8453 before any signature (1.9s)
  ✓  13 tests/e2e/preflight.spec.ts:3:3 › CoW UI refuses chain 42161 before any signature (1.7s)
  ✓  14 tests/e2e/preflight.spec.ts:3:3 › CoW UI refuses chain 999 before any signature (1.7s)

  14 passed (13.6s)

RELEASE CHECK PASS — offline testnet candidate only; no live acceptance or deployment

[exit_code=0]
```

## Dirty-tree refusal (expected nonzero)

```text
$ pnpm release:check

> pit@0.1.0 release:check /home/corio/PIT
> node scripts/release/check.mjs

RELEASE CHECK FAILED: Release requires a clean Git working tree (including untracked files)
 ELIFECYCLE  Command failed with exit code 1.

[exit_code=1]
```

[Initial release test failure, exact output](audit/phase-j/release-initial-test-failure.txt). The corrected full clean-tree run above supersedes that failure.

---

Historical Phase I/H/G/F evidence follows. Its hashes, counts and observations refer to those earlier revisions.

# Phase I verification — derivative boundary enforced; live acceptance still blocked

Baseline `a5830a1eb3f0b030994d77b9bf82aa8a25da4daf`. **33 unit tests, 9 offline Playwright tests, clean typecheck, successful production build.** Two synthetic CoW fills round-trip through the actual workspace Taxlot importer with zero issues. This proves fixture compatibility, not live settlement or tax-calculation acceptance. No wallet signature, swap, order or public deployment occurred.

[Exact field-by-field schema matrix, derivative boundary, raw evidence model, all importer differences and blockers](audit/phase-i/DERIVATIVE-ACCOUNTING.md). [Complete schema/source audit output](audit/phase-i/schema-source.txt) includes upstream file hashes, numbered source and the empty protected-file comparison. [Full fixture reconciliation](audit/phase-i/roundtrip.json). [Assumptions](../ASSUMPTIONS.md): item 8 remains OPEN; derivative normalization is unsupported by v1. The schema, fee/network settings, origin policy and legal gates are unchanged.

Raw derivative fills/funding have their own origin-guarded append-only database and `unsupported_derivative_v1` status. They never enter Taxlot events or CSV. Existing records are preserved. Tests cover routing refusal, signed raw evidence, concurrent dedup, conflicting observations, unsafe-origin denial, and dedicated-origin persistence. Browser origins and protocol responses are fixtures, not deployed services.

## Exact Phase I command outputs

Combined stdout/stderr is quoted verbatim with command and exit-code framing, including warnings, terminal escapes and timing. Playwright needed authorized localhost/Chromium access. The initial importer provenance lookup failed under the sandbox; its output is preserved separately, followed by the successful authorized read-only retry. No live execution was used for any check.

## Unit tests

[Raw output](audit/phase-i/unit.txt)

```text
$ pnpm test

> pit@0.1.0 test /home/corio/PIT
> vitest run


 RUN  v3.2.7 /home/corio/PIT

 ✓ tests/schema-provenance.test.ts (1 test) 4ms
 ✓ tests/schema-capabilities.test.ts (3 tests) 15ms
 ✓ tests/storage-policy.test.ts (5 tests) 41ms
 ✓ tests/events.test.ts (4 tests) 191ms
 ✓ tests/audit-builder-path.test.ts (1 test) 10ms
 ✓ tests/derivative-boundary.test.ts (6 tests) 69ms
 ✓ tests/audit-taxlot.test.ts (1 test) 106ms
 ✓ tests/hyperliquid.test.ts (2 tests) 11ms
 ✓ tests/cow.test.ts (6 tests) 21ms
 ✓ tests/audit-fees.test.ts (4 tests) 9ms

 Test Files  10 passed (10)
      Tests  33 passed (33)
   Start at  20:22:37
   Duration  1.98s (transform 827ms, setup 301ms, collect 6.60s, tests 477ms, environment 3ms, prepare 1.98s)


[exit_code=0]
```

## Playwright tests

[Raw output](audit/phase-i/playwright.txt)

```text
$ pnpm test:e2e

> pit@0.1.0 test:e2e /home/corio/PIT
> playwright test

[2m[WebServer] [22m(node:177587) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[2m[WebServer] [22m(Use `node --trace-warnings ...` to show where the warning was created)
[2m[WebServer] [22m(node:177600) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[2m[WebServer] [22m(Use `node --trace-warnings ...` to show where the warning was created)

Running 9 tests using 3 workers

(node:177649) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:177650) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:177656) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:177656) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:177650) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:177649) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
Attack reproduction: {"stolen":{"event":{"account":"fixture","quantity":"1"},"raw":{"fill":"original"},"sequence":1},"poisoned":{"account":"fixture","quantity":"999"},"deleted":true,"sequence":999,"origin":"http://127.0.0.1:4398"}
  ✓  1 tests/e2e/storage-origin.spec.ts:2:1 › shared-origin attack reads, poisons and deletes events raw and meta (229ms)
Dedicated origin https://pit.example: reload persistence and CSV passed; https://sibling.example: no PIT database.
  ✓  3 tests/e2e/origin-guard.spec.ts:54:1 › approved dedicated HTTPS origin persists and exports; sibling origin cannot read records (279ms)
Shared path: eventDB, appendEvent, listEvents, downloadCSV rejected; existing valid event preserved.
  ✓  4 tests/e2e/origin-guard.spec.ts:93:1 › unsafe path denies open/write/read/download and preserves pre-existing valid records (145ms)
  ✓  5 tests/e2e/origin-guard.spec.ts:133:1 › unapproved production origin never creates PIT storage; approved stable IPNS origin works (132ms)
  ✓  6 tests/e2e/origin-guard.spec.ts:163:1 › dedicated-origin derivative evidence never enters Taxlot events and unsafe origins cannot open its store (206ms)
  ✓  2 tests/e2e/interface.spec.ts:10:1 › production swap, wallet dialog, navigation and CSP (1.1s)
  ✓  7 tests/e2e/interface.spec.ts:50:1 › perps fields render against public info fixture and mobile does not overflow (516ms)
  ✓  8 tests/e2e/interface.spec.ts:77:1 › injected test provider connects without secrets; invalid swaps cannot sign (1.8s)
  ✓  9 tests/e2e/interface.spec.ts:173:1 › IPFS-style subpath hydrates and links stay beneath the CID (638ms)

  9 passed (7.5s)

[exit_code=0]
```

## Typecheck

[Raw output](audit/phase-i/typecheck.txt)

```text
$ pnpm check

> pit@0.1.0 check /home/corio/PIT
> astro check

20:22:41 [content] Syncing content
20:22:41 [content] Synced content
20:22:41 [types] Generated 68ms
20:22:41 [check] Getting diagnostics for Astro files in /home/corio/PIT...
Result (43 files): 
- 0 errors
- 0 warnings
- 0 hints


[exit_code=0]
```

## Production build

[Raw output](audit/phase-i/build.txt)

```text
$ pnpm build

> pit@0.1.0 build /home/corio/PIT
> node scripts/generate-validator.mjs && astro build && node scripts/prepare-static.mjs && node scripts/build-manifest.mjs

20:22:41 [content] Syncing content
20:22:41 [content] Synced content
20:22:41 [types] Generated 96ms
20:22:41 [build] output: "static"
20:22:41 [build] mode: "static"
20:22:41 [build] directory: /home/corio/PIT/dist/
20:22:41 [build] Collecting build info...
20:22:41 [build] ✓ Completed in 131ms.
20:22:41 [build] Building static entrypoints...
20:22:42 [vite] ✓ built in 1.38s
20:22:42 [build] ✓ Completed in 1.42s.

 building client (vite) 
20:22:42 [vite] transforming...
20:22:48 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js (6:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:22:48 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js (6:27): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:22:48 [WARN] [vite] node_modules/.pnpm/ox@0.9.17_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js (6:27): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.9.17_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:22:49 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js (2:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:22:49 [WARN] [vite] node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment

"/** Anchors a pattern source. The interpolation lives here rather than at the call site because
 * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it
 * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */"

in "node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:22:49 [WARN] [vite] node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment

"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle."

in "node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:22:52 [WARN] [vite] node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js (6:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:22:52 [WARN] [vite] node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js (2:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:23:00 [vite] ✓ 5292 modules transformed.
20:23:01 [vite] rendering chunks...
20:23:01 [vite] computing gzip size...
20:23:01 [vite] dist/_astro/TradingApp.-te2UX_w.js                     0.10 kB │ gzip:   0.10 kB
20:23:01 [vite] dist/_astro/base16.BPd3-eEf.js                         0.33 kB │ gzip:   0.24 kB
20:23:01 [vite] dist/_astro/cursor.NbcavrU9.js                         0.38 kB │ gzip:   0.27 kB
20:23:01 [vite] dist/_astro/chevron-left.Tkosi2pj.js                   0.52 kB │ gzip:   0.33 kB
20:23:01 [vite] dist/_astro/chevron-top.D2LpgnbQ.js                    0.52 kB │ gzip:   0.33 kB
20:23:01 [vite] dist/_astro/external-link.13uHC61c.js                  0.52 kB │ gzip:   0.33 kB
20:23:01 [vite] dist/_astro/chevron-bottom.xgjQvJK8.js                 0.52 kB │ gzip:   0.33 kB
20:23:01 [vite] dist/_astro/chevron-right.TjAomqCA.js                  0.52 kB │ gzip:   0.32 kB
20:23:01 [vite] dist/_astro/arrow-top.C6W3tdLu.js                      0.53 kB │ gzip:   0.34 kB
20:23:01 [vite] dist/_astro/arrow-bottom.D4kQGLHp.js                   0.53 kB │ gzip:   0.34 kB
20:23:01 [vite] dist/_astro/arrow-left.tZZT892g.js                     0.53 kB │ gzip:   0.34 kB
20:23:01 [vite] dist/_astro/arrow-right.CatiMGFm.js                    0.53 kB │ gzip:   0.34 kB
20:23:01 [vite] dist/_astro/off.DCetU8w9.js                            0.55 kB │ gzip:   0.34 kB
20:23:01 [vite] dist/_astro/search.B-qTLwE7.js                         0.56 kB │ gzip:   0.35 kB
20:23:01 [vite] dist/_astro/close.CNABJI5Y.js                          0.56 kB │ gzip:   0.34 kB
20:23:01 [vite] dist/_astro/all-wallets.CPMuJQJf.js                    0.57 kB │ gzip:   0.32 kB
20:23:01 [vite] dist/_astro/filters.BX5qfAfu.js                        0.57 kB │ gzip:   0.33 kB
20:23:01 [vite] dist/_astro/info-circle.CvjsqjYw.js                    0.59 kB │ gzip:   0.35 kB
20:23:01 [vite] dist/_astro/more.aRfStRdC.js                           0.61 kB │ gzip:   0.36 kB
20:23:01 [vite] dist/_astro/refresh.D8eOu2lN.js                        0.61 kB │ gzip:   0.38 kB
20:23:01 [vite] dist/_astro/warning-circle.Cqa-tnc9.js                 0.62 kB │ gzip:   0.37 kB
20:23:01 [vite] dist/_astro/coinPlaceholder.DSvB20Hg.js                0.62 kB │ gzip:   0.40 kB
20:23:01 [vite] dist/_astro/compass.ZzdW-7g_.js                        0.64 kB │ gzip:   0.39 kB
20:23:01 [vite] dist/_astro/swapVertical.B4tuof3k.js                   0.67 kB │ gzip:   0.39 kB
20:23:01 [vite] dist/_astro/swapHorizontal.m39qLVN6.js                 0.67 kB │ gzip:   0.38 kB
20:23:01 [vite] dist/_astro/x.BPT3hvn2.js                              0.69 kB │ gzip:   0.44 kB
20:23:01 [vite] dist/_astro/cursor-transparent.DskdkFxq.js             0.70 kB │ gzip:   0.41 kB
20:23:01 [vite] dist/_astro/twitterIcon.D8UI9rCA.js                    0.70 kB │ gzip:   0.43 kB
20:23:01 [vite] dist/_astro/mobile.GiG2kNAE.js                         0.71 kB │ gzip:   0.37 kB
20:23:01 [vite] dist/_astro/checkmark-bold.D2QVG_wH.js                 0.77 kB │ gzip:   0.49 kB
20:23:01 [vite] dist/_astro/etherscan.ClB2eUqa.js                      0.82 kB │ gzip:   0.50 kB
20:23:01 [vite] dist/_astro/checkmark.CEQ936uX.js                      0.82 kB │ gzip:   0.52 kB
20:23:01 [vite] dist/_astro/help-circle.BmXi5cx4.js                    0.83 kB │ gzip:   0.48 kB
20:23:01 [vite] dist/_astro/wallet.7wIT3E_P.js                         0.84 kB │ gzip:   0.47 kB
20:23:01 [vite] dist/_astro/plus.TZE3-5IT.js                           0.88 kB │ gzip:   0.48 kB
20:23:01 [vite] dist/_astro/verify-filled.D3RNctKt.js                  0.89 kB │ gzip:   0.52 kB
20:23:01 [vite] dist/_astro/add.DcMFaLE2.js                            0.89 kB │ gzip:   0.48 kB
20:23:01 [vite] dist/_astro/google.BWTZ6JAa.js                         0.93 kB │ gzip:   0.51 kB
20:23:01 [vite] dist/_astro/three-dots.CYdj7lBs.js                     0.96 kB │ gzip:   0.46 kB
20:23:01 [vite] dist/_astro/clock._LZUInjs.js                          0.96 kB │ gzip:   0.53 kB
20:23:01 [vite] dist/_astro/disconnect.Ca0pjakj.js                     1.01 kB │ gzip:   0.56 kB
20:23:01 [vite] dist/_astro/twitch.D_4D_Xum.js                         1.02 kB │ gzip:   0.55 kB
20:23:01 [vite] dist/_astro/bank.Co60wF1T.js                           1.06 kB │ gzip:   0.58 kB
20:23:01 [vite] dist/_astro/apple.DY62Jzc5.js                          1.08 kB │ gzip:   0.58 kB
20:23:01 [vite] dist/_astro/play-store.Dy-gJGD7.js                     1.13 kB │ gzip:   0.57 kB
20:23:01 [vite] dist/_astro/farcaster.CJTAnfNR.js                      1.13 kB │ gzip:   0.58 kB
20:23:01 [vite] dist/_astro/arrow-bottom-circle.zHBCsDSu.js            1.25 kB │ gzip:   0.58 kB
20:23:01 [vite] dist/_astro/github.XbN1h4i8.js                         1.25 kB │ gzip:   0.65 kB
20:23:01 [vite] dist/_astro/swapHorizontalBold.SEcdKo3o.js             1.28 kB │ gzip:   0.67 kB
20:23:01 [vite] dist/_astro/app-store.jIWzWr8C.js                      1.32 kB │ gzip:   0.73 kB
20:23:01 [vite] dist/_astro/mail.Cptm_PVi.js                           1.32 kB │ gzip:   0.71 kB
20:23:01 [vite] dist/_astro/v0.1.0-452JMA5G.CxDlBNav.js                1.33 kB │ gzip:   0.64 kB
20:23:01 [vite] dist/_astro/facebook.opLiGCOv.js                       1.35 kB │ gzip:   0.70 kB
20:23:01 [vite] dist/_astro/wallet-placeholder.C_D1Oakj.js             1.38 kB │ gzip:   0.65 kB
20:23:01 [vite] dist/_astro/desktop.BnL1wIo7.js                        1.39 kB │ gzip:   0.70 kB
20:23:01 [vite] dist/_astro/discord.Bi1eWurA.js                        1.42 kB │ gzip:   0.71 kB
20:23:01 [vite] dist/_astro/swapHorizontalMedium.D7Mkyc73.js           1.42 kB │ gzip:   0.73 kB
20:23:01 [vite] dist/_astro/recycle-horizontal.BmOVf1oR.js             1.46 kB │ gzip:   0.76 kB
20:23:01 [vite] dist/_astro/base32.l_RPZY32.js                         1.50 kB │ gzip:   0.51 kB
20:23:01 [vite] dist/_astro/extension.gjzVzDrK.js                      1.55 kB │ gzip:   0.75 kB
20:23:01 [vite] dist/_astro/telegram.C_zzmHsv.js                       1.57 kB │ gzip:   0.89 kB
20:23:01 [vite] dist/_astro/swapHorizontalRoundedBold.BTZAbNyP.js      1.57 kB │ gzip:   0.82 kB
20:23:01 [vite] dist/_astro/verify.ChPLIHLA.js                         1.59 kB │ gzip:   0.77 kB
20:23:01 [vite] dist/_astro/qr-code.Co2g3si0.js                        1.63 kB │ gzip:   0.58 kB
20:23:01 [vite] dist/_astro/browser.D6SMpD-m.js                        1.70 kB │ gzip:   0.84 kB
20:23:01 [vite] dist/_astro/network-placeholder.CRt4Rn36.js            1.77 kB │ gzip:   0.79 kB
20:23:01 [vite] dist/_astro/client.BHjpRL8Y.js                         1.84 kB │ gzip:   0.91 kB
20:23:01 [vite] dist/_astro/id.l0xuIiI3.js                             1.87 kB │ gzip:   0.86 kB
20:23:01 [vite] dist/_astro/nftPlaceholder.Dlro1YxX.js                 1.87 kB │ gzip:   0.92 kB
20:23:01 [vite] dist/_astro/v0.2.0-RZSAEYWJ.BO42Ib25.js                1.90 kB │ gzip:   0.80 kB
20:23:01 [vite] dist/_astro/v0.4.0-XWYIU6OQ.dtmZJ7oB.js                2.00 kB │ gzip:   0.86 kB
20:23:01 [vite] dist/_astro/v0.3.0-QEEYHNXA.C8R-2dRU.js                2.09 kB │ gzip:   0.87 kB
20:23:01 [vite] dist/_astro/info.DQP-fTMA.js                           2.38 kB │ gzip:   1.20 kB
20:23:01 [vite] dist/_astro/v0.5.0-6JWER4SU.B0qvJgU-.js                2.44 kB │ gzip:   0.93 kB
20:23:01 [vite] dist/_astro/exclamation-triangle.CyXzY4cj.js           2.54 kB │ gzip:   1.19 kB
20:23:01 [vite] dist/_astro/send.iewOO91L.js                           2.54 kB │ gzip:   1.34 kB
20:23:01 [vite] dist/_astro/card.Bc4Z5vbw.js                           2.71 kB │ gzip:   1.23 kB
20:23:01 [vite] dist/_astro/chrome-store.DEepVzmN.js                   2.71 kB │ gzip:   1.07 kB
20:23:01 [vite] dist/_astro/reown-logo.BNrcQTUY.js                     2.72 kB │ gzip:   1.12 kB
20:23:01 [vite] dist/_astro/lightbulb.B-dE5Ylc.js                      2.83 kB │ gzip:   1.28 kB
20:23:01 [vite] dist/_astro/ccip.DueAbYv3.js                           2.92 kB │ gzip:   1.35 kB
20:23:01 [vite] dist/_astro/v0.8.0-MA4RCSXJ.BzWVU6mD.js                3.40 kB │ gzip:   1.22 kB
20:23:01 [vite] dist/_astro/v0.6.0-DCUHOIX6.D0nK_KNa.js                3.44 kB │ gzip:   1.21 kB
20:23:01 [vite] dist/_astro/v0.7.0-WUIYE67P.DHAtTBPF.js                3.46 kB │ gzip:   1.22 kB
20:23:01 [vite] dist/_astro/image.DuIWkyJR.js                          3.61 kB │ gzip:   1.57 kB
20:23:01 [vite] dist/_astro/copy.DGYUyK_Q.js                           3.94 kB │ gzip:   1.54 kB
20:23:01 [vite] dist/_astro/walletconnect.b5wSlJeW.js                  4.18 kB │ gzip:   1.72 kB
20:23:01 [vite] dist/_astro/base.DMz8QJ2S.js                           4.32 kB │ gzip:   1.80 kB
20:23:01 [vite] dist/_astro/v0.9.0-MODYXNNJ.CW56i5Hn.js                4.79 kB │ gzip:   1.60 kB
20:23:01 [vite] dist/_astro/v0.10.0-OHB5VFCY.BxLkbVOM.js               5.20 kB │ gzip:   1.71 kB
20:23:01 [vite] dist/_astro/v0.11.0-YC4BNGSG.ZJUKLJPn.js               5.72 kB │ gzip:   1.77 kB
20:23:01 [vite] dist/_astro/cid.DuD6wXc4.js                            5.83 kB │ gzip:   2.45 kB
20:23:01 [vite] dist/_astro/v1.0.0-LO3INJ7G.Cn81q8wR.js                6.36 kB │ gzip:   1.93 kB
20:23:01 [vite] dist/_astro/v1.1.0-VDZLWY4U.BWHazOd8.js                6.82 kB │ gzip:   2.08 kB
20:23:01 [vite] dist/_astro/v1.2.0-J7HBJ6X3.DAO9TS_K.js                6.98 kB │ gzip:   2.15 kB
20:23:01 [vite] dist/_astro/v1.3.0-YE5Z6DA7.WxjICRnn.js                7.32 kB │ gzip:   2.29 kB
20:23:01 [vite] dist/_astro/v1.4.0-XW4S4BWH.BE1DD-uT.js                8.88 kB │ gzip:   2.53 kB
20:23:01 [vite] dist/_astro/v1.5.0-RPBY3HCV.BChBsCfx.js                9.72 kB │ gzip:   2.83 kB
20:23:01 [vite] dist/_astro/v1.6.0-WTOLS5Y6.BrJvDjHz.js               10.73 kB │ gzip:   3.03 kB
20:23:01 [vite] dist/_astro/v1.7.0-7V2ZPHKV.1d-zW9eS.js               10.98 kB │ gzip:   3.07 kB
20:23:01 [vite] dist/_astro/v1.8.0-UKWSFP36.wayCITfA.js               10.98 kB │ gzip:   3.06 kB
20:23:01 [vite] dist/_astro/v1.9.0-SQYL3FIK.ehOfOIud.js               11.19 kB │ gzip:   3.12 kB
20:23:01 [vite] dist/_astro/v1.10.0-HV5QAMRI.DtfFbtUQ.js              11.67 kB │ gzip:   3.32 kB
20:23:01 [vite] dist/_astro/v1.11.0-7OORRXZT.CGwSLHNc.js              12.77 kB │ gzip:   3.58 kB
20:23:01 [vite] dist/_astro/v1.13.0-F46Z6ASK.CtOs43cv.js              13.89 kB │ gzip:   3.96 kB
20:23:01 [vite] dist/_astro/v1.12.0-JRP6T6PK.BrocjUYM.js              13.89 kB │ gzip:   3.96 kB
20:23:01 [vite] dist/_astro/v1.15.0-4YFUPOOT.Bi1u4Jfv.js              13.90 kB │ gzip:   4.00 kB
20:23:01 [vite] dist/_astro/v1.14.0-4GFOYRNY.B8nGQ1Rg.js              13.92 kB │ gzip:   4.01 kB
20:23:01 [vite] dist/_astro/secp256k1.aLXYj32d.js                     31.50 kB │ gzip:  12.59 kB
20:23:01 [vite] dist/_astro/w3m-modal.ByV6BDmg.js                     39.50 kB │ gzip:   9.25 kB
20:23:01 [vite] dist/_astro/index.QKznZHD6.js                         39.67 kB │ gzip:   9.38 kB
20:23:01 [vite] dist/_astro/ajv.B0PCc7TN.js                          124.94 kB │ gzip:  39.27 kB
20:23:01 [vite] dist/_astro/basic.D8kVlgo2.js                        141.77 kB │ gzip:  32.77 kB
20:23:01 [vite] dist/_astro/index.BKL_-_Dm.js                        142.40 kB │ gzip:  45.69 kB
20:23:01 [vite] dist/_astro/index.es.DB94AKpA.js                     398.87 kB │ gzip: 115.66 kB
20:23:01 [vite] dist/_astro/core.Cj0c0eyv.js                         471.49 kB │ gzip: 129.01 kB
20:23:01 [vite] dist/_astro/TradingApp.BEnKM5CB.js                 1,435.37 kB │ gzip: 438.50 kB
20:23:01 [WARN] [vite] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
20:23:01 [vite] ✓ built in 19.10s

 generating static routes 
20:23:02 ▶ src/pages/fees.astro
20:23:02   └─ /fees/index.html (+16ms) 
20:23:02 ▶ src/pages/index.astro
20:23:02   └─ /index.html (+6ms) 
20:23:02 ▶ src/pages/legal.astro
20:23:02   └─ /legal/index.html (+4ms) 
20:23:02 ✓ Completed in 860ms.

20:23:02 [build] 3 page(s) built in 21.60s
20:23:02 [build] Complete!
Build SHA-256: 95d0e7d951bde9761576e5fbc44a0a3d550cd92d75f4b6a02185f09498eae82b

[exit_code=0]
```

## Actual Taxlot importer round-trip

[Raw output](audit/phase-i/real-importer.txt)

```text
$ node scripts/audit/taxlot-roundtrip.mjs
Real importer: /home/corio/TAXLOT/src/importers/index.ts
Taxlot HEAD: a4879aec7ecee5f0049ddfd4780000ae9a63b2e9
Schema byte-identical: d8eb339ed7acd7da3b68ef09fe5c1b01c4cc3258cb401a4f2ba8805e7a3b07d7
Importer SHA256: 6f5d5c9cea24b88e868b7bc8bb022a341aed3c23c6c41d761f133b4d1a0e4e55
Synthetic CoW fills -> actual PIT recorder -> IndexedDB -> CSV -> actual Taxlot Generic importer
Persisted/schema-valid: 2 Imported/schema-valid: 2 Blocking issues: 0
Exact economic fields preserved; asset IDs uppercased by upstream assetName; deterministic replay: PASS
All field differences: [{"row":1,"field":"id","pit":"cow:11155111:synthetic-cow-one:1:0","taxlot":"pit-phase-i-fixture:2"},{"row":1,"field":"sequence","pit":42,"taxlot":0},{"row":1,"field":"asset","pit":"eip155:11155111/erc20:0x1111111111111111111111111111111111111111","taxlot":"EIP155:11155111/ERC20:0X1111111111111111111111111111111111111111"},{"row":1,"field":"counter_asset","pit":"eip155:11155111/erc20:0x2222222222222222222222222222222222222222","taxlot":"EIP155:11155111/ERC20:0X2222222222222222222222222222222222222222"},{"row":1,"field":"fee","pit":[{"asset":"eip155:11155111/erc20:0x1111111111111111111111111111111111111111","quantity":"0.000000000000000001"}],"taxlot":[{"asset":"EIP155:11155111/ERC20:0X1111111111111111111111111111111111111111","quantity":"0.000000000000000001"}]},{"row":1,"field":"source","pit":"pit:cow:11155111","taxlot":"Generic"},{"row":1,"field":"raw_row_ref","pit":"cow:11155111:synthetic-cow-one:1:0","taxlot":"pit-phase-i-fixture:2"},{"row":1,"field":"valuation_note","pit":"Crypto-to-crypto trade, including stablecoins. Amounts from executed fill; no EUR valuation supplied.","taxlot":null},{"row":2,"field":"id","pit":"cow:11155111:synthetic-cow-two:2:0","taxlot":"pit-phase-i-fixture:3"},{"row":2,"field":"sequence","pit":43,"taxlot":1},{"row":2,"field":"asset","pit":"eip155:11155111/erc20:0x2222222222222222222222222222222222222222","taxlot":"EIP155:11155111/ERC20:0X2222222222222222222222222222222222222222"},{"row":2,"field":"counter_asset","pit":"eip155:11155111/erc20:0x1111111111111111111111111111111111111111","taxlot":"EIP155:11155111/ERC20:0X1111111111111111111111111111111111111111"},{"row":2,"field":"fee","pit":[{"asset":"eip155:11155111/erc20:0x2222222222222222222222222222222222222222","quantity":"0.000001"}],"taxlot":[{"asset":"EIP155:11155111/ERC20:0X2222222222222222222222222222222222222222","quantity":"0.000001"}]},{"row":2,"field":"source","pit":"pit:cow:11155111","taxlot":"Generic"},{"row":2,"field":"raw_row_ref","pit":"cow:11155111:synthetic-cow-two:2:0","taxlot":"pit-phase-i-fixture:3"},{"row":2,"field":"valuation_note","pit":"Crypto-to-crypto trade, including stablecoins. Amounts from executed fill; no EUR valuation supplied.","taxlot":null}]
Artifacts: docs/audit/phase-i/cow-fixture.csv and roundtrip.json
No live execution and no tax calculation/valuation acceptance claimed.

[exit_code=0]
```

## Observer syntax

[Raw output](audit/phase-i/observer-syntax.txt)

```text
$ node --check scripts/live-e2e.mjs

[exit_code=0]
```

[Initial importer sandbox failure](audit/phase-i/importer-sandbox-failure.txt). The successful retry above supersedes that environment failure.

---

Historical Phase H/G/F evidence follows. Their hashes/results refer to those earlier artifacts; Phase I supersedes shared raw derivative storage and pending importer investigation.

# Phase H verification — LIVE ACCEPTANCE BLOCKED

Baseline `3651f775bdb6ee6c0df601bf1a9dbf3e488b77fc`. The operator explicitly requested: **keep live execution blocked and finish evidence/preparation**. No wallet connection, signature, approval, swap or Hyperliquid order occurred. No live order ID, settlement hash, fill, live zero-fee proof, real-event schema result or reconciled CSV exists.

[Full live-attempt blocker, operator procedure, field-by-field unavailable reconciliation, derivative disposition and remaining blockers](audit/phase-h/LIVE-TESTNET.md). [Assumptions](../ASSUMPTIONS.md): assumption 8 remains OPEN; derivative accounting is BLOCKED for Phase I. No dedicated public origin was deployed or verified.

**Regression checks after the blocked attempt/remediation:** 24 unit tests, 8 offline Playwright tests, clean typecheck and successful production build. These are not post-live-execution results. Fee flags, CoW/Hyperliquid execution/fee configuration, Taxlot schema, origin policy and legal gates are unchanged. The derivative converter was removed: fills are raw evidence only; derivative Taxlot insertion/export is rejected, and existing legacy rows are preserved but excluded from spot exports.

The observer uses public shell parameters, no automatic environment-file loading or wallet/trade-button clicks. It validates loopback endpoints, limits observed primary submissions, omits signatures from saved request evidence and never claims settlement from submission. Its syntax/missing-configuration path are verified; its connected live-wallet path is not. Future unreviewed evidence is ignored by Git until explicitly reviewed.

## Exact Phase H command outputs

Captured combined stdout/stderr follows verbatim with command/exit-code framing; terminal escapes, timing and trailing whitespace are intentional. Playwright uses authorized localhost/Chromium permissions outside the sandbox and fixture requests, not real protocol execution.

## Security preflight

[Raw output](audit/phase-h/preflight.txt)

```text
$ python3 scripts/audit/live-preflight.py
$ git status --short
?? scripts/audit/live-preflight.py
$ git rev-parse HEAD
3651f775bdb6ee6c0df601bf1a9dbf3e488b77fc
src/lib/config.ts: FEES_ENABLED: false
src/lib/config.ts: MAINNET_ENABLED: false
src/lib/config.ts: feeRecipient: ""
src/lib/config.ts: builderAddress: ""
src/lib/hyperliquid.ts: new HttpTransport({ isTestnet: true })
CoW permitted trading chain: Sepolia 11155111; actual wallet chain NOT VERIFIED until external provider attached.
Hyperliquid transport: https://api.hyperliquid-testnet.xyz (info/exchange)
Public live parameters: {"PIT_LIVE_CDP_URL": "MISSING", "PIT_TEST_ACCOUNT": "MISSING", "PIT_SEPOLIA_SELL_TOKEN": "MISSING", "PIT_SEPOLIA_BUY_TOKEN": "MISSING", "PIT_SEPOLIA_SELL_AMOUNT": "MISSING", "PIT_HL_PRICE": "MISSING", "PIT_HL_SIZE": "MISSING"}
Secret-named PIT/PUBLIC environment variables present: 0
Root environment files: [".env.example"]
No process environment values were logged; external wallet custody is required.

[exit_code=0]
```

## Secret/environment preflight

[Raw output](audit/phase-h/secret-preflight.txt)

```text
$ python3 scripts/audit/origin-secrets-review.py
Underlying Phase F scanner exit: 1
Available Git commits/blobs: 7 138
Current env files: ['.env.example']
Historical Phase F manifest byte-identical to 079abb7: True
Historical public artifact hash matches reviewed: 174
Unresolved credential candidates: 0
Limits: original pattern-scan exclusions and limitations still apply; no absence guarantee.

[exit_code=0]
```

## Blocked live attempt

[Raw output](audit/phase-h/live-attempt.txt)

```text
$ node scripts/live-e2e.mjs
LIVE EXECUTION BLOCKED: missing public configuration: PIT_LIVE_CDP_URL, PIT_TEST_ACCOUNT, PIT_SEPOLIA_SELL_TOKEN, PIT_SEPOLIA_BUY_TOKEN, PIT_SEPOLIA_SELL_AMOUNT, PIT_HL_PRICE, PIT_HL_SIZE. No test order was sent.

[exit_code=2]
```

## Observer syntax check

[Raw output](audit/phase-h/harness-syntax.txt)

```text
$ node --check scripts/live-e2e.mjs

[exit_code=0]
```

## Unit tests

[Raw output](audit/phase-h/unit.txt)

```text
$ pnpm test

> pit@0.1.0 test /home/corio/PIT
> vitest run


 RUN  v3.2.7 /home/corio/PIT

 ✓ tests/schema-provenance.test.ts (1 test) 5ms
 ✓ tests/storage-policy.test.ts (5 tests) 51ms
 ✓ tests/audit-builder-path.test.ts (1 test) 12ms
 ✓ tests/audit-taxlot.test.ts (1 test) 114ms
 ✓ tests/events.test.ts (4 tests) 128ms
 ✓ tests/hyperliquid.test.ts (2 tests) 7ms
 ✓ tests/cow.test.ts (6 tests) 20ms
 ✓ tests/audit-fees.test.ts (4 tests) 8ms

 Test Files  8 passed (8)
      Tests  24 passed (24)
   Start at  20:03:25
   Duration  1.95s (transform 522ms, setup 228ms, collect 5.97s, tests 344ms, environment 2ms, prepare 1.32s)


[exit_code=0]
```

## Playwright tests

[Raw output](audit/phase-h/playwright.txt)

```text
$ pnpm test:e2e

> pit@0.1.0 test:e2e /home/corio/PIT
> playwright test

[2m[WebServer] [22m(node:149813) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[2m[WebServer] [22m(Use `node --trace-warnings ...` to show where the warning was created)
[2m[WebServer] [22m(node:149826) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[2m[WebServer] [22m(Use `node --trace-warnings ...` to show where the warning was created)

Running 8 tests using 3 workers

(node:149911) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:149918) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:149913) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:149911) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:149918) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:149913) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
Attack reproduction: {"stolen":{"event":{"account":"fixture","quantity":"1"},"raw":{"fill":"original"},"sequence":1},"poisoned":{"account":"fixture","quantity":"999"},"deleted":true,"sequence":999,"origin":"http://127.0.0.1:4398"}
  ✓  2 tests/e2e/storage-origin.spec.ts:2:1 › shared-origin attack reads, poisons and deletes events raw and meta (205ms)
Dedicated origin https://pit.example: reload persistence and CSV passed; https://sibling.example: no PIT database.
  ✓  3 tests/e2e/origin-guard.spec.ts:54:1 › approved dedicated HTTPS origin persists and exports; sibling origin cannot read records (326ms)
Shared path: eventDB, appendEvent, listEvents, downloadCSV rejected; existing valid event preserved.
  ✓  4 tests/e2e/origin-guard.spec.ts:93:1 › unsafe path denies open/write/read/download and preserves pre-existing valid records (142ms)
  ✓  5 tests/e2e/origin-guard.spec.ts:133:1 › unapproved production origin never creates PIT storage; approved stable IPNS origin works (155ms)
  ✓  1 tests/e2e/interface.spec.ts:10:1 › production swap, wallet dialog, navigation and CSP (1.0s)
  ✓  6 tests/e2e/interface.spec.ts:50:1 › perps fields render against public info fixture and mobile does not overflow (530ms)
  ✓  7 tests/e2e/interface.spec.ts:77:1 › injected test provider connects without secrets; invalid swaps cannot sign (1.7s)
  ✓  8 tests/e2e/interface.spec.ts:173:1 › IPFS-style subpath hydrates and links stay beneath the CID (659ms)

  8 passed (7.6s)

[exit_code=0]
```

## Typecheck

[Raw output](audit/phase-h/typecheck.txt)

```text
$ pnpm check

> pit@0.1.0 check /home/corio/PIT
> astro check

20:03:28 [content] Syncing content
20:03:28 [content] Synced content
20:03:28 [types] Generated 60ms
20:03:28 [check] Getting diagnostics for Astro files in /home/corio/PIT...
Result (38 files): 
- 0 errors
- 0 warnings
- 0 hints


[exit_code=0]
```

## Production build

[Raw output](audit/phase-h/build.txt)

```text
$ pnpm build

> pit@0.1.0 build /home/corio/PIT
> node scripts/generate-validator.mjs && astro build && node scripts/prepare-static.mjs && node scripts/build-manifest.mjs

20:03:28 [content] Syncing content
20:03:28 [content] Synced content
20:03:28 [types] Generated 57ms
20:03:28 [build] output: "static"
20:03:28 [build] mode: "static"
20:03:28 [build] directory: /home/corio/PIT/dist/
20:03:28 [build] Collecting build info...
20:03:28 [build] ✓ Completed in 101ms.
20:03:28 [build] Building static entrypoints...
20:03:30 [vite] ✓ built in 1.49s
20:03:30 [build] ✓ Completed in 1.53s.

 building client (vite) 
20:03:30 [vite] transforming...
20:03:37 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js (6:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:03:37 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js (6:27): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:03:37 [WARN] [vite] node_modules/.pnpm/ox@0.9.17_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js (6:27): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.9.17_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:03:39 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js (2:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:03:39 [WARN] [vite] node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment

"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle."

in "node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:03:39 [WARN] [vite] node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment

"/** Anchors a pattern source. The interpolation lives here rather than at the call site because
 * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it
 * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */"

in "node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:03:43 [WARN] [vite] node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js (6:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:03:43 [WARN] [vite] node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js (2:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
20:03:49 [vite] ✓ 5290 modules transformed.
20:03:50 [vite] rendering chunks...
20:03:50 [vite] computing gzip size...
20:03:50 [vite] dist/_astro/TradingApp.BAn_a8jV.js                     0.10 kB │ gzip:   0.10 kB
20:03:50 [vite] dist/_astro/base16.BPd3-eEf.js                         0.33 kB │ gzip:   0.24 kB
20:03:50 [vite] dist/_astro/cursor.DntG-d_l.js                         0.38 kB │ gzip:   0.27 kB
20:03:50 [vite] dist/_astro/chevron-left.BrzvG34X.js                   0.52 kB │ gzip:   0.33 kB
20:03:50 [vite] dist/_astro/chevron-top.BiGJ7VEP.js                    0.52 kB │ gzip:   0.33 kB
20:03:50 [vite] dist/_astro/external-link.Cds3SY7e.js                  0.52 kB │ gzip:   0.33 kB
20:03:50 [vite] dist/_astro/chevron-bottom.D0pWfkJn.js                 0.52 kB │ gzip:   0.33 kB
20:03:50 [vite] dist/_astro/chevron-right.CMsVV6zA.js                  0.52 kB │ gzip:   0.32 kB
20:03:50 [vite] dist/_astro/arrow-top.Db-O5IvD.js                      0.53 kB │ gzip:   0.34 kB
20:03:50 [vite] dist/_astro/arrow-bottom.Dg7KKl2r.js                   0.53 kB │ gzip:   0.34 kB
20:03:50 [vite] dist/_astro/arrow-left.Biy-9g28.js                     0.53 kB │ gzip:   0.34 kB
20:03:50 [vite] dist/_astro/arrow-right.nPT7IInL.js                    0.53 kB │ gzip:   0.34 kB
20:03:50 [vite] dist/_astro/off.f7pDkH15.js                            0.55 kB │ gzip:   0.34 kB
20:03:50 [vite] dist/_astro/search.BrjGeRGk.js                         0.56 kB │ gzip:   0.35 kB
20:03:50 [vite] dist/_astro/close.DSyzbTK-.js                          0.56 kB │ gzip:   0.34 kB
20:03:50 [vite] dist/_astro/all-wallets.3EVpCOn1.js                    0.57 kB │ gzip:   0.32 kB
20:03:50 [vite] dist/_astro/filters.DWbQM4dW.js                        0.57 kB │ gzip:   0.33 kB
20:03:50 [vite] dist/_astro/info-circle.B5AVXD-a.js                    0.59 kB │ gzip:   0.35 kB
20:03:50 [vite] dist/_astro/more.DO34k37_.js                           0.61 kB │ gzip:   0.36 kB
20:03:50 [vite] dist/_astro/refresh.dkYQSkPe.js                        0.61 kB │ gzip:   0.38 kB
20:03:50 [vite] dist/_astro/warning-circle.DEojg_aj.js                 0.62 kB │ gzip:   0.37 kB
20:03:50 [vite] dist/_astro/coinPlaceholder.DB8YVrpT.js                0.62 kB │ gzip:   0.40 kB
20:03:50 [vite] dist/_astro/compass.8qfA101s.js                        0.64 kB │ gzip:   0.40 kB
20:03:50 [vite] dist/_astro/swapVertical.CMhM9Ko9.js                   0.67 kB │ gzip:   0.39 kB
20:03:50 [vite] dist/_astro/swapHorizontal.HpifNvf-.js                 0.67 kB │ gzip:   0.39 kB
20:03:50 [vite] dist/_astro/x.aKNXVOFW.js                              0.69 kB │ gzip:   0.44 kB
20:03:50 [vite] dist/_astro/cursor-transparent.CE9-dMSV.js             0.70 kB │ gzip:   0.41 kB
20:03:50 [vite] dist/_astro/twitterIcon.BqPGfMDt.js                    0.70 kB │ gzip:   0.43 kB
20:03:50 [vite] dist/_astro/mobile.6aIl7V1N.js                         0.71 kB │ gzip:   0.37 kB
20:03:50 [vite] dist/_astro/checkmark-bold.D2Vy6fCz.js                 0.77 kB │ gzip:   0.49 kB
20:03:50 [vite] dist/_astro/etherscan.C3DZAUMw.js                      0.82 kB │ gzip:   0.50 kB
20:03:50 [vite] dist/_astro/checkmark.CmGESpwc.js                      0.82 kB │ gzip:   0.52 kB
20:03:50 [vite] dist/_astro/help-circle.bX_f65P2.js                    0.83 kB │ gzip:   0.48 kB
20:03:50 [vite] dist/_astro/wallet.DoB1kaGz.js                         0.84 kB │ gzip:   0.47 kB
20:03:50 [vite] dist/_astro/plus.DdEstLXF.js                           0.88 kB │ gzip:   0.48 kB
20:03:50 [vite] dist/_astro/verify-filled.BfXPjCYn.js                  0.89 kB │ gzip:   0.52 kB
20:03:50 [vite] dist/_astro/add.4jj9HE4B.js                            0.89 kB │ gzip:   0.49 kB
20:03:50 [vite] dist/_astro/google.BC6m0xDg.js                         0.93 kB │ gzip:   0.51 kB
20:03:50 [vite] dist/_astro/three-dots.C5_oAvTL.js                     0.96 kB │ gzip:   0.46 kB
20:03:50 [vite] dist/_astro/clock.CNw0G5Fh.js                          0.96 kB │ gzip:   0.53 kB
20:03:50 [vite] dist/_astro/disconnect.fkR5c4Us.js                     1.01 kB │ gzip:   0.56 kB
20:03:50 [vite] dist/_astro/twitch.CC22wbYM.js                         1.02 kB │ gzip:   0.55 kB
20:03:50 [vite] dist/_astro/bank.DwfhNmA8.js                           1.06 kB │ gzip:   0.58 kB
20:03:50 [vite] dist/_astro/apple.C0CYE690.js                          1.08 kB │ gzip:   0.58 kB
20:03:50 [vite] dist/_astro/play-store.k7fq2Gi4.js                     1.13 kB │ gzip:   0.57 kB
20:03:50 [vite] dist/_astro/farcaster.DdBC4dcm.js                      1.13 kB │ gzip:   0.59 kB
20:03:50 [vite] dist/_astro/arrow-bottom-circle.Bh8U3xkT.js            1.25 kB │ gzip:   0.58 kB
20:03:50 [vite] dist/_astro/github.CG2jBNqv.js                         1.25 kB │ gzip:   0.65 kB
20:03:50 [vite] dist/_astro/swapHorizontalBold.DSF2o7_Z.js             1.28 kB │ gzip:   0.67 kB
20:03:50 [vite] dist/_astro/app-store.Dwvs9D8L.js                      1.32 kB │ gzip:   0.73 kB
20:03:50 [vite] dist/_astro/mail.Dl26fIUv.js                           1.32 kB │ gzip:   0.71 kB
20:03:50 [vite] dist/_astro/v0.1.0-452JMA5G.CxDlBNav.js                1.33 kB │ gzip:   0.64 kB
20:03:50 [vite] dist/_astro/facebook.nZHbQaPB.js                       1.35 kB │ gzip:   0.70 kB
20:03:50 [vite] dist/_astro/wallet-placeholder.BJvGQBvI.js             1.38 kB │ gzip:   0.65 kB
20:03:50 [vite] dist/_astro/desktop.D0Reh2q_.js                        1.39 kB │ gzip:   0.70 kB
20:03:50 [vite] dist/_astro/discord.cyqYsyGv.js                        1.42 kB │ gzip:   0.71 kB
20:03:50 [vite] dist/_astro/swapHorizontalMedium.C88-AWYV.js           1.42 kB │ gzip:   0.74 kB
20:03:50 [vite] dist/_astro/recycle-horizontal.DOn8JZw4.js             1.46 kB │ gzip:   0.76 kB
20:03:50 [vite] dist/_astro/base32.l_RPZY32.js                         1.50 kB │ gzip:   0.51 kB
20:03:50 [vite] dist/_astro/extension.DMz2oeTN.js                      1.55 kB │ gzip:   0.75 kB
20:03:50 [vite] dist/_astro/telegram.D6wQZ8s9.js                       1.57 kB │ gzip:   0.89 kB
20:03:50 [vite] dist/_astro/swapHorizontalRoundedBold.B0NsHVpM.js      1.57 kB │ gzip:   0.82 kB
20:03:50 [vite] dist/_astro/verify.Dz7UWy6s.js                         1.59 kB │ gzip:   0.77 kB
20:03:50 [vite] dist/_astro/qr-code.gUxbYybe.js                        1.63 kB │ gzip:   0.58 kB
20:03:50 [vite] dist/_astro/browser.BZXcTuQ_.js                        1.70 kB │ gzip:   0.84 kB
20:03:50 [vite] dist/_astro/network-placeholder.DSWwHIDt.js            1.77 kB │ gzip:   0.79 kB
20:03:50 [vite] dist/_astro/client.BHjpRL8Y.js                         1.84 kB │ gzip:   0.91 kB
20:03:50 [vite] dist/_astro/id.B2VB8e7g.js                             1.87 kB │ gzip:   0.86 kB
20:03:50 [vite] dist/_astro/nftPlaceholder.ZN-aC67e.js                 1.87 kB │ gzip:   0.93 kB
20:03:50 [vite] dist/_astro/v0.2.0-RZSAEYWJ.BO42Ib25.js                1.90 kB │ gzip:   0.80 kB
20:03:50 [vite] dist/_astro/v0.4.0-XWYIU6OQ.dtmZJ7oB.js                2.00 kB │ gzip:   0.86 kB
20:03:50 [vite] dist/_astro/v0.3.0-QEEYHNXA.C8R-2dRU.js                2.09 kB │ gzip:   0.87 kB
20:03:50 [vite] dist/_astro/info.JNZGY_ka.js                           2.38 kB │ gzip:   1.20 kB
20:03:50 [vite] dist/_astro/v0.5.0-6JWER4SU.B0qvJgU-.js                2.44 kB │ gzip:   0.93 kB
20:03:50 [vite] dist/_astro/exclamation-triangle.D09ajmQr.js           2.54 kB │ gzip:   1.19 kB
20:03:50 [vite] dist/_astro/send.BJnMeN4-.js                           2.54 kB │ gzip:   1.34 kB
20:03:50 [vite] dist/_astro/card.ikbVsSdv.js                           2.71 kB │ gzip:   1.23 kB
20:03:50 [vite] dist/_astro/chrome-store.BTaR6Rxn.js                   2.71 kB │ gzip:   1.07 kB
20:03:50 [vite] dist/_astro/reown-logo.BaApcAvW.js                     2.72 kB │ gzip:   1.13 kB
20:03:50 [vite] dist/_astro/lightbulb.BUWH2nrc.js                      2.83 kB │ gzip:   1.28 kB
20:03:50 [vite] dist/_astro/ccip.D_sgqg66.js                           2.92 kB │ gzip:   1.35 kB
20:03:50 [vite] dist/_astro/v0.8.0-MA4RCSXJ.BzWVU6mD.js                3.40 kB │ gzip:   1.22 kB
20:03:50 [vite] dist/_astro/v0.6.0-DCUHOIX6.D0nK_KNa.js                3.44 kB │ gzip:   1.21 kB
20:03:50 [vite] dist/_astro/v0.7.0-WUIYE67P.DHAtTBPF.js                3.46 kB │ gzip:   1.22 kB
20:03:50 [vite] dist/_astro/image.Ccnptyn8.js                          3.61 kB │ gzip:   1.57 kB
20:03:50 [vite] dist/_astro/copy.5qzywQZI.js                           3.94 kB │ gzip:   1.54 kB
20:03:50 [vite] dist/_astro/walletconnect.JYP2m3y6.js                  4.18 kB │ gzip:   1.72 kB
20:03:50 [vite] dist/_astro/base.DMz8QJ2S.js                           4.32 kB │ gzip:   1.80 kB
20:03:50 [vite] dist/_astro/v0.9.0-MODYXNNJ.CW56i5Hn.js                4.79 kB │ gzip:   1.60 kB
20:03:50 [vite] dist/_astro/v0.10.0-OHB5VFCY.BxLkbVOM.js               5.20 kB │ gzip:   1.71 kB
20:03:50 [vite] dist/_astro/v0.11.0-YC4BNGSG.ZJUKLJPn.js               5.72 kB │ gzip:   1.77 kB
20:03:50 [vite] dist/_astro/cid.DuD6wXc4.js                            5.83 kB │ gzip:   2.45 kB
20:03:50 [vite] dist/_astro/v1.0.0-LO3INJ7G.Cn81q8wR.js                6.36 kB │ gzip:   1.93 kB
20:03:50 [vite] dist/_astro/v1.1.0-VDZLWY4U.BWHazOd8.js                6.82 kB │ gzip:   2.08 kB
20:03:50 [vite] dist/_astro/v1.2.0-J7HBJ6X3.DAO9TS_K.js                6.98 kB │ gzip:   2.15 kB
20:03:50 [vite] dist/_astro/v1.3.0-YE5Z6DA7.WxjICRnn.js                7.32 kB │ gzip:   2.29 kB
20:03:50 [vite] dist/_astro/v1.4.0-XW4S4BWH.BE1DD-uT.js                8.88 kB │ gzip:   2.53 kB
20:03:50 [vite] dist/_astro/v1.5.0-RPBY3HCV.BChBsCfx.js                9.72 kB │ gzip:   2.83 kB
20:03:50 [vite] dist/_astro/v1.6.0-WTOLS5Y6.BrJvDjHz.js               10.73 kB │ gzip:   3.03 kB
20:03:50 [vite] dist/_astro/v1.7.0-7V2ZPHKV.1d-zW9eS.js               10.98 kB │ gzip:   3.07 kB
20:03:50 [vite] dist/_astro/v1.8.0-UKWSFP36.wayCITfA.js               10.98 kB │ gzip:   3.06 kB
20:03:50 [vite] dist/_astro/v1.9.0-SQYL3FIK.ehOfOIud.js               11.19 kB │ gzip:   3.12 kB
20:03:50 [vite] dist/_astro/v1.10.0-HV5QAMRI.DtfFbtUQ.js              11.67 kB │ gzip:   3.32 kB
20:03:50 [vite] dist/_astro/v1.11.0-7OORRXZT.CGwSLHNc.js              12.77 kB │ gzip:   3.58 kB
20:03:50 [vite] dist/_astro/v1.13.0-F46Z6ASK.CtOs43cv.js              13.89 kB │ gzip:   3.96 kB
20:03:50 [vite] dist/_astro/v1.12.0-JRP6T6PK.BrocjUYM.js              13.89 kB │ gzip:   3.96 kB
20:03:50 [vite] dist/_astro/v1.15.0-4YFUPOOT.Bi1u4Jfv.js              13.90 kB │ gzip:   4.00 kB
20:03:50 [vite] dist/_astro/v1.14.0-4GFOYRNY.B8nGQ1Rg.js              13.92 kB │ gzip:   4.01 kB
20:03:50 [vite] dist/_astro/secp256k1.1IzQTYZV.js                     31.50 kB │ gzip:  12.59 kB
20:03:50 [vite] dist/_astro/w3m-modal.BOL7YJ_i.js                     39.50 kB │ gzip:   9.25 kB
20:03:50 [vite] dist/_astro/index.BkPIzSJc.js                         39.67 kB │ gzip:   9.38 kB
20:03:50 [vite] dist/_astro/ajv.B0PCc7TN.js                          124.94 kB │ gzip:  39.27 kB
20:03:50 [vite] dist/_astro/basic.zeDbozsV.js                        141.77 kB │ gzip:  32.77 kB
20:03:50 [vite] dist/_astro/index.BKL_-_Dm.js                        142.40 kB │ gzip:  45.69 kB
20:03:50 [vite] dist/_astro/index.es.-l48i_FY.js                     398.87 kB │ gzip: 115.66 kB
20:03:50 [vite] dist/_astro/core.CYjLwtuD.js                         471.49 kB │ gzip: 129.01 kB
20:03:50 [vite] dist/_astro/TradingApp.n8gBEdI4.js                 1,431.91 kB │ gzip: 437.50 kB
20:03:50 [WARN] [vite] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
20:03:50 [vite] ✓ built in 20.25s

 generating static routes 
20:03:51 ▶ src/pages/fees.astro
20:03:51   └─ /fees/index.html (+11ms) 
20:03:51 ▶ src/pages/index.astro
20:03:51   └─ /index.html (+5ms) 
20:03:51 ▶ src/pages/legal.astro
20:03:51   └─ /legal/index.html (+3ms) 
20:03:51 ✓ Completed in 761ms.

20:03:51 [build] 3 page(s) built in 22.68s
20:03:51 [build] Complete!
Build SHA-256: ba8780b548ce68ded61a515b721a9e96d0fbc66905ac58cac4f38d1041a0a4a3

[exit_code=0]
```

## Unchanged fees/schema and artifact controls

[Raw output](audit/phase-h/invariants.txt)

```text
$ python3 scripts/audit/origin-evidence.py
$ git rev-parse HEAD
3651f775bdb6ee6c0df601bf1a9dbf3e488b77fc
Unchanged from Phase F: src/lib/config.ts
Unchanged from Phase F: src/lib/cow.ts
Unchanged from Phase F: src/lib/hyperliquid.ts
Unchanged from Phase F: schemas/events.v1.json
Taxlot current upstream byte equality: true; SHA256 d8eb339ed7acd7da3b68ef09fe5c1b01c4cc3258cb401a4f2ba8805e7a3b07d7
index.html CSP: connect-src 'self' https://*.cow.fi https://api.hyperliquid-testnet.xyz https://api.hyperliquid.xyz https://ethereum-sepolia-rpc.publicnode.com https://ethereum-rpc.publicnode.com https://base-rpc.publicnode.com https://arbitrum-one-rpc.publicnode.com https://11155111.rpc.thirdweb.com https://ethereum.reth.rs https://mainnet.base.org https://arb1.arbitrum.io;default-src 'none';font-src 'self' data:;img-src 'self' data:;object-src 'none';base-uri 'self';form-action 'self'; script-src 'self' 'sha256-BF0290pkb3jxQsE7z00xR8Imp8X34FLC88L0lkMnrGw=' 'sha256-QzWFZi+FLIx23tnm9SBU4aEgx4x8DsuASP07mfqol/c=' 'sha256-0chmwFk0zaA528yFfGV7J9ppIpdfTPPULncDF3WG7Zs=' 'sha256-eIXWvAmxkr251LJZkjniEK5LcPF3NkapbJepohwYRIc=' 'sha256-Q2BPg90ZMplYY+FSdApNErhpWafg2hcRRbndmvxuL/Q=' 'sha256-U7a72oKuFFz8D7GUHLA1NZ0ciymHmDOc9T9aVDg2rWU=' 'sha256-p9VbHs/ClkQc+x63XdUjvCAgeWxA4ZGvpebJtMn9jbs='; style-src 'self' 'unsafe-inline';
fees/index.html CSP: connect-src 'self' https://*.cow.fi https://api.hyperliquid-testnet.xyz https://api.hyperliquid.xyz https://ethereum-sepolia-rpc.publicnode.com https://ethereum-rpc.publicnode.com https://base-rpc.publicnode.com https://arbitrum-one-rpc.publicnode.com https://11155111.rpc.thirdweb.com https://ethereum.reth.rs https://mainnet.base.org https://arb1.arbitrum.io;default-src 'none';font-src 'self' data:;img-src 'self' data:;object-src 'none';base-uri 'self';form-action 'self'; script-src 'self' 'sha256-BF0290pkb3jxQsE7z00xR8Imp8X34FLC88L0lkMnrGw=' 'sha256-QzWFZi+FLIx23tnm9SBU4aEgx4x8DsuASP07mfqol/c=' 'sha256-0chmwFk0zaA528yFfGV7J9ppIpdfTPPULncDF3WG7Zs=' 'sha256-eIXWvAmxkr251LJZkjniEK5LcPF3NkapbJepohwYRIc=' 'sha256-Q2BPg90ZMplYY+FSdApNErhpWafg2hcRRbndmvxuL/Q=' 'sha256-U7a72oKuFFz8D7GUHLA1NZ0ciymHmDOc9T9aVDg2rWU=' 'sha256-p9VbHs/ClkQc+x63XdUjvCAgeWxA4ZGvpebJtMn9jbs='; style-src 'self' 'unsafe-inline';
legal/index.html CSP: connect-src 'self' https://*.cow.fi https://api.hyperliquid-testnet.xyz https://api.hyperliquid.xyz https://ethereum-sepolia-rpc.publicnode.com https://ethereum-rpc.publicnode.com https://base-rpc.publicnode.com https://arbitrum-one-rpc.publicnode.com https://11155111.rpc.thirdweb.com https://ethereum.reth.rs https://mainnet.base.org https://arb1.arbitrum.io;default-src 'none';font-src 'self' data:;img-src 'self' data:;object-src 'none';base-uri 'self';form-action 'self'; script-src 'self' 'sha256-BF0290pkb3jxQsE7z00xR8Imp8X34FLC88L0lkMnrGw=' 'sha256-QzWFZi+FLIx23tnm9SBU4aEgx4x8DsuASP07mfqol/c=' 'sha256-0chmwFk0zaA528yFfGV7J9ppIpdfTPPULncDF3WG7Zs=' 'sha256-eIXWvAmxkr251LJZkjniEK5LcPF3NkapbJepohwYRIc=' 'sha256-Q2BPg90ZMplYY+FSdApNErhpWafg2hcRRbndmvxuL/Q=' 'sha256-U7a72oKuFFz8D7GUHLA1NZ0ciymHmDOc9T9aVDg2rWU=' 'sha256-p9VbHs/ClkQc+x63XdUjvCAgeWxA4ZGvpebJtMn9jbs='; style-src 'self' 'unsafe-inline';
Cloudflare artifact _headers (configuration, not a live HTTP observation):
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: DENY

Storage deployment policy:
/** Reviewed deployment origins only: exact scheme/host/port, no paths or wildcards.
 * Keep empty until the operator verifies the entire origin is PIT-controlled.
 * Dedicated Pages/custom domains, DNSLink and stable IPNS subdomains work here.
 * This is public deployment policy, never a credential or user preference.
 */
export const accountingOrigins: readonly string[] = Object.freeze([]);

Database version/name: unchanged pit-taxlot-v1, version 1; no migration or deletion
Build hash: ba8780b548ce68ded61a515b721a9e96d0fbc66905ac58cac4f38d1041a0a4a3

[exit_code=0]
```

## Protected file comparison against Phase G

[Raw output](audit/phase-h/protected-files.txt)

```text
$ git diff --exit-code 3651f775bdb6ee6c0df601bf1a9dbf3e488b77fc -- src/lib/config.ts src/lib/cow.ts src/lib/hyperliquid.ts src/lib/storage-origins.ts src/lib/storage-policy.ts schemas/events.v1.json src/pages/legal.astro scripts/deploy.sh public/_headers

[exit_code=0]
```

---

Historical Phase G/F evidence follows; its hashes and assertions refer to those earlier artifacts. Phase H supersedes earlier derivative review-event/export behavior.

# Phase G verification — storage origin isolation

Baseline: `079abb7dabe48c5c0e42ec557c22f923f8ed644c`. **24 unit tests, 8 Playwright tests, typecheck and production build pass.** Production accounting is disabled until a dedicated HTTPS origin is explicitly reviewed and configured. Shared IPFS/IPNS paths cannot use PIT accounting persistence or CSV downloads. Existing records are preserved.

[Full attack reproduction, invariant, implementation, tests, hosting/CSP matrix and remaining blockers](audit/phase-g/ORIGIN-ISOLATION.md). [Assumptions](../ASSUMPTIONS.md): original assumption 8 remains OPEN for accounting/import semantics. PIT-F-01 is mitigated in current source; deployment acceptance and legacy shared-origin recovery remain OPEN. No public deployment or live trade is claimed.

Fee flags, network guards, fee recipients/rates and schema bytes are unchanged from Phase F; the exact check appears below. Approved HTTPS origins in browser tests are offline route fixtures with an explicit test-only allowlist. The shipping allowlist remains empty. Existing local preview/development remains allowed; browser tests validate the production artifact's warning and disabled export behavior under a shared path.

Files changed: `src/lib/storage-origins.ts`, `src/lib/storage-policy.ts`, `src/lib/events.ts`; accounting disclosure/sync in `src/components/Export.tsx`, `FillRecorder.tsx`, `TradingApp.tsx`; `tests/storage-policy.test.ts`, `tests/setup.ts`, `vitest.config.ts`, `tests/e2e/origin-guard.spec.ts`, `storage-origin.spec.ts`, `interface.spec.ts`; `scripts/audit/origin-evidence.py`, `render-origin-verification.py`, `origin-secrets-review.py`; `docs/DEPLOY.md`, `ASSUMPTIONS.md`, this document and `docs/audit/phase-g/` evidence. No trade execution code, wallet credentials, event semantics or publication script changed.

## Exact Phase G outputs

The following are verbatim combined stdout/stderr captures, with command and exit-code framing. Terminal escapes, warning text and trailing whitespace are intentional evidence. Browser execution used authorized localhost/Chromium permissions outside the restricted sandbox; fixture domains never reach the network.

## Unit tests

[Raw output](audit/phase-g/unit.txt)

```text
$ pnpm test

> pit@0.1.0 test /home/corio/PIT
> vitest run


 RUN  v3.2.7 /home/corio/PIT

 ✓ tests/schema-provenance.test.ts (1 test) 4ms
 ✓ tests/storage-policy.test.ts (5 tests) 33ms
 ✓ tests/audit-builder-path.test.ts (1 test) 11ms
 ✓ tests/events.test.ts (4 tests) 105ms
 ✓ tests/audit-taxlot.test.ts (1 test) 107ms
 ✓ tests/hyperliquid.test.ts (2 tests) 7ms
 ✓ tests/cow.test.ts (6 tests) 12ms
 ✓ tests/audit-fees.test.ts (4 tests) 7ms

 Test Files  8 passed (8)
      Tests  24 passed (24)
   Start at  19:48:48
   Duration  2.10s (transform 596ms, setup 228ms, collect 6.32s, tests 285ms, environment 3ms, prepare 1.67s)


[exit_code=0]
```

## Playwright including exact attack reproduction

[Raw output](audit/phase-g/playwright.txt)

```text
$ pnpm test:e2e

> pit@0.1.0 test:e2e /home/corio/PIT
> playwright test

[2m[WebServer] [22m(node:141319) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[2m[WebServer] [22m(Use `node --trace-warnings ...` to show where the warning was created)
[2m[WebServer] [22m(node:141333) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[2m[WebServer] [22m(Use `node --trace-warnings ...` to show where the warning was created)

Running 8 tests using 3 workers

(node:141386) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:141387) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:141393) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:141386) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:141393) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:141387) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
Attack reproduction: {"stolen":{"event":{"account":"fixture","quantity":"1"},"raw":{"fill":"original"},"sequence":1},"poisoned":{"account":"fixture","quantity":"999"},"deleted":true,"sequence":999,"origin":"http://127.0.0.1:4398"}
  ✓  2 tests/e2e/storage-origin.spec.ts:2:1 › shared-origin attack reads, poisons and deletes events raw and meta (268ms)
Dedicated origin https://pit.example: reload persistence and CSV passed; https://sibling.example: no PIT database.
  ✓  1 tests/e2e/origin-guard.spec.ts:54:1 › approved dedicated HTTPS origin persists and exports; sibling origin cannot read records (434ms)
Shared path: eventDB, appendEvent, listEvents, downloadCSV rejected; existing valid event preserved.
  ✓  4 tests/e2e/origin-guard.spec.ts:93:1 › unsafe path denies open/write/read/download and preserves pre-existing valid records (214ms)
  ✓  5 tests/e2e/origin-guard.spec.ts:133:1 › unapproved production origin never creates PIT storage; approved stable IPNS origin works (216ms)
  ✓  3 tests/e2e/interface.spec.ts:10:1 › production swap, wallet dialog, navigation and CSP (1.3s)
  ✓  6 tests/e2e/interface.spec.ts:47:1 › perps fields render against public info fixture and mobile does not overflow (590ms)
  ✓  7 tests/e2e/interface.spec.ts:74:1 › injected test provider connects without secrets; invalid swaps cannot sign (1.8s)
  ✓  8 tests/e2e/interface.spec.ts:170:1 › IPFS-style subpath hydrates and links stay beneath the CID (651ms)

  8 passed (8.2s)

[exit_code=0]
```

## Typecheck

[Raw output](audit/phase-g/typecheck.txt)

```text
$ pnpm check

> pit@0.1.0 check /home/corio/PIT
> astro check

19:51:24 [content] Syncing content
19:51:24 [content] Synced content
19:51:24 [types] Generated 52ms
19:51:24 [check] Getting diagnostics for Astro files in /home/corio/PIT...
Result (38 files): 
- 0 errors
- 0 warnings
- 0 hints


[exit_code=0]
```

## Production build

[Raw output](audit/phase-g/build.txt)

```text
$ pnpm build

> pit@0.1.0 build /home/corio/PIT
> node scripts/generate-validator.mjs && astro build && node scripts/prepare-static.mjs && node scripts/build-manifest.mjs

19:49:18 [content] Syncing content
19:49:18 [content] Synced content
19:49:18 [types] Generated 48ms
19:49:18 [build] output: "static"
19:49:18 [build] mode: "static"
19:49:18 [build] directory: /home/corio/PIT/dist/
19:49:18 [build] Collecting build info...
19:49:18 [build] ✓ Completed in 79ms.
19:49:18 [build] Building static entrypoints...
19:49:20 [vite] ✓ built in 1.69s
19:49:20 [build] ✓ Completed in 1.75s.

 building client (vite) 
19:49:20 [vite] transforming...
19:49:26 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js (6:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:49:26 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js (6:27): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:49:26 [WARN] [vite] node_modules/.pnpm/ox@0.9.17_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js (6:27): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.9.17_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:49:28 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js (2:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:49:28 [WARN] [vite] node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment

"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle."

in "node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:49:28 [WARN] [vite] node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment

"/** Anchors a pattern source. The interpolation lives here rather than at the call site because
 * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it
 * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */"

in "node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:49:31 [WARN] [vite] node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js (6:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:49:31 [WARN] [vite] node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js (2:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:49:37 [vite] ✓ 5290 modules transformed.
19:49:38 [vite] rendering chunks...
19:49:39 [vite] computing gzip size...
19:49:39 [vite] dist/_astro/TradingApp.CFVMgkXn.js                     0.10 kB │ gzip:   0.10 kB
19:49:39 [vite] dist/_astro/base16.BPd3-eEf.js                         0.33 kB │ gzip:   0.24 kB
19:49:39 [vite] dist/_astro/cursor.CKAhxuxC.js                         0.38 kB │ gzip:   0.28 kB
19:49:39 [vite] dist/_astro/chevron-left.BHhGsIw3.js                   0.52 kB │ gzip:   0.33 kB
19:49:39 [vite] dist/_astro/chevron-top.DEikRqDN.js                    0.52 kB │ gzip:   0.33 kB
19:49:39 [vite] dist/_astro/external-link.CGOPD7PE.js                  0.52 kB │ gzip:   0.33 kB
19:49:39 [vite] dist/_astro/chevron-bottom.CGDC63CI.js                 0.52 kB │ gzip:   0.34 kB
19:49:39 [vite] dist/_astro/chevron-right.Bph9OuZo.js                  0.52 kB │ gzip:   0.33 kB
19:49:39 [vite] dist/_astro/arrow-top.2RgdMGF7.js                      0.53 kB │ gzip:   0.34 kB
19:49:39 [vite] dist/_astro/arrow-bottom.BHD29dFJ.js                   0.53 kB │ gzip:   0.34 kB
19:49:39 [vite] dist/_astro/arrow-left.DMMv_Blr.js                     0.53 kB │ gzip:   0.34 kB
19:49:39 [vite] dist/_astro/arrow-right.f8EKT5Qg.js                    0.53 kB │ gzip:   0.34 kB
19:49:39 [vite] dist/_astro/off.CiMIa7hZ.js                            0.55 kB │ gzip:   0.34 kB
19:49:39 [vite] dist/_astro/search.zmUIo-H3.js                         0.56 kB │ gzip:   0.35 kB
19:49:39 [vite] dist/_astro/close.Dv2S3jYH.js                          0.56 kB │ gzip:   0.34 kB
19:49:39 [vite] dist/_astro/all-wallets.CmixEnI8.js                    0.57 kB │ gzip:   0.32 kB
19:49:39 [vite] dist/_astro/filters.DOhDSBoV.js                        0.57 kB │ gzip:   0.33 kB
19:49:39 [vite] dist/_astro/info-circle.DyFDyau2.js                    0.59 kB │ gzip:   0.35 kB
19:49:39 [vite] dist/_astro/more.CaBC7EpE.js                           0.61 kB │ gzip:   0.36 kB
19:49:39 [vite] dist/_astro/refresh.CFJ61_tp.js                        0.61 kB │ gzip:   0.38 kB
19:49:39 [vite] dist/_astro/warning-circle.CoK6-DKa.js                 0.62 kB │ gzip:   0.37 kB
19:49:39 [vite] dist/_astro/coinPlaceholder.zFAPOnCg.js                0.62 kB │ gzip:   0.41 kB
19:49:39 [vite] dist/_astro/compass.ClfJFH5I.js                        0.64 kB │ gzip:   0.40 kB
19:49:39 [vite] dist/_astro/swapVertical.DPhcUiV2.js                   0.67 kB │ gzip:   0.39 kB
19:49:39 [vite] dist/_astro/swapHorizontal.COEScLZc.js                 0.67 kB │ gzip:   0.39 kB
19:49:39 [vite] dist/_astro/x.BZHDdU0F.js                              0.69 kB │ gzip:   0.45 kB
19:49:39 [vite] dist/_astro/cursor-transparent.CXUqbDam.js             0.70 kB │ gzip:   0.41 kB
19:49:39 [vite] dist/_astro/twitterIcon.DHyklhot.js                    0.70 kB │ gzip:   0.43 kB
19:49:39 [vite] dist/_astro/mobile.Chczk5HW.js                         0.71 kB │ gzip:   0.38 kB
19:49:39 [vite] dist/_astro/checkmark-bold.ClpKODed.js                 0.77 kB │ gzip:   0.49 kB
19:49:39 [vite] dist/_astro/etherscan.Cg2m2tu2.js                      0.82 kB │ gzip:   0.50 kB
19:49:39 [vite] dist/_astro/checkmark.BjoKp9uV.js                      0.82 kB │ gzip:   0.53 kB
19:49:39 [vite] dist/_astro/help-circle.B33gc53s.js                    0.83 kB │ gzip:   0.48 kB
19:49:39 [vite] dist/_astro/wallet.igjUqwSs.js                         0.84 kB │ gzip:   0.47 kB
19:49:39 [vite] dist/_astro/plus.Buq8XmuP.js                           0.88 kB │ gzip:   0.48 kB
19:49:39 [vite] dist/_astro/verify-filled.eHOFPX-x.js                  0.89 kB │ gzip:   0.52 kB
19:49:39 [vite] dist/_astro/add.V5DMvHm5.js                            0.89 kB │ gzip:   0.49 kB
19:49:39 [vite] dist/_astro/google.C81XS--W.js                         0.93 kB │ gzip:   0.51 kB
19:49:39 [vite] dist/_astro/three-dots.CTcnH2DM.js                     0.96 kB │ gzip:   0.47 kB
19:49:39 [vite] dist/_astro/clock.nAytB3Zn.js                          0.96 kB │ gzip:   0.53 kB
19:49:39 [vite] dist/_astro/disconnect.BrseJjhl.js                     1.01 kB │ gzip:   0.56 kB
19:49:39 [vite] dist/_astro/twitch.y4EpHY3e.js                         1.02 kB │ gzip:   0.55 kB
19:49:39 [vite] dist/_astro/bank.BjbkS3sn.js                           1.06 kB │ gzip:   0.58 kB
19:49:39 [vite] dist/_astro/apple.BApSzqIz.js                          1.08 kB │ gzip:   0.58 kB
19:49:39 [vite] dist/_astro/play-store.BvVxYdvJ.js                     1.13 kB │ gzip:   0.57 kB
19:49:39 [vite] dist/_astro/farcaster.D_oCFCzG.js                      1.13 kB │ gzip:   0.59 kB
19:49:39 [vite] dist/_astro/arrow-bottom-circle.lwX_IlvA.js            1.25 kB │ gzip:   0.59 kB
19:49:39 [vite] dist/_astro/github.CnZxjf1G.js                         1.25 kB │ gzip:   0.66 kB
19:49:39 [vite] dist/_astro/swapHorizontalBold.DyCwHYUp.js             1.28 kB │ gzip:   0.68 kB
19:49:39 [vite] dist/_astro/app-store.D6a9qiRr.js                      1.32 kB │ gzip:   0.73 kB
19:49:39 [vite] dist/_astro/mail.CIxUljmp.js                           1.32 kB │ gzip:   0.71 kB
19:49:39 [vite] dist/_astro/v0.1.0-452JMA5G.CxDlBNav.js                1.33 kB │ gzip:   0.64 kB
19:49:39 [vite] dist/_astro/facebook.DtDHpBiz.js                       1.35 kB │ gzip:   0.70 kB
19:49:39 [vite] dist/_astro/wallet-placeholder.DtjfPMpW.js             1.38 kB │ gzip:   0.65 kB
19:49:39 [vite] dist/_astro/desktop.DZHkr3J9.js                        1.39 kB │ gzip:   0.70 kB
19:49:39 [vite] dist/_astro/discord.BVLfD4u7.js                        1.42 kB │ gzip:   0.71 kB
19:49:39 [vite] dist/_astro/swapHorizontalMedium.Cut2l98X.js           1.42 kB │ gzip:   0.74 kB
19:49:39 [vite] dist/_astro/recycle-horizontal.CMmlMBF4.js             1.46 kB │ gzip:   0.76 kB
19:49:39 [vite] dist/_astro/base32.l_RPZY32.js                         1.50 kB │ gzip:   0.51 kB
19:49:39 [vite] dist/_astro/extension.D3r01dUl.js                      1.55 kB │ gzip:   0.75 kB
19:49:39 [vite] dist/_astro/telegram.BXv6R2De.js                       1.57 kB │ gzip:   0.90 kB
19:49:39 [vite] dist/_astro/swapHorizontalRoundedBold.BkO2SDS4.js      1.57 kB │ gzip:   0.83 kB
19:49:39 [vite] dist/_astro/verify.C-weFrLN.js                         1.59 kB │ gzip:   0.77 kB
19:49:39 [vite] dist/_astro/qr-code.BxFwR3PX.js                        1.63 kB │ gzip:   0.58 kB
19:49:39 [vite] dist/_astro/browser.vXNbW8wH.js                        1.70 kB │ gzip:   0.84 kB
19:49:39 [vite] dist/_astro/network-placeholder.DA_6YKeF.js            1.77 kB │ gzip:   0.79 kB
19:49:39 [vite] dist/_astro/client.BHjpRL8Y.js                         1.84 kB │ gzip:   0.91 kB
19:49:39 [vite] dist/_astro/id.DMUNnE_J.js                             1.87 kB │ gzip:   0.87 kB
19:49:39 [vite] dist/_astro/nftPlaceholder.BPyMIGDD.js                 1.87 kB │ gzip:   0.93 kB
19:49:39 [vite] dist/_astro/v0.2.0-RZSAEYWJ.BO42Ib25.js                1.90 kB │ gzip:   0.80 kB
19:49:39 [vite] dist/_astro/v0.4.0-XWYIU6OQ.dtmZJ7oB.js                2.00 kB │ gzip:   0.86 kB
19:49:39 [vite] dist/_astro/v0.3.0-QEEYHNXA.C8R-2dRU.js                2.09 kB │ gzip:   0.87 kB
19:49:39 [vite] dist/_astro/info.Bz5DfKXD.js                           2.38 kB │ gzip:   1.20 kB
19:49:39 [vite] dist/_astro/v0.5.0-6JWER4SU.B0qvJgU-.js                2.44 kB │ gzip:   0.93 kB
19:49:39 [vite] dist/_astro/exclamation-triangle.Bq2MH38W.js           2.54 kB │ gzip:   1.20 kB
19:49:39 [vite] dist/_astro/send.6wSmW4TL.js                           2.54 kB │ gzip:   1.34 kB
19:49:39 [vite] dist/_astro/card.DF9CmUFv.js                           2.71 kB │ gzip:   1.23 kB
19:49:39 [vite] dist/_astro/chrome-store.S9khghaq.js                   2.71 kB │ gzip:   1.07 kB
19:49:39 [vite] dist/_astro/reown-logo.yU6DWg_r.js                     2.72 kB │ gzip:   1.13 kB
19:49:39 [vite] dist/_astro/lightbulb.Cb3tlOw7.js                      2.83 kB │ gzip:   1.28 kB
19:49:39 [vite] dist/_astro/ccip.D4c2zzCs.js                           2.92 kB │ gzip:   1.35 kB
19:49:39 [vite] dist/_astro/v0.8.0-MA4RCSXJ.BzWVU6mD.js                3.40 kB │ gzip:   1.22 kB
19:49:39 [vite] dist/_astro/v0.6.0-DCUHOIX6.D0nK_KNa.js                3.44 kB │ gzip:   1.21 kB
19:49:39 [vite] dist/_astro/v0.7.0-WUIYE67P.DHAtTBPF.js                3.46 kB │ gzip:   1.22 kB
19:49:39 [vite] dist/_astro/image.BTiB882M.js                          3.61 kB │ gzip:   1.57 kB
19:49:39 [vite] dist/_astro/copy.DePFljS8.js                           3.94 kB │ gzip:   1.54 kB
19:49:39 [vite] dist/_astro/walletconnect.CNMBFl1d.js                  4.18 kB │ gzip:   1.72 kB
19:49:39 [vite] dist/_astro/base.DMz8QJ2S.js                           4.32 kB │ gzip:   1.80 kB
19:49:39 [vite] dist/_astro/v0.9.0-MODYXNNJ.CW56i5Hn.js                4.79 kB │ gzip:   1.60 kB
19:49:39 [vite] dist/_astro/v0.10.0-OHB5VFCY.BxLkbVOM.js               5.20 kB │ gzip:   1.71 kB
19:49:39 [vite] dist/_astro/v0.11.0-YC4BNGSG.ZJUKLJPn.js               5.72 kB │ gzip:   1.77 kB
19:49:39 [vite] dist/_astro/cid.DuD6wXc4.js                            5.83 kB │ gzip:   2.45 kB
19:49:39 [vite] dist/_astro/v1.0.0-LO3INJ7G.Cn81q8wR.js                6.36 kB │ gzip:   1.93 kB
19:49:39 [vite] dist/_astro/v1.1.0-VDZLWY4U.BWHazOd8.js                6.82 kB │ gzip:   2.08 kB
19:49:39 [vite] dist/_astro/v1.2.0-J7HBJ6X3.DAO9TS_K.js                6.98 kB │ gzip:   2.15 kB
19:49:39 [vite] dist/_astro/v1.3.0-YE5Z6DA7.WxjICRnn.js                7.32 kB │ gzip:   2.29 kB
19:49:39 [vite] dist/_astro/v1.4.0-XW4S4BWH.BE1DD-uT.js                8.88 kB │ gzip:   2.53 kB
19:49:39 [vite] dist/_astro/v1.5.0-RPBY3HCV.BChBsCfx.js                9.72 kB │ gzip:   2.83 kB
19:49:39 [vite] dist/_astro/v1.6.0-WTOLS5Y6.BrJvDjHz.js               10.73 kB │ gzip:   3.03 kB
19:49:39 [vite] dist/_astro/v1.7.0-7V2ZPHKV.1d-zW9eS.js               10.98 kB │ gzip:   3.07 kB
19:49:39 [vite] dist/_astro/v1.8.0-UKWSFP36.wayCITfA.js               10.98 kB │ gzip:   3.06 kB
19:49:39 [vite] dist/_astro/v1.9.0-SQYL3FIK.ehOfOIud.js               11.19 kB │ gzip:   3.12 kB
19:49:39 [vite] dist/_astro/v1.10.0-HV5QAMRI.DtfFbtUQ.js              11.67 kB │ gzip:   3.32 kB
19:49:39 [vite] dist/_astro/v1.11.0-7OORRXZT.CGwSLHNc.js              12.77 kB │ gzip:   3.58 kB
19:49:39 [vite] dist/_astro/v1.13.0-F46Z6ASK.CtOs43cv.js              13.89 kB │ gzip:   3.96 kB
19:49:39 [vite] dist/_astro/v1.12.0-JRP6T6PK.BrocjUYM.js              13.89 kB │ gzip:   3.96 kB
19:49:39 [vite] dist/_astro/v1.15.0-4YFUPOOT.Bi1u4Jfv.js              13.90 kB │ gzip:   4.00 kB
19:49:39 [vite] dist/_astro/v1.14.0-4GFOYRNY.B8nGQ1Rg.js              13.92 kB │ gzip:   4.01 kB
19:49:39 [vite] dist/_astro/secp256k1.B8lITaKl.js                     31.50 kB │ gzip:  12.59 kB
19:49:39 [vite] dist/_astro/w3m-modal.C9AogNrX.js                     39.50 kB │ gzip:   9.25 kB
19:49:39 [vite] dist/_astro/index.BCvywQku.js                         39.67 kB │ gzip:   9.38 kB
19:49:39 [vite] dist/_astro/ajv.B0PCc7TN.js                          124.94 kB │ gzip:  39.27 kB
19:49:39 [vite] dist/_astro/basic.Cu6Pe-Mm.js                        141.77 kB │ gzip:  32.77 kB
19:49:39 [vite] dist/_astro/index.BKL_-_Dm.js                        142.40 kB │ gzip:  45.69 kB
19:49:39 [vite] dist/_astro/index.es.DChZJE-t.js                     398.87 kB │ gzip: 115.66 kB
19:49:39 [vite] dist/_astro/core.BnXE5Vw4.js                         471.49 kB │ gzip: 129.00 kB
19:49:39 [vite] dist/_astro/TradingApp.BI-WGkWe.js                 1,432.19 kB │ gzip: 437.59 kB
19:49:39 [WARN] [vite] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
19:49:39 [vite] ✓ built in 18.78s

 generating static routes 
19:49:39 ▶ src/pages/fees.astro
19:49:39   └─ /fees/index.html (+9ms) 
19:49:39 ▶ src/pages/index.astro
19:49:39   └─ /index.html (+5ms) 
19:49:39 ▶ src/pages/legal.astro
19:49:39   └─ /legal/index.html (+2ms) 
19:49:39 ✓ Completed in 569ms.

19:49:39 [build] 3 page(s) built in 21.26s
19:49:39 [build] Complete!
Build SHA-256: 9e3fdda7f98822cfad2146ec478019c2429c98a3b6d80591e40dcb70f2715c88

[exit_code=0]
```

## CSP artifact, headers and invariant checks

[Raw output](audit/phase-g/headers-and-invariants.txt)

```text
$ python3 scripts/audit/origin-evidence.py
$ git rev-parse HEAD
079abb7dabe48c5c0e42ec557c22f923f8ed644c
Unchanged from Phase F: src/lib/config.ts
Unchanged from Phase F: src/lib/cow.ts
Unchanged from Phase F: src/lib/hyperliquid.ts
Unchanged from Phase F: schemas/events.v1.json
Taxlot current upstream byte equality: true; SHA256 d8eb339ed7acd7da3b68ef09fe5c1b01c4cc3258cb401a4f2ba8805e7a3b07d7
index.html CSP: connect-src 'self' https://*.cow.fi https://api.hyperliquid-testnet.xyz https://api.hyperliquid.xyz https://ethereum-sepolia-rpc.publicnode.com https://ethereum-rpc.publicnode.com https://base-rpc.publicnode.com https://arbitrum-one-rpc.publicnode.com https://11155111.rpc.thirdweb.com https://ethereum.reth.rs https://mainnet.base.org https://arb1.arbitrum.io;default-src 'none';font-src 'self' data:;img-src 'self' data:;object-src 'none';base-uri 'self';form-action 'self'; script-src 'self' 'sha256-BF0290pkb3jxQsE7z00xR8Imp8X34FLC88L0lkMnrGw=' 'sha256-QzWFZi+FLIx23tnm9SBU4aEgx4x8DsuASP07mfqol/c=' 'sha256-0chmwFk0zaA528yFfGV7J9ppIpdfTPPULncDF3WG7Zs=' 'sha256-eIXWvAmxkr251LJZkjniEK5LcPF3NkapbJepohwYRIc=' 'sha256-Q2BPg90ZMplYY+FSdApNErhpWafg2hcRRbndmvxuL/Q=' 'sha256-U7a72oKuFFz8D7GUHLA1NZ0ciymHmDOc9T9aVDg2rWU=' 'sha256-p9VbHs/ClkQc+x63XdUjvCAgeWxA4ZGvpebJtMn9jbs='; style-src 'self' 'unsafe-inline';
fees/index.html CSP: connect-src 'self' https://*.cow.fi https://api.hyperliquid-testnet.xyz https://api.hyperliquid.xyz https://ethereum-sepolia-rpc.publicnode.com https://ethereum-rpc.publicnode.com https://base-rpc.publicnode.com https://arbitrum-one-rpc.publicnode.com https://11155111.rpc.thirdweb.com https://ethereum.reth.rs https://mainnet.base.org https://arb1.arbitrum.io;default-src 'none';font-src 'self' data:;img-src 'self' data:;object-src 'none';base-uri 'self';form-action 'self'; script-src 'self' 'sha256-BF0290pkb3jxQsE7z00xR8Imp8X34FLC88L0lkMnrGw=' 'sha256-QzWFZi+FLIx23tnm9SBU4aEgx4x8DsuASP07mfqol/c=' 'sha256-0chmwFk0zaA528yFfGV7J9ppIpdfTPPULncDF3WG7Zs=' 'sha256-eIXWvAmxkr251LJZkjniEK5LcPF3NkapbJepohwYRIc=' 'sha256-Q2BPg90ZMplYY+FSdApNErhpWafg2hcRRbndmvxuL/Q=' 'sha256-U7a72oKuFFz8D7GUHLA1NZ0ciymHmDOc9T9aVDg2rWU=' 'sha256-p9VbHs/ClkQc+x63XdUjvCAgeWxA4ZGvpebJtMn9jbs='; style-src 'self' 'unsafe-inline';
legal/index.html CSP: connect-src 'self' https://*.cow.fi https://api.hyperliquid-testnet.xyz https://api.hyperliquid.xyz https://ethereum-sepolia-rpc.publicnode.com https://ethereum-rpc.publicnode.com https://base-rpc.publicnode.com https://arbitrum-one-rpc.publicnode.com https://11155111.rpc.thirdweb.com https://ethereum.reth.rs https://mainnet.base.org https://arb1.arbitrum.io;default-src 'none';font-src 'self' data:;img-src 'self' data:;object-src 'none';base-uri 'self';form-action 'self'; script-src 'self' 'sha256-BF0290pkb3jxQsE7z00xR8Imp8X34FLC88L0lkMnrGw=' 'sha256-QzWFZi+FLIx23tnm9SBU4aEgx4x8DsuASP07mfqol/c=' 'sha256-0chmwFk0zaA528yFfGV7J9ppIpdfTPPULncDF3WG7Zs=' 'sha256-eIXWvAmxkr251LJZkjniEK5LcPF3NkapbJepohwYRIc=' 'sha256-Q2BPg90ZMplYY+FSdApNErhpWafg2hcRRbndmvxuL/Q=' 'sha256-U7a72oKuFFz8D7GUHLA1NZ0ciymHmDOc9T9aVDg2rWU=' 'sha256-p9VbHs/ClkQc+x63XdUjvCAgeWxA4ZGvpebJtMn9jbs='; style-src 'self' 'unsafe-inline';
Cloudflare artifact _headers (configuration, not a live HTTP observation):
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: DENY

Storage deployment policy:
/** Reviewed deployment origins only: exact scheme/host/port, no paths or wildcards.
 * Keep empty until the operator verifies the entire origin is PIT-controlled.
 * Dedicated Pages/custom domains, DNSLink and stable IPNS subdomains work here.
 * This is public deployment policy, never a credential or user preference.
 */
export const accountingOrigins: readonly string[] = Object.freeze([]);

Database version/name: unchanged pit-taxlot-v1, version 1; no migration or deletion
Build hash: 9e3fdda7f98822cfad2146ec478019c2429c98a3b6d80591e40dcb70f2715c88

[exit_code=0]
```

## Secret scan and historical public-hash review

[Raw output](audit/phase-g/secrets-review.txt)

```text
$ python3 scripts/audit/origin-secrets-review.py
Underlying Phase F scanner exit: 1
Available Git commits/blobs: 6 113
Current env files: ['.env.example']
Historical Phase F manifest byte-identical to 079abb7: True
Historical public artifact hash matches reviewed: 174
Unresolved credential candidates: 0
Limits: original pattern-scan exclusions and limitations still apply; no absence guarantee.

[exit_code=0]
```

---

The record below is historical Phase F evidence; its results and hash refer to the Phase F artifact, not the changed Phase G artifact.

# Phase F verification — 2026-09-29

Audit target: `c65a14e76a09f4507e7669aed605996e71650d30`. A–E are reachable; the exact repository check appears below. The initial interactive `git status --short` was empty. The captured repository check ran after creating audit scripts/logs and accurately lists those untracked additions.

**Result: 19 unit tests and 5 Playwright tests pass; typecheck has 0 errors/warnings/hints; two production builds are byte-identical. One conditional medium shared-origin IPFS storage finding remains OPEN. No live testnet execution or launch acceptance is claimed.**

- [Security result, fee/network proof, CoW/Hyperliquid SDK evidence, Taxlot persistence, secret-history scope and blockers](audit/phase-f/SECURITY.md).
- [Every assumption disposition](../ASSUMPTIONS.md).
- [Numbered application/SDK source and FEES_ENABLED uses](audit/phase-f/source.txt).
- [Initial redacted secret candidates](audit/phase-f/secrets-initial.txt), [reviewed scan](audit/phase-f/secrets-reviewed.txt), [final scan](audit/phase-f/secrets-final.txt), [public-pattern classifications](../scripts/audit/public-patterns.json).
- [Full first build manifest](audit/phase-f/build-1.manifest.json). Build comparison recomputes all 122 artifact digests and checks the regenerated validator against Phase E.
- [First Playwright startup failure](audit/phase-f/playwright-sandbox-failure.txt): sandbox web server exited 1. Authorized retry outside the sandbox passed. All browser requests outside localhost are blocked unless explicitly fulfilled by a fixture. No real wallet or API execution occurs.
- [Intermediate typecheck failure](audit/phase-f/typecheck-initial-failure.txt): a newly added SDK-order-helper test omitted required token-decimal type fields. The test fixture was corrected and both unit tests and typecheck rerun successfully.

The only changes are audit documentation/scripts/tests. Application configuration, schema semantics, fee recipients/rates, hosting/deployment and legal gates remain unchanged. `FEES_ENABLED=false`, `MAINNET_ENABLED=false`; current integrator revenue is zero. No `.env.local` was created or requested.

No on-chain transaction/order ID, live fill or live acceptance screenshot exists for this phase. Browser screenshots in `test-results/` are disposable offline UI evidence; older tracked `docs/*.png` were not overwritten. They do not establish live execution.

NOT VERIFIED — Quote the exact output of `node scripts/live-e2e.mjs` after a separately handled funded testnet session. Actual CSV reconciliation and Taxlot importer acceptance remain open; the current tests prove schema/write/export behavior only. The MiCA/PSAN legal opinion remains a prerequisite for any mainnet activation.

## Exact command outputs

The following blocks copy captured combined stdout/stderr without summarization. Each log includes its exact invoked command and an added exit-code footer. Timings, terminal escape sequences, trailing spaces and environment warnings are retained. Consequently generic whitespace checks report intentional whitespace in these quoted logs. No elapsed duration is represented as deterministic.

## Repository, phase reachability and schema provenance

[Raw output](audit/phase-f/repository.txt)

```text
$ python3 scripts/audit/repository.py
$ git status --short
?? docs/audit/
?? scripts/audit/
$ git log --oneline -8
c65a14e feat(e): add trust pages reproducible deployment and browser verification
a3d367d feat(d): validate and persist Taxlot fill events with CSV exports
3bf7b19 feat(c): add Hyperliquid testnet perps and capped builder fee flow
b7fb676 feat(b): integrate CoW quotes approvals signing and order history
4a3084f feat(a): scaffold static Astro wallet interface and testnet configuration
$ git rev-parse HEAD
c65a14e76a09f4507e7669aed605996e71650d30
$ git merge-base --is-ancestor 4a3084f HEAD
4a3084f: REACHABLE
$ git merge-base --is-ancestor b7fb676 HEAD
b7fb676: REACHABLE
$ git merge-base --is-ancestor 3bf7b19 HEAD
3bf7b19: REACHABLE
$ git merge-base --is-ancestor a3d367d HEAD
a3d367d: REACHABLE
$ git merge-base --is-ancestor c65a14e HEAD
c65a14e: REACHABLE
$ node --version
v22.22.3
$ pnpm --version
10.17.1
schemas/events.v1.json: d8eb339ed7acd7da3b68ef09fe5c1b01c4cc3258cb401a4f2ba8805e7a3b07d7
/home/corio/TAXLOT/schemas/events.v1.json: d8eb339ed7acd7da3b68ef09fe5c1b01c4cc3258cb401a4f2ba8805e7a3b07d7
Taxlot schemas byte-identical: true
$ git -C /home/corio/TAXLOT rev-parse HEAD
50b18a723917df1848ab5cd9808e0338046a86b7

[exit_code=0]
```

## Unit tests

[Raw output](audit/phase-f/unit.txt)

```text
$ pnpm test

> pit@0.1.0 test /home/corio/PIT
> vitest run


 RUN  v3.2.7 /home/corio/PIT

 ✓ tests/schema-provenance.test.ts (1 test) 11ms
 ✓ tests/audit-builder-path.test.ts (1 test) 12ms
 ✓ tests/events.test.ts (4 tests) 108ms
 ✓ tests/audit-taxlot.test.ts (1 test) 107ms
 ✓ tests/hyperliquid.test.ts (2 tests) 6ms
 ✓ tests/cow.test.ts (6 tests) 19ms
 ✓ tests/audit-fees.test.ts (4 tests) 8ms

 Test Files  7 passed (7)
      Tests  19 passed (19)
   Start at  19:19:44
   Duration  7.72s (transform 1.86s, setup 0ms, collect 29.35s, tests 272ms, environment 5ms, prepare 3.81s)


[exit_code=0]
```

## Playwright tests (authorized localhost/browser retry)

[Raw output](audit/phase-f/playwright.txt)

```text
$ pnpm test:e2e

> pit@0.1.0 test:e2e /home/corio/PIT
> playwright test

[2m[WebServer] [22m(node:99700) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[2m[WebServer] [22m(Use `node --trace-warnings ...` to show where the warning was created)
[2m[WebServer] [22m(node:99714) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[2m[WebServer] [22m(Use `node --trace-warnings ...` to show where the warning was created)

Running 5 tests using 2 workers

(node:99755) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:99756) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:99755) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:99756) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓  2 tests/e2e/storage-origin.spec.ts:2:1 › audit: shared-origin IPFS paths cannot isolate PIT IndexedDB (332ms)
  ✓  1 tests/e2e/interface.spec.ts:10:1 › production swap, wallet dialog, navigation and CSP (1.4s)
  ✓  3 tests/e2e/interface.spec.ts:47:1 › perps fields render against public info fixture and mobile does not overflow (747ms)
  ✓  4 tests/e2e/interface.spec.ts:74:1 › injected test provider connects without secrets; invalid swaps cannot sign (2.0s)
  ✓  5 tests/e2e/interface.spec.ts:170:1 › IPFS-style subpath hydrates and links stay beneath the CID (786ms)

  5 passed (11.2s)

[exit_code=0]
```

## Typecheck

[Raw output](audit/phase-f/typecheck.txt)

```text
$ pnpm check

> pit@0.1.0 check /home/corio/PIT
> astro check

19:19:49 [content] Syncing content
19:19:49 [content] Synced content
19:19:49 [types] Generated 1.58s
19:19:49 [check] Getting diagnostics for Astro files in /home/corio/PIT...
Result (33 files): 
- 0 errors
- 0 warnings
- 0 hints


[exit_code=0]
```

## Production build 1

[Raw output](audit/phase-f/build-1.txt)

```text
$ pnpm build

> pit@0.1.0 build /home/corio/PIT
> node scripts/generate-validator.mjs && astro build && node scripts/prepare-static.mjs && node scripts/build-manifest.mjs

19:16:44 [content] Syncing content
19:16:44 [content] Synced content
19:16:44 [types] Generated 120ms
19:16:44 [build] output: "static"
19:16:44 [build] mode: "static"
19:16:44 [build] directory: /home/corio/PIT/dist/
19:16:44 [build] Collecting build info...
19:16:44 [build] ✓ Completed in 165ms.
19:16:44 [build] Building static entrypoints...
19:16:47 [vite] ✓ built in 2.95s
19:16:47 [build] ✓ Completed in 3.04s.

 building client (vite) 
19:16:47 [vite] transforming...
19:17:00 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js (6:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:17:00 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js (6:27): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:17:01 [WARN] [vite] node_modules/.pnpm/ox@0.9.17_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js (6:27): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.9.17_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:17:03 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js (2:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:17:03 [WARN] [vite] node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment

"/** Anchors a pattern source. The interpolation lives here rather than at the call site because
 * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it
 * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */"

in "node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:17:03 [WARN] [vite] node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment

"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle."

in "node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:17:07 [WARN] [vite] node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js (6:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:17:07 [WARN] [vite] node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js (2:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:17:16 [vite] ✓ 5288 modules transformed.
19:17:17 [vite] rendering chunks...
19:17:18 [vite] computing gzip size...
19:17:18 [vite] dist/_astro/TradingApp.DXz-kL6w.js                     0.10 kB │ gzip:   0.10 kB
19:17:18 [vite] dist/_astro/base16.BPd3-eEf.js                         0.33 kB │ gzip:   0.24 kB
19:17:18 [vite] dist/_astro/cursor.DvaSo78t.js                         0.38 kB │ gzip:   0.27 kB
19:17:18 [vite] dist/_astro/chevron-left.CNN3WfLy.js                   0.52 kB │ gzip:   0.33 kB
19:17:18 [vite] dist/_astro/chevron-top.Bj83L42v.js                    0.52 kB │ gzip:   0.33 kB
19:17:18 [vite] dist/_astro/external-link.BnmZjZ3W.js                  0.52 kB │ gzip:   0.33 kB
19:17:18 [vite] dist/_astro/chevron-bottom.BqzBUs8Q.js                 0.52 kB │ gzip:   0.33 kB
19:17:18 [vite] dist/_astro/chevron-right.vUgsd32o.js                  0.52 kB │ gzip:   0.32 kB
19:17:18 [vite] dist/_astro/arrow-top.DbvsuPi4.js                      0.53 kB │ gzip:   0.33 kB
19:17:18 [vite] dist/_astro/arrow-bottom.DuAz4pJ5.js                   0.53 kB │ gzip:   0.34 kB
19:17:18 [vite] dist/_astro/arrow-left.DN_tGMV_.js                     0.53 kB │ gzip:   0.33 kB
19:17:18 [vite] dist/_astro/arrow-right.CREDteVs.js                    0.53 kB │ gzip:   0.34 kB
19:17:18 [vite] dist/_astro/off.CH9HHPMH.js                            0.55 kB │ gzip:   0.34 kB
19:17:18 [vite] dist/_astro/search.oBqNbi6U.js                         0.56 kB │ gzip:   0.35 kB
19:17:18 [vite] dist/_astro/close.1qyM6l2S.js                          0.56 kB │ gzip:   0.34 kB
19:17:18 [vite] dist/_astro/all-wallets.BPqzkw3n.js                    0.57 kB │ gzip:   0.31 kB
19:17:18 [vite] dist/_astro/filters.BybL5qHt.js                        0.57 kB │ gzip:   0.33 kB
19:17:18 [vite] dist/_astro/info-circle.BHSxYsT_.js                    0.59 kB │ gzip:   0.35 kB
19:17:18 [vite] dist/_astro/more.YtCGqtwx.js                           0.61 kB │ gzip:   0.36 kB
19:17:18 [vite] dist/_astro/refresh.Dqo8WiLL.js                        0.61 kB │ gzip:   0.38 kB
19:17:18 [vite] dist/_astro/warning-circle.DnR8fOUZ.js                 0.62 kB │ gzip:   0.36 kB
19:17:18 [vite] dist/_astro/coinPlaceholder.CXomwaJi.js                0.62 kB │ gzip:   0.40 kB
19:17:18 [vite] dist/_astro/compass.ZmugxCXr.js                        0.64 kB │ gzip:   0.39 kB
19:17:18 [vite] dist/_astro/swapVertical.C6kAEU0k.js                   0.67 kB │ gzip:   0.39 kB
19:17:18 [vite] dist/_astro/swapHorizontal.3vt4v8qz.js                 0.67 kB │ gzip:   0.38 kB
19:17:18 [vite] dist/_astro/x.CnI2kBxF.js                              0.69 kB │ gzip:   0.44 kB
19:17:18 [vite] dist/_astro/cursor-transparent.DnGhW6CX.js             0.70 kB │ gzip:   0.41 kB
19:17:18 [vite] dist/_astro/twitterIcon.CYFvnnPW.js                    0.70 kB │ gzip:   0.43 kB
19:17:18 [vite] dist/_astro/mobile.DRK3g499.js                         0.71 kB │ gzip:   0.37 kB
19:17:18 [vite] dist/_astro/checkmark-bold.0mJo8eUu.js                 0.77 kB │ gzip:   0.49 kB
19:17:18 [vite] dist/_astro/etherscan.BMG70-gU.js                      0.82 kB │ gzip:   0.50 kB
19:17:18 [vite] dist/_astro/checkmark.DvWy6Gb-.js                      0.82 kB │ gzip:   0.52 kB
19:17:18 [vite] dist/_astro/help-circle.BPZtanm0.js                    0.83 kB │ gzip:   0.48 kB
19:17:18 [vite] dist/_astro/wallet.CvfV37ZD.js                         0.84 kB │ gzip:   0.47 kB
19:17:18 [vite] dist/_astro/plus.DQ0FN6Pn.js                           0.88 kB │ gzip:   0.48 kB
19:17:18 [vite] dist/_astro/verify-filled.Cgbj5jJR.js                  0.89 kB │ gzip:   0.52 kB
19:17:18 [vite] dist/_astro/add.BhRwi3bG.js                            0.89 kB │ gzip:   0.48 kB
19:17:18 [vite] dist/_astro/google.BcpSYJJK.js                         0.93 kB │ gzip:   0.51 kB
19:17:18 [vite] dist/_astro/three-dots.CUGaXIw0.js                     0.96 kB │ gzip:   0.46 kB
19:17:18 [vite] dist/_astro/clock.BluPkpBb.js                          0.96 kB │ gzip:   0.53 kB
19:17:18 [vite] dist/_astro/disconnect.SWFrA3Ix.js                     1.01 kB │ gzip:   0.56 kB
19:17:18 [vite] dist/_astro/twitch.CVQ7L-go.js                         1.02 kB │ gzip:   0.55 kB
19:17:18 [vite] dist/_astro/bank.CFjMbSw9.js                           1.06 kB │ gzip:   0.58 kB
19:17:18 [vite] dist/_astro/apple.4LHs8Vuj.js                          1.08 kB │ gzip:   0.58 kB
19:17:18 [vite] dist/_astro/play-store.C0tjhZ0o.js                     1.13 kB │ gzip:   0.57 kB
19:17:18 [vite] dist/_astro/farcaster.Dopfk7Ab.js                      1.13 kB │ gzip:   0.58 kB
19:17:18 [vite] dist/_astro/arrow-bottom-circle.rrHaPx13.js            1.25 kB │ gzip:   0.58 kB
19:17:18 [vite] dist/_astro/github.DjpSSrs-.js                         1.25 kB │ gzip:   0.65 kB
19:17:18 [vite] dist/_astro/swapHorizontalBold.Cu4QIm0k.js             1.28 kB │ gzip:   0.67 kB
19:17:18 [vite] dist/_astro/app-store.D7SsFDjA.js                      1.32 kB │ gzip:   0.73 kB
19:17:18 [vite] dist/_astro/mail.CcRNb-9W.js                           1.32 kB │ gzip:   0.71 kB
19:17:18 [vite] dist/_astro/v0.1.0-452JMA5G.CxDlBNav.js                1.33 kB │ gzip:   0.64 kB
19:17:18 [vite] dist/_astro/facebook._qxjZcvk.js                       1.35 kB │ gzip:   0.70 kB
19:17:18 [vite] dist/_astro/wallet-placeholder.N9goN9mi.js             1.38 kB │ gzip:   0.65 kB
19:17:18 [vite] dist/_astro/desktop.Dp7aPlx9.js                        1.39 kB │ gzip:   0.70 kB
19:17:18 [vite] dist/_astro/discord.BDqFrB6g.js                        1.42 kB │ gzip:   0.71 kB
19:17:18 [vite] dist/_astro/swapHorizontalMedium.CorKU68U.js           1.42 kB │ gzip:   0.73 kB
19:17:18 [vite] dist/_astro/recycle-horizontal.B-MXNvMV.js             1.46 kB │ gzip:   0.76 kB
19:17:18 [vite] dist/_astro/base32.l_RPZY32.js                         1.50 kB │ gzip:   0.51 kB
19:17:18 [vite] dist/_astro/extension.gryhwZGV.js                      1.55 kB │ gzip:   0.75 kB
19:17:18 [vite] dist/_astro/telegram.BDif31Pa.js                       1.57 kB │ gzip:   0.89 kB
19:17:18 [vite] dist/_astro/swapHorizontalRoundedBold.Dq72O40t.js      1.57 kB │ gzip:   0.82 kB
19:17:18 [vite] dist/_astro/verify.B3yydH6O.js                         1.59 kB │ gzip:   0.77 kB
19:17:18 [vite] dist/_astro/qr-code.CEYeIYM8.js                        1.63 kB │ gzip:   0.58 kB
19:17:18 [vite] dist/_astro/browser.DDZ3iO8r.js                        1.70 kB │ gzip:   0.84 kB
19:17:18 [vite] dist/_astro/network-placeholder.DHL2dVEf.js            1.77 kB │ gzip:   0.79 kB
19:17:18 [vite] dist/_astro/client.BHjpRL8Y.js                         1.84 kB │ gzip:   0.91 kB
19:17:18 [vite] dist/_astro/id.BoEaphBo.js                             1.87 kB │ gzip:   0.86 kB
19:17:18 [vite] dist/_astro/nftPlaceholder.cCQURm9Y.js                 1.87 kB │ gzip:   0.92 kB
19:17:18 [vite] dist/_astro/v0.2.0-RZSAEYWJ.BO42Ib25.js                1.90 kB │ gzip:   0.80 kB
19:17:18 [vite] dist/_astro/v0.4.0-XWYIU6OQ.dtmZJ7oB.js                2.00 kB │ gzip:   0.86 kB
19:17:18 [vite] dist/_astro/v0.3.0-QEEYHNXA.C8R-2dRU.js                2.09 kB │ gzip:   0.87 kB
19:17:18 [vite] dist/_astro/info.Wi4FJAk5.js                           2.38 kB │ gzip:   1.20 kB
19:17:18 [vite] dist/_astro/v0.5.0-6JWER4SU.B0qvJgU-.js                2.44 kB │ gzip:   0.93 kB
19:17:18 [vite] dist/_astro/exclamation-triangle.iw9381ca.js           2.54 kB │ gzip:   1.19 kB
19:17:18 [vite] dist/_astro/send.C3z8zejT.js                           2.54 kB │ gzip:   1.34 kB
19:17:18 [vite] dist/_astro/card.BXz73HYp.js                           2.71 kB │ gzip:   1.23 kB
19:17:18 [vite] dist/_astro/chrome-store.C8NCxK73.js                   2.71 kB │ gzip:   1.07 kB
19:17:18 [vite] dist/_astro/reown-logo.BpkrQUAh.js                     2.72 kB │ gzip:   1.12 kB
19:17:18 [vite] dist/_astro/lightbulb.CJwaBNxD.js                      2.83 kB │ gzip:   1.28 kB
19:17:18 [vite] dist/_astro/ccip.BlSNJZZb.js                           2.92 kB │ gzip:   1.35 kB
19:17:18 [vite] dist/_astro/v0.8.0-MA4RCSXJ.BzWVU6mD.js                3.40 kB │ gzip:   1.22 kB
19:17:18 [vite] dist/_astro/v0.6.0-DCUHOIX6.D0nK_KNa.js                3.44 kB │ gzip:   1.21 kB
19:17:18 [vite] dist/_astro/v0.7.0-WUIYE67P.DHAtTBPF.js                3.46 kB │ gzip:   1.22 kB
19:17:18 [vite] dist/_astro/image.gxCQrLHi.js                          3.61 kB │ gzip:   1.57 kB
19:17:18 [vite] dist/_astro/copy.CThbYsIF.js                           3.94 kB │ gzip:   1.54 kB
19:17:18 [vite] dist/_astro/walletconnect.DIFgSkn5.js                  4.18 kB │ gzip:   1.72 kB
19:17:18 [vite] dist/_astro/base.DMz8QJ2S.js                           4.32 kB │ gzip:   1.80 kB
19:17:18 [vite] dist/_astro/v0.9.0-MODYXNNJ.CW56i5Hn.js                4.79 kB │ gzip:   1.60 kB
19:17:18 [vite] dist/_astro/v0.10.0-OHB5VFCY.BxLkbVOM.js               5.20 kB │ gzip:   1.71 kB
19:17:18 [vite] dist/_astro/v0.11.0-YC4BNGSG.ZJUKLJPn.js               5.72 kB │ gzip:   1.77 kB
19:17:18 [vite] dist/_astro/cid.DuD6wXc4.js                            5.83 kB │ gzip:   2.45 kB
19:17:18 [vite] dist/_astro/v1.0.0-LO3INJ7G.Cn81q8wR.js                6.36 kB │ gzip:   1.93 kB
19:17:18 [vite] dist/_astro/v1.1.0-VDZLWY4U.BWHazOd8.js                6.82 kB │ gzip:   2.08 kB
19:17:18 [vite] dist/_astro/v1.2.0-J7HBJ6X3.DAO9TS_K.js                6.98 kB │ gzip:   2.15 kB
19:17:18 [vite] dist/_astro/v1.3.0-YE5Z6DA7.WxjICRnn.js                7.32 kB │ gzip:   2.29 kB
19:17:18 [vite] dist/_astro/v1.4.0-XW4S4BWH.BE1DD-uT.js                8.88 kB │ gzip:   2.53 kB
19:17:18 [vite] dist/_astro/v1.5.0-RPBY3HCV.BChBsCfx.js                9.72 kB │ gzip:   2.83 kB
19:17:18 [vite] dist/_astro/v1.6.0-WTOLS5Y6.BrJvDjHz.js               10.73 kB │ gzip:   3.03 kB
19:17:18 [vite] dist/_astro/v1.7.0-7V2ZPHKV.1d-zW9eS.js               10.98 kB │ gzip:   3.07 kB
19:17:18 [vite] dist/_astro/v1.8.0-UKWSFP36.wayCITfA.js               10.98 kB │ gzip:   3.06 kB
19:17:18 [vite] dist/_astro/v1.9.0-SQYL3FIK.ehOfOIud.js               11.19 kB │ gzip:   3.12 kB
19:17:18 [vite] dist/_astro/v1.10.0-HV5QAMRI.DtfFbtUQ.js              11.67 kB │ gzip:   3.32 kB
19:17:18 [vite] dist/_astro/v1.11.0-7OORRXZT.CGwSLHNc.js              12.77 kB │ gzip:   3.58 kB
19:17:18 [vite] dist/_astro/v1.13.0-F46Z6ASK.CtOs43cv.js              13.89 kB │ gzip:   3.96 kB
19:17:18 [vite] dist/_astro/v1.12.0-JRP6T6PK.BrocjUYM.js              13.89 kB │ gzip:   3.96 kB
19:17:18 [vite] dist/_astro/v1.15.0-4YFUPOOT.Bi1u4Jfv.js              13.90 kB │ gzip:   4.00 kB
19:17:18 [vite] dist/_astro/v1.14.0-4GFOYRNY.B8nGQ1Rg.js              13.92 kB │ gzip:   4.01 kB
19:17:18 [vite] dist/_astro/secp256k1.wG4-XAqJ.js                     31.50 kB │ gzip:  12.59 kB
19:17:18 [vite] dist/_astro/w3m-modal.DL6-0ThR.js                     39.50 kB │ gzip:   9.25 kB
19:17:18 [vite] dist/_astro/index._z1Y4Wqc.js                         39.67 kB │ gzip:   9.39 kB
19:17:18 [vite] dist/_astro/ajv.B0PCc7TN.js                          124.94 kB │ gzip:  39.27 kB
19:17:18 [vite] dist/_astro/basic.CVnxuyqx.js                        141.77 kB │ gzip:  32.77 kB
19:17:18 [vite] dist/_astro/index.BKL_-_Dm.js                        142.40 kB │ gzip:  45.69 kB
19:17:18 [vite] dist/_astro/index.es.BLec4dxZ.js                     398.87 kB │ gzip: 115.66 kB
19:17:18 [vite] dist/_astro/core.DpZ6wO2O.js                         471.49 kB │ gzip: 129.01 kB
19:17:18 [vite] dist/_astro/TradingApp.DifftT03.js                 1,431.33 kB │ gzip: 437.29 kB
19:17:18 [WARN] [vite] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
19:17:18 [vite] ✓ built in 31.11s

 generating static routes 
19:17:19 ▶ src/pages/fees.astro
19:17:19   └─ /fees/index.html (+16ms) 
19:17:19 ▶ src/pages/index.astro
19:17:19   └─ /index.html (+11ms) 
19:17:19 ▶ src/pages/legal.astro
19:17:19   └─ /legal/index.html (+4ms) 
19:17:19 ✓ Completed in 826ms.

19:17:19 [build] 3 page(s) built in 35.26s
19:17:19 [build] Complete!
Build SHA-256: fa712013bdc5279ae30e617ae8e75c731b0bf446dcb09648bef8f2ffb1453216

[exit_code=0]
```

## Production build 2

[Raw output](audit/phase-f/build-2.txt)

```text
$ pnpm build

> pit@0.1.0 build /home/corio/PIT
> node scripts/generate-validator.mjs && astro build && node scripts/prepare-static.mjs && node scripts/build-manifest.mjs

19:17:56 [content] Syncing content
19:17:56 [content] Synced content
19:17:56 [types] Generated 76ms
19:17:56 [build] output: "static"
19:17:56 [build] mode: "static"
19:17:56 [build] directory: /home/corio/PIT/dist/
19:17:56 [build] Collecting build info...
19:17:56 [build] ✓ Completed in 128ms.
19:17:56 [build] Building static entrypoints...
19:17:58 [vite] ✓ built in 1.65s
19:17:58 [build] ✓ Completed in 1.71s.

 building client (vite) 
19:17:58 [vite] transforming...
19:18:06 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js (6:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:18:06 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js (6:27): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:18:06 [WARN] [vite] node_modules/.pnpm/ox@0.9.17_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js (6:27): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.9.17_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Base64.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:18:08 [WARN] [vite] node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js (2:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.9_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:18:08 [WARN] [vite] node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment

"/** Anchors a pattern source. The interpolation lives here rather than at the call site because
 * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it
 * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */"

in "node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:18:08 [WARN] [vite] node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment

"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle."

in "node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:18:14 [WARN] [vite] node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js (6:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/Address.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:18:14 [WARN] [vite] node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js (2:21): A comment

"/*#__PURE__*/"

in "node_modules/.pnpm/ox@0.6.7_typescript@5.9.3_zod@4.6.5/node_modules/ox/_esm/core/internal/cursor.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
19:18:25 [vite] ✓ 5288 modules transformed.
19:18:26 [vite] rendering chunks...
19:18:27 [vite] computing gzip size...
19:18:27 [vite] dist/_astro/TradingApp.DXz-kL6w.js                     0.10 kB │ gzip:   0.10 kB
19:18:27 [vite] dist/_astro/base16.BPd3-eEf.js                         0.33 kB │ gzip:   0.24 kB
19:18:27 [vite] dist/_astro/cursor.DvaSo78t.js                         0.38 kB │ gzip:   0.27 kB
19:18:27 [vite] dist/_astro/chevron-left.CNN3WfLy.js                   0.52 kB │ gzip:   0.33 kB
19:18:27 [vite] dist/_astro/chevron-top.Bj83L42v.js                    0.52 kB │ gzip:   0.33 kB
19:18:27 [vite] dist/_astro/external-link.BnmZjZ3W.js                  0.52 kB │ gzip:   0.33 kB
19:18:27 [vite] dist/_astro/chevron-bottom.BqzBUs8Q.js                 0.52 kB │ gzip:   0.33 kB
19:18:27 [vite] dist/_astro/chevron-right.vUgsd32o.js                  0.52 kB │ gzip:   0.32 kB
19:18:27 [vite] dist/_astro/arrow-top.DbvsuPi4.js                      0.53 kB │ gzip:   0.33 kB
19:18:27 [vite] dist/_astro/arrow-bottom.DuAz4pJ5.js                   0.53 kB │ gzip:   0.34 kB
19:18:27 [vite] dist/_astro/arrow-left.DN_tGMV_.js                     0.53 kB │ gzip:   0.33 kB
19:18:27 [vite] dist/_astro/arrow-right.CREDteVs.js                    0.53 kB │ gzip:   0.34 kB
19:18:27 [vite] dist/_astro/off.CH9HHPMH.js                            0.55 kB │ gzip:   0.34 kB
19:18:27 [vite] dist/_astro/search.oBqNbi6U.js                         0.56 kB │ gzip:   0.35 kB
19:18:27 [vite] dist/_astro/close.1qyM6l2S.js                          0.56 kB │ gzip:   0.34 kB
19:18:27 [vite] dist/_astro/all-wallets.BPqzkw3n.js                    0.57 kB │ gzip:   0.31 kB
19:18:27 [vite] dist/_astro/filters.BybL5qHt.js                        0.57 kB │ gzip:   0.33 kB
19:18:27 [vite] dist/_astro/info-circle.BHSxYsT_.js                    0.59 kB │ gzip:   0.35 kB
19:18:27 [vite] dist/_astro/more.YtCGqtwx.js                           0.61 kB │ gzip:   0.36 kB
19:18:27 [vite] dist/_astro/refresh.Dqo8WiLL.js                        0.61 kB │ gzip:   0.38 kB
19:18:27 [vite] dist/_astro/warning-circle.DnR8fOUZ.js                 0.62 kB │ gzip:   0.36 kB
19:18:27 [vite] dist/_astro/coinPlaceholder.CXomwaJi.js                0.62 kB │ gzip:   0.40 kB
19:18:27 [vite] dist/_astro/compass.ZmugxCXr.js                        0.64 kB │ gzip:   0.39 kB
19:18:27 [vite] dist/_astro/swapVertical.C6kAEU0k.js                   0.67 kB │ gzip:   0.39 kB
19:18:27 [vite] dist/_astro/swapHorizontal.3vt4v8qz.js                 0.67 kB │ gzip:   0.38 kB
19:18:27 [vite] dist/_astro/x.CnI2kBxF.js                              0.69 kB │ gzip:   0.44 kB
19:18:27 [vite] dist/_astro/cursor-transparent.DnGhW6CX.js             0.70 kB │ gzip:   0.41 kB
19:18:27 [vite] dist/_astro/twitterIcon.CYFvnnPW.js                    0.70 kB │ gzip:   0.43 kB
19:18:27 [vite] dist/_astro/mobile.DRK3g499.js                         0.71 kB │ gzip:   0.37 kB
19:18:27 [vite] dist/_astro/checkmark-bold.0mJo8eUu.js                 0.77 kB │ gzip:   0.49 kB
19:18:27 [vite] dist/_astro/etherscan.BMG70-gU.js                      0.82 kB │ gzip:   0.50 kB
19:18:27 [vite] dist/_astro/checkmark.DvWy6Gb-.js                      0.82 kB │ gzip:   0.52 kB
19:18:27 [vite] dist/_astro/help-circle.BPZtanm0.js                    0.83 kB │ gzip:   0.48 kB
19:18:27 [vite] dist/_astro/wallet.CvfV37ZD.js                         0.84 kB │ gzip:   0.47 kB
19:18:27 [vite] dist/_astro/plus.DQ0FN6Pn.js                           0.88 kB │ gzip:   0.48 kB
19:18:27 [vite] dist/_astro/verify-filled.Cgbj5jJR.js                  0.89 kB │ gzip:   0.52 kB
19:18:27 [vite] dist/_astro/add.BhRwi3bG.js                            0.89 kB │ gzip:   0.48 kB
19:18:27 [vite] dist/_astro/google.BcpSYJJK.js                         0.93 kB │ gzip:   0.51 kB
19:18:27 [vite] dist/_astro/three-dots.CUGaXIw0.js                     0.96 kB │ gzip:   0.46 kB
19:18:27 [vite] dist/_astro/clock.BluPkpBb.js                          0.96 kB │ gzip:   0.53 kB
19:18:27 [vite] dist/_astro/disconnect.SWFrA3Ix.js                     1.01 kB │ gzip:   0.56 kB
19:18:27 [vite] dist/_astro/twitch.CVQ7L-go.js                         1.02 kB │ gzip:   0.55 kB
19:18:27 [vite] dist/_astro/bank.CFjMbSw9.js                           1.06 kB │ gzip:   0.58 kB
19:18:27 [vite] dist/_astro/apple.4LHs8Vuj.js                          1.08 kB │ gzip:   0.58 kB
19:18:27 [vite] dist/_astro/play-store.C0tjhZ0o.js                     1.13 kB │ gzip:   0.57 kB
19:18:27 [vite] dist/_astro/farcaster.Dopfk7Ab.js                      1.13 kB │ gzip:   0.58 kB
19:18:27 [vite] dist/_astro/arrow-bottom-circle.rrHaPx13.js            1.25 kB │ gzip:   0.58 kB
19:18:27 [vite] dist/_astro/github.DjpSSrs-.js                         1.25 kB │ gzip:   0.65 kB
19:18:27 [vite] dist/_astro/swapHorizontalBold.Cu4QIm0k.js             1.28 kB │ gzip:   0.67 kB
19:18:27 [vite] dist/_astro/app-store.D7SsFDjA.js                      1.32 kB │ gzip:   0.73 kB
19:18:27 [vite] dist/_astro/mail.CcRNb-9W.js                           1.32 kB │ gzip:   0.71 kB
19:18:27 [vite] dist/_astro/v0.1.0-452JMA5G.CxDlBNav.js                1.33 kB │ gzip:   0.64 kB
19:18:27 [vite] dist/_astro/facebook._qxjZcvk.js                       1.35 kB │ gzip:   0.70 kB
19:18:27 [vite] dist/_astro/wallet-placeholder.N9goN9mi.js             1.38 kB │ gzip:   0.65 kB
19:18:27 [vite] dist/_astro/desktop.Dp7aPlx9.js                        1.39 kB │ gzip:   0.70 kB
19:18:27 [vite] dist/_astro/discord.BDqFrB6g.js                        1.42 kB │ gzip:   0.71 kB
19:18:27 [vite] dist/_astro/swapHorizontalMedium.CorKU68U.js           1.42 kB │ gzip:   0.73 kB
19:18:27 [vite] dist/_astro/recycle-horizontal.B-MXNvMV.js             1.46 kB │ gzip:   0.76 kB
19:18:27 [vite] dist/_astro/base32.l_RPZY32.js                         1.50 kB │ gzip:   0.51 kB
19:18:27 [vite] dist/_astro/extension.gryhwZGV.js                      1.55 kB │ gzip:   0.75 kB
19:18:27 [vite] dist/_astro/telegram.BDif31Pa.js                       1.57 kB │ gzip:   0.89 kB
19:18:27 [vite] dist/_astro/swapHorizontalRoundedBold.Dq72O40t.js      1.57 kB │ gzip:   0.82 kB
19:18:27 [vite] dist/_astro/verify.B3yydH6O.js                         1.59 kB │ gzip:   0.77 kB
19:18:27 [vite] dist/_astro/qr-code.CEYeIYM8.js                        1.63 kB │ gzip:   0.58 kB
19:18:27 [vite] dist/_astro/browser.DDZ3iO8r.js                        1.70 kB │ gzip:   0.84 kB
19:18:27 [vite] dist/_astro/network-placeholder.DHL2dVEf.js            1.77 kB │ gzip:   0.79 kB
19:18:27 [vite] dist/_astro/client.BHjpRL8Y.js                         1.84 kB │ gzip:   0.91 kB
19:18:27 [vite] dist/_astro/id.BoEaphBo.js                             1.87 kB │ gzip:   0.86 kB
19:18:27 [vite] dist/_astro/nftPlaceholder.cCQURm9Y.js                 1.87 kB │ gzip:   0.92 kB
19:18:27 [vite] dist/_astro/v0.2.0-RZSAEYWJ.BO42Ib25.js                1.90 kB │ gzip:   0.80 kB
19:18:27 [vite] dist/_astro/v0.4.0-XWYIU6OQ.dtmZJ7oB.js                2.00 kB │ gzip:   0.86 kB
19:18:27 [vite] dist/_astro/v0.3.0-QEEYHNXA.C8R-2dRU.js                2.09 kB │ gzip:   0.87 kB
19:18:27 [vite] dist/_astro/info.Wi4FJAk5.js                           2.38 kB │ gzip:   1.20 kB
19:18:27 [vite] dist/_astro/v0.5.0-6JWER4SU.B0qvJgU-.js                2.44 kB │ gzip:   0.93 kB
19:18:27 [vite] dist/_astro/exclamation-triangle.iw9381ca.js           2.54 kB │ gzip:   1.19 kB
19:18:27 [vite] dist/_astro/send.C3z8zejT.js                           2.54 kB │ gzip:   1.34 kB
19:18:27 [vite] dist/_astro/card.BXz73HYp.js                           2.71 kB │ gzip:   1.23 kB
19:18:27 [vite] dist/_astro/chrome-store.C8NCxK73.js                   2.71 kB │ gzip:   1.07 kB
19:18:27 [vite] dist/_astro/reown-logo.BpkrQUAh.js                     2.72 kB │ gzip:   1.12 kB
19:18:27 [vite] dist/_astro/lightbulb.CJwaBNxD.js                      2.83 kB │ gzip:   1.28 kB
19:18:27 [vite] dist/_astro/ccip.BlSNJZZb.js                           2.92 kB │ gzip:   1.35 kB
19:18:27 [vite] dist/_astro/v0.8.0-MA4RCSXJ.BzWVU6mD.js                3.40 kB │ gzip:   1.22 kB
19:18:27 [vite] dist/_astro/v0.6.0-DCUHOIX6.D0nK_KNa.js                3.44 kB │ gzip:   1.21 kB
19:18:27 [vite] dist/_astro/v0.7.0-WUIYE67P.DHAtTBPF.js                3.46 kB │ gzip:   1.22 kB
19:18:27 [vite] dist/_astro/image.gxCQrLHi.js                          3.61 kB │ gzip:   1.57 kB
19:18:27 [vite] dist/_astro/copy.CThbYsIF.js                           3.94 kB │ gzip:   1.54 kB
19:18:27 [vite] dist/_astro/walletconnect.DIFgSkn5.js                  4.18 kB │ gzip:   1.72 kB
19:18:27 [vite] dist/_astro/base.DMz8QJ2S.js                           4.32 kB │ gzip:   1.80 kB
19:18:27 [vite] dist/_astro/v0.9.0-MODYXNNJ.CW56i5Hn.js                4.79 kB │ gzip:   1.60 kB
19:18:27 [vite] dist/_astro/v0.10.0-OHB5VFCY.BxLkbVOM.js               5.20 kB │ gzip:   1.71 kB
19:18:27 [vite] dist/_astro/v0.11.0-YC4BNGSG.ZJUKLJPn.js               5.72 kB │ gzip:   1.77 kB
19:18:27 [vite] dist/_astro/cid.DuD6wXc4.js                            5.83 kB │ gzip:   2.45 kB
19:18:27 [vite] dist/_astro/v1.0.0-LO3INJ7G.Cn81q8wR.js                6.36 kB │ gzip:   1.93 kB
19:18:27 [vite] dist/_astro/v1.1.0-VDZLWY4U.BWHazOd8.js                6.82 kB │ gzip:   2.08 kB
19:18:27 [vite] dist/_astro/v1.2.0-J7HBJ6X3.DAO9TS_K.js                6.98 kB │ gzip:   2.15 kB
19:18:27 [vite] dist/_astro/v1.3.0-YE5Z6DA7.WxjICRnn.js                7.32 kB │ gzip:   2.29 kB
19:18:27 [vite] dist/_astro/v1.4.0-XW4S4BWH.BE1DD-uT.js                8.88 kB │ gzip:   2.53 kB
19:18:27 [vite] dist/_astro/v1.5.0-RPBY3HCV.BChBsCfx.js                9.72 kB │ gzip:   2.83 kB
19:18:27 [vite] dist/_astro/v1.6.0-WTOLS5Y6.BrJvDjHz.js               10.73 kB │ gzip:   3.03 kB
19:18:27 [vite] dist/_astro/v1.7.0-7V2ZPHKV.1d-zW9eS.js               10.98 kB │ gzip:   3.07 kB
19:18:27 [vite] dist/_astro/v1.8.0-UKWSFP36.wayCITfA.js               10.98 kB │ gzip:   3.06 kB
19:18:27 [vite] dist/_astro/v1.9.0-SQYL3FIK.ehOfOIud.js               11.19 kB │ gzip:   3.12 kB
19:18:27 [vite] dist/_astro/v1.10.0-HV5QAMRI.DtfFbtUQ.js              11.67 kB │ gzip:   3.32 kB
19:18:27 [vite] dist/_astro/v1.11.0-7OORRXZT.CGwSLHNc.js              12.77 kB │ gzip:   3.58 kB
19:18:27 [vite] dist/_astro/v1.13.0-F46Z6ASK.CtOs43cv.js              13.89 kB │ gzip:   3.96 kB
19:18:27 [vite] dist/_astro/v1.12.0-JRP6T6PK.BrocjUYM.js              13.89 kB │ gzip:   3.96 kB
19:18:27 [vite] dist/_astro/v1.15.0-4YFUPOOT.Bi1u4Jfv.js              13.90 kB │ gzip:   4.00 kB
19:18:27 [vite] dist/_astro/v1.14.0-4GFOYRNY.B8nGQ1Rg.js              13.92 kB │ gzip:   4.01 kB
19:18:27 [vite] dist/_astro/secp256k1.wG4-XAqJ.js                     31.50 kB │ gzip:  12.59 kB
19:18:27 [vite] dist/_astro/w3m-modal.DL6-0ThR.js                     39.50 kB │ gzip:   9.25 kB
19:18:27 [vite] dist/_astro/index._z1Y4Wqc.js                         39.67 kB │ gzip:   9.39 kB
19:18:27 [vite] dist/_astro/ajv.B0PCc7TN.js                          124.94 kB │ gzip:  39.27 kB
19:18:27 [vite] dist/_astro/basic.CVnxuyqx.js                        141.77 kB │ gzip:  32.77 kB
19:18:27 [vite] dist/_astro/index.BKL_-_Dm.js                        142.40 kB │ gzip:  45.69 kB
19:18:27 [vite] dist/_astro/index.es.BLec4dxZ.js                     398.87 kB │ gzip: 115.66 kB
19:18:27 [vite] dist/_astro/core.DpZ6wO2O.js                         471.49 kB │ gzip: 129.01 kB
19:18:27 [vite] dist/_astro/TradingApp.DifftT03.js                 1,431.33 kB │ gzip: 437.29 kB
19:18:27 [WARN] [vite] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
19:18:27 [vite] ✓ built in 29.55s

 generating static routes 
19:18:28 ▶ src/pages/fees.astro
19:18:28   └─ /fees/index.html (+14ms) 
19:18:28 ▶ src/pages/index.astro
19:18:28   └─ /index.html (+6ms) 
19:18:28 ▶ src/pages/legal.astro
19:18:28   └─ /legal/index.html (+4ms) 
19:18:28 ✓ Completed in 938ms.

19:18:28 [build] 3 page(s) built in 32.43s
19:18:28 [build] Complete!
Build SHA-256: fa712013bdc5279ae30e617ae8e75c731b0bf446dcb09648bef8f2ffb1453216

[exit_code=0]
```

## Reproducible build and validator comparison

[Raw output](audit/phase-f/reproducible.txt)

```text
$ python3 scripts/audit/compare-builds.py
build-1 manifest hash: fa712013bdc5279ae30e617ae8e75c731b0bf446dcb09648bef8f2ffb1453216
build-2 manifest hash: fa712013bdc5279ae30e617ae8e75c731b0bf446dcb09648bef8f2ffb1453216
Complete manifests byte-identical: True
Verified individual artifact digests: 122
Regenerated validator equals phase-E validator: True

[exit_code=0]
```

## Phase L — static supply-chain and SRI gate

[Full inventory, CSP before/after, SRI matrix and bounded telemetry findings](audit/phase-l/STATIC-SUPPLY-CHAIN.md) · [Complete production artifact manifest](audit/phase-l/artifact-inventory.json) · [Exact keyless browser request capture](audit/phase-l/runtime-inventory.json) · [Exact clean-tree release-check output](audit/phase-l/release-check.txt).

Commands:

```text
pnpm build
node scripts/release/artifacts.mjs
pnpm preview --port 4398
node scripts/audit/runtime-inventory.mjs
pnpm release:check
```

The artifact guard output from the final local build is:

```text
PASS static artifacts: 123 files; 3 HTML pages; 0 external scripts/styles; CSP, SRI, telemetry, secret, source-map and mainnet endpoint guards
```

The request capture uses a synthetic injected provider, aborts external HTTP, and records only the exact attempted origins `https://api.cow.fi` and `https://api.hyperliquid-testnet.xyz` after connection. It records `violations: []`, no external executable/style/font/image and no address analytics request. The initial capture exposed blocked mainnet RPC attempts from wagmi and ConnectKit ENS fallback; the final `Wallet.tsx` configuration removes those request paths. The offline browser test asserts the same allowed origins and zero CSP violations. This is not evidence from a real wallet extension or a public origin.

The static artifact gate runs **after** the production build in `pnpm release:check`. Its 18 focused unit tests include 16 negative mutations and two valid baselines; missing SRI/CORS, unquoted and protocol-relative remote scripts, external styles/CSS resources, `unsafe-eval`, wildcard/mainnet CSP, analytics packages/imports/endpoints, secret-like values, source maps and mainnet execution paths all fail. The actual artifact has 117 JS chunks, one CSS file, three HTML pages, a JSON manifest and `_headers`, with no source maps. No external runtime script, stylesheet or font dependency needed removal. `style-src 'unsafe-inline'` remains for generated/runtime styles; `script-src` uses hashes and has no `unsafe-eval`.

The exact clean-tree `pnpm release:check` output is stored in the linked file. Its decisive lines are:

```text
Clean release source: 076a493aaa018f6e159fd679ddc9db0cff02c1e6
PASS protected fee/network configuration: FEES_ENABLED=false; MAINNET_ENABLED=false; recipients/rates unchanged
PASS exact Taxlot v1 schema SHA256 d8eb339ed7acd7da3b68ef09fe5c1b01c4cc3258cb401a4f2ba8805e7a3b07d7
PASS origin policy: default-deny; production allowlist empty; legal page unchanged
PASS tracked-file credential patterns and environment-file policy (not a proof against encoded secrets)
PASS no direct analytics dependency or app-source analytics import
 Test Files  15 passed (15)
      Tests  93 passed (93)
Result (57 files):
- 0 errors
- 0 warnings
- 0 hints
11:45:33 [build] 3 page(s) built in 31.56s
Build SHA-256: eb4b07f82216d1f113678523841717bed6fb5045bd5d50f34ec5f25276f79257
PASS static artifacts: 123 files; 3 HTML pages; 0 external scripts/styles; CSP, SRI, telemetry, secret, source-map and mainnet endpoint guards
  16 passed (17.8s)
RELEASE CHECK PASS — offline testnet candidate only; no live acceptance or deployment
```

The clean-tree run used the source commit shown in its output. This verification section and the full log are appended to that same phase commit afterward; no source or test code changes follow the run. Phase L changes neither the Phase H-live blocker nor Assumption 8's OPEN disposition: no dedicated public HTTPS origin or live transaction has been verified.

## Phase M — toolbox foundation

[Architecture, registry inventory, formulas and execution boundary](audit/phase-m/TOOLBOX-ARCHITECTURE.md) · [calculator request capture](audit/phase-m/calculator-inventory.json) · [build impact](audit/phase-m/build-impact.json) · [complete candidate artifact manifest](audit/phase-m/artifact-inventory.json) · [exact clean-tree release-check output](audit/phase-m/release-check.txt).

Commands: `pnpm test`, `pnpm check`, `pnpm build`, `node scripts/release/artifacts.mjs`, `pnpm test:e2e`, `node scripts/audit/calculator-inventory.mjs` against a local production preview, and finally `pnpm release:check` from a clean committed tree. The request capture uses offline browser contexts after initial same-origin HTML/CSS loads; all three calculators report `afterLoadRequests: []` and `websockets: []`. The Playwright suite covers registry URLs, landing search, calculation, direct reload, offline/no-network use and disabled signing controls on direct execution URLs. The exact final suite totals and build hash appear in the linked release-check output.

The existing execution preflight, fee-disabled flag, Taxlot schema and derivative evidence boundary are unchanged. Assumption 8 remains OPEN; Phase H-live acceptance remains blocked.

The decisive lines from the exact 345-line clean-tree output are:

```text
Clean release source: a73dbf01c56522403937485c747019b888d78bd1
PASS protected fee/network configuration: FEES_ENABLED=false; MAINNET_ENABLED=false; recipients/rates unchanged
PASS exact Taxlot v1 schema SHA256 d8eb339ed7acd7da3b68ef09fe5c1b01c4cc3258cb401a4f2ba8805e7a3b07d7
PASS origin policy: default-deny; production allowlist empty; legal page unchanged
PASS tracked-file credential patterns and environment-file policy (not a proof against encoded secrets)
PASS no direct analytics dependency or app-source analytics import
 Test Files  17 passed (17)
      Tests  116 passed (116)
Result (76 files):
- 0 errors
- 0 warnings
- 0 hints
12:11:40 [build] 11 page(s) built in 21.97s
Build SHA-256: 82b197be5ddb9db674e64e878e5c7787c4f8ef34c68d65fee01ee931bda23e24
PASS static artifacts: 136 files; 11 HTML pages; 0 external scripts/styles; CSP, SRI, telemetry, secret, source-map and mainnet endpoint guards
  22 passed (13.8s)
RELEASE CHECK PASS — offline testnet candidate only; no live acceptance or deployment
```

The clean-tree run used the source commit shown above. Only this verification text and the exact log are added to the same phase commit afterward; no source or test code changes follow the run.

## Phase N — registry-driven discoverability

[Metadata architecture, complete route matrix, indexing activation rule, built JSON-LD and negative-guard evidence](audit/phase-n/DISCOVERABILITY.md) · [exact clean-tree release-check output](audit/phase-n/release-check.txt).

The versioned policy is disabled: all 11 built pages emit `noindex,nofollow`, `robots.txt` disallows `/`, and no canonical production host or sitemap is generated. The new artifact guard checks metadata against the authoritative registry and confirms calculator/discovery HTML has no wallet/protocol JavaScript reference. Playwright checks actual served metadata and robots behavior. The separate Phase L artifact guard still validates CSP/SRI, telemetry, secrets, source maps and mainnet endpoints. See the linked exact log for complete command outputs and totals.

The exact 351-line clean-tree `pnpm release:check` output is in the linked log. Decisive lines:

```text
Clean release source: 886149c0dc33e2b2e0e8e802f301fae7f11053f5
 Test Files  18 passed (18)
      Tests  124 passed (124)
Result (79 files):
- 0 errors
- 0 warnings
- 0 hints
10:20:55 [build] 11 page(s) built in 17.37s
Discoverability: 11 noindex pages; robots.txt; sitemap withheld
Build SHA-256: 38da18fe32116bef0d89982bdba2d3f49c1332eae7d3fd3ada201471d72507e6
PASS static artifacts: 137 files; 11 HTML pages; 0 external scripts/styles; CSP, SRI, telemetry, secret, source-map and mainnet endpoint guards
PASS discoverability: 11 routes; 7 registry tool pages; 4 local/discovery pages without wallet or protocol JS; indexing policy and sitemap guards
  23 passed (17.5s)
RELEASE CHECK PASS — offline testnet candidate only; no live acceptance or deployment
```

The run used the clean source commit shown above. This verification text and the exact output log are appended to the same phase commit afterward; no source or test changes follow that run.

## Phase O — secretless multi-venue swap quoting

[Architecture, exact normalization/ranking semantics, official deployment and `eth_getCode` evidence, failure isolation, and execution boundary](audit/phase-o/BEST-SWAP-QUOTING.md) · [keyless runtime request capture](audit/phase-o/runtime-inventory.json) · [exact clean-tree release-check output](audit/phase-o/release-check.txt).

The second venue is Uniswap v3 QuoterV2 on Ethereum Sepolia, read through the existing public Sepolia RPC. It is quote-only. CoW's original SDK quote, exact fee disclosure and preflight retain sole swap execution authority. Comparison ranks BigInt quoted output after known provider fees, before slippage and wallet gas, only for matching fresh exact-input quotes. No live quote for a real pool, wallet signature, swap or public deployment is claimed. `FEES_ENABLED=false` and Assumption 8's **OPEN** disposition are unchanged. The linked exact release log contains the final unit, Playwright, typecheck, build, CSP/artifact and discoverability results.

The exact 359-line clean-tree `pnpm release:check` output is in the linked log. Decisive lines:

```text
Clean release source: ee4c9c7368797c82418efb8e22aca1f0fb15dc5b
PASS protected fee/network configuration: FEES_ENABLED=false; MAINNET_ENABLED=false; recipients/rates unchanged
PASS exact Taxlot v1 schema SHA256 d8eb339ed7acd7da3b68ef09fe5c1b01c4cc3258cb401a4f2ba8805e7a3b07d7
PASS origin policy: default-deny; production allowlist empty; legal page unchanged
 Test Files  19 passed (19)
      Tests  130 passed (130)
Result (83 files):
- 0 errors
- 0 warnings
- 0 hints
10:51:19 [build] 11 page(s) built in 18.96s
Discoverability: 11 noindex pages; robots.txt; sitemap withheld
Build SHA-256: 414305ebc55f769759bf08a21d5ca7152ee9986ad3af1b44c5b04e9b10f25d62
PASS static artifacts: 137 files; 11 HTML pages; 0 external scripts/styles; CSP, SRI, telemetry, secret, source-map and mainnet endpoint guards
PASS discoverability: 11 routes; 7 registry tool pages; 4 local/discovery pages without wallet or protocol JS; indexing policy and sitemap guards
  24 passed (15.8s)
RELEASE CHECK PASS — offline testnet candidate only; no live acceptance or deployment
```

The run used the clean source commit shown above. This verification text and the exact output log are appended to the same phase commit afterward; no source or test changes follow that run.

## Phase P — quote provenance and same-budget cost coverage

[Full boundary, SDK amount-stage and live-read audit](audit/phase-p/QUOTE-INTEGRITY.md) · [pinned Sepolia block response](audit/phase-p/block-response.json) · [quoter/factory raw RPC responses](audit/phase-p/contracts-response.json) · [built-page browser CORS capture](audit/phase-p/browser-production-read.json) · [complete clean-tree release transcript](audit/phase-p/release-check.txt).

The original `QUOTE_EXPIRED` response for a normalized Uniswap object meant only that it was absent from CoW's private execution map. Both approval and submission now reject missing, forged, copied, stale-request or mutated execution provenance as `INVALID_EXECUTION_QUOTE` before SDK approval/posting; `QUOTE_EXPIRED` is reserved for a retained valid CoW quote past its 60-second limit. Valid fixture controls reach the SDK approval and posting spies. Comparison now requires the same **total** sell-token debit budget, separates CoW's network-fee-reduced solver input from the original budget, and displays unknown wallet gas separately from embedded costs. Uniswap resolves and shows the selected single pool and fee tier; it remains quote-only.

Live Sepolia chain, block, quoter bytecode/factory identity and CoW version reads succeeded, and the local browser reached both existing public endpoints. **LIVE_COMPARISON is BLOCKED**: no real Sepolia token pair was approved/configured and no public quote `from` context was supplied; no token quote, signing or transaction was attempted. These infrastructure and browser CORS checks are not live pricing or execution acceptance. Assumption 8 remains **OPEN**; Phase H live acceptance and Phase K dedicated-origin verification remain blocked. The linked transcript gives exact deterministic unit, typecheck, build, artifact-guard and Playwright output for the clean tested source commit.

The complete 357-line clean-tree `pnpm release:check` output is in the linked transcript. It tested source commit `e1925f106b4d7eda390487820cde2ca543005069`: 134 unit tests, 24 Playwright tests, 83 typechecked files with zero diagnostics, 11 static pages, and build SHA-256 `56ee7fbec4c7618494bb6aca91c872f3be92b73f4bc97f95df97ae283b195f50`. It ended `RELEASE CHECK PASS — offline testnet candidate only; no live acceptance or deployment`. Only this verification text, the audit document and exact log were added after that run; tested non-evidence files remain identical.

Assumption 8 remains **OPEN**. This local static build neither deploys nor independently verifies a dedicated public HTTPS origin; live Phase H execution is still blocked by absent funded external testnet accounts and operator-approved signatures.

## Phase Q — verified read-only Sepolia market

[Manifest, synthetic context, exact read outcomes, cost reconciliation and acceptance matrix](audit/phase-q/SEPOLIA-MARKET-ACCEPTANCE.md) · [sanitized CLI probe stdout](audit/phase-q/cli-probe-output.txt) · [raw Uniswap RPC batch request](audit/phase-q/cli-uniswap-request.json) / [response](audit/phase-q/cli-uniswap-response.json) · [built-page browser capture](audit/phase-q/browser-live-read.json) / [SDK reconciliation](audit/phase-q/browser-reconciliation.json) / [screenshot](audit/phase-q/browser-diagnostic.png).

A single verified read-only manifest pair, WETH → Circle test USDC on Ethereum Sepolia, is now available for a fixed diagnostic quote. The synthetic public CoW `from` address has no private key, is not an operator account and is never registered for execution. A local built-browser run got real HTTP 200 CoW and approved-RPC responses, normalized a same-`0.01`-WETH debit budget through the production comparison path, and displayed `442009102` versus `566804400` test-USDC base units. This is a point-in-time **testnet quoted-output** comparison with different embedded costs and unknown separate wallet gas; neither diagnostic quote can execute. The final browser capture used the release-checked source and production artifact. The Node CLI probe exited **2** after the PublicNode viem transport failed at `eth_chainId`, while CoW succeeded; browser success does not erase that CLI transport limitation. No approval, signature, order, transaction, accounting write or public deployment occurred.

Assumption 8 remains **OPEN**: localhost browser acceptance is not a dedicated public HTTPS-origin verification. Phase H remains blocked pending funded external testnet accounts and operator-approved signatures. The Hyperliquid derivative evidence boundary and legal mainnet fee gate are unchanged. The network-dependent probe stays outside `pnpm release:check`.

The complete **358-line** clean-source [`pnpm release:check` transcript](audit/phase-q/release-check.txt) tested commit `c3dd5038edcb1af6d2d190d976ebd22c892cce6b` and ended `RELEASE CHECK PASS — offline testnet candidate only; no live acceptance or deployment`: **137 unit tests**, **24 Playwright tests**, **88 typechecked files with zero diagnostics**, **11 static pages**, static artifact/CSP/secret/discoverability guards passing, and build SHA-256 `c323eef27feb0314464f0725152fdb2f8c282bef94075b07f541557681276f70`. Only audit text, release transcript, and final browser screenshot/request/reconciliation evidence changed after this run; all tested non-evidence files remain identical.

## Phase R — public documentation URL scanner correction

[Exact reproduction, corrected artifact rule, zero-exception inventory, negative controls, scan scope and limitations](audit/phase-r/SECRET-GUARD-CORRECTNESS.md) · [targeted 37-test output](audit/phase-r/targeted-tests.txt) · [source/artifact scan](audit/phase-r/source-artifact-scan.txt).

The Phase Q false positive came from an artifact regex that crossed path separators after `/v3/` and matched the official Uniswap deployment documentation URL. The manifest now stores the literal URL directly. The artifact guard still scans every value, and separately rejects credential-shaped assignments, private-key PEM headers, URL userinfo, sensitive URL queries and opaque versioned path IDs; no reviewed-value exception or scanner bypass was introduced. Targeted negative tests include a credential next to the public URL, trusted-host query credentials, lookalike/nested URLs and unreviewed private-key-shaped docs evidence. Phase Q CLI, H-live, dedicated-origin, derivative-accounting and legal dispositions remain unchanged; Assumption 8 remains OPEN.

The complete **358-line** clean-source [`pnpm release:check` transcript](audit/phase-r/release-check.txt) tested commit `bbb969e7e7c65639d507ae88f878e66174dcf52a` and ended `RELEASE CHECK PASS — offline testnet candidate only; no live acceptance or deployment`: **144 unit tests**, **24 Playwright tests**, **88 typechecked files with zero diagnostics**, **11 static pages**, static artifact/CSP/secret/discoverability guards passing, and build SHA-256 `48eecaaf4286ad47f7b8782d25bc9bd7564c42ef389a330ebe3344a2ffad6849`. Only audit text and the exact transcript changed after this run; all tested non-evidence files remain identical.

# Phase S CLI quote transport

The bounded Node/viem transport matrix reached the approved Sepolia RPC, while the pre-edit full probe exited 2 on a `fetch failed` block read. A request-scoped CLI retry policy and nested cause-code reporting were added; the first post-change probe still exited 2 on a timeout, and the single confirmation probe exited 0 with a real same-input CoW/Uniswap diagnostic comparison. This remains read-only evidence, not a live trade or proof of RPC reliability. [Exact probe transcripts, UTC durations, matrix, correction, and regression evidence](audit/phase-s/CLI-TRANSPORT.md). The [complete 360-line clean-source release transcript](audit/phase-s/release-check.txt) tested `3ff924c55ffffaeb2d17118446b8fa3a12903a5a`: 148 unit tests, 24 Playwright tests, 90 typechecked files with zero diagnostics, 11 pages, build SHA-256 `ab84ad5f731420735b2130194f2ae8b0955668c8f3cdc318802bee6514b3b6ba`. Assumption 8 remains OPEN; Phase H live execution and Phase K public-origin acceptance remain blocked.

## Phase T — operator live-acceptance readiness

The [authoritative Phase T operator checklist, dry-run proof and future evidence procedure](audit/phase-t/LIVE-READINESS.md) adds read-only PASS/FAIL/UNKNOWN prerequisites and separate operator checkpoints before approval, CoW sign-and-submit, Hyperliquid order and reduce-only close. Diagnostic quotes cannot become CoW execution quotes. Dry run advances only UI state and makes no wallet signing, submission or accounting write. No live acceptance or public-origin verification is claimed; Assumption 8 remains OPEN. The [complete 362-line clean-source release transcript](audit/phase-t/release-check.txt) tested `6065eeed0dd6ffa2a814f6bb6e192d02708ad6a3`: 152 unit tests, 25 Playwright tests, 95 typechecked files with zero diagnostics, 11 static pages, build SHA-256 `7f6230468ba155f7fe670e1ee7100c17523f52902c00b34fecdb025b605c9a2b`.

## Phase U — acceptance evidence harness

Phase U adds a separate local append-only acceptance-session database and exact-integer CoW / raw-only derivative reconciliation. Synthetic fixtures and disconnected browser dry runs are the only new acceptance evidence; no live transaction or deployment occurred. Full design and results: [LIVE-EVIDENCE-HARNESS.md](audit/phase-u/LIVE-EVIDENCE-HARNESS.md). Assumption 8 remains OPEN.

Phase U clean-source release result: tested commit `be2d4d032f7260f02872dfd509585dd87d5f28e5`, 157/157 unit tests, 27/27 Playwright tests, 99 files with zero typecheck diagnostics, 11 pages, build SHA-256 `5d8513c0ab4e6819401968fb384b8b75363bff3755b4f0dad0d909f4bd1de8ba`. [Exact output](audit/phase-u/release-check.txt). Later changes are evidence-only; live acceptance remains blocked.

## Phase H-live blocked preflight

The [Phase H-live record](audit/phase-h-live/LIVE-ACCEPTANCE.md) documents a clean release preflight, then an H.1 stop: no externally controlled funded testnet wallet/account was connected or supplied. No prompt, order, fill, acceptance-session export or live accounting reconciliation occurred. Source and fee configuration are unchanged. Assumption 8 remains OPEN.

## Phase Y.3 — protected Vercel staging configuration

[Phase Y.3 checkpoint, configuration evidence and manual authenticated readback](audit/phase-y/VERCEL-STAGING.md). The temporary automation bypass is **OPERATOR-CONFIRMED revoked**; the read-only Vercel API cannot independently list it. Vercel Authentication remains enabled. The deployed staging alias still yields an unauthenticated HTTP 302, which is not PIT's application response. Actual PIT HTTP CSP, browser persistence/reload/CSV and read-only quote acceptance remain **BLOCKED**. Assumption 8 stays **OPEN**, and the exact staging origin remains outside the accounting allowlist.

The repository-root `vercel.json` supplies Git deployments with the built static headers and `outputDirectory: "dist"`. The release artifact guard now compares its CSP hashes and full header set against `dist/vercel.json`, which is retained for direct upload of the contents of `dist`. Neither local configuration nor uploaded `src/vercel.json` proves that the existing deployment consumed those headers. The [complete clean-commit release output](audit/phase-y/release-check-y3.txt) tested source/configuration commit `56651cc548f6fd87e77fcdd2c3af5f0ebdf58247`: 185 unit tests, 28 Playwright tests, 116 files typechecked with no errors or warnings (one existing hint), 11 pages, 138 guarded artifacts and build SHA-256 `d8e7e1da8cfc56fb351df1b1126a0272a23dde9849698b70f0fb1c6b4efa39e0`. The run ended `RELEASE CHECK PASS — offline testnet candidate only; no live acceptance or deployment`. Only evidence text/logs were added after the clean source run.

### Phase Y.3 operator HTTP readback

The operator supplied a final authenticated PIT staging `/tools/` URL and HTTP 200, plus HSTS, nosniff, no-referrer, DENY frame, noindex and permissions response headers. The HTTP CSP was reported to contain the expected restricted sources and script hashes without `unsafe-eval`; its complete value was not provided. Deployment API file IDs for `src/vercel.json` and `src/tools/index.html` match the local generated artifact SHA-1 values, whose nine CSP script hashes agree internally. Exact served-header-to-HTML hash equality is **NOT VERIFIED**. Browser storage/reload/CSV and live read-only quotes are **BLOCKED**; the origin is not approved for accounting, and Assumption 8 stays **OPEN**. [Evidence and criterion matrix](audit/phase-y/VERCEL-STAGING.md).

### Phase Y.4 operator CSP reconciliation

The operator later supplied the complete public CSP from the authenticated `/tools/` HTTP 200. [Exact reconciliation output](audit/phase-y/csp-reconciliation-y4.txt) shows byte-for-byte equality with `dist/vercel.json` and the repository-root `vercel.json`, and equality with the deployment-identified `/tools/` HTML meta CSP after adding HTTP-only `frame-ancestors 'none'`. Its one executable inline script has the expected hash; across the current build four executable-script hashes are covered, none missing, while five header hashes have no current executable-script counterpart. Seven JSON-LD data scripts are not executable. The exact stable Vercel alias is now the sole approved source-origin candidate. It has **not yet been deployed with this allowlist or verified for browser storage/reload/CSV**. Assumption 8 remains **OPEN**. Configuration-source attribution is still unverified even though the operator-observed effective header value matches the generated configuration.

### Phase Y.5 synthetic staging accounting check

The operator reported authenticated HTTP 200 for `/tools/`, `/build-manifest.json`, and `/tools/taxlot-export/` on the reviewed deployment, and supplied its complete public CSP. The [new-deployment CSP reconciliation](audit/phase-y/csp-reconciliation-y5.txt) matches the uploaded HTML/configuration hashes; this is operator-provided HTTP evidence and Vercel API artifact evidence. The disconnected Taxlot page correctly has its wallet-dependent export disabled, which does not establish a storage defect or an IndexedDB pass.

An isolated staging-only, wallet-free synthetic accounting page now uses PIT's actual schema validator, IndexedDB recorder, and CSV helpers. It refuses to write if the browser has any existing PIT accounting record or metadata; it requires a reload, exact downloaded-CSV readback, then deletes only its synthetic fixture. Normal production builds exclude it, and the artifact guard rejects accidental inclusion. Local unit and browser regressions pass; they are **not** public-origin accounting acceptance. The protected staging addendum deployment is `dpl_CwZD54BuYB3AvAEL6JHavMSW12LA`, READY on the same exact alias with Vercel Authentication enabled. Its actual HTTP headers and the operator's browser write/reload/CSV outcome remain pending. Assumption 8 stays **OPEN**, including legacy-record recovery.

The [complete clean-source release transcript](audit/phase-y/release-check-y5.txt) tested `08aa360076b687ba1d706cfa4ee58fa5667472cd`: 186 unit tests, 30 Playwright tests, 119 typechecked files with 0 errors/0 warnings/1 preexisting hint, 11 static pages, 138 guarded artifacts, and unchanged build SHA-256 `c1cfff57f2560fa911c754a05f9aaf373c9e9b15cef1bfb12b04ba857dd3f4fc`. It ended `RELEASE CHECK PASS — offline testnet candidate only; no live acceptance or deployment`. Only audit documentation and this exact transcript were added after that run; no tested implementation/configuration/test/public-asset file changed.

### Phase Y.7 — offline protected-staging runner diagnosis

The [Phase Y.7 lifecycle audit](audit/phase-y/STAGING-LIFECYCLE-Y7.md) reconstructs the failed Phase Y.6 bypass attempt. The original runner's `ACTIVE BYPASS` label was unsupported: it covered any revocation exception and concealed the earlier safe error. The local credential file was retained during that attempt and subsequently deleted after read-only checks found zero project bypass entries, old-credential HTTP 302, anonymous HTTP 302 and Vercel Authentication enabled. The original mutation response, protected PIT HTTP 200 and Chromium start remain **UNKNOWN**. Phase Y.7 created no credential and performed no real staging A–E test. The runner now reports creation, access, browser, revocation-request and confirmation states separately; deterministic mocked lifecycle tests cover delayed propagation, active and unknown states, cleanup and redaction. Assumption 8 remains **OPEN**. A new real bypass attempt requires separate authorization.

### Phase Y.9 — offline Vercel bypass request correction

The [Phase Y.9 audit](audit/phase-y/STAGING-BYPASS-Y9.md) compares the Y.8 HTTP 400 request with the current official Vercel OpenAPI contract. The former 43-character base64url candidate violated the required 32-character alphanumeric `generate.secret` pattern. The original 400 response body is missing, so its precise Vercel error remains **UNKNOWN**. The test-only runner now generates and validates the documented shape and records sanitized HTTP-error diagnostics without secret values. A rejected creation and cleanup HTTP 404 followed by zero entries and old/anonymous HTTP 302 is **NO_ACTIVE_BYPASS_OBSERVED**, not proof of successful revocation. No new bypass or browser A–E acceptance was attempted in Y.9. `FEES_ENABLED=false`, `MAINNET_ENABLED=false`, the Taxlot schema, derivative boundary and Assumption 8 **OPEN** disposition remain unchanged.

### Phase Y-D — staging CSV File-selection diagnosis

The operator-observed synthetic staging fixture passed IndexedDB insertion and reload persistence; the PIT CSV downloaded. D remained **BLOCKED** because the handler found no browser `File` object, and E was not attempted. The exact cause in the operator's Brave session is **UNKNOWN**. The [Phase Y staging audit](audit/phase-y/VERCEL-STAGING.md) records the source trace, targeted tests, and one protected redeployment with visible staging-only File diagnostics and disabled D/E gates. No bypass credential or wallet access was used. The new deployment is READY, but D/E browser acceptance, legacy recovery, real public accounting and derivative support remain outstanding. Assumption 8 stays **OPEN**.

The clean-source release run at `c2d24b44547f59c5481cbd09c35d6bd344fe31bf` passed only after bounding Playwright concurrency with `CI=1`: 231 unit tests, 34 Playwright tests, 127 typechecked files with zero errors, zero warnings and one preexisting hint, 11 static pages, 138 guarded artifacts, build SHA-256 `26c93d99609eafd11c72470f6c254c8cc7679af41ce77c346aa2fd8d49c6b101`. Two prior complete runs each had a different five-second readiness-element timeout at six workers and 33/34 Playwright pass; both failed tests passed individually. All three exact transcripts are linked from the Phase Y staging audit. These local results do not promote D or E to PASS.

The operator later reported real protected-staging Step D **CSV VERIFIED** with an actual 183-byte `pit-taxlot.csv` File: one `trade` row, WETH `0.005`, USDC `10.25`. The harness's D success path validates the stored event schema and requires exact selected-file equality with PIT's CSV serializer. Operator-reported Step E returned `PASS — synthetic fixture cleaned; stores empty` for the original fixture ID, with zero preexisting and remaining PIT records. The [Phase Y staging audit](audit/phase-y/VERCEL-STAGING.md) records provenance and exact limits. Post-reload absence remains pending a separate read-only operator check; full A–E acceptance is not yet claimed. Assumption 8 remains **OPEN** regardless of this synthetic result.

### Phase Y-F — post-cleanup absence gate

The operator's post-cleanup B result, `BLOCKED: fixture or store state differs; no cleanup performed`, is the expected output for empty stores because B requires the fixture to exist; it is also compatible with corrupted or unrelated records, so it is not deletion proof. A single staging-only F button now uses PIT's real IndexedDB connection in a readonly transaction and requires the exact original fixture ID, zero matching fixture entries and zero records in the three PIT stores. It reports present fixture and unrelated records as separate FAIL outcomes, and missing ID, missing database or storage-read errors as BLOCKED. Nine targeted Playwright tests pass, including the full synthetic A→F sequence and negative cases. Deployment `dpl_84ZVhZw7g4M21xSFtvX3kx32M9nN` is READY on the protected stable alias with uploaded addendum hashes matching the local candidate. The operator then reloaded the original fixture URL and reported F **PASS** with the exact ID, `events: 0`, `raw: 0`, `meta: 0`, and `readOnly: true`. This completes operator-observed **synthetic** staging A–F acceptance, including post-reload absence. It is not an independently controlled browser run or real trade/tax acceptance. The earlier two unrelated Playwright timeout transcripts remain preserved in the [Phase Y audit](audit/phase-y/VERCEL-STAGING.md). Assumption 8 stays **OPEN**.
