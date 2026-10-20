# Phase AR — isolated 20-tool static candidate

This is a **local build candidate**, not a deployment or public release. The protected six-tool beta, `pit-prod`, and `pit-testnet-staging` remain separate.

## Scope and inventory

`pnpm toolbox:check` builds only `src/local-toolbox/` with `astro.local-toolbox.config.mjs`, prepares `dist-local-toolbox/`, and packages `dist-local-toolbox-host/`. The host package has `vercel.json` at its root and `public/` as the sole static output directory. The root PIT Vercel configuration still points to the full `dist` output. Its CSP hash pins were refreshed because the metadata isolation changed the full application's inline script bytes; all non-hash directives and security headers were preserved. It does not point to or publish the new toolbox.

The reviewed routes are `/`, `/tools/`, and exactly these twenty tool routes:

| Task | Routes |
| --- | --- |
| Portfolio & performance | `/tools/portfolio-exposure/`, `/tools/portfolio-rebalance/`, `/tools/performance-drawdown/`, `/tools/pnl/`, `/tools/trade-risk/` |
| Costs & conversions | `/tools/swap-cost/`, `/tools/bridge-cost/`, `/tools/execution-math/`, `/tools/token-fee-converter/` |
| Yield, debt & schedules | `/tools/yield-growth/`, `/tools/staking-rewards/`, `/tools/vesting-unlocks/`, `/tools/collateral-health/`, `/tools/borrowing-cost/`, `/tools/liquidation/` |
| Liquidity mathematics | `/tools/amm-pool-math/`, `/tools/concentrated-liquidity/`, `/tools/impermanent-loss/` |
| Data inspection | `/tools/evm-data-inspector/`, `/tools/crypto-data-workshop/` |

`LOCAL_TOOL_IDS` is the source-entry allowlist; a separate packaging allowlist checks every emitted route. `localToolById` shares local metadata with the full registry so inline pure calculators no longer bundle the full registry's wallet and execution metadata. Existing financial engines are reused without formula changes. The local-only `ToolLayout` mode limits navigation and related tools; the EVM page suppresses its live-allowance link in this candidate. The full application and its existing routes retain their prior behavior.

## Static and privacy boundary

The candidate contains 22 HTML pages, `robots.txt`, and one 13,828-byte CSS asset: 24 served files, 734,442 served bytes. The host package adds only `vercel.json` and a non-served per-file SHA-256 `manifest.json`: 26 package files. There are no JavaScript chunks, source maps, remote scripts, redirects, rewrites, functions, wallet SDK bundles, RPC clients, Taxlot storage modules or analytics assets. Calculator code is an inline, CSP-hashed browser script per applicable page. The catalogue's local search script is also hashed.

The stylesheet composes the reviewed fixed base CSS and small local/scoped styles without Tailwind's global source scan. The separate six-tool host package retains SHA-256 `f2907ac694594531e16ab5501e3be7d066edf98f528553f2bf2164dde725a425` after `pnpm beta:check`.

The new host configuration has `connect-src 'none'`, `default-src 'none'`, exactly the hashes of its 19 executable inline scripts and actual inline style blocks, `frame-ancestors 'none'` in the HTTP CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, a short host-appropriate HSTS policy, and restricted permissions. The build rejects unexpected files, routes, resource URLs, network/wallet/storage calls in executable scripts, changed host settings, or a manifest/copy mismatch. It does not rely on route hiding in the full application.

The local candidate hash is `030653993dc3bf0c3aec3ea4994691929c8e88be4d3ec4a8914e4b3d77edede8`; the reviewed new host-package hash is `c17eb13dfdcdd5f9422b5be61a55d8b5563215da21e72742101eab754d715c5a`. These hashes describe local bytes, not a hosted response.

## Validation and limits

Targeted unit checks verified the twenty IDs, metadata parity and exactly-once task grouping. Focused Chromium and Firefox runs each passed five tests against the emitted package: all 22 routes, five excluded-route 404s, CSP blocking of injected script, local search/filter/keyboard/mobile use, flagship examples, incomplete portfolio coverage, CSV preview, JSON downloads, EVM/CSV examples, network/wallet/accounting-storage denial, and rejection of an added execution route or weakened host configuration. The earlier Chromium test fixture incorrectly paired a missing price with a timestamp; it was corrected to an explicitly unpriced row. Firefox initially lacked the pinned browser binary; it was downloaded to `/tmp`. A sandbox loopback `EPERM` required the permitted local-process test run. Neither issue was an application defect.

`CI=1 pnpm release:check` now includes `pnpm toolbox:check` before the full Playwright suite. Final committed-source release evidence belongs to the Phase AR completion report and must be obtained before the branch is published.

The first clean-commit release attempt could not spawn Git under the sandbox (`spawnSync git EPERM`). Repeating the same gate with local-process access reached the full-build artifact check and failed because the pinned root CSP contained the old pure-tool script hashes. The generated full-build CSP was compared against the root policy: only script hashes differed. The root pins were updated without changing policy directives or the full-build output directory. The complete release gate must be rerun on the final committed source.

The artifact is intended only for a separately authorized, protected QA deployment. Actual Vercel headers, authentication and browser behavior are **NOT VERIFIED** by these local tests. Public release remains **NO-GO**: Assumption 8, legal/privacy review and hosted acceptance are unresolved. No wallet, transaction, mainnet or PIT fee capability is enabled.
