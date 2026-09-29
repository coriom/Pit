from pathlib import Path
root=Path('docs/audit/phase-f')
header='''# Phase F verification — 2026-09-29

Audit target: `c65a14e76a09f4507e7669aed605996e71650d30`. A–E are reachable; the exact repository check appears below. The initial interactive `git status --short` was empty. The captured repository check ran after creating audit scripts/logs and accurately lists those untracked additions.

**Result: 19 unit tests and 5 Playwright tests pass; typecheck has 0 errors/warnings/hints; two production builds are byte-identical. One conditional medium shared-origin IPFS storage finding remains OPEN. No live testnet execution or launch acceptance is claimed.**

- [Security result, fee/network proof, CoW/Hyperliquid SDK evidence, Taxlot persistence, secret-history scope and blockers](audit/phase-f/SECURITY.md).
- [Every assumption disposition](../ASSUMPTIONS.md).
- [Numbered application/SDK source and FEES_ENABLED uses](audit/phase-f/source.txt).
- [Initial redacted secret candidates](audit/phase-f/secrets-initial.txt), [reviewed scan](audit/phase-f/secrets-reviewed.txt), [final scan](audit/phase-f/secrets-final.txt), [public-pattern classifications](../scripts/audit/public-patterns.json).
- [Full first build manifest](audit/phase-f/build-1.manifest.json). Build comparison recomputes all 122 artifact digests and checks the regenerated validator against Phase E.
- [First Playwright startup failure](audit/phase-f/playwright-sandbox-failure.txt): sandbox web server exited 1. Authorized retry outside the sandbox passed. All browser requests outside localhost are blocked unless explicitly fulfilled by a fixture. No real wallet or API execution occurs.
- [Intermediate typecheck failure](audit/phase-f/typecheck-initial-failure.txt): a newly added SDK-order-helper test omitted required token-decimal type fields. The test fixture was corrected and both unit tests and typecheck rerun successfully.

The only changes are audit documentation/scripts/tests. Application configuration, schema semantics, fee recipients/rates, hosting/deployment and legal gates remain unchanged. `FEES_ENABLED=false`, `MAINNET_ENABLED=false`; current integrator revenue is zero. No `.env.local` was created or requested.

No on-chain transaction/order ID, live fill or live acceptance screenshot exists for this phase. Browser screenshots in `test-results/` are disposable offline UI evidence; older tracked `docs/*.png` were not overwritten. They do not establish live execution.

NOT VERIFIED — Quote the exact output of `node scripts/live-e2e.mjs` after a separately handled funded testnet session. Actual CSV reconciliation and Taxlot importer acceptance remain open; the current tests prove schema/write/export behavior only. The MiCA/PSAN legal opinion remains a prerequisite for any mainnet activation.

## Exact command outputs

The following blocks copy captured combined stdout/stderr without summarization. Each log includes its exact invoked command and an added exit-code footer. Timings, terminal escape sequences, trailing spaces and environment warnings are retained. Consequently generic whitespace checks report intentional whitespace in these quoted logs. No elapsed duration is represented as deterministic.

'''
parts=[header]
for title,name in [('Repository, phase reachability and schema provenance','repository.txt'),('Unit tests','unit.txt'),('Playwright tests (authorized localhost/browser retry)','playwright.txt'),('Typecheck','typecheck.txt'),('Production build 1','build-1.txt'),('Production build 2','build-2.txt'),('Reproducible build and validator comparison','reproducible.txt')]:
 parts.append(f'## {title}\n\n[Raw output](audit/phase-f/{name})\n\n```text\n'+(root/name).read_text()+'```\n\n')
Path('docs/VERIFICATION.md').write_text(''.join(parts))
