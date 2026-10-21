# PIT Toolbox V1 task catalogue

The canonical, machine-readable inventory is [PIT-TOOLBOX-V1-TASKS.json](./PIT-TOOLBOX-V1-TASKS.json). `node scripts/release/local-task-inventory.mjs --check` verifies that it matches the reviewed TypeScript registry, and `pnpm toolbox:check` includes that check.

## Scope and counting

- **95 task experiences:** six existing single-purpose local pages and 89 new stable `/tasks/{id}/` pages. The 89 comprise 47 preselected calculation modes and 42 narrower questions that emphasize a distinct output of a reviewed mode. A question and its narrower result are separate catalogue tasks only when a user can meaningfully seek that result on its own. They share one calculation implementation.
- **20 original workspaces** remain at their stable `/tools/{id}/` routes. Fourteen multi-mode workspaces are not counted again as separate task experiences. There are no genuinely new financial engines in this campaign; the 20 existing local engines/components are reused. The full application still has 25 registered top-level tools. The task registry is a separate, build-time reviewed local catalogue, not a new executable dispatch registry.
- Category counts: Portfolio & performance 16; Costs & conversions 8; Lending & debt 17; Liquidity mathematics 13; Yield & growth 8; Trade & execution 13; Staking & vesting 14; Data inspection 6.
- An earlier estimate of roughly 102 grouped operations was not an inventory of individually accessible tools. The JSON inventory records each task's question, input schema field names, output, engine, route, status and limitation. It currently has zero pending entries; that is a catalogue completion claim, not public-release approval.

## Product and isolation

The homepage keeps three flagship starting points and links to task categories. The catalogue defaults to the 20 workspaces to avoid a wall of cards; search covers all pages, and users can switch to focused tasks, all entries or a task category. Every task URL preselects the reviewed existing interface and links back to its workspace and sibling questions. Focused-result pages display an existing result field prominently as inert text; they do not recalculate or change an engine. CSV normalization and deduplication still require an explicit inspect and confirmation step. Original examples, error states and local downloads remain in their existing components.

The private static build has 113 HTML pages: homepage, catalogue, privacy and site-information notices, 20 workspaces and 89 tasks. The package guard requires an explicit route/file allowlist, one CSS asset, zero JavaScript chunks, exact hashes for executable inline scripts, noindex, `connect-src 'none'`, and no wallet, RPC, execution, Taxlot storage or telemetry code. The historical six-tool beta has a separate source tree and is not changed by these routes. Neither candidate is deployed by this campaign.

## Honest limits

Task pages reuse full multi-mode component markup; the selected task is shown first, but this approach increases static HTML size compared with a purpose-built small form. It preserves tested calculations and avoids copying financial logic. The 42 focused pages highlight a distinct user question within a broader calculation, rather than representing 42 new engines. Manually entered assumptions are not market data or advice. Some results require complete fee, valuation or history coverage; an unavailable field remains unavailable. The legal/privacy placeholders still need operator-provided publishing details before any public release. Protected hosted QA, Safari acceptance and public authorization are outside this campaign.

## Validation boundary

During implementation, targeted local-toolbox unit tests, TypeScript/Astro checking, deterministic private-package checks, frozen-beta verification and Chromium/Firefox static-page smoke tests were used. The final full `CI=1 pnpm release:check` must run against a clean committed source tree before protected QA deployment is considered. Local browser and build results do not prove live hosted security headers or authenticated access.
