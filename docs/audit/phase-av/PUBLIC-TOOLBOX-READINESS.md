# Phase AV — isolated toolbox public-beta preparation

Status: **protected candidate prepared; public release NO-GO**. This phase changes source and local build packaging only. It does not deploy, alter Vercel Authentication, assign a domain, invite users, or authorize indexing.

## Product and artifact

The separate local-toolbox entry tree still selects exactly the 20 reviewed, wallet-free tool IDs. The private host package now has 24 HTML pages: home, catalogue, 20 tools, privacy and site information. The two notices describe manual assumptions, no advice or transaction capability, browser-local inputs, downloads, and ordinary host request metadata. Navigation exposes both notices on home, catalogue and local-tool pages. Home, catalogue and tool pages retain the existing PIT visual language; mobile navigation wraps, and home/catalogue/notices expose a keyboard skip link. No calculator or financial formula changes.

The current `pnpm toolbox:check` command explicitly builds the **private** candidate: `noindex,nofollow` on every page, `X-Robots-Tag: noindex, nofollow`, disallowing `robots.txt`, no sitemap and no canonical URL. The package's `vercel.json` still selects only `public/`, has no rewrites/functions, and sets an exact inline-script-hash CSP with `connect-src 'none'`, `frame-ancestors 'none'`, HSTS, nosniff, no-referrer, DENY framing and restrictive permissions. Its route/file allowlist rejects added trading, wallet, RPC, Taxlot and telemetry artifacts. No source path from the full application is copied into the package.

`pnpm toolbox:public:check` is a **future, non-deploying** packaging command. It requires an explicit public-build mode, `PIT_TOOLBOX_PUBLIC_RELEASE_APPROVED=yes`, and an exact HTTPS origin. It would add canonical URLs, a 22-URL sitemap (home, catalogue, 20 tools), an allow-all `robots.txt`, and indexed page/header metadata while still keeping privacy and site-information routes accessible. The package guard currently **rejects** public packaging because both notices retain `data-publication-pending` markers. The environment variable is a build guard, not proof of operator authorization. Replacing the notices with verified operator facts, reviewing the public origin and headers, and obtaining a separate public-release decision remain required. The default command cannot accidentally select public mode.

The historical six-tool host package remains byte-for-byte frozen at SHA-256 `f2907ac694594531e16ab5501e3be7d066edf98f528553f2bf2164dde725a425`. It has not been redeployed or updated. The new 20-tool package has its own hash and will require separate review before any public deployment.

## Privacy, legal and plan boundaries

Operator must supply and approve the publisher's legal name/status, a working contact and privacy channel, applicable jurisdiction, any required postal/registration/consumer notice, and verified hosting-log retention and deletion-request details. No identity, address, retention period or legal conclusion is invented. The privacy notice correctly distinguishes local form/CSV processing from host-visible HTTP metadata and Vercel Authentication cookies during protected QA.

Vercel's current [Hobby plan description](https://vercel.com/docs/plans/hobby), [fair-use guidelines](https://vercel.com/docs/limits/fair-use-guidelines), and [terms](https://vercel.com/legal/terms) restrict Hobby to personal, non-commercial use. The operator must establish that the intended public site's ownership, promotional purpose and potential future monetization fit those terms or separately approve an appropriate paid plan; this phase authorizes no upgrade or charge. A public beta need not involve transactions to raise a plan or consumer-claims question. Actual hosted headers, accessible notice text, domain, TLS, and browser behavior of a future public deployment remain unverified.

Assumption 8 remains **OPEN** for its historical PIT accounting/public-origin and legacy-record criteria. This isolated static package has no Taxlot/accounting storage, wallet, RPC or transaction surface, so those specific accounting acceptance criteria do not logically block the *local calculator calculations*. This is a scope assessment, not closure of Assumption 8 or waiver of public privacy/legal review.

## Validation and decision

Targeted checks established that private packaging remains noindex, the published route list is confined to the 20 local tools, and a public build with a test-only origin fails closed on the pending legal notice. Focused local Chromium and Firefox tests passed 6/6 each against the emitted private package; these are not hosted acceptance. Five targeted unit tests passed, and `pnpm check` reported 291 files, zero errors and zero warnings. No network, wallet or accounting-store requests were observed in those browser tests. The protected Production and Preview deployments were not changed.

| Decision | Status | Reason |
| --- | --- | --- |
| Local protected candidate | GO after final clean-commit tests | Separate static tree and exact host package guards. |
| Future public release | NO-GO | Publisher/privacy facts and review, Hobby use classification, final approved origin, public artifact review, hosted HTTP/browser QA, and separate release authorization remain. |

The final clean-commit `CI=1 pnpm release:check` result and package hashes are reported with the Phase AV delivery, which identifies the tested commit. This document itself does not claim a hosted or public deployment.
