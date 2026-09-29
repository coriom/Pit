# Phase J — release and execution safety

Baseline: `3f54b7a4e1078ddc389f97d4e1e0204402e5754a`. This phase runs no live execution or deployment and changes no fee flags/rates/recipients, upstream schema, derivative semantics, origin allowlist or legal gate.

## One shared preflight

`src/lib/execution-preflight.ts` owns the ordered typed predicates and operator messages. `executionPreflight` rejects fee activation, mainnet enablement, disconnected wallets, protocol environment mismatches and unsafe storage in a deterministic order. It never treats a network's display label as evidence. Protocol-specific inspectors gather fresh facts from the connected wallet/public protocol API; failed or unknown reads fail closed. The UI maps unclassified read failures to `READ_FAILED` while the execution call rejects the original error.

`inspectCow` verifies cached and live wallet chain, current account, actual writable accounting storage, two distinct deployed ERC20 contracts and decimals, deployed pinned settlement/relayer, sell balance and ETH. Approval additionally requires twice estimated gas × current gas price when allowance is insufficient. Contract presence is not a bytecode authenticity proof; the connected wallet RPC remains a trust dependency. API quote acceptance is required before any signing control can appear. Token names or “testnet” strings grant no permission. No fixed token-symbol allowlist claims that arbitrary contracts are economically safe.

`quoteSwap` retains SDK signing/submission capabilities in a private WeakMap; the returned quote exposes helper results and display metadata only. `approveSwap` and `submitSwap` rerun `inspectSwap` (fresh protocol preflight plus quote lifetime) before SDK execution. The UI no longer invokes an unguarded SDK post closure. Displayed fees/minimum receive still use the exact quote's SDK amounts-and-costs helper; fee math is unchanged. Approval's allowance read is followed by another preflight before approval.

`inspectPerp` independently verifies the actual Hyperliquid transport's `isTestnet`, exact API base and exact RPC base before reads and again before execution. It checks wallet account, writable storage, market/precision, full limit-notional collateral for opening orders, and position direction/size for reduce-only orders. No leverage mutation was added. `placePerp` calls this inspector before reaching ExchangeClient; the exchange factory also checks the release invariants. Fees true prevents even the formerly enabled builder-approval path. Disabled-fee requests omit builder fields. Transport redirects are errors.

`useExecutionPreflight` calls the same inspectors for signing controls, binds results to current inputs, polls every five seconds, serializes reads and expires facts after ten seconds measured from read start. Input/account changes invalidate the result; failed/hung checks cannot silently remain GREEN. The execution functions always recheck regardless of UI state. Reads such as requesting a quote can remain enabled; signing/submission cannot. Preflight is a point-in-time check, not an atomic lock on external balances or wallet state. The wallet must still enforce each transaction/typed-data domain, and the operator must inspect every prompt.

## Exact network matrix

| Protocol / identifier | Result |
| --- | --- |
| CoW Ethereum Sepolia 11155111 / 0xaa36a7 | Accepted only with every other predicate GREEN |
| CoW Base Sepolia 84532 / 0x14a34 | WRONG_CHAIN |
| CoW Ethereum mainnet 1 | WRONG_CHAIN |
| CoW Base mainnet 8453 | WRONG_CHAIN |
| CoW Arbitrum mainnet 42161 | WRONG_CHAIN |
| CoW any unknown ID, including 0 and 999 | WRONG_CHAIN |
| CoW exact Sepolia URL with wrong settlement or relayer | COW_CONFIGURATION |
| Hyperliquid isTestnet true + https://api.hyperliquid-testnet.xyz + https://rpc.hyperliquid-testnet.xyz | Accepted only with every other predicate GREEN; independent of wallet EVM chain |
| Hyperliquid isTestnet false, mainnet API/RPC, suffix-lookalike, trailing or alternate URL | HL_CONFIGURATION |
| Either protocol, FEES_ENABLED true | FEES_ENABLED |
| Either protocol, MAINNET_ENABLED true | MAINNET_ENABLED |
| Either protocol, no wallet | DISCONNECTED |
| Either protocol, unsafe/unapproved origin or failed writable-IDB probe | STORAGE_UNAVAILABLE |

CoW SDK `env: prod` is not interpreted as mainnet: the orderbook receives only the explicit Sepolia chain/base URL and the canonical Sepolia contract mapping must match the pinned addresses. Those addresses are documented in the runbook. CoW `orderbook` additionally rejects every other chain independently of optional config flags.

## Deterministic release check

`pnpm release:check` runs `scripts/release/check.mjs`. It requires a clean Git tree at both start and finish, forbids a `PIT_E2E_URL` alternate target, rejects local environment files except the exact pinned `.env.example`, and rejects secret-named PIT/PUBLIC environment variables without printing values. `scripts/release/protected.json` pins SHA-256 identities of fee/network config, exact Taxlot schema, origin policy/allowlist, public env example and legal page. The pinned files remain byte-identical to Phase I.

The tracked-file scanner rejects environment/credential filenames, private-key headers, common token formats, credential assignments/URLs/query parameters and 0x-prefixed 256-bit candidates. It scans tracked text including docs. Binary content, encoded/split secrets, arbitrary passwords and unlabelled unprefixed secrets are not exhaustively classified; a pass is not mathematical proof of absence and does not replace review or historical Phase F evidence. It does not print secret values or alter Git history. No new credentials were introduced.

Required commands run sequentially and abort on any nonzero exit: `pnpm test`, `pnpm check`, `pnpm build`, then `pnpm test:e2e` against that production artifact. Output timing/process IDs/build durations are naturally variable; pass/fail rules and fixed inputs are deterministic. There is no skip-tests, force, dirty-tree or fake-pass option. Unit mutation tests establish protected-file, env-file and secret-candidate refusal. Browser tests use offline responses and injected keyless providers; real signing is never performed.

To capture a clean-tree run while delivering one phase commit, the implementation/runbook are committed first; release output is captured outside the repo. Only audit evidence/docs are then amended into that same commit. The recorded clean source revision identifies the tested code. The final amendment changes no executable files; its code/tree identity is checked separately. A future operator should rerun `pnpm release:check` on the final checkout.

## Evidence and scope

[Exact release output](release-check.txt) is quoted in [VERIFICATION.md](../../VERIFICATION.md). Tests include the accepted Sepolia provider path; rejected Base Sepolia/mainnets/unknown chains; changed chain/balance after a quote; absent wallet; bad endpoints/contracts; fees true; unsafe origin; actual Hyperliquid request without builder; and Phase I accounting isolation. The former fee-enabled builder-path test now proves that activation cannot reach approval/order in this release.

Changed implementation: `execution-preflight.ts`, `cow.ts`, `hyperliquid.ts`, `Swap.tsx`, `Perps.tsx`, `useExecutionPreflight.ts`; release tooling under `scripts/release/`, package command, new execution/release tests and browser preflight tests; runbook, assumptions, README and verification evidence. Existing fee-math and accounting tests remain.

Assumption 8 stays OPEN. Funded external accounts, operator signatures, real order/fill evidence, live accounting reconciliation, future derivative normalization and actual dedicated-origin acceptance remain outstanding. No release check can substitute for those acceptance steps or satisfy the legal gate.

Final verified totals: 75 unit tests across 14 files; 14 offline Playwright tests; typecheck 52 files with zero errors/warnings/hints; production build 3 pages. The clean tested revision and all non-documentation file hashes are in `tested-source.json`. `dirty-tree-refusal.txt` proves nonzero dirty-tree rejection; `release-initial-test-failure.txt` proves a failed required test stops the release command. The final clean run is `release-check.txt` (exit 0).
