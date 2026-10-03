# Phase R — release guard correctness for a public documentation URL

## Baseline and exact reproduction

Before edits:

```text
$ git rev-parse HEAD
30aca93b52151bda11cf670c2f1aad0cd1c36a35
$ git status --short
```

The status command produced no output. `src/lib/config.ts` defines `FEES_ENABLED: false` and `MAINNET_ENABLED: false`; the protected release configuration was not edited. This phase did not change quotes, execution, endpoints, fees, accounting, origin policy, indexing or deployment.

[Phase Q's unchanged initial failure transcript](../phase-q/release-check-initial-failure.txt) ends:

```text
$ node scripts/release/artifacts.mjs
STATIC ARTIFACT CHECK FAILED: Secret-like value in artifact: _astro/Swap.DzbFUzpB.js
RELEASE CHECK FAILED: Required command failed: node scripts/release/artifacts.mjs (exit 1)
```

[The isolated reproduction output](false-positive-reproduction.txt) uses the original literal source field `quoteMarkets[0].sell.source`. [The original rule applied to a one-file artifact fixture](original-guard-fixture.txt) exits **1** with `STATIC ARTIFACT CHECK FAILED: Secret-like value in artifact: _astro/Swap.fixture.js`. The original artifact rule's URL alternative was `https?:\/\/[^\s"']+\/v[23]\/[^\s"']{20,}`. It matched this **entire public URL**, not a credential:

```text
https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments
```

The regex crossed the second path separator after `/v3/`, treating ordinary `deployments/v3-ethereum-deployments` documentation text as an opaque token. The URL is the official [Uniswap v3 Ethereum deployments page](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments), independently opened during this phase. The failed artifact name matches the generated Swap chunk where the manifest source URL appears. No genuine credential was found in this reproduction. The reported issue was a false positive, not evidence of a leak.

## Correction and scope

`src/lib/quote-markets.ts` again stores the **literal** public source URL directly in `quoteMarkets[0].sell.source`. Its Phase Q `new URL(...)` construction and workaround comment were removed. No string splitting, encoding or alternate prefix remains. `scripts/release/artifacts.mjs` now checks independently for:

| Kind | Supported artifact case |
| --- | --- |
| `assignment` | Existing long private/API/access/seed assignment shape |
| `private-key-pem` | Existing PEM private-key header |
| `url-userinfo` | URL containing username:password-like userinfo |
| `url-sensitive-query` | Nonempty API-key, token, secret, password or client-secret query value |
| `url-opaque-version-id` | One 20+-character opaque path segment **directly** after `/v2/` or `/v3/` |

The scanner checks the entire artifact body for every kind; accepting the public URL never removes text or skips a line/file. The `url-opaque-version-id` rule still rejects versioned credential-shaped path segments on **any** hostname, including a lookalike. A public documentation route with `/v3/deployments/...` no longer matches simply because text beyond another slash is long.

**Exception inventory: none.** No trusted hostname, public-value allowlist, source-file exemption or exception configuration was introduced. Consequently there is no exception whose value or context can be changed, and no malformed/overbroad exception configuration input to parse. Tests instead prove that changed opaque values fail in both application artifacts and evidence paths. The existing tracked-file guard remains unchanged and continues to reject unreviewed 32-byte `0x` hex values, including in `docs/evidence.txt`. Phase Q's historical public-hash transformations and transcripts remain untouched.

This is a pattern scanner, not proof that all secrets are absent. It detects the listed shapes and the separate tracked-file guard's credential/hex patterns; it does **not** reliably detect arbitrary obfuscated JavaScript, split/encoded keys, every provider-specific URL path, short path IDs, binary/image-hidden material, or credentials outside the scanned files. A benign long documentation slug directly under `/v3/` can still require review, a deliberate conservative limit.

## Controls and scans

[Exact targeted Vitest output](targeted-tests.txt) shows **37/37** tests passing. New cases cover the original literal in source/built-style JS, a separate credential assignment on the same line, URL userinfo, credential query on the public host, a lookalike host, a nested public URL beside a credential query, changed opaque values in app/evidence artifacts, a private-key-shaped value in tracked docs evidence, and the tracked source URL beside a credential. Existing artifact, CSP, SRI, analytics, mainnet, env-file and protected-configuration negative tests remain passing. Synthetic credential strings are assembled only inside unit tests; no real value or fixture enters the browser bundle.

[The precommit source/artifact scan output](source-artifact-scan.txt) reports the exact source literal present, workaround symbol absent, the literal in the generated `_astro/Swap.DzbFUzpB.js` with `secretKind:null`, and `validateArtifacts` passing for 137 files/11 pages. It also ran the tracked-file guard over 217 then-tracked files; the final clean-tree release check below scans the committed source and all newly tracked evidence. No scanner rule or negative-test expected result was weakened to make that check pass.

## Clean-source release result

The complete **358-line** clean-tree [`pnpm release:check` transcript](release-check.txt) tested source commit `bbb969e7e7c65639d507ae88f878e66174dcf52a`. The production artifact SHA-256 is `48eecaaf4286ad47f7b8782d25bc9bd7564c42ef389a330ebe3344a2ffad6849`, the same value recorded by Phase Q's original scanner-failed build with the literal URL. Exact decisive output:

```text
Clean release source: bbb969e7e7c65639d507ae88f878e66174dcf52a
PASS protected fee/network configuration: FEES_ENABLED=false; MAINNET_ENABLED=false; recipients/rates unchanged
 Test Files  20 passed (20)
      Tests  144 passed (144)
Result (88 files):
- 0 errors
- 0 warnings
- 0 hints
17:42:43 [build] 11 page(s) built in 41.53s
Build SHA-256: 48eecaaf4286ad47f7b8782d25bc9bd7564c42ef389a330ebe3344a2ffad6849
PASS static artifacts: 137 files; 11 HTML pages; 0 external scripts/styles; CSP, SRI, telemetry, secret, source-map and mainnet endpoint guards
PASS discoverability: 11 routes; 7 registry tool pages; 4 local/discovery pages without wallet or protocol JS; indexing policy and sitemap guards
  24 passed (15.9s)
RELEASE CHECK PASS — offline testnet candidate only; no live acceptance or deployment
```

Only this audit document, `docs/VERIFICATION.md` and the release transcript were added/amended after the check. All other tracked files, including configuration, lockfiles, build scripts and public assets, remain byte-identical to tested source commit; the exact path diff is checked in the final report. Network-dependent Phase Q probes were not rerun. Their dispositions remain: browser read-only comparison **PASS as reported in Phase Q**, CLI probe **BLOCKED** by its Node/RPC transport, live execution **NOT PERFORMED**, and dedicated public-origin acceptance **OPEN**. Phase H still needs funded external testnet accounts and operator-approved signatures; Hyperliquid derivatives remain `unsupported_derivative_v1`; the legal mainnet fee gate remains closed.
