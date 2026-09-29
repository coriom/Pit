# Phase G — storage origin isolation

Baseline: `079abb7dabe48c5c0e42ec557c22f923f8ed644c`. This phase changes only the accounting-origin boundary, its UI disclosure, tests and documentation. Fee flags, mainnet guards, CoW/Hyperliquid fee configuration and Taxlot schema bytes are unchanged, checked by `headers-and-invariants.txt`. No live trade, wallet signing, public deployment, IPFS pin or ENS transaction occurred.

## Security invariant and disposition

**PIT MUST NOT rely on browser-private accounting data being isolated when served through a shared-origin path gateway.** Accounting persistence is allowed only on an explicitly approved, exclusively PIT-controlled HTTPS origin, or a trusted loopback development origin. Paths and database names do not create isolation. Shared-origin IPFS/IPNS path gateways are rejected for production use; an unknown origin is never implicitly approved.

**PIT-F-01: mitigated in the current source; deployment acceptance remains OPEN.** The artifact's production allowlist is empty, so no production origin receives accounting persistence by default. Tests establish correct behavior with explicitly approved dedicated test origins, while the production artifact rejects a shared path. The architecture no longer requires shared-path isolation. This is not a claim that any public hosting has been verified, or that previously exposed records have become private. Retain the finding's deployment follow-up until an actual dedicated origin is reviewed. Assumption 8 is still OPEN because its original subject is Taxlot accounting/import semantics; this phase does not resolve derivative treatment or actual importer acceptance.

## Exact attack model and reproduction

Local origin: `http://127.0.0.1:4398` (scheme + host + port). Victim path `/ipfs/pit-audit-cid/` and attacker path `/ipfs/untrusted-audit-cid/` share that origin. A path gateway that serves attacker-controlled HTML/JavaScript under a sibling CID gives that code the same browser storage authority. The attacker needs a visit to its content; no wallet key, PIT account connection or transaction is needed.

Affected PIT namespace: IndexedDB database `pit-taxlot-v1`, version 1, stores `events` (account, assets, amounts, identifiers, timestamps), `raw` (original fills), and `meta` (sequence and account-specific `hl-cursor:<address>` sync cursors). Account filtering is an application selection rule, not authorization. Attackers can read, enumerate, insert, overwrite, delete and poison these stores, including structurally valid event rows, duplicate IDs and cursors. Schema validation does not authenticate records written directly through IndexedDB. The same-origin issue also applies to other origin-scoped storage mechanisms; PIT does not move accounting into localStorage, cookies, CacheStorage or a renamed database.

`tests/e2e/storage-origin.spec.ts` runs a deliberately unguarded platform reproduction: seed public fixtures in all three stores under the victim path, navigate to the sibling path, read all three, overwrite event quantity, delete raw fill evidence and poison the sequence. Fixtures use simplified keyed stores to isolate browser origin semantics, rather than invoking PIT's guarded writer. The exact output in `playwright.txt` includes:

```text
Attack reproduction: {"stolen":{"event":{"account":"fixture","quantity":"1"},"raw":{"fill":"original"},"sequence":1},"poisoned":{"account":"fixture","quantity":"999"},"deleted":true,"sequence":999,"origin":"http://127.0.0.1:4398"}
```

This attack still succeeds against unguarded origin-local data, as it should. The fix stops PIT creating or using accounting data on such deployments; it does not change browser security semantics or prevent malicious sibling code from accessing legacy data. The exact command is `pnpm test:e2e`; the complete output is retained in [playwright.txt](playwright.txt).

## Implementation

- `src/lib/storage-origins.ts`: frozen, explicit list of approved HTTPS origins, empty in this release. Approval is a reviewed source configuration change. No wildcard, URL parameter, browser preference, environment credential, user prompt or “trust this site” bypass exists.
- `src/lib/storage-policy.ts`: exact URL-origin comparison; deny opaque/non-HTTPS production URLs, credentials, unknown origins and embedded documents. Explicit loopback names `localhost`, `127.0.0.1`, `[::1]` allow ordinary HTTP development with arbitrary local ports. Shared `ipfs`/`ipns` path segments, including encoded forms, are rejected before origin approval or loopback allowance; malformed/remaining encoded paths fail closed. These negative checks are defense in depth. Their absence does not confer trust, and a CID-looking hostname is not automatically trusted.
- `src/lib/events.ts`: `eventDB()` asserts the policy before `openDB`. All application event/raw/meta access and export reads funnel through it. Blocked calls cannot open/create the database, read records, persist a fill/cursor or initiate a CSV download. `eventsCSV` remains a pure serializer of supplied records; it has no persistence claim or storage access.
- `FillRecorder.tsx`: returns before starting account-history sync when storage is disabled; never reports successful local sync there. `Export.tsx`: disables both download buttons and shows a concise accessible warning; shows the saved-record explanation only when storage is enabled. `TradingApp.tsx` removes its unconditional duplicate persistence claim. Trading configuration and unrelated trading UI are untouched.

