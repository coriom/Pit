# PIT Apple Design review — implementation reference

The earlier review identified the concrete issues below. Its documentation-only
commit (`22311c8368990600f955f9aed3676bb93c2d6e85`) is unavailable in this
checkout, so this file records the findings supplied for implementation; it is
not presented as a recovered copy of that commit. The product and repository
remain the source of truth.

| Priority | Component | Observed issue | Correction |
| --- | --- | --- | --- |
| P1 | Unified directory | `risk calculator`, `erc-20 creator`, and `wallet balance` returned no results despite relevant tools. | Normalize and tokenize catalog metadata; add terminology matches and deterministic relevance ranking. |
| P1 | Token Creator forms | Checkboxes were oversized, and Standard showed advanced cap and roles. | Native sized controls and preset-specific, disabled fields in local paid, local direct and bounded testnet-preview entry points; clear hidden values on switch. |
| P1 | Surface navigation | Toolbox Home and wordmark returned to Toolbox instead of the unified PIT homepage. Explorer navigation also differed. | Shared global destinations in the integrated build, with truthful isolated-build labels. |
| P1 | Hosted availability | Read-only staging offered a prominent wallet connection action and described a local creation flow before explaining it was unavailable. | Build-aware wallet and operation copy; explicit preview availability before details. |
| P2 | Touch and motion | Open, navbar search, and wallet controls had hit areas around 30–38 CSS px; primary text faded on initial reveal. | Raise key controls to 44 px and make primary text readable on the first frame. |

## Design principles applied

The installed `apple-design` skill from
[`emilkowalski/skills`](https://github.com/emilkowalski/skills), reviewed at
`f1090bec277140d02ed202440185ad9d02ac1490`, emphasizes clarity,
immediate response, purposeful and interruptible motion, user control,
familiarity, responsibility, and craft. For PIT this means quick tool discovery,
predictable form state, truthful transaction availability, visible focus and
comfortable controls, while preserving the current dark brand and category
colors. It does not imply Apple certification or native-app conventions.

## Validation limits

These findings came from the prior design review and were reproduced against
the local source in the implementation campaign. The original review evidence
directory and commit are not present in this checkout. New local browser
evidence belongs to the implementation campaign. Authenticated Cloudflare
staging was not accessed, bypassed, or modified.

## Local before and after evidence

The before images were rendered from `b9b6652d7a9d91c994f35700a784a2660c103e9e`
in a separate local checkout. The after images were rendered from the
implementation branch. The hosted Cloudflare deployment was not inspected.

| Correction | Before | After |
| --- | --- | --- |
| Search | [No risk-calculator result](evidence/apple-before-search.png) | [Ranked results](evidence/apple-search-after.png) |
| Standard form | [Advanced fields exposed](evidence/apple-before-standard-form.png) | [Standard fields only](evidence/apple-standard-form-desktop-after.png) |
| Advanced form | [Oversized checkboxes](evidence/apple-before-advanced-form.png) | [Scoped permissions](evidence/apple-advanced-form-desktop-after.png) |
| Global navigation | [Toolbox header](evidence/apple-before-toolbox-nav.png) | [Integrated return route](evidence/apple-global-nav-after.png) |
| Hosted availability | [Creator preview](evidence/apple-before-hosted-operation.png) | [Unavailable wallet and preview copy](evidence/apple-hosted-wallet-after.png) |
| Mobile controls | [Previous header](evidence/apple-before-mobile.png) | [Current mobile menu](evidence/mobile-navigation.png) |

Screenshots establish visual states. Browser assertions separately verify
search results, navigation destinations and back behavior, form submission
state, read-only availability, touch targets and reduced motion. The local
paid-operation browser test executes Standard and Advanced creation against
Anvil and reads contract state after confirmed receipts.
