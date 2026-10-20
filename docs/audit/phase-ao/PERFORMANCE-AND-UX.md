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

At the exploratory build, the full static directory was 4.4 MiB and the frozen beta host package 212 KiB. The largest full-app JavaScript chunks were wallet 905,138 bytes, core 471,574 bytes and a dependency index 398,948 bytes; those chunks belong to the full application, not the isolated beta. The beta has no JavaScript chunks and one 13,828-byte CSS asset. Its local browser run loaded only allowlisted pages/assets and calculated with CSP-hashed inline scripts.

Small usability hardening in this phase is limited to explicit validation feedback for unsupported concentrated-range precision and for noncanonical ABI words. The other interfaces and financial engines retain their established sample-first, one-mode-at-a-time presentation. No tester feedback was invented, no invitation was sent, and hosted/mobile Safari acceptance remains a separate task.
