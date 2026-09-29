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

