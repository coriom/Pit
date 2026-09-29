from pathlib import Path
import subprocess
root=Path('docs/audit/phase-g')
text='''# Phase G verification — storage origin isolation

Baseline: `079abb7dabe48c5c0e42ec557c22f923f8ed644c`. **24 unit tests, 8 Playwright tests, typecheck and production build pass.** Production accounting is disabled until a dedicated HTTPS origin is explicitly reviewed and configured. Shared IPFS/IPNS paths cannot use PIT accounting persistence or CSV downloads. Existing records are preserved.

[Full attack reproduction, invariant, implementation, tests, hosting/CSP matrix and remaining blockers](audit/phase-g/ORIGIN-ISOLATION.md). [Assumptions](../ASSUMPTIONS.md): original assumption 8 remains OPEN for accounting/import semantics. PIT-F-01 is mitigated in current source; deployment acceptance and legacy shared-origin recovery remain OPEN. No public deployment or live trade is claimed.

Fee flags, network guards, fee recipients/rates and schema bytes are unchanged from Phase F; the exact check appears below. Approved HTTPS origins in browser tests are offline route fixtures with an explicit test-only allowlist. The shipping allowlist remains empty. Existing local preview/development remains allowed; browser tests validate the production artifact's warning and disabled export behavior under a shared path.

Files changed: `src/lib/storage-origins.ts`, `src/lib/storage-policy.ts`, `src/lib/events.ts`; accounting disclosure/sync in `src/components/Export.tsx`, `FillRecorder.tsx`, `TradingApp.tsx`; `tests/storage-policy.test.ts`, `tests/setup.ts`, `vitest.config.ts`, `tests/e2e/origin-guard.spec.ts`, `storage-origin.spec.ts`, `interface.spec.ts`; `scripts/audit/origin-evidence.py`, `render-origin-verification.py`, `origin-secrets-review.py`; `docs/DEPLOY.md`, `ASSUMPTIONS.md`, this document and `docs/audit/phase-g/` evidence. No trade execution code, wallet credentials, event semantics or publication script changed.

## Exact Phase G outputs

The following are verbatim combined stdout/stderr captures, with command and exit-code framing. Terminal escapes, warning text and trailing whitespace are intentional evidence. Browser execution used authorized localhost/Chromium permissions outside the restricted sandbox; fixture domains never reach the network.

'''
for title,name in [('Unit tests','unit.txt'),('Playwright including exact attack reproduction','playwright.txt'),('Typecheck','typecheck.txt'),('Production build','build.txt'),('CSP artifact, headers and invariant checks','headers-and-invariants.txt'),('Secret scan and historical public-hash review','secrets-review.txt')]:
 text+=f'## {title}\n\n[Raw output](audit/phase-g/{name})\n\n```text\n'+(root/name).read_text()+'```\n\n'
text+='---\n\nThe record below is historical Phase F evidence; its results and hash refer to the Phase F artifact, not the changed Phase G artifact.\n\n'
text+=subprocess.check_output(['git','show','079abb7:docs/VERIFICATION.md']).decode()
Path('docs/VERIFICATION.md').write_text(text)