The React review checked hook ordering, early return before effects start work, native disabled button behavior, accessible warning text, no new listeners or tracking, and the client-only Astro island context. Safety is checked at storage access, not merely through presentation. A same-origin attacker that already controls an approved deployment's scripts can bypass client code: the prerequisite is exclusive control of the **entire** approved origin, not just the PIT path. This guard is neither an XSS sandbox nor an attestation service.

## Deployment choices

| Target | Supported accounting architecture | Restrictions |
| --- | --- | --- |
| Cloudflare Pages | Explicit `https://<pit-project>.pages.dev` or dedicated custom origin after operator review | No `*.pages.dev` wildcard; no unrelated executable uploads/routes on the origin. Preview origins require separate review and exact entries. Current list is empty. |
| IPFS | Dedicated DNSLink/custom origin or stable, dedicated IPNS subdomain included exactly in the reviewed allowlist | Direct `/ipfs/…` and `/ipns/…` paths are rejected. A CID subdomain provides a real distinct host boundary, but arbitrary gateway hosts are not auto-approved. |
| ENS/IPFS | ENS resolution must ultimately land on an approved dedicated HTTPS origin, such as an operator-controlled DNSLink/custom gateway domain or stable IPNS subdomain | ENS contenthash alone does not guarantee the browser's final origin. Native/opaque `ipfs:` URLs and arbitrary resolver gateways remain disabled. No ENS change occurred. |
| Loopback development | Dedicated trusted PIT dev/preview server at exact loopback hostname | Root/subpaths other than shared-gateway markers work. The local server/process is trusted; do not host untrusted sibling applications on that development origin. |

An immutable CID hostname cannot usefully be embedded as its own exact allowlist entry: changing the artifact changes its CID. This implementation deliberately avoids that circular configuration and avoids gateway suffix auto-trust. To retain accounting with a static IPFS artifact, use a stable dedicated DNSLink/custom or IPNS origin whose name is known before building. Direct CID-subdomain rendering remains possible with accounting disabled. Stable origin content must remain PIT-controlled across upgrades.

Operator approval requires verifying TLS and canonical final origin, exclusive control of all executable content/routes and redirects, absence of arbitrary sibling content on that origin, and actual response headers. Then add only the exact origin, rebuild, rerun these tests and verify the published artifact. This is a documented future action, not a deployment performed in this phase.

