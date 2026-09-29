from pathlib import Path
import subprocess
root=Path('docs/audit/phase-h')
text='''# Phase H verification — LIVE ACCEPTANCE BLOCKED

Baseline `3651f775bdb6ee6c0df601bf1a9dbf3e488b77fc`. The operator explicitly requested: **keep live execution blocked and finish evidence/preparation**. No wallet connection, signature, approval, swap or Hyperliquid order occurred. No live order ID, settlement hash, fill, live zero-fee proof, real-event schema result or reconciled CSV exists.

[Full live-attempt blocker, operator procedure, field-by-field unavailable reconciliation, derivative disposition and remaining blockers](audit/phase-h/LIVE-TESTNET.md). [Assumptions](../ASSUMPTIONS.md): assumption 8 remains OPEN; derivative accounting is BLOCKED for Phase I. No dedicated public origin was deployed or verified.

**Regression checks after the blocked attempt/remediation:** 24 unit tests, 8 offline Playwright tests, clean typecheck and successful production build. These are not post-live-execution results. Fee flags, CoW/Hyperliquid execution/fee configuration, Taxlot schema, origin policy and legal gates are unchanged. The derivative converter was removed: fills are raw evidence only; derivative Taxlot insertion/export is rejected, and existing legacy rows are preserved but excluded from spot exports.

The observer uses public shell parameters, no automatic environment-file loading or wallet/trade-button clicks. It validates loopback endpoints, limits observed primary submissions, omits signatures from saved request evidence and never claims settlement from submission. Its syntax/missing-configuration path are verified; its connected live-wallet path is not. Future unreviewed evidence is ignored by Git until explicitly reviewed.

## Exact Phase H command outputs

Captured combined stdout/stderr follows verbatim with command/exit-code framing; terminal escapes, timing and trailing whitespace are intentional. Playwright uses authorized localhost/Chromium permissions outside the sandbox and fixture requests, not real protocol execution.

'''
for title,name in [('Security preflight','preflight.txt'),('Secret/environment preflight','secret-preflight.txt'),('Blocked live attempt','live-attempt.txt'),('Observer syntax check','harness-syntax.txt'),('Unit tests','unit.txt'),('Playwright tests','playwright.txt'),('Typecheck','typecheck.txt'),('Production build','build.txt'),('Unchanged fees/schema and artifact controls','invariants.txt'),('Protected file comparison against Phase G','protected-files.txt')]:
 text+=f'## {title}\n\n[Raw output](audit/phase-h/{name})\n\n```text\n'+(root/name).read_text()+'```\n\n'
text+='---\n\nHistorical Phase G/F evidence follows; its hashes and assertions refer to those earlier artifacts. Phase H supersedes earlier derivative review-event/export behavior.\n\n'
text+=subprocess.check_output(['git','show','3651f77:docs/VERIFICATION.md']).decode()
Path('docs/VERIFICATION.md').write_text(text)
