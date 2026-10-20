# Phase AO release decision

**Current status: checkpoint clean-commit release gate PASS; final evidence-commit rerun PENDING.** No merge or deployment is authorized by this result.

The local feature branch started clean at `ebf09c74dd35da61606cb023775558d680620c03`; independent GitHub readback confirmed the same feature HEAD and protected `main` at `878b334dd34f50180733908b76942733054bd8df`. The change is bounded to numerical validation, adversarial-input hardening, beta CSS isolation, browser/security regression and this audit. No new tool, execution capability or deployment was created.

| Decision | Current state | Required next evidence |
| --- | --- | --- |
| Local feature integration | Provisionally READY FOR MERGE REVIEW; do not merge automatically | Final clean-commit release rerun and independent branch push/readback |
| Hosted public beta | **NO-GO** | Separate operator authorization, authenticated hosted HTTP/browser QA, legal/privacy/accounting-origin review, Assumption 8 resolution, review of six surplus CSP hashes before changing beta bytes |

The existing `pit-prod` deployment `dpl_GJ89unyGhLJxY2MvHsDmVYx6wMzF` was neither accessed with an authenticated session nor changed. The protected full-test staging and main branch remain outside AO. A passing local build cannot establish public accessibility, hosted response headers or financial/legal release approval.

The final report will preserve the final feature commit, independent remote hash, 0/0 divergence, clean `git status --short`, exact unit/Playwright/type/build totals and package SHA. If any final gate fails or cannot be completed, local integration is **NO-GO** and the precise failing stage remains in the audit.

The first clean-tree gate on checkpoint `734c62f4e78cc94238fd6a898ff42b26af20d4ee` stopped during the tracked-file credential-pattern scan, before tests. The trigger was the public ERC-20 `Transfer` event topic written contiguously in the Phase AN audit and its golden test; no secret was exposed or inferred. AO preserved the exact vector as two explicitly concatenated halves in both locations. The credential guard was not weakened. This correction requires another clean commit and full rerun.

The second gate on clean commit `56146346ac8a10dca458c2b03aeb4ee921c778a3` exited **PASS**: 446/446 unit tests, Astro typecheck 279 files with zero errors and one existing hint, 29-page build SHA-256 `c0c4913c1eef476b85e252807ac203d6ed9df5e9366b85744d2929051797ffe0`, static-artifact and noindex guards, 11-file beta SHA-256 `f2907ac694594531e16ab5501e3be7d066edf98f528553f2bf2164dde725a425`, beta source-contamination fixture, and **83/83 Chromium Playwright tests**. This evidence update is itself a tracked source change, so a third clean-commit full run is mandatory before push. It must not be represented as complete until its final exit is recorded.

The exploratory full Firefox suite passed once at 82/82 with one Chromium-only performance case skipped before the final numerical guard. Two later complete Firefox runs on the hardened build each had **one** 30-second timeout in a different staging-accounting CSV export test (81 passed, one failed, one skipped). Both failures occurred after clicking Export before asynchronous Create had reached its `CREATED` state. An isolated rerun passed; then AO added the explicit state wait already present in neighboring tests, and ten repeated Firefox cases passed. No Taxlot application code or stored records were changed. The subsequent complete Firefox suite passed **82/82**, with only the Chromium-specific CPU-throttle test skipped. The two failed runs remain recorded as pre-fix evidence.