This distinction follows the [IPFS addressing documentation](https://docs.ipfs.tech/how-to/address-ipfs-on-web/): path gateways share an origin; subdomain and DNSLink addressing provide origin isolation. The application still requires explicit operational approval of the chosen host.

## Existing records and recovery

Database name, version, event schema and records are unchanged. There is no upgrade, deletion, copy or migration. Unit and browser tests seed a valid event, switch to a blocked path, reject all public storage/export entry points, switch back and verify the event remains; the unit test also verifies raw evidence and sequence are unchanged.

Previously stored records on a shared origin remain exposed to sibling scripts. A new dedicated origin cannot read the old origin's IndexedDB, and this phase does not try to bridge that boundary or automatically import potentially poisoned data. Existing safe-origin records remain usable once that exact origin is approved. Shared-origin recovery requires a separately controlled offline recovery/reconciliation process or known-good backups; no automated recovery is claimed. Do not delete the original data as part of this phase.

## Test evidence and limits

- `tests/storage-policy.test.ts`: default-deny production, exact dedicated origin acceptance, suffix/scheme/port confusion rejection, encoded shared paths, malformed URLs, local development and absent location; blocked open/write/read/download with unchanged existing event/raw/sequence.
- `tests/e2e/origin-guard.spec.ts`: actual Chromium IndexedDB persistence across reload on `https://pit.example`; actual downloaded CSV equals serialization of those stored records; `https://sibling.example` has no PIT database. An approved stable IPNS test origin can persist. An unknown HTTPS origin cannot create the database. On an otherwise approved host's shared path, open/write/read/download all reject and the original valid event survives.
- Those HTTPS origins are browser route fixtures fulfilled locally, not deployed sites. The browser harness bundles the **real storage and policy modules** with a test-only replacement for `storage-origins.ts`; the shipping empty allowlist is unchanged. No signing or external API request occurs.
- `tests/e2e/interface.spec.ts`: the real production artifact hydrates under `/ipfs/test-cid/`, shows the security warning, disables both exports, omits the saved-record claim and creates no PIT database. Existing local injected-wallet, actual CSV, CSP and UI tests still pass.
- Full outputs: [unit.txt](unit.txt), [playwright.txt](playwright.txt), [typecheck.txt](typecheck.txt), [build.txt](build.txt). [headers-and-invariants.txt](headers-and-invariants.txt) captures artifact CSP/headers, unchanged fee/schema files and current upstream schema equality. No public deployment is verified.

## CSP and HTTP-header audit

| Target | Evidence/enforceable controls | Limits |
| --- | --- | --- |
| Cloudflare Pages static assets | `dist/_headers` configures `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, camera/microphone/geolocation Permissions-Policy and `X-Frame-Options: DENY`. Static HTML includes the generated meta CSP. | Local preview does not prove Cloudflare served these headers. Future actual HTTP readback is required; Pages Functions responses would need their own headers (none are added). Headers do not separate same-origin sibling pages. |
| Static IPFS artifact | Generated CSP meta is present in all three HTML pages and tested with production hydration. Script policy permits self/hash sources without unsafe-inline/eval; default/object sources are none. | Arbitrary gateways do not interpret Cloudflare `_headers` as response policy. No guarantee of nosniff, referrer/permissions policy, X-Frame-Options, HSTS or frame-ancestors. Gateway response integrity and MIME types remain operational trust. |
| ENS/IPFS | Same controls as the final serving gateway and actual browser origin | A resolver/contenthash is not an HTTP-header policy and does not establish isolation. |
| Development | Storage guard remains active; loopback exception enables development | Astro development does not carry the production CSP. Use production preview/browser tests for artifact CSP evidence. |

The existing `style-src 'unsafe-inline'` exception supports ConnectKit's dynamic styles. Existing connect-src still allows mainnet RPC/Hyperliquid hosts; it is not the trading-network guard and was not broadened or modified. There are no CDN assets to add SRI to. CSP governs each document's resource execution; PIT's policy does not constrain an unrelated sibling document or partition IndexedDB. No CSP rule can turn paths into origins.

Cloudflare's [_headers documentation](https://developers.cloudflare.com/pages/configuration/headers/) describes static response handling. CSP's [meta delivery specification](https://www.w3.org/TR/CSP3/#meta-element) excludes frame-ancestors and sandbox from meta delivery; report-only policy also cannot be supplied through meta. Therefore the shipped meta policy is not a substitute for deployment headers. The runtime guard additionally disables accounting in frames but does not claim to block framing itself.

## Remaining Phase H blockers

For localhost live testnet acceptance: external funded Sepolia/Hyperliquid testnet wallet and public trade parameters, separately handled wallet consent, actual order/fill evidence and screenshots from `pnpm dev`, then CSV reconciliation and real Taxlot import review. No private-key file is needed or created. Fees remain false and mainnet activation remains forbidden without the separate legal-opinion gate.

For any hosted acceptance: select, review and explicitly approve a dedicated origin; verify real response headers and artifact readback. Shared-origin production paths remain prohibited. Legacy shared-origin records need independent recovery/reconciliation if any exist. No such user records were supplied to this audit.

## Credential regression check

[secrets-review.txt](secrets-review.txt) records the current-file/history pattern scan. The Phase F scanner flags old artifact hashes after the build changes; every remaining match was confined to the byte-identical Phase F build manifest and verified against its committed `079abb7` content. The review left zero unresolved credential candidates. The original exclusions (including image pixels and unavailable history) still apply. No secret values are printed or added.
