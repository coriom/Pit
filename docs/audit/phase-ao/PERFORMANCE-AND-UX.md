# Phase AO performance and usability evidence

The 25-entry toolbox remains task-oriented: twenty browser-local calculation/inspection pages, three read-only or wallet/accounting-dependent surfaces, and two separate testnet execution pages. Existing registry-driven route, category, search and related-link tests are retained. No new tool or design system was added. The beta still presents only its six reviewed local calculators.

## Local browser matrix

| Scope | Chromium | Firefox | Provenance |
| --- | --- | --- | --- |
| All 25 full-app routes, title/navigation/noindex and execution labels | PASS | PASS | Local static preview and `toolbox.spec.ts` |
| All 20 local routes without API/external, wallet, IndexedDB or Web Storage calls on load | PASS | PASS | Local static preview, `ao-local-catalogue.spec.ts` |
| Eight beta pages, four excluded-route 404s, CSS rendering and CSP injection rejection | PASS | PASS | Local host-package server using generated response headers, `ao-beta-isolation.spec.ts` |
| AMM and concentrated page modes, mobile keyboard use and JSON | PASS | PASS | Focused local `am-tools.spec.ts` |
| EVM/CSV examples, malformed input, preview, normalization, deduplication and downloads | PASS | PASS | Focused local `an-tools.spec.ts` |
| Authenticated `pit-prod` HTTP/browser behavior | NOT VERIFIED | NOT VERIFIED | No approved authenticated automation session in this campaign |
| Safari or mobile WebKit | NOT VERIFIED | NOT VERIFIED | A local pinned WebKit binary was downloaded to `/tmp`, but launch stopped before page execution because host libraries are missing; no privileged libraries were installed |

The first Firefox attempt stopped before page execution because Playwright's pinned `firefox-1509` executable was missing. The exact matching browser was downloaded to a temporary `/tmp` cache without system libraries. The selected 13-case Firefox regression then passed. A subsequent full local Firefox run on the exploratory static build reported 82 passed and one Chromium-only CPU-throttle case skipped; the final committed-build result is recorded in the release decision after rerun.

The WebKit smoke failed **before navigation** with Playwright's missing-host-dependencies diagnostic: `libgtk-4-1`, `libevent-2.1-7t64`, `libgstreamer-plugins-bad1.0-0`, `libavif16`, and `libwoff1`. Safari and WebKit behavior are therefore NOT VERIFIED; AO did not run `install-deps`, `apt`, or any privileged system installer.

Two pre-existing Firefox staging-accounting tests failed in separate full-suite runs while waiting for a CSV download. The page snapshot showed the async synthetic fixture only at `CREATED` after Export was already clicked. Both tests lacked the explicit CREATED wait used by neighboring tests. AO added that state assertion before Export, with no Taxlot implementation or stored-record change. The two tests then passed **10/10** repeated Firefox cases (five runs each). The complete Firefox rerun on the corrected tests passed **82/82**, with the Chromium-only CPU-throttle test skipped, in **1.7 minutes**. Earlier failed runs remain part of the evidence; this fix removes the demonstrated async race, but no browser suite proves absence of all timing flakes.

## Bounded CSV measurement

`ao-csv-performance.spec.ts` used Chromium at a 390×780 viewport with **4× CPU throttling**. The fictional UTF-8 CSV had 250,995 bytes, exactly 1,000 data rows and 30 columns. Timing includes Playwright action/wait overhead and is a measured upper-level interaction duration, not isolated parser CPU time:

| Stage | Measured elapsed |
| --- | ---: |
| Select/upload and initial local parse | 552 ms |
| Inspect and bounded preview | 475 ms |
| Normalize mapped fields | 354 ms |
| Deduplicate | 223 ms |
| Generate/download exact local JSON | 384 ms |

The JSON report was 1,841,867 bytes; the original preview stayed capped at 180 table cells (six rows by thirty columns), so DOM growth did not track the full 30,000-cell input. The test observed zero external or same-origin API requests. These are one machine/emulation sample, not a low-end-device performance guarantee. The current 256 KiB/1,000-row limit remains appropriate; no larger-input claim is made.

An added Chromium CDP `JSHeapUsedSize` snapshot at page load and after each stage measured **1,085,168**, **7,208,744**, **2,784,816**, **4,320,172**, **5,581,908**, and **7,667,816 bytes** respectively on a later targeted 4× run. This is sampled page JavaScript heap, not a peak, retained heap, browser RSS or system memory; the highest observed snapshot was **7.67 MB**. The later run's upload/inspect/normalize/dedupe/export interactions measured **417/347/280/535/185 ms**. The download remained 1,841,867 bytes. No unbounded preview DOM growth or observed runaway heap occurred within the documented limits, but a peak-memory profile on an actual low-end device remains outside this local sample.

Under the full Chromium release suite on checkpoint `5614634`, the same 4× CPU-throttled fixture measured upload **605 ms**, inspect **2,691 ms**, normalize **375 ms**, dedupe **440 ms**, and JSON export **2,219 ms**. This second run shows substantial contention/variance in inspection and download timing; the standalone figures above must not be treated as a latency guarantee. The source remains bounded, and a real low-end-device study is still needed before claiming a responsiveness target.

At the exploratory build, the full static directory was 4.4 MiB and the frozen beta host package 212 KiB. The largest full-app JavaScript chunks were wallet 905,138 bytes, core 471,574 bytes and a dependency index 398,948 bytes; those chunks belong to the full application, not the isolated beta. The beta has no JavaScript chunks and one 13,828-byte CSS asset. Its local browser run loaded only allowlisted pages/assets and calculated with CSP-hashed inline scripts.

Small usability hardening in this phase is limited to explicit validation feedback for unsupported concentrated-range precision and for noncanonical ABI words. The other interfaces and financial engines retain their established sample-first, one-mode-at-a-time presentation. No tester feedback was invented, no invitation was sent, and hosted/mobile Safari acceptance remains a separate task.
