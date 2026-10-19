# Phase AG — composable tool foundation

Status: development-branch candidate based on accepted main `878b334dd34f50180733908b76942733054bd8df`. No public release, deployment, workflow editor or transaction is part of this phase.

## Architecture audit and decisions

- `tool-registry.ts` already owns display metadata, routes, related links, access mode and network requirements. `read-only-beta.ts` has a separate build-time allowlist for six local calculators. Keep both roles; add only a closed opt-in pure calculation contract keyed by stable registry IDs.
- `swap-cost.ts` supplies exact BigInt parsing/formatting, wallet-gas conversion and fee coverage. `bridge-cost.ts` reuses the parser/formatter but has its own route-specific rounding and denomination model. `portfolio-exposure.ts` supplies 18-decimal USD raw units, explicit observation time, CSV limits and group/concentration calculations. The generic PnL, liquidation and impermanent-loss engine uses JavaScript numbers; Phase AG does not silently recast those economics or claim exact-money parity.
- Existing Astro layouts and `CalculatorForm.astro` already provide headings, labelled fields, samples, result/status regions and related links. The larger Swap, Bridge and Portfolio forms need distinct progressive inputs and CSV behavior. A universal schema-driven renderer would duplicate or constrain them. Phase AG adds no UI component and documents the small composition pattern for a later focused UI change.
- Existing exports are tool-specific local JSON (Swap Cost, Bridge Cost, Portfolio) or CSV. There is no need for a generic export engine now. The contract exposes raw values with unit metadata so future reporting can reject incompatible values.
- The gap was a runtime-validated, versioned entry point and a machine-checkable unit boundary between calculators. Phase AG adds that boundary for Swap Cost and Portfolio Exposure without changing their existing pages or engines. Bridge Cost remains a future adapter candidate because its fee/payer/chain output is richer than this pilot contract.

## Security and parity

The v1 runner imports no signing, RPC, wallet, Taxlot, React or Astro module and dispatches only `swap-cost` and `portfolio-exposure`. Trading/read-only registry entries are rejected. It does not access network, filesystem, DOM, localStorage, IndexedDB, randomness or the implicit clock. Portfolio observation time is explicit. Existing financial engines and browser adapters are unchanged. Fee, mainnet and ordinary Uniswap acceptance gates remain false. Manual token labels do not establish same-asset identity.

Targeted tests compare wrapper results with the unchanged engines' full result objects, including the 10-USDC/0.005-WETH Swap Cost case and a manual $2,000 ETH position. They cover malformed shapes, incomplete coverage, duplicate holdings, missing time, unit/version/timestamp incompatibility, chain-scoped identities and the execution allowlist. The regular full Playwright/release campaign is intentionally deferred to AO; this phase runs focused unit, type and relevant static-artifact checks.

## Skills review

Three already available local skill instructions were inspected, with no new installation or permissions change: `property-based-testing` from the local Codex skill directory, Vercel `react-best-practices` at plugin version 0.54.1, and curated `security-diff-scan` at plugin version 0.1.32. The first is useful when later numeric roundtrips/invariants justify domain generators; this phase uses exact golden parity and incompatibility tests with existing Vitest, avoiding a new property-testing dependency. The React guide is not applied because no TSX component is edited. The security scan workflow is too broad for this bounded pure-code change; targeted static inspection and release guards remain in place. No third-party installer or executable skill script was run.

## Open items

The contract covers only two pilot engines. It does not migrate the UI, create a bridge adapter, convert manual labels to verified token identities, connect ports, migrate saved workflows, or validate all nested result fields. Those require separate design/tests in later phases. Existing Assumption 8 and public-beta/legal gates remain open. Hosted authenticated QA remains a distinct prior NOT VERIFIED claim.

## Local validation

- `pnpm exec vitest run tests/pure-tool-contract.test.ts tests/swap-cost.test.ts tests/portfolio-exposure.test.ts`: **36/36 PASS** (8 new contract cases, 28 unchanged engine cases). The initial pre-fix targeted run also passed, but the accompanying typecheck caught an input-array narrowing error; it was corrected before the final run.
- `pnpm exec vitest run tests/unit/read-only-beta.test.ts tests/unit/read-only-beta-host.test.ts tests/unit/static-artifacts.test.ts`: **47/47 PASS**.
- `pnpm check`: **174 files, 0 errors, 0 warnings, 1 preexisting hint** in `scripts/audit/verify-live-setup.mjs` about a possible string `.value` access. The first typecheck attempt had one new narrowing error; the final run passed.
- `pnpm build`: **15 static pages**, noindex policy, build SHA-256 `9aecfcc3a8ba9a0ea03481c24a59db7377e335321272e2190a27bdda9365df1b`. `node scripts/release/artifacts.mjs`: **143 guarded files PASS**. `node scripts/release/discoverability.mjs`: **15 routes, 11 registry tools PASS**. Vite retained its existing pure-annotation/chunk-size warnings.
- `pnpm beta:check` after final source changes: **8 pages, 1 CSS asset, 4 exact CSP hashes**, candidate SHA-256 `951fc927bf07dbb06974b96de5c13734b7edb7b66ec30a6676391ca1c59aa32d`, host-package SHA-256 `f2907ac694594531e16ab5501e3be7d066edf98f528553f2bf2164dde725a425`; **NOT DEPLOYED**. Neither built artifact contained the new contract identifier in a direct text scan.

No Playwright suite or full `release:check` ran in Phase AG, as requested for the targeted-development campaign. Phase AO owns consolidated regression and public readiness. No live-network or hosted-browser evidence was created here.
