from pathlib import Path
import subprocess
root = Path('docs/audit/phase-i')
text = '''# Phase I verification — derivative boundary enforced; live acceptance still blocked

Baseline `a5830a1eb3f0b030994d77b9bf82aa8a25da4daf`. **33 unit tests, 9 offline Playwright tests, clean typecheck, successful production build.** Two synthetic CoW fills round-trip through the actual workspace Taxlot importer with zero issues. This proves fixture compatibility, not live settlement or tax-calculation acceptance. No wallet signature, swap, order or public deployment occurred.

[Exact field-by-field schema matrix, derivative boundary, raw evidence model, all importer differences and blockers](audit/phase-i/DERIVATIVE-ACCOUNTING.md). [Complete schema/source audit output](audit/phase-i/schema-source.txt) includes upstream file hashes, numbered source and the empty protected-file comparison. [Full fixture reconciliation](audit/phase-i/roundtrip.json). [Assumptions](../ASSUMPTIONS.md): item 8 remains OPEN; derivative normalization is unsupported by v1. The schema, fee/network settings, origin policy and legal gates are unchanged.

Raw derivative fills/funding have their own origin-guarded append-only database and `unsupported_derivative_v1` status. They never enter Taxlot events or CSV. Existing records are preserved. Tests cover routing refusal, signed raw evidence, concurrent dedup, conflicting observations, unsafe-origin denial, and dedicated-origin persistence. Browser origins and protocol responses are fixtures, not deployed services.

## Exact Phase I command outputs

Combined stdout/stderr is quoted verbatim with command and exit-code framing, including warnings, terminal escapes and timing. Playwright needed authorized localhost/Chromium access. The initial importer provenance lookup failed under the sandbox; its output is preserved separately, followed by the successful authorized read-only retry. No live execution was used for any check.

'''
for title, name in [('Unit tests','unit.txt'),('Playwright tests','playwright.txt'),('Typecheck','typecheck.txt'),('Production build','build.txt'),('Actual Taxlot importer round-trip','real-importer.txt'),('Observer syntax','observer-syntax.txt')]:
    text += f'## {title}\n\n[Raw output](audit/phase-i/{name})\n\n```text\n' + (root/name).read_text() + '```\n\n'
text += '[Initial importer sandbox failure](audit/phase-i/importer-sandbox-failure.txt). The successful retry above supersedes that environment failure.\n\n---\n\nHistorical Phase H/G/F evidence follows. Their hashes/results refer to those earlier artifacts; Phase I supersedes shared raw derivative storage and pending importer investigation.\n\n'
text += subprocess.check_output(['git','show','a5830a1:docs/VERIFICATION.md']).decode()
Path('docs/VERIFICATION.md').write_text(text)
